import { randomUUID } from 'crypto';
import { createServerClient } from '@/lib/supabase';
import { getMessagingAdapter } from '@/lib/messaging';
import { getTemplate } from '@/lib/templates';
import type { Database } from '@/types/database';
import {
  CLAIM_STALE_MS,
  campaignStepMessageSid,
  hasFreshClaim,
  parkedNextSendAt,
} from '@/services/campaign-logic';
import {
  parseMessageSid,
  recoveryMessageSid,
} from '@/services/sms-sid';
import {
  parkNextAt,
  reconcileAmbiguousSms as reconcileViaSendModule,
  sendMessage,
  resolveRecoveryOutcome,
} from '@/services/send';
import {
  decideReconcileAdvanceEligibility,
  decideRequeueEligibility,
  mapRecoveryOutcomeToState,
} from '@/services/campaign-decisions';
import { planEnroll, planSwitch } from '@/services/campaign-enroll-plan';
import {
  mapSwitchResultToReplyAction,
  planReplyEnrollment,
} from '@/services/campaign-reply-plan';
import {
  decideClaimTokenResult,
  emptyDueCounts,
  noteClaimSkip,
  noteExtraRequeue,
  noteSendFailure,
  noteSendSuccess,
  staleClaimCutoffIso,
} from '@/services/campaign-cron-plan';
import {
  planCampaignSendPost,
  planCampaignSendPre,
} from '@/services/campaign-send-plan';
import {
  advanceStepPayload,
  claimDuePayload,
  clearOutboundSidPayload,
  completeEnrollmentPayload,
  computeNextSendAt,
  needsReviewEnrollmentPayload,
  pauseEnrollmentPayload,
  processDueErrorParkPayload,
  quietHoursReviewLeadPayload,
  reclaimStalePayload,
  reconcileAdvancePayload,
  reconcileCompletePayload,
  releaseClaimPayload,
  requeueStepPayload,
  rowFound,
  staleBeforeIso,
} from '@/services/campaign-io-plans';
import { processDeferredRecoveries, sendRecoverySMS } from '@/services/sms';
import {
  SuppressionLookupError,
  isPhoneSuppressed,
} from '@/services/suppressions';
import { ENROLLMENT_CLAIM_SELECT } from '@/lib/postgrest-select';
import {
  ABANDONED_SID_RE,
  CAMPAIGN_SELECT_STAR_STEPS,
  CAMPAIGN_SELECT_URGENCY,
  CAMPAIGN_SID_LIKE,
  COL,
  CONFIRMED_PROVIDER_STATUSES,
  DIRECTION_OUTBOUND,
  ENROLLMENT_SELECT_ADVANCE,
  ENROLLMENT_SELECT_ID,
  ENROLLMENT_SELECT_REQUEUE,
  ENROLLMENT_SELECT_SEND,
  ENROLLMENT_SELECT_STAR,
  ENROLLMENT_STATUS,
  KIND_CAMPAIGN,
  KIND_RECOVERY,
  LEAD_SELECT_STAR_BIZ,
  PG_UNIQUE,
  REVIEW_REASON_QUIET_HOURS,
  SMS_SELECT_ABANDONED,
  SMS_SELECT_CONFIRMED,
  SMS_STATUS,
  STEP_SELECT_STAR,
  TABLE,
} from '@/services/db-strings';

type Business = Database['public']['Tables']['businesses']['Row'];
type Lead = Database['public']['Tables']['leads']['Row'];
type Campaign = Database['public']['Tables']['campaigns']['Row'];
type CampaignStep = Database['public']['Tables']['campaign_steps']['Row'];
type CampaignEnrollment =
  Database['public']['Tables']['campaign_enrollments']['Row'];
type CampaignRow = Campaign & { campaign_steps?: CampaignStep[] | null };

export type EnrollmentResult =
  | {
      enrolled: true;
      campaignId: string;
      campaignName: string;
      currentStep: number;
      nextSendAt: string;
      skippedInitial: boolean;
      switched?: boolean;
    }
  | { enrolled: false; reason: string };

type Supabase = ReturnType<typeof createServerClient>;

export async function enrollLeadInCampaign(
  leadId: string
): Promise<EnrollmentResult> {
  const supabase = createServerClient();

  const { data: lead, error: leadError } = await supabase
    .from(TABLE.leads)
    .select(LEAD_SELECT_STAR_BIZ)
    .eq(COL.id, leadId)
    .single();

  // QC r6 P0: enroll non-responders into Standard (urgency null → Standard
  // campaign). Classification still switches Emergency/High on reply.
  const existing = await getEnrollmentForLead(leadId);
  const leadFound = rowFound(lead, leadError);

  const { data: campaigns, error: campaignError } = leadFound
    ? await supabase
        .from(TABLE.campaigns)
        .select(CAMPAIGN_SELECT_STAR_STEPS)
        .eq(COL.status, ENROLLMENT_STATUS.active)
        .eq(COL.autoEnroll, true)
    : { data: null, error: null };

  const recoveryState = leadFound
    ? await getRecoverySendState(supabase, leadId)
    : 'absent';

  const plan = planEnroll({
    leadId,
    leadFound,
    optedOut: Boolean(lead?.opted_out),
    existingStatus: existing?.status ?? null,
    campaigns: (campaigns as CampaignRow[] | null) ?? null,
    campaignError: Boolean(campaignError),
    urgency: lead?.urgency ?? null,
    recoveryState,
    smsOutboundSid: lead?.sms_outbound_sid ?? null,
    statusActive: ENROLLMENT_STATUS.active,
  });

  if (plan.type === 'reject') {
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.warn('enroll_reject', plan.reason, leadError);
    // Stryker restore StringLiteral,CallExpression
    return { enrolled: false, reason: plan.reason };
  }

  const { error: enrollError } = await supabase
    .from(TABLE.campaignEnrollments)
    .insert(plan.payload);

  if (enrollError) {
    if (enrollError.code === PG_UNIQUE) {
      return { enrolled: false, reason: 'already_enrolled:unique' };
    }
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.error('Failed to enroll lead:', enrollError);
    // Stryker restore StringLiteral,CallExpression
    return { enrolled: false, reason: 'insert_failed' };
  }

  // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
  console.log(
    `Lead ${leadId} enrolled in campaign ${plan.result.campaignName} ` +
      `(urgency=${lead?.urgency ?? 'null'}, step=${plan.result.currentStep}` +
      `${plan.result.skippedInitial ? ', skipped initial' : ''}), next send: ${plan.result.nextSendAt}`
  );
  // Stryker restore StringLiteral,CallExpression

  return plan.result;
}

/**
 * Switch enrollment to another campaign. Refuses while a fresh claim is held.
 * Requires status='active' and no fresh claim (claim_token/claimed_at cleared or stale).
 */
export async function switchEnrollmentCampaign(
  leadId: string,
  targetCampaignId: string
): Promise<EnrollmentResult> {
  const supabase = createServerClient();

  const existing = await getEnrollmentForLead(leadId);
  const { data: lead, error: leadError } = await supabase
    .from(TABLE.leads)
    .select(ENROLLMENT_SELECT_STAR)
    .eq(COL.id, leadId)
    .single();

  const { data: campaign, error: campError } = await supabase
    .from(TABLE.campaigns)
    .select(CAMPAIGN_SELECT_STAR_STEPS)
    .eq(COL.id, targetCampaignId)
    .single();

  // Staging (c): recovery ≠ Emergency initial — planSwitch keeps
  // treatRecoveryAsInitial: false so the first Emergency text goes out.
  const nowIso = new Date().toISOString();
  const plan = planSwitch({
    hasEnrollment: Boolean(existing),
    freshClaim: existing ? hasFreshClaim(existing) : false,
    leadFound: rowFound(lead, leadError),
    campaignFound: rowFound(campaign, campError),
    campaign: (campaign as CampaignRow | null) ?? null,
    targetCampaignId,
    smsOutboundSid: lead?.sms_outbound_sid ?? null,
    nowIso,
  });

  if (plan.type === 'reject') {
    return { enrolled: false, reason: plan.reason };
  }

  const staleBefore = staleBeforeIso(Date.now(), CLAIM_STALE_MS);

  // Only switch when not mid-send: claim_token null OR claim stale.
  // PostgREST re-applies filters to the representation — select every column
  // referenced by the filter or Postgres returns 42703 (staging evidence c).
  const { data: updated, error: updateError } = await supabase
    .from(TABLE.campaignEnrollments)
    .update(plan.payload)
    .eq(COL.leadId, leadId)
    .eq(COL.status, ENROLLMENT_STATUS.active)
    .or(`claim_token.is.null,claimed_at.lt.${staleBefore}`)
    .select(ENROLLMENT_CLAIM_SELECT)
    .maybeSingle();

  if (updateError || !updated) {
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.error('Failed to switch enrollment (maybe mid-send):', updateError);
    // Stryker restore StringLiteral,CallExpression
    return { enrolled: false, reason: 'deferred_or_switch_failed' };
  }

  // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
  console.log(
    `Lead ${leadId} switched to campaign ${plan.result.campaignName}, ` +
      `step=${plan.result.currentStep}, next send: ${plan.result.nextSendAt}`
  );
  // Stryker restore StringLiteral,CallExpression

  return plan.result;
}

export async function handleClassifiedReplyEnrollment(
  leadId: string,
  urgency: string | null
): Promise<{ action: string; campaignName?: string }> {
  const supabase = createServerClient();
  const enrollment = await getEnrollmentForLead(leadId);

  const { data: campaigns } = await supabase
    .from(TABLE.campaigns)
    .select(CAMPAIGN_SELECT_URGENCY)
    .eq(COL.status, ENROLLMENT_STATUS.active)
    .eq(COL.autoEnroll, true);

  const plan = planReplyEnrollment({
    enrollment: enrollment
      ? {
          id: enrollment.id,
          campaign_id: enrollment.campaign_id,
          status: enrollment.status,
          claimed_at: enrollment.claimed_at,
          claim_token: enrollment.claim_token,
        }
      : null,
    campaigns: campaigns || [],
    urgency,
  });

  if (plan.type === 'defer_switch') {
    // Stryker disable next-line StringLiteral,CallExpression: log-only (no control flow)
    console.log(
      `Deferring switch for lead ${leadId}; fresh claim held (mid-send)`
    );
    return { action: 'defer_switch', campaignName: plan.campaignName };
  }

  if (plan.type === 'switch') {
    const result = await switchEnrollmentCampaign(
      leadId,
      plan.targetCampaignId
    );
    return mapSwitchResultToReplyAction({
      enrolled: result.enrolled,
      reason: result.enrolled ? undefined : result.reason,
      campaignName: result.enrolled ? result.campaignName : undefined,
      targetCampaignName: plan.campaignName,
    });
  }

  if (plan.type === 'pause') {
    await pauseCampaignForLead(leadId);
    return { action: 'pause' };
  }

  if (plan.type === 'enroll') {
    const result = await enrollLeadInCampaign(leadId);
    return {
      action: result.enrolled ? 'enroll' : `skip:${result.reason}`,
      campaignName: result.enrolled ? result.campaignName : undefined,
    };
  }

  return { action: 'noop' };
}

export async function getEnrollmentForLead(
  leadId: string
): Promise<CampaignEnrollment | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from(TABLE.campaignEnrollments)
    .select(ENROLLMENT_SELECT_STAR)
    .eq(COL.leadId, leadId)
    .maybeSingle();

  if (error) {
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.error('Failed to fetch enrollment for lead:', error);
    // Stryker restore StringLiteral,CallExpression
    return null;
  }
  return data;
}

/**
 * Send SMS for a campaign step. Requires an active claim_token on the row.
 * Insert-before-send with campaign-scoped UNIQUE(message_sid).
 */
export async function sendCampaignSMS(
  enrollmentId: string,
  claimToken?: string
): Promise<boolean> {
  const supabase = createServerClient();

  const { data: enrollment, error: enrollError } = await supabase
    .from(TABLE.campaignEnrollments)
    .select(ENROLLMENT_SELECT_SEND)
    .eq(COL.id, enrollmentId)
    .single();

  const lead = enrollment
    ? ((enrollment as any).leads as Lead & { businesses: Business })
    : null;
  const business = lead?.businesses ?? null;
  const campaign = enrollment
    ? ((enrollment as any).campaigns as Campaign)
    : null;

  let suppressed = false;
  let suppressionLookupFailed = false;
  if (lead && business) {
    try {
      suppressed = await isPhoneSuppressed(business.id, lead.caller_phone);
    } catch (err) {
      if (err instanceof SuppressionLookupError) {
        // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
        console.error('Suppression check failed closed:', err.message);
        // Stryker restore StringLiteral,CallExpression
        suppressionLookupFailed = true;
      } else {
        throw err;
      }
    }
  }

  const { data: steps, error: stepsError } =
    campaign != null
      ? await supabase
          .from(TABLE.campaignSteps)
          .select(STEP_SELECT_STAR)
          .eq(COL.campaignId, campaign.id)
          .order(COL.stepNumber, { ascending: true })
      : { data: null, error: null };

  const token = claimToken || enrollment?.claim_token || null;
  const pre = planCampaignSendPre({
    enrollmentFound: rowFound(enrollment, enrollError),
    claimToken: token,
    optedOut: Boolean(lead?.opted_out),
    suppressed,
    suppressionLookupFailed,
    steps: (stepsError ? [] : steps) ?? [],
    currentStep: enrollment?.current_step ?? -1,
    leadTimezone: (lead as { timezone?: string | null } | null)?.timezone ?? null,
  });

  if (pre.type === 'fail') {
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.error('campaign_send_fail', enrollmentId, pre.reason, enrollError);
    // Stryker restore StringLiteral,CallExpression
    return pre.success;
  }

  if (pre.type === 'pause') {
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.log('campaign_send_pause', enrollmentId, pre.reason, suppressed);
    // Stryker restore StringLiteral,CallExpression
    await pauseCampaignForLead(lead!.id);
    return pre.success;
  }

  if (pre.type === 'release_fail') {
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.error(
      'campaign_send_release_fail',
      enrollmentId,
      pre.reason,
      stepsError
    );
    // Stryker restore StringLiteral,CallExpression
    await releaseClaim(supabase, enrollmentId, token!);
    return pre.success;
  }

  const stepSid = campaignStepMessageSid(
    enrollmentId,
    campaign!.id,
    pre.stepNumber
  );

  const messageBody = getTemplate(pre.templateKey, {
    business: business!.name,
    name: '',
    issue: lead!.issue || '',
  });

  const parkedFallback = parkedNextSendAt();

  // Single send module: E.164, quiet hours, recovery gate, caps+echo, relay.
  const outcome = await sendMessage({
    kind: 'campaign',
    leadId: lead!.id,
    businessId: business!.id,
    to: lead!.caller_phone,
    body: messageBody,
    idempotencyKey: stepSid,
    enrollmentId,
    campaignId: campaign!.id,
    stepNumber: pre.stepNumber,
    claimToken: token!,
    leadTimezone: pre.leadTimezone,
    businessTimezone: business!.timezone,
    skipRecoveryGate: pre.skipRecoveryGate,
  });

  const dispatch = planCampaignSendPost(outcome, parkedFallback);

  switch (dispatch.type) {
    case 'advance': {
      const advanced = await advanceEnrollment(
        supabase,
        enrollmentId,
        token!,
        pre.stepNumber,
        steps as CampaignStep[]
      );
      // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
      console.log(
        'campaign_send_advance',
        enrollmentId,
        pre.stepNumber,
        advanced,
        outcome.kind
      );
      // Stryker restore StringLiteral,CallExpression
      return dispatch.success;
    }
    case 'release':
      await releaseClaim(supabase, enrollmentId, token!, {
        nextSendAt: dispatch.nextSendAt,
      });
      return dispatch.success;
    case 'flag_unresolved_tz':
      // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
      console.error('campaign_send_unresolved_tz', enrollmentId);
      // Stryker restore StringLiteral,CallExpression
      await supabase
        .from(TABLE.leads)
        .update(
          quietHoursReviewLeadPayload({
            reason: REVIEW_REASON_QUIET_HOURS,
            nowIso: new Date().toISOString(),
          })
        )
        .eq(COL.id, lead!.id);
      await releaseClaim(supabase, enrollmentId, token!, {
        nextSendAt: dispatch.nextSendAt,
      });
      return dispatch.success;
    case 'park':
      await parkEnrollmentForReconcile(supabase, enrollmentId, token!, {
        nextSendAt: dispatch.nextSendAt,
      });
      // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
      console.warn('campaign_send_park', enrollmentId, outcome.kind);
      // Stryker restore StringLiteral,CallExpression
      return dispatch.success;
    case 'pause_opt_out':
      await pauseCampaignForLead(lead!.id);
      return dispatch.success;
    case 'needs_review_terminal':
      // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
      console.error(
        'campaign_send_needs_review',
        enrollmentId,
        dispatch.reason,
        outcome.kind
      );
      // Stryker restore StringLiteral,CallExpression
      // Terminal status — do not re-park every 30 min (QC r6 P1 #7).
      await markEnrollmentNeedsReview(
        supabase,
        enrollmentId,
        token!,
        dispatch.reason
      );
      return dispatch.success;
    case 'noop_false':
      await releaseClaim(supabase, enrollmentId, token!);
      return dispatch.success;
  }
}

/**
 * Advance only if we still own the claim (status=active AND claim_token matches).
 * Returns false when ownership was lost (pause/switch mid-send).
 */
export async function advanceEnrollment(
  supabase: Supabase,
  enrollmentId: string,
  claimToken: string,
  currentStepNumber: number,
  steps: CampaignStep[]
): Promise<boolean> {
  const nextStepNumber = currentStepNumber + 1;
  const nextStep = steps.find((s) => s.step_number === nextStepNumber);

  if (nextStep) {
    const nowIso = new Date().toISOString();
    const nextSendAt = computeNextSendAt(Date.now(), nextStep.delay_minutes);

    const { data, error } = await supabase
      .from(TABLE.campaignEnrollments)
      .update(
        advanceStepPayload({
          nextStepNumber,
          nextSendAt,
          nowIso,
        })
      )
      .eq(COL.id, enrollmentId)
      .eq(COL.status, ENROLLMENT_STATUS.active)
      .eq(COL.claimToken, claimToken)
      .select(ENROLLMENT_CLAIM_SELECT);

    if (error || !data?.length) {
      // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
      console.warn('advance_ownership_miss', enrollmentId, error);
      // Stryker restore StringLiteral,CallExpression
      return false;
    }

    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.log('campaign_advanced', nextStepNumber, nextSendAt);
    // Stryker restore StringLiteral,CallExpression
    return true;
  }

  const { data, error } = await supabase
    .from(TABLE.campaignEnrollments)
    .update(
      completeEnrollmentPayload({
        status: ENROLLMENT_STATUS.completed,
        nowIso: new Date().toISOString(),
      })
    )
    .eq(COL.id, enrollmentId)
    .eq(COL.status, ENROLLMENT_STATUS.active)
    .eq(COL.claimToken, claimToken)
    .select(ENROLLMENT_CLAIM_SELECT);

  if (error || !data?.length) {
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.warn('complete_ownership_miss', enrollmentId, error);
    // Stryker restore StringLiteral,CallExpression
    return false;
  }

  // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
  console.log('campaign_completed', enrollmentId);
  // Stryker restore StringLiteral,CallExpression
  return true;
}

async function releaseClaim(
  supabase: Supabase,
  enrollmentId: string,
  claimToken: string,
  opts?: { nextSendAt?: string }
): Promise<void> {
  await supabase
    .from(TABLE.campaignEnrollments)
    .update(
      releaseClaimPayload({
        nextSendAt:
          opts?.nextSendAt ??
          new Date(Date.now() + CLAIM_STALE_MS).toISOString(),
        nowIso: new Date().toISOString(),
      })
    )
    .eq(COL.id, enrollmentId)
    .eq(COL.status, ENROLLMENT_STATUS.active)
    .eq(COL.claimToken, claimToken);
}

/**
 * Park an enrollment with an ambiguous send until reconcile resolves it.
 * Uses a far-future next_send_at so cron will not reclaim/resend.
 */
async function parkEnrollmentForReconcile(
  supabase: Supabase,
  enrollmentId: string,
  claimToken: string,
  opts?: { nextSendAt?: string }
): Promise<void> {
  await releaseClaim(supabase, enrollmentId, claimToken, {
    nextSendAt: opts?.nextSendAt ?? parkedNextSendAt(),
  });
}

/** Terminal needs_review — clears claim, no 30-min re-alert loop. */
async function markEnrollmentNeedsReview(
  supabase: Supabase,
  enrollmentId: string,
  claimToken: string,
  reason: string
): Promise<void> {
  await supabase
    .from(TABLE.campaignEnrollments)
    .update(
      needsReviewEnrollmentPayload({
        status: ENROLLMENT_STATUS.needsReview,
        nowIso: new Date().toISOString(),
      })
    )
    .eq(COL.id, enrollmentId)
    .eq(COL.status, ENROLLMENT_STATUS.active)
    .eq(COL.claimToken, claimToken);
  // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
  console.error(
    `Enrollment ${enrollmentId} terminal needs_review (${reason})`
  );
  // Stryker restore StringLiteral,CallExpression
}

/**
 * Pause active enrollments. Allowed mid-send: clears claim so the in-flight
 * worker's advanceEnrollment ownership check fails (no accidental next step).
 */
export async function pauseCampaignForLead(leadId: string): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from(TABLE.campaignEnrollments)
    .update(
      pauseEnrollmentPayload({
        status: ENROLLMENT_STATUS.paused,
        nowIso: new Date().toISOString(),
      })
    )
    .eq(COL.leadId, leadId)
    .eq(COL.status, ENROLLMENT_STATUS.active);

  if (error) {
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.error('Failed to pause campaign:', error);
    // Stryker restore StringLiteral,CallExpression
    return;
  }

  // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
  console.log(`Campaign paused for lead ${leadId}`);
  // Stryker restore StringLiteral,CallExpression
}

export async function leadHasActiveEnrollment(
  leadId: string
): Promise<boolean> {
  const enrollment = await getEnrollmentForLead(leadId);
  return enrollment?.status === 'active';
}

/**
 * Atomically claim a due (or stale-claimed) enrollment with a fresh claim_token.
 */
export async function claimDueEnrollment(
  enrollmentId: string
): Promise<string | null> {
  const supabase = createServerClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const staleBefore = staleClaimCutoffIso(now.getTime(), CLAIM_STALE_MS);
  const token = randomUUID();

  const due = await supabase
    .from(TABLE.campaignEnrollments)
    .update(claimDuePayload({ nowIso, token }))
    .eq(COL.id, enrollmentId)
    .eq(COL.status, ENROLLMENT_STATUS.active)
    .lte(COL.nextSendAt, nowIso)
    .is(COL.claimToken, null)
    .select(ENROLLMENT_CLAIM_SELECT);

  const dueCount = due.data?.length ?? 0;
  if (!due.error && dueCount > 0) {
    return decideClaimTokenResult({
      dueError: false,
      dueCount,
      staleError: true,
      staleCount: 0,
      token,
    });
  }

  const stale = await supabase
    .from(TABLE.campaignEnrollments)
    .update(reclaimStalePayload({ nowIso, token }))
    .eq(COL.id, enrollmentId)
    .eq(COL.status, ENROLLMENT_STATUS.active)
    .is(COL.nextSendAt, null)
    .lt(COL.claimedAt, staleBefore)
    // claimed_at is in the filter — must be selected (PostgREST 42703).
    .select(ENROLLMENT_CLAIM_SELECT);

  if (stale.error) {
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.error('Failed to reclaim stale enrollment:', stale.error);
    // Stryker restore StringLiteral,CallExpression
  }

  return decideClaimTokenResult({
    dueError: Boolean(due.error),
    dueCount,
    staleError: Boolean(stale.error),
    staleCount: stale.data?.length ?? 0,
    token,
  });
}

export async function listClaimableEnrollmentIds(
  limit = 100
): Promise<string[]> {
  const supabase = createServerClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const staleBefore = staleClaimCutoffIso(now.getTime(), CLAIM_STALE_MS);

  const { data: due } = await supabase
    .from(TABLE.campaignEnrollments)
    .select(ENROLLMENT_SELECT_ID)
    .eq(COL.status, ENROLLMENT_STATUS.active)
    .lte(COL.nextSendAt, nowIso)
    .is(COL.claimToken, null)
    .order(COL.nextSendAt, { ascending: true })
    .limit(limit);

  const { data: stale } = await supabase
    .from(TABLE.campaignEnrollments)
    .select(ENROLLMENT_SELECT_ID)
    .eq(COL.status, ENROLLMENT_STATUS.active)
    .is(COL.nextSendAt, null)
    .lt(COL.claimedAt, staleBefore)
    .limit(limit);

  const ids = new Set<string>();
  for (const row of due || []) ids.add(row.id);
  for (const row of stale || []) ids.add(row.id);
  return [...ids].slice(0, limit);
}

export type ReconcileResult = {
  unknownCount: number;
  stuckSendingCount: number;
  requeued: number;
  confirmed: number;
  parked: number;
  needsReview: number;
  alert: boolean;
};

/**
 * Reconcile unknown / stuck 'sending' rows against the relay by idempotency key.
 *
 * - outcome=sent → confirm; advance campaign step from sid
 * - outcome=never_sent (explicit only) → abandon sid; requeue exact step / resend recovery
 * - outcome=unknown / missing → increment attempts; park or needs_review
 * - ORDER BY oldest first so a backlog cannot starve new rows
 */
export async function reconcileAmbiguousSms(): Promise<ReconcileResult> {
  // All relay lookups go through the send module.
  const base = await reconcileViaSendModule();
  const supabase = createServerClient();

  // Post-pass: advance / requeue from abandoned_retry + newly resolved rows
  // that the send module marked in this cron tick is handled inside callers
  // via sid parse on never_sent. Recovery resend uses sendRecoverySMS.
  const { data: abandoned } = await supabase
    .from(TABLE.smsMessages)
    .select(SMS_SELECT_ABANDONED)
    .eq(COL.status, SMS_STATUS.abandonedRetry)
    .order(COL.sentAt, { ascending: true })
    .limit(50);

  let extraRequeued = 0;
  for (const row of abandoned ?? []) {
    // Original sid is prefix before :abandoned:
    const original = String(row.message_sid).replace(ABANDONED_SID_RE, '');
    const parsed = parseMessageSid(original);
    if (parsed.kind === KIND_CAMPAIGN) {
      const ok = await requeueExactCampaignStep(
        supabase,
        parsed.enrollmentId,
        parsed.campaignId,
        parsed.stepNumber
      );
      extraRequeued = noteExtraRequeue(extraRequeued, ok);
    } else if (parsed.kind === KIND_RECOVERY) {
      await resendRecoveryIdempotent(supabase, parsed.leadId, original);
      extraRequeued = noteExtraRequeue(extraRequeued, true);
    }
    // Prevent reprocessing the same abandoned row forever
    await supabase
      .from(TABLE.smsMessages)
      .update({ status: SMS_STATUS.abandonedDone })
      .eq(COL.id, row.id);
  }

  const { data: confirmedRows } = await supabase
    .from(TABLE.smsMessages)
    .select(SMS_SELECT_CONFIRMED)
    .in(COL.status, [...CONFIRMED_PROVIDER_STATUSES])
    .like(COL.messageSid, CAMPAIGN_SID_LIKE)
    .order(COL.sentAt, { ascending: false })
    .limit(20);

  for (const row of confirmedRows ?? []) {
    const parsed = parseMessageSid(row.message_sid);
    if (parsed.kind === KIND_CAMPAIGN) {
      await advanceEnrollmentAfterConfirmedSend(
        supabase,
        parsed.enrollmentId,
        parsed.campaignId,
        parsed.stepNumber
      );
    }
  }

  return {
    ...base,
    requeued: base.requeued + extraRequeued,
  };
}

async function getRecoverySendState(
  supabase: Supabase,
  leadId: string
): Promise<'confirmed' | 'pending' | 'absent' | 'abandoned'> {
  const outcome = await resolveRecoveryOutcome(supabase, leadId);
  return mapRecoveryOutcomeToState(outcome);
}

/**
 * After never_sent on a recovery sid: clear outbound marker and actually
 * resend recovery SMS (insert-before-send is idempotent on the freed sid).
 */
async function resendRecoveryIdempotent(
  supabase: Supabase,
  leadId: string,
  abandonedOriginalSid: string
): Promise<void> {
  await supabase
    .from(TABLE.leads)
    .update(clearOutboundSidPayload({ nowIso: new Date().toISOString() }))
    .eq(COL.id, leadId)
    .eq(COL.smsOutboundSid, abandonedOriginalSid);

  const { data: lead } = await supabase
    .from(TABLE.leads)
    .select(LEAD_SELECT_STAR_BIZ)
    .eq(COL.id, leadId)
    .maybeSingle();

  if (!lead || lead.opted_out) return;
  const business = (lead as { businesses?: Business }).businesses;
  if (!business) return;

  try {
    await sendRecoverySMS(leadId, business, lead.caller_phone);
  } catch (err) {
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.error(
      `Recovery resend failed for ${leadId}:`,
      err instanceof Error ? err.message : 'unknown'
    );
    // Stryker restore StringLiteral,CallExpression
  }
}

/**
 * After reconcile confirms a campaign step was sent, advance past that step
 * if the enrollment is still active on it (and not mid-claim).
 */
async function advanceEnrollmentAfterConfirmedSend(
  supabase: Supabase,
  enrollmentId: string,
  campaignId: string,
  stepNumber: number
): Promise<void> {
  const { data: enrollment } = await supabase
    .from(TABLE.campaignEnrollments)
    .select(ENROLLMENT_SELECT_ADVANCE)
    .eq(COL.id, enrollmentId)
    .eq(COL.status, ENROLLMENT_STATUS.active)
    .maybeSingle();

  if (
    !decideReconcileAdvanceEligibility({
      enrollmentFound: Boolean(enrollment),
      campaignMatches: enrollment?.campaign_id === campaignId,
      stepMatches: enrollment?.current_step === stepNumber,
      hasClaimToken: Boolean(enrollment?.claim_token),
    })
  ) {
    return;
  }

  const { data: steps } = await supabase
    .from(TABLE.campaignSteps)
    .select(STEP_SELECT_STAR)
    .eq(COL.campaignId, campaignId)
    .order(COL.stepNumber, { ascending: true });

  if (!steps?.length) return;

  const nextStep = steps.find((s) => s.step_number === stepNumber + 1);
  const nowIso = new Date().toISOString();
  if (nextStep) {
    const nextSendAt = computeNextSendAt(Date.now(), nextStep.delay_minutes);
    await supabase
      .from(TABLE.campaignEnrollments)
      .update(
        reconcileAdvancePayload({
          nextStepNumber: nextStep.step_number,
          nextSendAt,
          nowIso,
        })
      )
      .eq(COL.id, enrollmentId)
      .eq(COL.status, ENROLLMENT_STATUS.active)
      .eq(COL.stepNumber, stepNumber)
      .is(COL.claimToken, null);
  } else {
    await supabase
      .from(TABLE.campaignEnrollments)
      .update(
        reconcileCompletePayload({
          status: ENROLLMENT_STATUS.completed,
          nowIso,
        })
      )
      .eq(COL.id, enrollmentId)
      .eq(COL.status, ENROLLMENT_STATUS.active)
      .eq(COL.stepNumber, stepNumber)
      .is(COL.claimToken, null);
  }
}

/**
 * Requeue the exact campaign step encoded in the sid (no skip / reorder).
 */
async function requeueExactCampaignStep(
  supabase: Supabase,
  enrollmentId: string,
  campaignId: string,
  stepNumber: number
): Promise<boolean> {
  const { data: enrollment } = await supabase
    .from(TABLE.campaignEnrollments)
    .select(ENROLLMENT_SELECT_REQUEUE)
    .eq(COL.id, enrollmentId)
    .eq(COL.status, ENROLLMENT_STATUS.active)
    .maybeSingle();

  if (
    !decideRequeueEligibility({
      enrollmentFound: Boolean(enrollment),
      campaignMatches: enrollment?.campaign_id === campaignId,
    })
  ) {
    return false;
  }

  const { data, error } = await supabase
    .from(TABLE.campaignEnrollments)
    .update(
      requeueStepPayload({
        stepNumber,
        nowIso: new Date().toISOString(),
      })
    )
    .eq(COL.id, enrollmentId)
    .eq(COL.status, ENROLLMENT_STATUS.active)
    .eq(COL.campaignId, campaignId)
    .select(ENROLLMENT_CLAIM_SELECT);

  if (error || !data?.length) {
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.warn(
      `requeueExactCampaignStep failed for ${enrollmentId} step ${stepNumber}:`,
      error?.message
    );
    // Stryker restore StringLiteral,CallExpression
    return false;
  }
  return true;
}

export async function processDueCampaigns(): Promise<{
  processed: number;
  errors: number;
  skipped: number;
  messagingProvider: string;
  unknownCount: number;
  stuckSendingCount: number;
  requeued: number;
  confirmed: number;
  parked: number;
  needsReview: number;
  alert: boolean;
  relayLookupSupported?: boolean;
}> {
  const adapter = getMessagingAdapter();

  // Caps probe + reconcile both live inside the send module.
  let relayLookupSupported: boolean | undefined;
  if (adapter.checkLookupSupport) {
    const support = await adapter.checkLookupSupport();
    relayLookupSupported = support.supported;
  }

  // Deferred recoveries first (quiet-hours window may have opened).
  await processDeferredRecoveries();

  const reconcile = await reconcileAmbiguousSms();

  const ids = await listClaimableEnrollmentIds(100);

  if (ids.length === 0) {
    // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
    console.log('No due campaigns to process');
    // Stryker restore StringLiteral,CallExpression
    return {
      processed: 0,
      errors: 0,
      skipped: 0,
      messagingProvider: adapter.name,
      relayLookupSupported,
      ...reconcile,
    };
  }

  let counts = emptyDueCounts();

  for (const id of ids) {
    try {
      const token = await claimDueEnrollment(id);
      if (!token) {
        counts = noteClaimSkip(counts);
        continue;
      }

      const success = await sendCampaignSMS(id, token);
      counts = success ? noteSendSuccess(counts) : noteSendFailure(counts);
    } catch (err) {
      // Isolate per-enrollment failures (e.g. invalid timezone) so one bad
      // lead cannot 500 the whole cron run.
      // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
      console.error(
        `Campaign send failed for ${id}:`,
        err instanceof Error ? err.message : 'unknown'
      );
      // Stryker restore StringLiteral,CallExpression
      counts = noteSendFailure(counts);
      try {
        const supabase = createServerClient();
        await supabase
          .from(TABLE.campaignEnrollments)
          .update(
            processDueErrorParkPayload({
              nextSendAt: parkedNextSendAt(),
              nowIso: new Date().toISOString(),
            })
          )
          .eq(COL.id, id)
          .eq(COL.status, ENROLLMENT_STATUS.active);
      } catch {
        /* ignore release failure */
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // Stryker disable StringLiteral,CallExpression: log-only (no control flow)
  console.log(
    `Processed ${counts.processed} campaigns, ${counts.errors} errors, ${counts.skipped} skipped ` +
      `out of ${ids.length} candidates (provider=${adapter.name})`
  );
  // Stryker restore StringLiteral,CallExpression

  return {
    ...counts,
    messagingProvider: adapter.name,
    relayLookupSupported,
    ...reconcile,
  };
}
