import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
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
  KIND_MANUAL,
  KIND_RECOVERY,
  LEAD_SELECT_STAR,
  LEAD_SELECT_GATES,
  LEAD_SELECT_OPTED_OUT,
  LEAD_SELECT_OUTBOUND,
  LEAD_SELECT_STAR_BIZ,
  LOOKUP_KIND,
  PG_UNIQUE,
  RECONCILE_PULL_STATUSES,
  RELAY_SIGNAL,
  REVIEW_REASON_QUIET_HOURS,
  SEND_REASON,
  SMS_SELECT_ABANDONED,
  SMS_SELECT_CONFIRMED,
  SMS_SELECT_DEFERRED,
  SMS_SELECT_ID_STATUS,
  SMS_SELECT_RECONCILE,
  SMS_SELECT_STATUS,
  SMS_STATUS,
  STEP_SELECT_STAR,
  TABLE,
  DIRECTION_INBOUND,
  ENV_BRWN_DEFAULT_BUSINESS_PHONE,
  INBOUND_MESSAGE_ID_PREFIX,
  LEAD_STATUS,
  LEGACY_LEAD_STATUSES,
  OPEN_LEAD_STATUSES,
  reconcileOrFilter,
} from './db-strings';

describe('db-strings constants (kill StringLiteral mutants)', () => {
  it('table names', () => {
    expect(TABLE.leads).toBe('leads');
    expect(TABLE.businesses).toBe('businesses');
    expect(TABLE.smsMessages).toBe('sms_messages');
    expect(TABLE.missedCalls).toBe('missed_calls');
    expect(TABLE.campaigns).toBe('campaigns');
    expect(TABLE.campaignSteps).toBe('campaign_steps');
    expect(TABLE.campaignEnrollments).toBe('campaign_enrollments');
  });

  it('column names', () => {
    expect(COL.id).toBe('id');
    expect(COL.leadId).toBe('lead_id');
    expect(COL.messageSid).toBe('message_sid');
    expect(COL.status).toBe('status');
    expect(COL.body).toBe('body');
    expect(COL.nextRetryAt).toBe('next_retry_at');
    expect(COL.nextSendAt).toBe('next_send_at');
    expect(COL.claimToken).toBe('claim_token');
    expect(COL.claimedAt).toBe('claimed_at');
    expect(COL.campaignId).toBe('campaign_id');
    expect(COL.stepNumber).toBe('step_number');
    expect(COL.autoEnroll).toBe('auto_enroll');
    expect(COL.sentAt).toBe('sent_at');
    expect(COL.smsOutboundSid).toBe('sms_outbound_sid');
    expect(COL.optedOut).toBe('opted_out');
    expect(COL.phone).toBe('phone');
    expect(COL.businessId).toBe('business_id');
    expect(COL.callerPhone).toBe('caller_phone');
    expect(COL.createdAt).toBe('created_at');
    expect(COL.direction).toBe('direction');
    expect(COL.callSid).toBe('call_sid');
    expect(COL.ringDuration).toBe('ring_duration');
    expect(COL.missedCallId).toBe('missed_call_id');
    expect(DIRECTION_INBOUND).toBe('inbound');
    expect(LEAD_STATUS.pending).toBe('pending');
    expect(OPEN_LEAD_STATUSES).toEqual(['qualified', 'escalated']);
    expect(LEGACY_LEAD_STATUSES).toEqual(['pending', 'qualified', 'escalated']);
    expect(SMS_STATUS.received).toBe('received');
    expect(INBOUND_MESSAGE_ID_PREFIX).toBe('brwn-in-');
    expect(ENV_BRWN_DEFAULT_BUSINESS_PHONE).toBe('BRWN_DEFAULT_BUSINESS_PHONE');
  });

  it('sms / enrollment statuses', () => {
    expect(SMS_STATUS.sending).toBe('sending');
    expect(SMS_STATUS.deferred).toBe('deferred');
    expect(SMS_STATUS.unknown).toBe('unknown');
    expect(SMS_STATUS.needsReview).toBe('needs_review');
    expect(SMS_STATUS.abandonedRetry).toBe('abandoned_retry');
    expect(SMS_STATUS.abandonedDone).toBe('abandoned_done');
    expect(SMS_STATUS.queued).toBe('queued');
    expect(SMS_STATUS.dispatched).toBe('dispatched');
    expect(SMS_STATUS.sent).toBe('sent');
    expect(SMS_STATUS.delivered).toBe('delivered');
    expect(SMS_STATUS.active).toBe('active');
    expect(SMS_STATUS.paused).toBe('paused');
    expect(SMS_STATUS.completed).toBe('completed');
    expect(SMS_STATUS.received).toBe('received');
    expect(ENROLLMENT_STATUS.active).toBe('active');
    expect(ENROLLMENT_STATUS.paused).toBe('paused');
    expect(ENROLLMENT_STATUS.completed).toBe('completed');
    expect(ENROLLMENT_STATUS.needsReview).toBe('needs_review');
  });

  it('select lists and misc', () => {
    expect(DIRECTION_OUTBOUND).toBe('outbound');
    expect(LEAD_SELECT_GATES).toBe('opted_out, timezone, sms_outbound_sid');
    expect(LEAD_SELECT_STAR).toBe('*');
    expect(SMS_SELECT_STATUS).toBe('status');
    expect(SMS_SELECT_ID_STATUS).toBe('id, status');
    expect(SMS_SELECT_DEFERRED).toBe(
      'id, lead_id, message_sid, body, next_retry_at, reconcile_attempts'
    );
    expect(SMS_SELECT_RECONCILE).toBe(
      'id, lead_id, message_sid, status, sent_at, reconcile_attempts, key_supported_at_send, next_retry_at'
    );
    expect(SMS_SELECT_ABANDONED).toBe('id, lead_id, message_sid, status');
    expect(SMS_SELECT_CONFIRMED).toBe('message_sid, status');
    expect(LEAD_SELECT_STAR_BIZ).toBe('*, businesses(*)');
    expect(LEAD_SELECT_OPTED_OUT).toBe('opted_out');
    expect(LEAD_SELECT_OUTBOUND).toBe('sms_outbound_sid');
    expect(ENROLLMENT_SELECT_STAR).toBe('*');
    expect(ENROLLMENT_SELECT_ID).toBe('id');
    expect(CAMPAIGN_SELECT_STAR_STEPS).toBe('*, campaign_steps(*)');
    expect(CAMPAIGN_SELECT_URGENCY).toBe('id, name, urgency_filter');
    expect(STEP_SELECT_STAR).toBe('*');
    expect(ENROLLMENT_SELECT_SEND).toBe(
      '*, leads!inner(*, businesses(*)), campaigns!inner(*)'
    );
    expect(ENROLLMENT_SELECT_ADVANCE).toBe(
      'id, campaign_id, current_step, status, claim_token'
    );
    expect(ENROLLMENT_SELECT_REQUEUE).toBe('id, campaign_id, status');
    expect(PG_UNIQUE).toBe('23505');
    expect(KIND_RECOVERY).toBe('recovery');
    expect(KIND_CAMPAIGN).toBe('campaign');
    expect(KIND_MANUAL).toBe('manual');
    expect(LOOKUP_KIND).toBe('lookup');
    expect(RELAY_SIGNAL.error).toBe('error');
    expect(RELAY_SIGNAL.unknown).toBe('unknown');
    expect(RELAY_SIGNAL.ok).toBe('ok');
    expect(SEND_REASON.invalidPhone).toBe('invalid_phone');
    expect(SEND_REASON.duplicateInFlight).toBe('duplicate_in_flight');
    expect(SEND_REASON.lookupUnsupported).toBe('lookup_unsupported');
    expect(SEND_REASON.sendsDisabled).toBe('sends_disabled');
    expect(REVIEW_REASON_QUIET_HOURS).toBe('quiet_hours_unresolved');
    expect(CAMPAIGN_SID_LIKE).toBe('mlf:campaign:%');
    expect(CONFIRMED_PROVIDER_STATUSES).toEqual([
      'queued',
      'dispatched',
      'sent',
      'delivered',
    ]);
    expect(RECONCILE_PULL_STATUSES).toEqual(['unknown', 'sending']);
    expect('sid:abandoned:123'.replace(ABANDONED_SID_RE, '')).toBe('sid');
    expect(reconcileOrFilter('NOW', 'CUT')).toContain('next_retry_at.lte.NOW');
    expect(reconcileOrFilter('NOW', 'CUT')).toContain('sent_at.lt.CUT');
    expect(reconcileOrFilter('NOW', 'CUT')).toContain('status.eq.unknown');
    // First fragment must keep next_retry_at.is.null (kills emptying that literal)
    expect(reconcileOrFilter('NOW', 'CUT')).toContain('next_retry_at.is.null');
    expect(reconcileOrFilter('NOW', 'CUT')).toBe(
      'and(status.eq.unknown,next_retry_at.is.null),' +
        'and(status.eq.unknown,next_retry_at.lte.NOW),' +
        'and(status.eq.sending,sent_at.lt.CUT)'
    );
  });

  it('property: every TABLE value is non-empty snake_case', () => {
    fc.assert(
      fc.property(fc.constantFrom(...Object.values(TABLE)), (name) => {
        expect(name.length).toBeGreaterThan(0);
        expect(name).toMatch(/^[a-z_]+$/);
      }),
      { numRuns: 20 }
    );
  });
});
