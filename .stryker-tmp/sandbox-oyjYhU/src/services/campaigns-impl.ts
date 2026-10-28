// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { randomUUID } from 'crypto';
import { createServerClient } from '@/lib/supabase';
import { getMessagingAdapter } from '@/lib/messaging';
import { getTemplate } from '@/lib/templates';
import type { Database } from '@/types/database';
import { CLAIM_STALE_MS, campaignStepMessageSid, decideReplyEnrollmentAction, getCampaignReplyMode, hasFreshClaim, parkedNextSendAt, planEnrollmentStart, selectCampaignForUrgency } from '@/services/campaign-logic';
import { parseMessageSid, recoveryMessageSid } from '@/services/sms-sid';
import { parkNextAt, reconcileAmbiguousSms as reconcileViaSendModule, sendMessage, resolveRecoveryOutcome } from '@/services/send';
import { decideCampaignLeadGates, decideCampaignSendDispatch, decideEnrollmentGates, decideEnrollmentPlan, decideReconcileAdvanceEligibility, decideRequeueEligibility, decideSkipRecoveryGate, decideSwitchClaimGate, mapRecoveryOutcomeToState } from '@/services/campaign-decisions';
import { processDeferredRecoveries, sendRecoverySMS } from '@/services/sms';
import { SuppressionLookupError, isPhoneSuppressed } from '@/services/suppressions';
import { ENROLLMENT_CLAIM_SELECT } from '@/lib/postgrest-select';
type Business = Database['public']['Tables']['businesses']['Row'];
type Lead = Database['public']['Tables']['leads']['Row'];
type Campaign = Database['public']['Tables']['campaigns']['Row'];
type CampaignStep = Database['public']['Tables']['campaign_steps']['Row'];
type CampaignEnrollment = Database['public']['Tables']['campaign_enrollments']['Row'];
export type EnrollmentResult = {
  enrolled: true;
  campaignId: string;
  campaignName: string;
  currentStep: number;
  nextSendAt: string;
  skippedInitial: boolean;
  switched?: boolean;
} | {
  enrolled: false;
  reason: string;
};
type Supabase = ReturnType<typeof createServerClient>;
export async function enrollLeadInCampaign(leadId: string): Promise<EnrollmentResult> {
  if (stryMutAct_9fa48("153")) {
    {}
  } else {
    stryCov_9fa48("153");
    const supabase = createServerClient();
    const {
      data: lead,
      error: leadError
    } = await supabase.from(stryMutAct_9fa48("154") ? "" : (stryCov_9fa48("154"), 'leads')).select(stryMutAct_9fa48("155") ? "" : (stryCov_9fa48("155"), '*, businesses(*)')).eq(stryMutAct_9fa48("156") ? "" : (stryCov_9fa48("156"), 'id'), leadId).single();

    // QC r6 P0: enroll non-responders into Standard (urgency null → Standard
    // campaign). Classification still switches Emergency/High on reply.
    const existing = await getEnrollmentForLead(leadId);
    const gate = decideEnrollmentGates(stryMutAct_9fa48("157") ? {} : (stryCov_9fa48("157"), {
      leadFound: stryMutAct_9fa48("160") ? Boolean(lead) || !leadError : stryMutAct_9fa48("159") ? false : stryMutAct_9fa48("158") ? true : (stryCov_9fa48("158", "159", "160"), Boolean(lead) && (stryMutAct_9fa48("161") ? leadError : (stryCov_9fa48("161"), !leadError))),
      optedOut: Boolean(stryMutAct_9fa48("162") ? lead.opted_out : (stryCov_9fa48("162"), lead?.opted_out)),
      existingStatus: stryMutAct_9fa48("163") ? existing?.status && null : (stryCov_9fa48("163"), (stryMutAct_9fa48("164") ? existing.status : (stryCov_9fa48("164"), existing?.status)) ?? null)
    }));
    if (stryMutAct_9fa48("167") ? false : stryMutAct_9fa48("166") ? true : stryMutAct_9fa48("165") ? gate.ok : (stryCov_9fa48("165", "166", "167"), !gate.ok)) {
      if (stryMutAct_9fa48("168")) {
        {}
      } else {
        stryCov_9fa48("168");
        if (stryMutAct_9fa48("171") ? gate.reason !== 'lead_not_found' : stryMutAct_9fa48("170") ? false : stryMutAct_9fa48("169") ? true : (stryCov_9fa48("169", "170", "171"), gate.reason === (stryMutAct_9fa48("172") ? "" : (stryCov_9fa48("172"), 'lead_not_found')))) {
          if (stryMutAct_9fa48("173")) {
            {}
          } else {
            stryCov_9fa48("173");
            // Stryker disable next-line StringLiteral: log-only message (no control flow)
            if (stryMutAct_9fa48("174")) {
              ;
            } else {
              stryCov_9fa48("174");
              console.error('Failed to fetch lead for enrollment:', leadError);
            }
          }
        }
        return stryMutAct_9fa48("176") ? {} : (stryCov_9fa48("176"), {
          enrolled: stryMutAct_9fa48("177") ? true : (stryCov_9fa48("177"), false),
          reason: gate.reason
        });
      }
    }
    if (stryMutAct_9fa48("180") ? false : stryMutAct_9fa48("179") ? true : stryMutAct_9fa48("178") ? lead : (stryCov_9fa48("178", "179", "180"), !lead)) {
      if (stryMutAct_9fa48("181")) {
        {}
      } else {
        stryCov_9fa48("181");
        return stryMutAct_9fa48("182") ? {} : (stryCov_9fa48("182"), {
          enrolled: stryMutAct_9fa48("183") ? true : (stryCov_9fa48("183"), false),
          reason: stryMutAct_9fa48("184") ? "" : (stryCov_9fa48("184"), 'lead_not_found')
        });
      }
    }
    const {
      data: campaigns,
      error: campaignError
    } = await supabase.from(stryMutAct_9fa48("185") ? "" : (stryCov_9fa48("185"), 'campaigns')).select(stryMutAct_9fa48("186") ? "" : (stryCov_9fa48("186"), '*, campaign_steps(*)')).eq(stryMutAct_9fa48("187") ? "" : (stryCov_9fa48("187"), 'status'), stryMutAct_9fa48("188") ? "" : (stryCov_9fa48("188"), 'active')).eq(stryMutAct_9fa48("189") ? "" : (stryCov_9fa48("189"), 'auto_enroll'), stryMutAct_9fa48("190") ? false : (stryCov_9fa48("190"), true));
    if (stryMutAct_9fa48("193") ? (campaignError || !campaigns) && campaigns.length === 0 : stryMutAct_9fa48("192") ? false : stryMutAct_9fa48("191") ? true : (stryCov_9fa48("191", "192", "193"), (stryMutAct_9fa48("195") ? campaignError && !campaigns : stryMutAct_9fa48("194") ? false : (stryCov_9fa48("194", "195"), campaignError || (stryMutAct_9fa48("196") ? campaigns : (stryCov_9fa48("196"), !campaigns)))) || (stryMutAct_9fa48("198") ? campaigns.length !== 0 : stryMutAct_9fa48("197") ? false : (stryCov_9fa48("197", "198"), campaigns.length === 0)))) {
      if (stryMutAct_9fa48("199")) {
        {}
      } else {
        stryCov_9fa48("199");
        // Stryker disable next-line StringLiteral: log-only message (no control flow)
        if (stryMutAct_9fa48("200")) {
          ;
        } else {
          stryCov_9fa48("200");
          console.warn('No active campaigns found for enrollment');
        }
        return stryMutAct_9fa48("202") ? {} : (stryCov_9fa48("202"), {
          enrolled: stryMutAct_9fa48("203") ? true : (stryCov_9fa48("203"), false),
          reason: stryMutAct_9fa48("204") ? "" : (stryCov_9fa48("204"), 'no_campaigns')
        });
      }
    }
    const selectedCampaign = selectCampaignForUrgency(campaigns as Array<Campaign & {
      campaign_steps: CampaignStep[];
    }>, lead.urgency);
    if (stryMutAct_9fa48("207") ? false : stryMutAct_9fa48("206") ? true : stryMutAct_9fa48("205") ? selectedCampaign : (stryCov_9fa48("205", "206", "207"), !selectedCampaign)) {
      if (stryMutAct_9fa48("208")) {
        {}
      } else {
        stryCov_9fa48("208");
        // Stryker disable next-line StringLiteral: log-only message (no control flow)
        if (stryMutAct_9fa48("209")) {
          ;
        } else {
          stryCov_9fa48("209");
          console.warn('No matching campaign found for lead');
        }
        return stryMutAct_9fa48("211") ? {} : (stryCov_9fa48("211"), {
          enrolled: stryMutAct_9fa48("212") ? true : (stryCov_9fa48("212"), false),
          reason: stryMutAct_9fa48("213") ? "" : (stryCov_9fa48("213"), 'no_matching_campaign')
        });
      }
    }
    const steps = stryMutAct_9fa48("215") ? (selectedCampaign.campaign_steps as unknown as CampaignStep[] || []).sort((a, b) => a.step_number - b.step_number) : stryMutAct_9fa48("214") ? (selectedCampaign.campaign_steps as unknown as CampaignStep[] || []).slice() : (stryCov_9fa48("214", "215"), (stryMutAct_9fa48("218") ? selectedCampaign.campaign_steps as unknown as CampaignStep[] && [] : stryMutAct_9fa48("217") ? false : stryMutAct_9fa48("216") ? true : (stryCov_9fa48("216", "217", "218"), selectedCampaign.campaign_steps as unknown as CampaignStep[] || (stryMutAct_9fa48("219") ? ["Stryker was here"] : (stryCov_9fa48("219"), [])))).slice().sort(stryMutAct_9fa48("220") ? () => undefined : (stryCov_9fa48("220"), (a, b) => stryMutAct_9fa48("221") ? a.step_number + b.step_number : (stryCov_9fa48("221"), a.step_number - b.step_number))));
    if (stryMutAct_9fa48("224") ? steps.length !== 0 : stryMutAct_9fa48("223") ? false : stryMutAct_9fa48("222") ? true : (stryCov_9fa48("222", "223", "224"), steps.length === 0)) {
      if (stryMutAct_9fa48("225")) {
        {}
      } else {
        stryCov_9fa48("225");
        // Stryker disable next-line StringLiteral: log-only message (no control flow)
        if (stryMutAct_9fa48("226")) {
          ;
        } else {
          stryCov_9fa48("226");
          console.error('Campaign has no steps');
        }
        return stryMutAct_9fa48("228") ? {} : (stryCov_9fa48("228"), {
          enrolled: stryMutAct_9fa48("229") ? true : (stryCov_9fa48("229"), false),
          reason: stryMutAct_9fa48("230") ? "" : (stryCov_9fa48("230"), 'no_steps')
        });
      }
    }

    // Gate step 1 on recovery's *resolved* outcome — not just sms_outbound_sid.
    const recoveryState = await getRecoverySendState(supabase, leadId);
    const recoveryConfirmed = stryMutAct_9fa48("233") ? recoveryState === 'confirmed' && Boolean(lead.sms_outbound_sid) : stryMutAct_9fa48("232") ? false : stryMutAct_9fa48("231") ? true : (stryCov_9fa48("231", "232", "233"), (stryMutAct_9fa48("235") ? recoveryState !== 'confirmed' : stryMutAct_9fa48("234") ? false : (stryCov_9fa48("234", "235"), recoveryState === (stryMutAct_9fa48("236") ? "" : (stryCov_9fa48("236"), 'confirmed')))) || Boolean(lead.sms_outbound_sid));
    // Recovery only substitutes Standard's delay-0 initial — never Emergency/High
    // (staging evidence c: first Emergency step must still go out).
    const plan = decideEnrollmentPlan(stryMutAct_9fa48("237") ? {} : (stryCov_9fa48("237"), {
      steps,
      recoveryState,
      recoveryConfirmed,
      treatRecoveryAsInitial: stryMutAct_9fa48("240") ? selectedCampaign.urgency_filter != null : stryMutAct_9fa48("239") ? false : stryMutAct_9fa48("238") ? true : (stryCov_9fa48("238", "239", "240"), selectedCampaign.urgency_filter == null)
    }));
    if (stryMutAct_9fa48("243") ? false : stryMutAct_9fa48("242") ? true : stryMutAct_9fa48("241") ? plan.ok : (stryCov_9fa48("241", "242", "243"), !plan.ok)) {
      if (stryMutAct_9fa48("244")) {
        {}
      } else {
        stryCov_9fa48("244");
        return stryMutAct_9fa48("245") ? {} : (stryCov_9fa48("245"), {
          enrolled: stryMutAct_9fa48("246") ? true : (stryCov_9fa48("246"), false),
          reason: plan.reason
        });
      }
    }
    const nextSendAt = plan.nextSendAt;
    const {
      error: enrollError
    } = await supabase.from(stryMutAct_9fa48("247") ? "" : (stryCov_9fa48("247"), 'campaign_enrollments')).insert(stryMutAct_9fa48("248") ? {} : (stryCov_9fa48("248"), {
      lead_id: leadId,
      campaign_id: selectedCampaign.id,
      current_step: plan.currentStep,
      status: stryMutAct_9fa48("249") ? "" : (stryCov_9fa48("249"), 'active'),
      next_send_at: nextSendAt,
      claimed_at: null,
      claim_token: null
    }));
    if (stryMutAct_9fa48("251") ? false : stryMutAct_9fa48("250") ? true : (stryCov_9fa48("250", "251"), enrollError)) {
      if (stryMutAct_9fa48("252")) {
        {}
      } else {
        stryCov_9fa48("252");
        if (stryMutAct_9fa48("255") ? enrollError.code !== '23505' : stryMutAct_9fa48("254") ? false : stryMutAct_9fa48("253") ? true : (stryCov_9fa48("253", "254", "255"), enrollError.code === (stryMutAct_9fa48("256") ? "" : (stryCov_9fa48("256"), '23505')))) {
          if (stryMutAct_9fa48("257")) {
            {}
          } else {
            stryCov_9fa48("257");
            return stryMutAct_9fa48("258") ? {} : (stryCov_9fa48("258"), {
              enrolled: stryMutAct_9fa48("259") ? true : (stryCov_9fa48("259"), false),
              reason: stryMutAct_9fa48("260") ? "" : (stryCov_9fa48("260"), 'already_enrolled:unique')
            });
          }
        }
        // Stryker disable next-line StringLiteral: log-only message (no control flow)
        if (stryMutAct_9fa48("261")) {
          ;
        } else {
          stryCov_9fa48("261");
          console.error('Failed to enroll lead:', enrollError);
        }
        return stryMutAct_9fa48("263") ? {} : (stryCov_9fa48("263"), {
          enrolled: stryMutAct_9fa48("264") ? true : (stryCov_9fa48("264"), false),
          reason: stryMutAct_9fa48("265") ? "" : (stryCov_9fa48("265"), 'insert_failed')
        });
      }
    }

    // Stryker disable next-line StringLiteral: log-only message (no control flow)
    console.log((stryMutAct_9fa48("267") ? `` : (stryCov_9fa48("267"), `Lead ${leadId} enrolled in campaign ${selectedCampaign.name} `)) + (stryMutAct_9fa48("268") ? `` : (stryCov_9fa48("268"), `(urgency=${stryMutAct_9fa48("269") ? lead.urgency && 'null' : (stryCov_9fa48("269"), lead.urgency ?? (stryMutAct_9fa48("270") ? "" : (stryCov_9fa48("270"), 'null')))}, step=${plan.currentStep}`)) + (stryMutAct_9fa48("271") ? `` : (stryCov_9fa48("271"), `${plan.skippedInitial ? stryMutAct_9fa48("272") ? "" : (stryCov_9fa48("272"), ', skipped initial') : stryMutAct_9fa48("273") ? "Stryker was here!" : (stryCov_9fa48("273"), '')}), next send: ${nextSendAt}`)));
    return stryMutAct_9fa48("274") ? {} : (stryCov_9fa48("274"), {
      enrolled: stryMutAct_9fa48("275") ? false : (stryCov_9fa48("275"), true),
      campaignId: selectedCampaign.id,
      campaignName: selectedCampaign.name,
      currentStep: plan.currentStep,
      nextSendAt,
      skippedInitial: plan.skippedInitial
    });
  }
}

/**
 * Switch enrollment to another campaign. Refuses while a fresh claim is held.
 * Requires status='active' and no fresh claim (claim_token/claimed_at cleared or stale).
 */
export async function switchEnrollmentCampaign(leadId: string, targetCampaignId: string): Promise<EnrollmentResult> {
  if (stryMutAct_9fa48("276")) {
    {}
  } else {
    stryCov_9fa48("276");
    const supabase = createServerClient();
    const existing = await getEnrollmentForLead(leadId);
    const switchGate = decideSwitchClaimGate(stryMutAct_9fa48("277") ? {} : (stryCov_9fa48("277"), {
      hasEnrollment: Boolean(existing),
      freshClaim: existing ? hasFreshClaim(existing) : stryMutAct_9fa48("278") ? true : (stryCov_9fa48("278"), false)
    }));
    if (stryMutAct_9fa48("281") ? false : stryMutAct_9fa48("280") ? true : stryMutAct_9fa48("279") ? switchGate.ok : (stryCov_9fa48("279", "280", "281"), !switchGate.ok)) {
      if (stryMutAct_9fa48("282")) {
        {}
      } else {
        stryCov_9fa48("282");
        return stryMutAct_9fa48("283") ? {} : (stryCov_9fa48("283"), {
          enrolled: stryMutAct_9fa48("284") ? true : (stryCov_9fa48("284"), false),
          reason: switchGate.reason
        });
      }
    }
    const {
      data: lead,
      error: leadError
    } = await supabase.from(stryMutAct_9fa48("285") ? "" : (stryCov_9fa48("285"), 'leads')).select(stryMutAct_9fa48("286") ? "" : (stryCov_9fa48("286"), '*')).eq(stryMutAct_9fa48("287") ? "" : (stryCov_9fa48("287"), 'id'), leadId).single();
    if (stryMutAct_9fa48("290") ? leadError && !lead : stryMutAct_9fa48("289") ? false : stryMutAct_9fa48("288") ? true : (stryCov_9fa48("288", "289", "290"), leadError || (stryMutAct_9fa48("291") ? lead : (stryCov_9fa48("291"), !lead)))) {
      if (stryMutAct_9fa48("292")) {
        {}
      } else {
        stryCov_9fa48("292");
        return stryMutAct_9fa48("293") ? {} : (stryCov_9fa48("293"), {
          enrolled: stryMutAct_9fa48("294") ? true : (stryCov_9fa48("294"), false),
          reason: stryMutAct_9fa48("295") ? "" : (stryCov_9fa48("295"), 'lead_not_found')
        });
      }
    }
    const {
      data: campaign,
      error: campError
    } = await supabase.from(stryMutAct_9fa48("296") ? "" : (stryCov_9fa48("296"), 'campaigns')).select(stryMutAct_9fa48("297") ? "" : (stryCov_9fa48("297"), '*, campaign_steps(*)')).eq(stryMutAct_9fa48("298") ? "" : (stryCov_9fa48("298"), 'id'), targetCampaignId).single();
    if (stryMutAct_9fa48("301") ? campError && !campaign : stryMutAct_9fa48("300") ? false : stryMutAct_9fa48("299") ? true : (stryCov_9fa48("299", "300", "301"), campError || (stryMutAct_9fa48("302") ? campaign : (stryCov_9fa48("302"), !campaign)))) {
      if (stryMutAct_9fa48("303")) {
        {}
      } else {
        stryCov_9fa48("303");
        return stryMutAct_9fa48("304") ? {} : (stryCov_9fa48("304"), {
          enrolled: stryMutAct_9fa48("305") ? true : (stryCov_9fa48("305"), false),
          reason: stryMutAct_9fa48("306") ? "" : (stryCov_9fa48("306"), 'campaign_not_found')
        });
      }
    }
    const steps = stryMutAct_9fa48("308") ? (campaign.campaign_steps as unknown as CampaignStep[] || []).sort((a, b) => a.step_number - b.step_number) : stryMutAct_9fa48("307") ? (campaign.campaign_steps as unknown as CampaignStep[] || []).slice() : (stryCov_9fa48("307", "308"), (stryMutAct_9fa48("311") ? campaign.campaign_steps as unknown as CampaignStep[] && [] : stryMutAct_9fa48("310") ? false : stryMutAct_9fa48("309") ? true : (stryCov_9fa48("309", "310", "311"), campaign.campaign_steps as unknown as CampaignStep[] || (stryMutAct_9fa48("312") ? ["Stryker was here"] : (stryCov_9fa48("312"), [])))).slice().sort(stryMutAct_9fa48("313") ? () => undefined : (stryCov_9fa48("313"), (a, b) => stryMutAct_9fa48("314") ? a.step_number + b.step_number : (stryCov_9fa48("314"), a.step_number - b.step_number))));
    if (stryMutAct_9fa48("317") ? steps.length !== 0 : stryMutAct_9fa48("316") ? false : stryMutAct_9fa48("315") ? true : (stryCov_9fa48("315", "316", "317"), steps.length === 0)) {
      if (stryMutAct_9fa48("318")) {
        {}
      } else {
        stryCov_9fa48("318");
        return stryMutAct_9fa48("319") ? {} : (stryCov_9fa48("319"), {
          enrolled: stryMutAct_9fa48("320") ? true : (stryCov_9fa48("320"), false),
          reason: stryMutAct_9fa48("321") ? "" : (stryCov_9fa48("321"), 'no_steps')
        });
      }
    }

    // Staging (c): recovery ≠ Emergency initial — always start at step 1 of the
    // target campaign so the first Emergency text goes out on switch.
    const plan = planEnrollmentStart(steps, stryMutAct_9fa48("322") ? {} : (stryCov_9fa48("322"), {
      recoveryAlreadySent: Boolean(lead.sms_outbound_sid),
      treatRecoveryAsInitial: stryMutAct_9fa48("323") ? true : (stryCov_9fa48("323"), false)
    }));
    const nextSendAt = plan.nextSendAt.toISOString();
    const staleBefore = new Date(stryMutAct_9fa48("324") ? Date.now() + CLAIM_STALE_MS : (stryCov_9fa48("324"), Date.now() - CLAIM_STALE_MS)).toISOString();

    // Only switch when not mid-send: claim_token null OR claim stale.
    // PostgREST re-applies filters to the representation — select every column
    // referenced by the filter or Postgres returns 42703 (staging evidence c).
    const {
      data: updated,
      error: updateError
    } = await supabase.from(stryMutAct_9fa48("325") ? "" : (stryCov_9fa48("325"), 'campaign_enrollments')).update(stryMutAct_9fa48("326") ? {} : (stryCov_9fa48("326"), {
      campaign_id: targetCampaignId,
      current_step: plan.currentStep,
      status: stryMutAct_9fa48("327") ? "" : (stryCov_9fa48("327"), 'active'),
      next_send_at: nextSendAt,
      claimed_at: null,
      claim_token: null,
      paused_at: null,
      completed_at: null,
      updated_at: new Date().toISOString()
    })).eq(stryMutAct_9fa48("328") ? "" : (stryCov_9fa48("328"), 'lead_id'), leadId).eq(stryMutAct_9fa48("329") ? "" : (stryCov_9fa48("329"), 'status'), stryMutAct_9fa48("330") ? "" : (stryCov_9fa48("330"), 'active')).or(stryMutAct_9fa48("331") ? `` : (stryCov_9fa48("331"), `claim_token.is.null,claimed_at.lt.${staleBefore}`)).select(ENROLLMENT_CLAIM_SELECT).maybeSingle();
    if (stryMutAct_9fa48("334") ? updateError && !updated : stryMutAct_9fa48("333") ? false : stryMutAct_9fa48("332") ? true : (stryCov_9fa48("332", "333", "334"), updateError || (stryMutAct_9fa48("335") ? updated : (stryCov_9fa48("335"), !updated)))) {
      if (stryMutAct_9fa48("336")) {
        {}
      } else {
        stryCov_9fa48("336");
        // Stryker disable next-line StringLiteral: log-only message (no control flow)
        if (stryMutAct_9fa48("337")) {
          ;
        } else {
          stryCov_9fa48("337");
          console.error('Failed to switch enrollment (maybe mid-send):', updateError);
        }
        return stryMutAct_9fa48("339") ? {} : (stryCov_9fa48("339"), {
          enrolled: stryMutAct_9fa48("340") ? true : (stryCov_9fa48("340"), false),
          reason: stryMutAct_9fa48("341") ? "" : (stryCov_9fa48("341"), 'deferred_or_switch_failed')
        });
      }
    }

    // Stryker disable next-line StringLiteral: log-only message (no control flow)
    console.log((stryMutAct_9fa48("343") ? `` : (stryCov_9fa48("343"), `Lead ${leadId} switched to campaign ${campaign.name}, `)) + (stryMutAct_9fa48("344") ? `` : (stryCov_9fa48("344"), `step=${plan.currentStep}, next send: ${nextSendAt}`)));
    return stryMutAct_9fa48("345") ? {} : (stryCov_9fa48("345"), {
      enrolled: stryMutAct_9fa48("346") ? false : (stryCov_9fa48("346"), true),
      campaignId: targetCampaignId,
      campaignName: campaign.name,
      currentStep: plan.currentStep,
      nextSendAt,
      skippedInitial: plan.skippedInitial,
      switched: stryMutAct_9fa48("347") ? false : (stryCov_9fa48("347"), true)
    });
  }
}
export async function handleClassifiedReplyEnrollment(leadId: string, urgency: string | null): Promise<{
  action: string;
  campaignName?: string;
}> {
  if (stryMutAct_9fa48("348")) {
    {}
  } else {
    stryCov_9fa48("348");
    const supabase = createServerClient();
    const enrollment = await getEnrollmentForLead(leadId);
    const replyMode = getCampaignReplyMode();
    const {
      data: campaigns
    } = await supabase.from(stryMutAct_9fa48("349") ? "" : (stryCov_9fa48("349"), 'campaigns')).select(stryMutAct_9fa48("350") ? "" : (stryCov_9fa48("350"), 'id, name, urgency_filter')).eq(stryMutAct_9fa48("351") ? "" : (stryCov_9fa48("351"), 'status'), stryMutAct_9fa48("352") ? "" : (stryCov_9fa48("352"), 'active')).eq(stryMutAct_9fa48("353") ? "" : (stryCov_9fa48("353"), 'auto_enroll'), stryMutAct_9fa48("354") ? false : (stryCov_9fa48("354"), true));
    const target = selectCampaignForUrgency(stryMutAct_9fa48("357") ? campaigns && [] : stryMutAct_9fa48("356") ? false : stryMutAct_9fa48("355") ? true : (stryCov_9fa48("355", "356", "357"), campaigns || (stryMutAct_9fa48("358") ? ["Stryker was here"] : (stryCov_9fa48("358"), []))), urgency);
    const decision = decideReplyEnrollmentAction(enrollment ? stryMutAct_9fa48("359") ? {} : (stryCov_9fa48("359"), {
      id: enrollment.id,
      campaign_id: enrollment.campaign_id,
      status: enrollment.status,
      claimed_at: enrollment.claimed_at,
      claim_token: enrollment.claim_token
    }) : null, target, stryMutAct_9fa48("360") ? {} : (stryCov_9fa48("360"), {
      replyMode
    }));
    if (stryMutAct_9fa48("363") ? decision.action === 'defer_switch' || target : stryMutAct_9fa48("362") ? false : stryMutAct_9fa48("361") ? true : (stryCov_9fa48("361", "362", "363"), (stryMutAct_9fa48("365") ? decision.action !== 'defer_switch' : stryMutAct_9fa48("364") ? true : (stryCov_9fa48("364", "365"), decision.action === (stryMutAct_9fa48("366") ? "" : (stryCov_9fa48("366"), 'defer_switch')))) && target)) {
      if (stryMutAct_9fa48("367")) {
        {}
      } else {
        stryCov_9fa48("367");
        // Stryker disable next-line StringLiteral: log-only message (no control flow)
        console.log(stryMutAct_9fa48("369") ? `` : (stryCov_9fa48("369"), `Deferring switch for lead ${leadId}; fresh claim held (mid-send)`));
        return stryMutAct_9fa48("370") ? {} : (stryCov_9fa48("370"), {
          action: stryMutAct_9fa48("371") ? "" : (stryCov_9fa48("371"), 'defer_switch'),
          campaignName: target.name
        });
      }
    }
    if (stryMutAct_9fa48("374") ? decision.action === 'switch' || target : stryMutAct_9fa48("373") ? false : stryMutAct_9fa48("372") ? true : (stryCov_9fa48("372", "373", "374"), (stryMutAct_9fa48("376") ? decision.action !== 'switch' : stryMutAct_9fa48("375") ? true : (stryCov_9fa48("375", "376"), decision.action === (stryMutAct_9fa48("377") ? "" : (stryCov_9fa48("377"), 'switch')))) && target)) {
      if (stryMutAct_9fa48("378")) {
        {}
      } else {
        stryCov_9fa48("378");
        const result = await switchEnrollmentCampaign(leadId, target.id);
        if (stryMutAct_9fa48("381") ? !result.enrolled || result.reason.startsWith('deferred') : stryMutAct_9fa48("380") ? false : stryMutAct_9fa48("379") ? true : (stryCov_9fa48("379", "380", "381"), (stryMutAct_9fa48("382") ? result.enrolled : (stryCov_9fa48("382"), !result.enrolled)) && (stryMutAct_9fa48("383") ? result.reason.endsWith('deferred') : (stryCov_9fa48("383"), result.reason.startsWith(stryMutAct_9fa48("384") ? "" : (stryCov_9fa48("384"), 'deferred')))))) {
          if (stryMutAct_9fa48("385")) {
            {}
          } else {
            stryCov_9fa48("385");
            return stryMutAct_9fa48("386") ? {} : (stryCov_9fa48("386"), {
              action: stryMutAct_9fa48("387") ? "" : (stryCov_9fa48("387"), 'defer_switch'),
              campaignName: target.name
            });
          }
        }
        return stryMutAct_9fa48("388") ? {} : (stryCov_9fa48("388"), {
          action: result.enrolled ? stryMutAct_9fa48("389") ? "" : (stryCov_9fa48("389"), 'switch') : stryMutAct_9fa48("390") ? `` : (stryCov_9fa48("390"), `skip:${result.reason}`),
          campaignName: result.enrolled ? result.campaignName : target.name
        });
      }
    }
    if (stryMutAct_9fa48("393") ? decision.action !== 'pause' : stryMutAct_9fa48("392") ? false : stryMutAct_9fa48("391") ? true : (stryCov_9fa48("391", "392", "393"), decision.action === (stryMutAct_9fa48("394") ? "" : (stryCov_9fa48("394"), 'pause')))) {
      if (stryMutAct_9fa48("395")) {
        {}
      } else {
        stryCov_9fa48("395");
        await pauseCampaignForLead(leadId);
        return stryMutAct_9fa48("396") ? {} : (stryCov_9fa48("396"), {
          action: stryMutAct_9fa48("397") ? "" : (stryCov_9fa48("397"), 'pause')
        });
      }
    }
    if (stryMutAct_9fa48("400") ? false : stryMutAct_9fa48("399") ? true : stryMutAct_9fa48("398") ? enrollment : (stryCov_9fa48("398", "399", "400"), !enrollment)) {
      if (stryMutAct_9fa48("401")) {
        {}
      } else {
        stryCov_9fa48("401");
        const result = await enrollLeadInCampaign(leadId);
        return stryMutAct_9fa48("402") ? {} : (stryCov_9fa48("402"), {
          action: result.enrolled ? stryMutAct_9fa48("403") ? "" : (stryCov_9fa48("403"), 'enroll') : stryMutAct_9fa48("404") ? `` : (stryCov_9fa48("404"), `skip:${result.reason}`),
          campaignName: result.enrolled ? result.campaignName : undefined
        });
      }
    }
    return stryMutAct_9fa48("405") ? {} : (stryCov_9fa48("405"), {
      action: stryMutAct_9fa48("406") ? "" : (stryCov_9fa48("406"), 'noop')
    });
  }
}
export async function getEnrollmentForLead(leadId: string): Promise<CampaignEnrollment | null> {
  if (stryMutAct_9fa48("407")) {
    {}
  } else {
    stryCov_9fa48("407");
    const supabase = createServerClient();
    const {
      data,
      error
    } = await supabase.from(stryMutAct_9fa48("408") ? "" : (stryCov_9fa48("408"), 'campaign_enrollments')).select(stryMutAct_9fa48("409") ? "" : (stryCov_9fa48("409"), '*')).eq(stryMutAct_9fa48("410") ? "" : (stryCov_9fa48("410"), 'lead_id'), leadId).maybeSingle();
    if (stryMutAct_9fa48("412") ? false : stryMutAct_9fa48("411") ? true : (stryCov_9fa48("411", "412"), error)) {
      if (stryMutAct_9fa48("413")) {
        {}
      } else {
        stryCov_9fa48("413");
        // Stryker disable next-line StringLiteral: log-only message (no control flow)
        if (stryMutAct_9fa48("414")) {
          ;
        } else {
          stryCov_9fa48("414");
          console.error('Failed to fetch enrollment for lead:', error);
        }
        return null;
      }
    }
    return data;
  }
}

/**
 * Send SMS for a campaign step. Requires an active claim_token on the row.
 * Insert-before-send with campaign-scoped UNIQUE(message_sid).
 */
export async function sendCampaignSMS(enrollmentId: string, claimToken?: string): Promise<boolean> {
  if (stryMutAct_9fa48("416")) {
    {}
  } else {
    stryCov_9fa48("416");
    const supabase = createServerClient();
    const {
      data: enrollment,
      error: enrollError
    } = await supabase.from(stryMutAct_9fa48("417") ? "" : (stryCov_9fa48("417"), 'campaign_enrollments')).select(stryMutAct_9fa48("418") ? "" : (stryCov_9fa48("418"), '*, leads!inner(*, businesses(*)), campaigns!inner(*)')).eq(stryMutAct_9fa48("419") ? "" : (stryCov_9fa48("419"), 'id'), enrollmentId).single();
    if (stryMutAct_9fa48("422") ? enrollError && !enrollment : stryMutAct_9fa48("421") ? false : stryMutAct_9fa48("420") ? true : (stryCov_9fa48("420", "421", "422"), enrollError || (stryMutAct_9fa48("423") ? enrollment : (stryCov_9fa48("423"), !enrollment)))) {
      if (stryMutAct_9fa48("424")) {
        {}
      } else {
        stryCov_9fa48("424");
        // Stryker disable next-line StringLiteral: log-only message (no control flow)
        if (stryMutAct_9fa48("425")) {
          ;
        } else {
          stryCov_9fa48("425");
          console.error('Failed to fetch enrollment:', enrollError);
        }
        return stryMutAct_9fa48("427") ? true : (stryCov_9fa48("427"), false);
      }
    }
    const token = stryMutAct_9fa48("430") ? claimToken && enrollment.claim_token : stryMutAct_9fa48("429") ? false : stryMutAct_9fa48("428") ? true : (stryCov_9fa48("428", "429", "430"), claimToken || enrollment.claim_token);
    if (stryMutAct_9fa48("433") ? false : stryMutAct_9fa48("432") ? true : stryMutAct_9fa48("431") ? token : (stryCov_9fa48("431", "432", "433"), !token)) {
      if (stryMutAct_9fa48("434")) {
        {}
      } else {
        stryCov_9fa48("434");
        // Stryker disable next-line StringLiteral: log-only message (no control flow)
        if (stryMutAct_9fa48("435")) {
          ;
        } else {
          stryCov_9fa48("435");
          console.error(`No claim_token for enrollment ${enrollmentId}`);
        }
        return stryMutAct_9fa48("437") ? true : (stryCov_9fa48("437"), false);
      }
    }
    const lead = (enrollment as any).leads as Lead & {
      businesses: Business;
    };
    const business = lead.businesses;
    const campaign = (enrollment as any).campaigns as Campaign;
    let suppressed = stryMutAct_9fa48("438") ? true : (stryCov_9fa48("438"), false);
    let suppressionLookupFailed = stryMutAct_9fa48("439") ? true : (stryCov_9fa48("439"), false);
    try {
      if (stryMutAct_9fa48("440")) {
        {}
      } else {
        stryCov_9fa48("440");
        suppressed = await isPhoneSuppressed(business.id, lead.caller_phone);
      }
    } catch (err) {
      if (stryMutAct_9fa48("441")) {
        {}
      } else {
        stryCov_9fa48("441");
        if (stryMutAct_9fa48("443") ? false : stryMutAct_9fa48("442") ? true : (stryCov_9fa48("442", "443"), err instanceof SuppressionLookupError)) {
          if (stryMutAct_9fa48("444")) {
            {}
          } else {
            stryCov_9fa48("444");
            // Stryker disable next-line StringLiteral: log-only message (no control flow)
            if (stryMutAct_9fa48("445")) {
              ;
            } else {
              stryCov_9fa48("445");
              console.error('Suppression check failed closed:', err.message);
            }
            suppressionLookupFailed = stryMutAct_9fa48("447") ? false : (stryCov_9fa48("447"), true);
          }
        } else {
          if (stryMutAct_9fa48("448")) {
            {}
          } else {
            stryCov_9fa48("448");
            throw err;
          }
        }
      }
    }
    const leadGate = decideCampaignLeadGates(stryMutAct_9fa48("449") ? {} : (stryCov_9fa48("449"), {
      optedOut: Boolean(lead.opted_out),
      suppressed,
      suppressionLookupFailed
    }));
    if (stryMutAct_9fa48("452") ? leadGate.action !== 'pause' : stryMutAct_9fa48("451") ? false : stryMutAct_9fa48("450") ? true : (stryCov_9fa48("450", "451", "452"), leadGate.action === (stryMutAct_9fa48("453") ? "" : (stryCov_9fa48("453"), 'pause')))) {
      if (stryMutAct_9fa48("454")) {
        {}
      } else {
        stryCov_9fa48("454");
        if (stryMutAct_9fa48("456") ? false : stryMutAct_9fa48("455") ? true : (stryCov_9fa48("455", "456"), suppressed)) {
          if (stryMutAct_9fa48("457")) {
            {}
          } else {
            stryCov_9fa48("457");
            // Stryker disable next-line StringLiteral: log-only message (no control flow)
            if (stryMutAct_9fa48("458")) {
              ;
            } else {
              stryCov_9fa48("458");
              console.log(`Suppressed phone for enrollment ${enrollmentId}; pausing`);
            }
          }
        }
        await pauseCampaignForLead(lead.id);
        return leadGate.success;
      }
    }
    if (stryMutAct_9fa48("462") ? leadGate.action !== 'release_fail' : stryMutAct_9fa48("461") ? false : stryMutAct_9fa48("460") ? true : (stryCov_9fa48("460", "461", "462"), leadGate.action === (stryMutAct_9fa48("463") ? "" : (stryCov_9fa48("463"), 'release_fail')))) {
      if (stryMutAct_9fa48("464")) {
        {}
      } else {
        stryCov_9fa48("464");
        await releaseClaim(supabase, enrollmentId, token);
        return leadGate.success;
      }
    }
    const {
      data: steps,
      error: stepsError
    } = await supabase.from(stryMutAct_9fa48("465") ? "" : (stryCov_9fa48("465"), 'campaign_steps')).select(stryMutAct_9fa48("466") ? "" : (stryCov_9fa48("466"), '*')).eq(stryMutAct_9fa48("467") ? "" : (stryCov_9fa48("467"), 'campaign_id'), campaign.id).order(stryMutAct_9fa48("468") ? "" : (stryCov_9fa48("468"), 'step_number'), stryMutAct_9fa48("469") ? {} : (stryCov_9fa48("469"), {
      ascending: stryMutAct_9fa48("470") ? false : (stryCov_9fa48("470"), true)
    }));
    if (stryMutAct_9fa48("473") ? (stepsError || !steps) && steps.length === 0 : stryMutAct_9fa48("472") ? false : stryMutAct_9fa48("471") ? true : (stryCov_9fa48("471", "472", "473"), (stryMutAct_9fa48("475") ? stepsError && !steps : stryMutAct_9fa48("474") ? false : (stryCov_9fa48("474", "475"), stepsError || (stryMutAct_9fa48("476") ? steps : (stryCov_9fa48("476"), !steps)))) || (stryMutAct_9fa48("478") ? steps.length !== 0 : stryMutAct_9fa48("477") ? false : (stryCov_9fa48("477", "478"), steps.length === 0)))) {
      if (stryMutAct_9fa48("479")) {
        {}
      } else {
        stryCov_9fa48("479");
        // Stryker disable next-line StringLiteral: log-only message (no control flow)
        if (stryMutAct_9fa48("480")) {
          ;
        } else {
          stryCov_9fa48("480");
          console.error('Failed to fetch campaign steps:', stepsError);
        }
        await releaseClaim(supabase, enrollmentId, token);
        return stryMutAct_9fa48("482") ? true : (stryCov_9fa48("482"), false);
      }
    }
    const currentStep = steps.find(stryMutAct_9fa48("483") ? () => undefined : (stryCov_9fa48("483"), s => stryMutAct_9fa48("486") ? s.step_number !== enrollment.current_step : stryMutAct_9fa48("485") ? false : stryMutAct_9fa48("484") ? true : (stryCov_9fa48("484", "485", "486"), s.step_number === enrollment.current_step)));
    if (stryMutAct_9fa48("489") ? false : stryMutAct_9fa48("488") ? true : stryMutAct_9fa48("487") ? currentStep : (stryCov_9fa48("487", "488", "489"), !currentStep)) {
      if (stryMutAct_9fa48("490")) {
        {}
      } else {
        stryCov_9fa48("490");
        // Stryker disable next-line StringLiteral: log-only message (no control flow)
        if (stryMutAct_9fa48("491")) {
          ;
        } else {
          stryCov_9fa48("491");
          console.error(`Step ${enrollment.current_step} not found`);
        }
        await releaseClaim(supabase, enrollmentId, token);
        return stryMutAct_9fa48("493") ? true : (stryCov_9fa48("493"), false);
      }
    }
    const stepSid = campaignStepMessageSid(enrollmentId, campaign.id, enrollment.current_step);
    const messageBody = getTemplate(currentStep.template_key, stryMutAct_9fa48("494") ? {} : (stryCov_9fa48("494"), {
      business: business.name,
      name: stryMutAct_9fa48("495") ? "Stryker was here!" : (stryCov_9fa48("495"), ''),
      issue: stryMutAct_9fa48("498") ? lead.issue && '' : stryMutAct_9fa48("497") ? false : stryMutAct_9fa48("496") ? true : (stryCov_9fa48("496", "497", "498"), lead.issue || (stryMutAct_9fa48("499") ? "Stryker was here!" : (stryCov_9fa48("499"), '')))
    }));
    const leadTz = stryMutAct_9fa48("500") ? (lead as {
      timezone?: string | null;
    }).timezone && null : (stryCov_9fa48("500"), (lead as {
      timezone?: string | null;
    }).timezone ?? null);
    const parkedFallback = parkedNextSendAt();

    // Single send module: E.164, quiet hours, recovery gate, caps+echo, relay.
    const outcome = await sendMessage(stryMutAct_9fa48("501") ? {} : (stryCov_9fa48("501"), {
      kind: stryMutAct_9fa48("502") ? "" : (stryCov_9fa48("502"), 'campaign'),
      leadId: lead.id,
      businessId: business.id,
      to: lead.caller_phone,
      body: messageBody,
      idempotencyKey: stepSid,
      enrollmentId,
      campaignId: campaign.id,
      stepNumber: enrollment.current_step,
      claimToken: token,
      leadTimezone: leadTz,
      businessTimezone: business.timezone,
      skipRecoveryGate: decideSkipRecoveryGate(stryMutAct_9fa48("503") ? {} : (stryCov_9fa48("503"), {
        delayMinutes: currentStep.delay_minutes,
        currentStep: enrollment.current_step,
        firstStepNumber: stryMutAct_9fa48("504") ? steps[0].step_number : (stryCov_9fa48("504"), steps[0]?.step_number)
      }))
    }));
    const dispatch = decideCampaignSendDispatch(outcome, parkedFallback);
    switch (dispatch.type) {
      case stryMutAct_9fa48("506") ? "" : (stryCov_9fa48("506"), 'advance'):
        if (stryMutAct_9fa48("505")) {} else {
          stryCov_9fa48("505");
          {
            if (stryMutAct_9fa48("507")) {
              {}
            } else {
              stryCov_9fa48("507");
              const advanced = await advanceEnrollment(supabase, enrollmentId, token, enrollment.current_step, steps);
              if (stryMutAct_9fa48("510") ? !advanced || outcome.kind === 'sent' : stryMutAct_9fa48("509") ? false : stryMutAct_9fa48("508") ? true : (stryCov_9fa48("508", "509", "510"), (stryMutAct_9fa48("511") ? advanced : (stryCov_9fa48("511"), !advanced)) && (stryMutAct_9fa48("513") ? outcome.kind !== 'sent' : stryMutAct_9fa48("512") ? true : (stryCov_9fa48("512", "513"), outcome.kind === (stryMutAct_9fa48("514") ? "" : (stryCov_9fa48("514"), 'sent')))))) {
                if (stryMutAct_9fa48("515")) {
                  {}
                } else {
                  stryCov_9fa48("515");
                  // Stryker disable next-line StringLiteral: log-only message (no control flow)
                  if (stryMutAct_9fa48("516")) {
                    ;
                  } else {
                    stryCov_9fa48("516");
                    console.warn(`Post-send advance lost claim for ${enrollmentId}`);
                  }
                }
              }
              if (stryMutAct_9fa48("520") ? outcome.kind !== 'sent' : stryMutAct_9fa48("519") ? false : stryMutAct_9fa48("518") ? true : (stryCov_9fa48("518", "519", "520"), outcome.kind === (stryMutAct_9fa48("521") ? "" : (stryCov_9fa48("521"), 'sent')))) {
                if (stryMutAct_9fa48("522")) {
                  {}
                } else {
                  stryCov_9fa48("522");
                  // Stryker disable next-line StringLiteral: log-only message (no control flow)
                  console.log(stryMutAct_9fa48("524") ? `` : (stryCov_9fa48("524"), `Campaign SMS sent for ${enrollmentId} step ${enrollment.current_step} sid=${outcome.sid}`));
                }
              }
              return dispatch.success;
            }
          }
        }
      case stryMutAct_9fa48("526") ? "" : (stryCov_9fa48("526"), 'release'):
        if (stryMutAct_9fa48("525")) {} else {
          stryCov_9fa48("525");
          await releaseClaim(supabase, enrollmentId, token, stryMutAct_9fa48("527") ? {} : (stryCov_9fa48("527"), {
            nextSendAt: dispatch.nextSendAt
          }));
          return dispatch.success;
        }
      case stryMutAct_9fa48("529") ? "" : (stryCov_9fa48("529"), 'flag_unresolved_tz'):
        if (stryMutAct_9fa48("528")) {} else {
          stryCov_9fa48("528");
          // Stryker disable next-line StringLiteral: log-only message (no control flow)
          console.error(stryMutAct_9fa48("531") ? `` : (stryCov_9fa48("531"), `ALERT: quiet-hours unresolved for enrollment ${enrollmentId}; needs_review`));
          await supabase.from(stryMutAct_9fa48("532") ? "" : (stryCov_9fa48("532"), 'leads')).update(stryMutAct_9fa48("533") ? {} : (stryCov_9fa48("533"), {
            needs_human_review: stryMutAct_9fa48("534") ? false : (stryCov_9fa48("534"), true),
            needs_human_review_at: new Date().toISOString(),
            needs_human_review_reason: stryMutAct_9fa48("535") ? "" : (stryCov_9fa48("535"), 'quiet_hours_unresolved')
          })).eq(stryMutAct_9fa48("536") ? "" : (stryCov_9fa48("536"), 'id'), lead.id);
          await releaseClaim(supabase, enrollmentId, token, stryMutAct_9fa48("537") ? {} : (stryCov_9fa48("537"), {
            nextSendAt: dispatch.nextSendAt
          }));
          return dispatch.success;
        }
      case stryMutAct_9fa48("539") ? "" : (stryCov_9fa48("539"), 'park'):
        if (stryMutAct_9fa48("538")) {} else {
          stryCov_9fa48("538");
          await parkEnrollmentForReconcile(supabase, enrollmentId, token, stryMutAct_9fa48("540") ? {} : (stryCov_9fa48("540"), {
            nextSendAt: dispatch.nextSendAt
          }));
          if (stryMutAct_9fa48("543") ? outcome.kind !== 'ambiguous' : stryMutAct_9fa48("542") ? false : stryMutAct_9fa48("541") ? true : (stryCov_9fa48("541", "542", "543"), outcome.kind === (stryMutAct_9fa48("544") ? "" : (stryCov_9fa48("544"), 'ambiguous')))) {
            if (stryMutAct_9fa48("545")) {
              {}
            } else {
              stryCov_9fa48("545");
              // Stryker disable next-line StringLiteral: log-only message (no control flow)
              console.warn(stryMutAct_9fa48("547") ? `` : (stryCov_9fa48("547"), `Campaign SMS ambiguous for ${enrollmentId} (${outcome.reason}); parked`));
            }
          }
          return dispatch.success;
        }
      case stryMutAct_9fa48("549") ? "" : (stryCov_9fa48("549"), 'pause_opt_out'):
        if (stryMutAct_9fa48("548")) {} else {
          stryCov_9fa48("548");
          await pauseCampaignForLead(lead.id);
          return dispatch.success;
        }
      case stryMutAct_9fa48("551") ? "" : (stryCov_9fa48("551"), 'needs_review_terminal'):
        if (stryMutAct_9fa48("550")) {} else {
          stryCov_9fa48("550");
          // Stryker disable next-line StringLiteral: log-only message (no control flow)
          console.error(stryMutAct_9fa48("553") ? `` : (stryCov_9fa48("553"), `ALERT: campaign SMS needs_review ${enrollmentId} sid=${(stryMutAct_9fa48("556") ? outcome.kind !== 'needs_review' : stryMutAct_9fa48("555") ? false : stryMutAct_9fa48("554") ? true : (stryCov_9fa48("554", "555", "556"), outcome.kind === (stryMutAct_9fa48("557") ? "" : (stryCov_9fa48("557"), 'needs_review')))) ? outcome.sid : stryMutAct_9fa48("558") ? "Stryker was here!" : (stryCov_9fa48("558"), '')} (${dispatch.reason})`));
          // Terminal status — do not re-park every 30 min (QC r6 P1 #7).
          await markEnrollmentNeedsReview(supabase, enrollmentId, token, dispatch.reason);
          return dispatch.success;
        }
      case stryMutAct_9fa48("560") ? "" : (stryCov_9fa48("560"), 'noop_false'):
        if (stryMutAct_9fa48("559")) {} else {
          stryCov_9fa48("559");
          await releaseClaim(supabase, enrollmentId, token);
          return dispatch.success;
        }
    }
  }
}

/**
 * Advance only if we still own the claim (status=active AND claim_token matches).
 * Returns false when ownership was lost (pause/switch mid-send).
 */
export async function advanceEnrollment(supabase: Supabase, enrollmentId: string, claimToken: string, currentStepNumber: number, steps: CampaignStep[]): Promise<boolean> {
  if (stryMutAct_9fa48("561")) {
    {}
  } else {
    stryCov_9fa48("561");
    const nextStepNumber = stryMutAct_9fa48("562") ? currentStepNumber - 1 : (stryCov_9fa48("562"), currentStepNumber + 1);
    const nextStep = steps.find(stryMutAct_9fa48("563") ? () => undefined : (stryCov_9fa48("563"), s => stryMutAct_9fa48("566") ? s.step_number !== nextStepNumber : stryMutAct_9fa48("565") ? false : stryMutAct_9fa48("564") ? true : (stryCov_9fa48("564", "565", "566"), s.step_number === nextStepNumber)));
    if (stryMutAct_9fa48("568") ? false : stryMutAct_9fa48("567") ? true : (stryCov_9fa48("567", "568"), nextStep)) {
      if (stryMutAct_9fa48("569")) {
        {}
      } else {
        stryCov_9fa48("569");
        const nextSendAt = new Date(stryMutAct_9fa48("570") ? Date.now() - nextStep.delay_minutes * 60 * 1000 : (stryCov_9fa48("570"), Date.now() + (stryMutAct_9fa48("571") ? nextStep.delay_minutes * 60 / 1000 : (stryCov_9fa48("571"), (stryMutAct_9fa48("572") ? nextStep.delay_minutes / 60 : (stryCov_9fa48("572"), nextStep.delay_minutes * 60)) * 1000)))).toISOString();
        const {
          data,
          error
        } = await supabase.from(stryMutAct_9fa48("573") ? "" : (stryCov_9fa48("573"), 'campaign_enrollments')).update(stryMutAct_9fa48("574") ? {} : (stryCov_9fa48("574"), {
          current_step: nextStepNumber,
          next_send_at: nextSendAt,
          claimed_at: null,
          claim_token: null,
          updated_at: new Date().toISOString()
        })).eq(stryMutAct_9fa48("575") ? "" : (stryCov_9fa48("575"), 'id'), enrollmentId).eq(stryMutAct_9fa48("576") ? "" : (stryCov_9fa48("576"), 'status'), stryMutAct_9fa48("577") ? "" : (stryCov_9fa48("577"), 'active')).eq(stryMutAct_9fa48("578") ? "" : (stryCov_9fa48("578"), 'claim_token'), claimToken).select(ENROLLMENT_CLAIM_SELECT);
        if (stryMutAct_9fa48("581") ? error && !data?.length : stryMutAct_9fa48("580") ? false : stryMutAct_9fa48("579") ? true : (stryCov_9fa48("579", "580", "581"), error || (stryMutAct_9fa48("582") ? data?.length : (stryCov_9fa48("582"), !(stryMutAct_9fa48("583") ? data.length : (stryCov_9fa48("583"), data?.length)))))) {
          if (stryMutAct_9fa48("584")) {
            {}
          } else {
            stryCov_9fa48("584");
            // Stryker disable next-line StringLiteral: log-only message (no control flow)
            console.warn(stryMutAct_9fa48("586") ? `` : (stryCov_9fa48("586"), `advanceEnrollment ownership miss for ${enrollmentId}:`), stryMutAct_9fa48("587") ? error.message : (stryCov_9fa48("587"), error?.message));
            return stryMutAct_9fa48("588") ? true : (stryCov_9fa48("588"), false);
          }
        }

        // Stryker disable next-line StringLiteral: log-only message (no control flow)
        console.log(stryMutAct_9fa48("590") ? `` : (stryCov_9fa48("590"), `Campaign advanced to step ${nextStepNumber}, scheduled for ${nextSendAt}`));
        return stryMutAct_9fa48("591") ? false : (stryCov_9fa48("591"), true);
      }
    }
    const {
      data,
      error
    } = await supabase.from(stryMutAct_9fa48("592") ? "" : (stryCov_9fa48("592"), 'campaign_enrollments')).update(stryMutAct_9fa48("593") ? {} : (stryCov_9fa48("593"), {
      status: stryMutAct_9fa48("594") ? "" : (stryCov_9fa48("594"), 'completed'),
      completed_at: new Date().toISOString(),
      next_send_at: null,
      claimed_at: null,
      claim_token: null,
      updated_at: new Date().toISOString()
    })).eq(stryMutAct_9fa48("595") ? "" : (stryCov_9fa48("595"), 'id'), enrollmentId).eq(stryMutAct_9fa48("596") ? "" : (stryCov_9fa48("596"), 'status'), stryMutAct_9fa48("597") ? "" : (stryCov_9fa48("597"), 'active')).eq(stryMutAct_9fa48("598") ? "" : (stryCov_9fa48("598"), 'claim_token'), claimToken).select(ENROLLMENT_CLAIM_SELECT);
    if (stryMutAct_9fa48("601") ? error && !data?.length : stryMutAct_9fa48("600") ? false : stryMutAct_9fa48("599") ? true : (stryCov_9fa48("599", "600", "601"), error || (stryMutAct_9fa48("602") ? data?.length : (stryCov_9fa48("602"), !(stryMutAct_9fa48("603") ? data.length : (stryCov_9fa48("603"), data?.length)))))) {
      if (stryMutAct_9fa48("604")) {
        {}
      } else {
        stryCov_9fa48("604");
        // Stryker disable next-line StringLiteral: log-only message (no control flow)
        console.warn(stryMutAct_9fa48("606") ? `` : (stryCov_9fa48("606"), `completeEnrollment ownership miss for ${enrollmentId}:`), stryMutAct_9fa48("607") ? error.message : (stryCov_9fa48("607"), error?.message));
        return stryMutAct_9fa48("608") ? true : (stryCov_9fa48("608"), false);
      }
    }

    // Stryker disable next-line StringLiteral: log-only message (no control flow)
    if (stryMutAct_9fa48("609")) {
      ;
    } else {
      stryCov_9fa48("609");
      console.log(`Campaign completed for enrollment ${enrollmentId}`);
    }
    return stryMutAct_9fa48("611") ? false : (stryCov_9fa48("611"), true);
  }
}
async function releaseClaim(supabase: Supabase, enrollmentId: string, claimToken: string, opts?: {
  nextSendAt?: string;
}): Promise<void> {
  if (stryMutAct_9fa48("612")) {
    {}
  } else {
    stryCov_9fa48("612");
    await supabase.from(stryMutAct_9fa48("613") ? "" : (stryCov_9fa48("613"), 'campaign_enrollments')).update(stryMutAct_9fa48("614") ? {} : (stryCov_9fa48("614"), {
      claimed_at: null,
      claim_token: null,
      next_send_at: stryMutAct_9fa48("615") ? opts?.nextSendAt && new Date(Date.now() + CLAIM_STALE_MS).toISOString() : (stryCov_9fa48("615"), (stryMutAct_9fa48("616") ? opts.nextSendAt : (stryCov_9fa48("616"), opts?.nextSendAt)) ?? new Date(stryMutAct_9fa48("617") ? Date.now() - CLAIM_STALE_MS : (stryCov_9fa48("617"), Date.now() + CLAIM_STALE_MS)).toISOString()),
      updated_at: new Date().toISOString()
    })).eq(stryMutAct_9fa48("618") ? "" : (stryCov_9fa48("618"), 'id'), enrollmentId).eq(stryMutAct_9fa48("619") ? "" : (stryCov_9fa48("619"), 'status'), stryMutAct_9fa48("620") ? "" : (stryCov_9fa48("620"), 'active')).eq(stryMutAct_9fa48("621") ? "" : (stryCov_9fa48("621"), 'claim_token'), claimToken);
  }
}

/**
 * Park an enrollment with an ambiguous send until reconcile resolves it.
 * Uses a far-future next_send_at so cron will not reclaim/resend.
 */
async function parkEnrollmentForReconcile(supabase: Supabase, enrollmentId: string, claimToken: string, opts?: {
  nextSendAt?: string;
}): Promise<void> {
  if (stryMutAct_9fa48("622")) {
    {}
  } else {
    stryCov_9fa48("622");
    await releaseClaim(supabase, enrollmentId, claimToken, stryMutAct_9fa48("623") ? {} : (stryCov_9fa48("623"), {
      nextSendAt: stryMutAct_9fa48("624") ? opts?.nextSendAt && parkedNextSendAt() : (stryCov_9fa48("624"), (stryMutAct_9fa48("625") ? opts.nextSendAt : (stryCov_9fa48("625"), opts?.nextSendAt)) ?? parkedNextSendAt())
    }));
  }
}

/** Terminal needs_review — clears claim, no 30-min re-alert loop. */
async function markEnrollmentNeedsReview(supabase: Supabase, enrollmentId: string, claimToken: string, reason: string): Promise<void> {
  if (stryMutAct_9fa48("626")) {
    {}
  } else {
    stryCov_9fa48("626");
    await supabase.from(stryMutAct_9fa48("627") ? "" : (stryCov_9fa48("627"), 'campaign_enrollments')).update(stryMutAct_9fa48("628") ? {} : (stryCov_9fa48("628"), {
      status: stryMutAct_9fa48("629") ? "" : (stryCov_9fa48("629"), 'needs_review'),
      next_send_at: null,
      claimed_at: null,
      claim_token: null,
      paused_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })).eq(stryMutAct_9fa48("630") ? "" : (stryCov_9fa48("630"), 'id'), enrollmentId).eq(stryMutAct_9fa48("631") ? "" : (stryCov_9fa48("631"), 'status'), stryMutAct_9fa48("632") ? "" : (stryCov_9fa48("632"), 'active')).eq(stryMutAct_9fa48("633") ? "" : (stryCov_9fa48("633"), 'claim_token'), claimToken);
    // Stryker disable next-line StringLiteral: log-only message (no control flow)
    console.error(stryMutAct_9fa48("635") ? `` : (stryCov_9fa48("635"), `Enrollment ${enrollmentId} terminal needs_review (${reason})`));
  }
}

/**
 * Pause active enrollments. Allowed mid-send: clears claim so the in-flight
 * worker's advanceEnrollment ownership check fails (no accidental next step).
 */
export async function pauseCampaignForLead(leadId: string): Promise<void> {
  if (stryMutAct_9fa48("636")) {
    {}
  } else {
    stryCov_9fa48("636");
    const supabase = createServerClient();
    const {
      error
    } = await supabase.from(stryMutAct_9fa48("637") ? "" : (stryCov_9fa48("637"), 'campaign_enrollments')).update(stryMutAct_9fa48("638") ? {} : (stryCov_9fa48("638"), {
      status: stryMutAct_9fa48("639") ? "" : (stryCov_9fa48("639"), 'paused'),
      paused_at: new Date().toISOString(),
      next_send_at: null,
      claimed_at: null,
      claim_token: null,
      updated_at: new Date().toISOString()
    })).eq(stryMutAct_9fa48("640") ? "" : (stryCov_9fa48("640"), 'lead_id'), leadId).eq(stryMutAct_9fa48("641") ? "" : (stryCov_9fa48("641"), 'status'), stryMutAct_9fa48("642") ? "" : (stryCov_9fa48("642"), 'active'));
    if (stryMutAct_9fa48("644") ? false : stryMutAct_9fa48("643") ? true : (stryCov_9fa48("643", "644"), error)) {
      if (stryMutAct_9fa48("645")) {
        {}
      } else {
        stryCov_9fa48("645");
        // Stryker disable next-line StringLiteral: log-only message (no control flow)
        if (stryMutAct_9fa48("646")) {
          ;
        } else {
          stryCov_9fa48("646");
          console.error('Failed to pause campaign:', error);
        }
        return;
      }
    }

    // Stryker disable next-line StringLiteral: log-only message (no control flow)
    if (stryMutAct_9fa48("648")) {
      ;
    } else {
      stryCov_9fa48("648");
      console.log(`Campaign paused for lead ${leadId}`);
    }
  }
}
export async function leadHasActiveEnrollment(leadId: string): Promise<boolean> {
  if (stryMutAct_9fa48("650")) {
    {}
  } else {
    stryCov_9fa48("650");
    const enrollment = await getEnrollmentForLead(leadId);
    return stryMutAct_9fa48("653") ? enrollment?.status !== 'active' : stryMutAct_9fa48("652") ? false : stryMutAct_9fa48("651") ? true : (stryCov_9fa48("651", "652", "653"), (stryMutAct_9fa48("654") ? enrollment.status : (stryCov_9fa48("654"), enrollment?.status)) === (stryMutAct_9fa48("655") ? "" : (stryCov_9fa48("655"), 'active')));
  }
}

/**
 * Atomically claim a due (or stale-claimed) enrollment with a fresh claim_token.
 */
export async function claimDueEnrollment(enrollmentId: string): Promise<string | null> {
  if (stryMutAct_9fa48("656")) {
    {}
  } else {
    stryCov_9fa48("656");
    const supabase = createServerClient();
    const now = new Date();
    const nowIso = now.toISOString();
    const staleBefore = new Date(stryMutAct_9fa48("657") ? now.getTime() + CLAIM_STALE_MS : (stryCov_9fa48("657"), now.getTime() - CLAIM_STALE_MS)).toISOString();
    const token = randomUUID();
    const due = await supabase.from(stryMutAct_9fa48("658") ? "" : (stryCov_9fa48("658"), 'campaign_enrollments')).update(stryMutAct_9fa48("659") ? {} : (stryCov_9fa48("659"), {
      next_send_at: null,
      claimed_at: nowIso,
      claim_token: token,
      updated_at: nowIso
    })).eq(stryMutAct_9fa48("660") ? "" : (stryCov_9fa48("660"), 'id'), enrollmentId).eq(stryMutAct_9fa48("661") ? "" : (stryCov_9fa48("661"), 'status'), stryMutAct_9fa48("662") ? "" : (stryCov_9fa48("662"), 'active')).lte(stryMutAct_9fa48("663") ? "" : (stryCov_9fa48("663"), 'next_send_at'), nowIso).is(stryMutAct_9fa48("664") ? "" : (stryCov_9fa48("664"), 'claim_token'), null).select(ENROLLMENT_CLAIM_SELECT);
    if (stryMutAct_9fa48("667") ? !due.error || (due.data?.length ?? 0) > 0 : stryMutAct_9fa48("666") ? false : stryMutAct_9fa48("665") ? true : (stryCov_9fa48("665", "666", "667"), (stryMutAct_9fa48("668") ? due.error : (stryCov_9fa48("668"), !due.error)) && (stryMutAct_9fa48("671") ? (due.data?.length ?? 0) <= 0 : stryMutAct_9fa48("670") ? (due.data?.length ?? 0) >= 0 : stryMutAct_9fa48("669") ? true : (stryCov_9fa48("669", "670", "671"), (stryMutAct_9fa48("672") ? due.data?.length && 0 : (stryCov_9fa48("672"), (stryMutAct_9fa48("673") ? due.data.length : (stryCov_9fa48("673"), due.data?.length)) ?? 0)) > 0)))) {
      if (stryMutAct_9fa48("674")) {
        {}
      } else {
        stryCov_9fa48("674");
        return token;
      }
    }
    const stale = await supabase.from(stryMutAct_9fa48("675") ? "" : (stryCov_9fa48("675"), 'campaign_enrollments')).update(stryMutAct_9fa48("676") ? {} : (stryCov_9fa48("676"), {
      claimed_at: nowIso,
      claim_token: token,
      updated_at: nowIso
    })).eq(stryMutAct_9fa48("677") ? "" : (stryCov_9fa48("677"), 'id'), enrollmentId).eq(stryMutAct_9fa48("678") ? "" : (stryCov_9fa48("678"), 'status'), stryMutAct_9fa48("679") ? "" : (stryCov_9fa48("679"), 'active')).is(stryMutAct_9fa48("680") ? "" : (stryCov_9fa48("680"), 'next_send_at'), null).lt(stryMutAct_9fa48("681") ? "" : (stryCov_9fa48("681"), 'claimed_at'), staleBefore)
    // claimed_at is in the filter — must be selected (PostgREST 42703).
    .select(ENROLLMENT_CLAIM_SELECT);
    if (stryMutAct_9fa48("683") ? false : stryMutAct_9fa48("682") ? true : (stryCov_9fa48("682", "683"), stale.error)) {
      if (stryMutAct_9fa48("684")) {
        {}
      } else {
        stryCov_9fa48("684");
        // Stryker disable next-line StringLiteral: log-only message (no control flow)
        if (stryMutAct_9fa48("685")) {
          ;
        } else {
          stryCov_9fa48("685");
          console.error('Failed to reclaim stale enrollment:', stale.error);
        }
        return null;
      }
    }
    return (stryMutAct_9fa48("690") ? (stale.data?.length ?? 0) <= 0 : stryMutAct_9fa48("689") ? (stale.data?.length ?? 0) >= 0 : stryMutAct_9fa48("688") ? false : stryMutAct_9fa48("687") ? true : (stryCov_9fa48("687", "688", "689", "690"), (stryMutAct_9fa48("691") ? stale.data?.length && 0 : (stryCov_9fa48("691"), (stryMutAct_9fa48("692") ? stale.data.length : (stryCov_9fa48("692"), stale.data?.length)) ?? 0)) > 0)) ? token : null;
  }
}
export async function listClaimableEnrollmentIds(limit = 100): Promise<string[]> {
  if (stryMutAct_9fa48("693")) {
    {}
  } else {
    stryCov_9fa48("693");
    const supabase = createServerClient();
    const now = new Date();
    const nowIso = now.toISOString();
    const staleBefore = new Date(stryMutAct_9fa48("694") ? now.getTime() + CLAIM_STALE_MS : (stryCov_9fa48("694"), now.getTime() - CLAIM_STALE_MS)).toISOString();
    const {
      data: due
    } = await supabase.from(stryMutAct_9fa48("695") ? "" : (stryCov_9fa48("695"), 'campaign_enrollments')).select(stryMutAct_9fa48("696") ? "" : (stryCov_9fa48("696"), 'id')).eq(stryMutAct_9fa48("697") ? "" : (stryCov_9fa48("697"), 'status'), stryMutAct_9fa48("698") ? "" : (stryCov_9fa48("698"), 'active')).lte(stryMutAct_9fa48("699") ? "" : (stryCov_9fa48("699"), 'next_send_at'), nowIso).is(stryMutAct_9fa48("700") ? "" : (stryCov_9fa48("700"), 'claim_token'), null).order(stryMutAct_9fa48("701") ? "" : (stryCov_9fa48("701"), 'next_send_at'), stryMutAct_9fa48("702") ? {} : (stryCov_9fa48("702"), {
      ascending: stryMutAct_9fa48("703") ? false : (stryCov_9fa48("703"), true)
    })).limit(limit);
    const {
      data: stale
    } = await supabase.from(stryMutAct_9fa48("704") ? "" : (stryCov_9fa48("704"), 'campaign_enrollments')).select(stryMutAct_9fa48("705") ? "" : (stryCov_9fa48("705"), 'id')).eq(stryMutAct_9fa48("706") ? "" : (stryCov_9fa48("706"), 'status'), stryMutAct_9fa48("707") ? "" : (stryCov_9fa48("707"), 'active')).is(stryMutAct_9fa48("708") ? "" : (stryCov_9fa48("708"), 'next_send_at'), null).lt(stryMutAct_9fa48("709") ? "" : (stryCov_9fa48("709"), 'claimed_at'), staleBefore).limit(limit);
    const ids = new Set<string>();
    for (const row of stryMutAct_9fa48("712") ? due && [] : stryMutAct_9fa48("711") ? false : stryMutAct_9fa48("710") ? true : (stryCov_9fa48("710", "711", "712"), due || (stryMutAct_9fa48("713") ? ["Stryker was here"] : (stryCov_9fa48("713"), [])))) if (stryMutAct_9fa48("714")) {
      ;
    } else {
      stryCov_9fa48("714");
      ids.add(row.id);
    }
    for (const row of stryMutAct_9fa48("717") ? stale && [] : stryMutAct_9fa48("716") ? false : stryMutAct_9fa48("715") ? true : (stryCov_9fa48("715", "716", "717"), stale || (stryMutAct_9fa48("718") ? ["Stryker was here"] : (stryCov_9fa48("718"), [])))) if (stryMutAct_9fa48("719")) {
      ;
    } else {
      stryCov_9fa48("719");
      ids.add(row.id);
    }
    return stryMutAct_9fa48("720") ? [...ids] : (stryCov_9fa48("720"), (stryMutAct_9fa48("721") ? [] : (stryCov_9fa48("721"), [...ids])).slice(0, limit));
  }
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
  if (stryMutAct_9fa48("722")) {
    {}
  } else {
    stryCov_9fa48("722");
    // All relay lookups go through the send module.
    const base = await reconcileViaSendModule();
    const supabase = createServerClient();

    // Post-pass: advance / requeue from abandoned_retry + newly resolved rows
    // that the send module marked in this cron tick is handled inside callers
    // via sid parse on never_sent. Recovery resend uses sendRecoverySMS.
    const {
      data: abandoned
    } = await supabase.from(stryMutAct_9fa48("723") ? "" : (stryCov_9fa48("723"), 'sms_messages')).select(stryMutAct_9fa48("724") ? "" : (stryCov_9fa48("724"), 'id, lead_id, message_sid, status')).eq(stryMutAct_9fa48("725") ? "" : (stryCov_9fa48("725"), 'status'), stryMutAct_9fa48("726") ? "" : (stryCov_9fa48("726"), 'abandoned_retry')).order(stryMutAct_9fa48("727") ? "" : (stryCov_9fa48("727"), 'sent_at'), stryMutAct_9fa48("728") ? {} : (stryCov_9fa48("728"), {
      ascending: stryMutAct_9fa48("729") ? false : (stryCov_9fa48("729"), true)
    })).limit(50);
    let extraRequeued = 0;
    for (const row of stryMutAct_9fa48("730") ? abandoned && [] : (stryCov_9fa48("730"), abandoned ?? (stryMutAct_9fa48("731") ? ["Stryker was here"] : (stryCov_9fa48("731"), [])))) {
      if (stryMutAct_9fa48("732")) {
        {}
      } else {
        stryCov_9fa48("732");
        // Original sid is prefix before :abandoned:
        const original = String(row.message_sid).replace(stryMutAct_9fa48("735") ? /:abandoned:\D+$/ : stryMutAct_9fa48("734") ? /:abandoned:\d$/ : stryMutAct_9fa48("733") ? /:abandoned:\d+/ : (stryCov_9fa48("733", "734", "735"), /:abandoned:\d+$/), stryMutAct_9fa48("736") ? "Stryker was here!" : (stryCov_9fa48("736"), ''));
        const parsed = parseMessageSid(original);
        if (stryMutAct_9fa48("739") ? parsed.kind !== 'campaign' : stryMutAct_9fa48("738") ? false : stryMutAct_9fa48("737") ? true : (stryCov_9fa48("737", "738", "739"), parsed.kind === (stryMutAct_9fa48("740") ? "" : (stryCov_9fa48("740"), 'campaign')))) {
          if (stryMutAct_9fa48("741")) {
            {}
          } else {
            stryCov_9fa48("741");
            const ok = await requeueExactCampaignStep(supabase, parsed.enrollmentId, parsed.campaignId, parsed.stepNumber);
            if (stryMutAct_9fa48("743") ? false : stryMutAct_9fa48("742") ? true : (stryCov_9fa48("742", "743"), ok)) stryMutAct_9fa48("744") ? extraRequeued-- : (stryCov_9fa48("744"), extraRequeued++);
          }
        } else if (stryMutAct_9fa48("747") ? parsed.kind !== 'recovery' : stryMutAct_9fa48("746") ? false : stryMutAct_9fa48("745") ? true : (stryCov_9fa48("745", "746", "747"), parsed.kind === (stryMutAct_9fa48("748") ? "" : (stryCov_9fa48("748"), 'recovery')))) {
          if (stryMutAct_9fa48("749")) {
            {}
          } else {
            stryCov_9fa48("749");
            await resendRecoveryIdempotent(supabase, parsed.leadId, original);
            stryMutAct_9fa48("750") ? extraRequeued-- : (stryCov_9fa48("750"), extraRequeued++);
          }
        }
        // Prevent reprocessing the same abandoned row forever
        await supabase.from(stryMutAct_9fa48("751") ? "" : (stryCov_9fa48("751"), 'sms_messages')).update(stryMutAct_9fa48("752") ? {} : (stryCov_9fa48("752"), {
          status: stryMutAct_9fa48("753") ? "" : (stryCov_9fa48("753"), 'abandoned_done')
        })).eq(stryMutAct_9fa48("754") ? "" : (stryCov_9fa48("754"), 'id'), row.id);
      }
    }
    const {
      data: confirmedRows
    } = await supabase.from(stryMutAct_9fa48("755") ? "" : (stryCov_9fa48("755"), 'sms_messages')).select(stryMutAct_9fa48("756") ? "" : (stryCov_9fa48("756"), 'message_sid, status')).in(stryMutAct_9fa48("757") ? "" : (stryCov_9fa48("757"), 'status'), stryMutAct_9fa48("758") ? [] : (stryCov_9fa48("758"), [stryMutAct_9fa48("759") ? "" : (stryCov_9fa48("759"), 'queued'), stryMutAct_9fa48("760") ? "" : (stryCov_9fa48("760"), 'dispatched'), stryMutAct_9fa48("761") ? "" : (stryCov_9fa48("761"), 'sent'), stryMutAct_9fa48("762") ? "" : (stryCov_9fa48("762"), 'delivered')])).like(stryMutAct_9fa48("763") ? "" : (stryCov_9fa48("763"), 'message_sid'), stryMutAct_9fa48("764") ? "" : (stryCov_9fa48("764"), 'mlf:campaign:%')).order(stryMutAct_9fa48("765") ? "" : (stryCov_9fa48("765"), 'sent_at'), stryMutAct_9fa48("766") ? {} : (stryCov_9fa48("766"), {
      ascending: stryMutAct_9fa48("767") ? true : (stryCov_9fa48("767"), false)
    })).limit(20);
    for (const row of stryMutAct_9fa48("768") ? confirmedRows && [] : (stryCov_9fa48("768"), confirmedRows ?? (stryMutAct_9fa48("769") ? ["Stryker was here"] : (stryCov_9fa48("769"), [])))) {
      if (stryMutAct_9fa48("770")) {
        {}
      } else {
        stryCov_9fa48("770");
        const parsed = parseMessageSid(row.message_sid);
        if (stryMutAct_9fa48("773") ? parsed.kind !== 'campaign' : stryMutAct_9fa48("772") ? false : stryMutAct_9fa48("771") ? true : (stryCov_9fa48("771", "772", "773"), parsed.kind === (stryMutAct_9fa48("774") ? "" : (stryCov_9fa48("774"), 'campaign')))) {
          if (stryMutAct_9fa48("775")) {
            {}
          } else {
            stryCov_9fa48("775");
            await advanceEnrollmentAfterConfirmedSend(supabase, parsed.enrollmentId, parsed.campaignId, parsed.stepNumber);
          }
        }
      }
    }
    return stryMutAct_9fa48("776") ? {} : (stryCov_9fa48("776"), {
      ...base,
      requeued: stryMutAct_9fa48("777") ? base.requeued - extraRequeued : (stryCov_9fa48("777"), base.requeued + extraRequeued)
    });
  }
}
async function getRecoverySendState(supabase: Supabase, leadId: string): Promise<'confirmed' | 'pending' | 'absent' | 'abandoned'> {
  if (stryMutAct_9fa48("778")) {
    {}
  } else {
    stryCov_9fa48("778");
    const outcome = await resolveRecoveryOutcome(supabase, leadId);
    return mapRecoveryOutcomeToState(outcome);
  }
}

/**
 * After never_sent on a recovery sid: clear outbound marker and actually
 * resend recovery SMS (insert-before-send is idempotent on the freed sid).
 */
async function resendRecoveryIdempotent(supabase: Supabase, leadId: string, abandonedOriginalSid: string): Promise<void> {
  if (stryMutAct_9fa48("779")) {
    {}
  } else {
    stryCov_9fa48("779");
    await supabase.from(stryMutAct_9fa48("780") ? "" : (stryCov_9fa48("780"), 'leads')).update(stryMutAct_9fa48("781") ? {} : (stryCov_9fa48("781"), {
      sms_outbound_sid: null,
      updated_at: new Date().toISOString()
    })).eq(stryMutAct_9fa48("782") ? "" : (stryCov_9fa48("782"), 'id'), leadId).eq(stryMutAct_9fa48("783") ? "" : (stryCov_9fa48("783"), 'sms_outbound_sid'), abandonedOriginalSid);
    const {
      data: lead
    } = await supabase.from(stryMutAct_9fa48("784") ? "" : (stryCov_9fa48("784"), 'leads')).select(stryMutAct_9fa48("785") ? "" : (stryCov_9fa48("785"), '*, businesses(*)')).eq(stryMutAct_9fa48("786") ? "" : (stryCov_9fa48("786"), 'id'), leadId).maybeSingle();
    if (stryMutAct_9fa48("789") ? !lead && lead.opted_out : stryMutAct_9fa48("788") ? false : stryMutAct_9fa48("787") ? true : (stryCov_9fa48("787", "788", "789"), (stryMutAct_9fa48("790") ? lead : (stryCov_9fa48("790"), !lead)) || lead.opted_out)) return;
    const business = (lead as {
      businesses?: Business;
    }).businesses;
    if (stryMutAct_9fa48("793") ? false : stryMutAct_9fa48("792") ? true : stryMutAct_9fa48("791") ? business : (stryCov_9fa48("791", "792", "793"), !business)) return;
    try {
      if (stryMutAct_9fa48("794")) {
        {}
      } else {
        stryCov_9fa48("794");
        await sendRecoverySMS(leadId, business, lead.caller_phone);
      }
    } catch (err) {
      if (stryMutAct_9fa48("795")) {
        {}
      } else {
        stryCov_9fa48("795");
        // Stryker disable next-line StringLiteral: log-only message (no control flow)
        console.error(stryMutAct_9fa48("797") ? `` : (stryCov_9fa48("797"), `Recovery resend failed for ${leadId}:`), err instanceof Error ? err.message : stryMutAct_9fa48("798") ? "" : (stryCov_9fa48("798"), 'unknown'));
      }
    }
  }
}

/**
 * After reconcile confirms a campaign step was sent, advance past that step
 * if the enrollment is still active on it (and not mid-claim).
 */
async function advanceEnrollmentAfterConfirmedSend(supabase: Supabase, enrollmentId: string, campaignId: string, stepNumber: number): Promise<void> {
  if (stryMutAct_9fa48("799")) {
    {}
  } else {
    stryCov_9fa48("799");
    const {
      data: enrollment
    } = await supabase.from(stryMutAct_9fa48("800") ? "" : (stryCov_9fa48("800"), 'campaign_enrollments')).select(stryMutAct_9fa48("801") ? "" : (stryCov_9fa48("801"), 'id, campaign_id, current_step, status, claim_token')).eq(stryMutAct_9fa48("802") ? "" : (stryCov_9fa48("802"), 'id'), enrollmentId).eq(stryMutAct_9fa48("803") ? "" : (stryCov_9fa48("803"), 'status'), stryMutAct_9fa48("804") ? "" : (stryCov_9fa48("804"), 'active')).maybeSingle();
    if (stryMutAct_9fa48("807") ? false : stryMutAct_9fa48("806") ? true : stryMutAct_9fa48("805") ? decideReconcileAdvanceEligibility({
      enrollmentFound: Boolean(enrollment),
      campaignMatches: enrollment?.campaign_id === campaignId,
      stepMatches: enrollment?.current_step === stepNumber,
      hasClaimToken: Boolean(enrollment?.claim_token)
    }) : (stryCov_9fa48("805", "806", "807"), !decideReconcileAdvanceEligibility(stryMutAct_9fa48("808") ? {} : (stryCov_9fa48("808"), {
      enrollmentFound: Boolean(enrollment),
      campaignMatches: stryMutAct_9fa48("811") ? enrollment?.campaign_id !== campaignId : stryMutAct_9fa48("810") ? false : stryMutAct_9fa48("809") ? true : (stryCov_9fa48("809", "810", "811"), (stryMutAct_9fa48("812") ? enrollment.campaign_id : (stryCov_9fa48("812"), enrollment?.campaign_id)) === campaignId),
      stepMatches: stryMutAct_9fa48("815") ? enrollment?.current_step !== stepNumber : stryMutAct_9fa48("814") ? false : stryMutAct_9fa48("813") ? true : (stryCov_9fa48("813", "814", "815"), (stryMutAct_9fa48("816") ? enrollment.current_step : (stryCov_9fa48("816"), enrollment?.current_step)) === stepNumber),
      hasClaimToken: Boolean(stryMutAct_9fa48("817") ? enrollment.claim_token : (stryCov_9fa48("817"), enrollment?.claim_token))
    })))) {
      if (stryMutAct_9fa48("818")) {
        {}
      } else {
        stryCov_9fa48("818");
        return;
      }
    }
    const {
      data: steps
    } = await supabase.from(stryMutAct_9fa48("819") ? "" : (stryCov_9fa48("819"), 'campaign_steps')).select(stryMutAct_9fa48("820") ? "" : (stryCov_9fa48("820"), '*')).eq(stryMutAct_9fa48("821") ? "" : (stryCov_9fa48("821"), 'campaign_id'), campaignId).order(stryMutAct_9fa48("822") ? "" : (stryCov_9fa48("822"), 'step_number'), stryMutAct_9fa48("823") ? {} : (stryCov_9fa48("823"), {
      ascending: stryMutAct_9fa48("824") ? false : (stryCov_9fa48("824"), true)
    }));
    if (stryMutAct_9fa48("827") ? false : stryMutAct_9fa48("826") ? true : stryMutAct_9fa48("825") ? steps?.length : (stryCov_9fa48("825", "826", "827"), !(stryMutAct_9fa48("828") ? steps.length : (stryCov_9fa48("828"), steps?.length)))) return;
    const nextStep = steps.find(stryMutAct_9fa48("829") ? () => undefined : (stryCov_9fa48("829"), s => stryMutAct_9fa48("832") ? s.step_number !== stepNumber + 1 : stryMutAct_9fa48("831") ? false : stryMutAct_9fa48("830") ? true : (stryCov_9fa48("830", "831", "832"), s.step_number === (stryMutAct_9fa48("833") ? stepNumber - 1 : (stryCov_9fa48("833"), stepNumber + 1)))));
    if (stryMutAct_9fa48("835") ? false : stryMutAct_9fa48("834") ? true : (stryCov_9fa48("834", "835"), nextStep)) {
      if (stryMutAct_9fa48("836")) {
        {}
      } else {
        stryCov_9fa48("836");
        const nextSendAt = new Date(stryMutAct_9fa48("837") ? Date.now() - nextStep.delay_minutes * 60 * 1000 : (stryCov_9fa48("837"), Date.now() + (stryMutAct_9fa48("838") ? nextStep.delay_minutes * 60 / 1000 : (stryCov_9fa48("838"), (stryMutAct_9fa48("839") ? nextStep.delay_minutes / 60 : (stryCov_9fa48("839"), nextStep.delay_minutes * 60)) * 1000)))).toISOString();
        await supabase.from(stryMutAct_9fa48("840") ? "" : (stryCov_9fa48("840"), 'campaign_enrollments')).update(stryMutAct_9fa48("841") ? {} : (stryCov_9fa48("841"), {
          current_step: nextStep.step_number,
          next_send_at: nextSendAt,
          claimed_at: null,
          claim_token: null,
          updated_at: new Date().toISOString()
        })).eq(stryMutAct_9fa48("842") ? "" : (stryCov_9fa48("842"), 'id'), enrollmentId).eq(stryMutAct_9fa48("843") ? "" : (stryCov_9fa48("843"), 'status'), stryMutAct_9fa48("844") ? "" : (stryCov_9fa48("844"), 'active')).eq(stryMutAct_9fa48("845") ? "" : (stryCov_9fa48("845"), 'current_step'), stepNumber).is(stryMutAct_9fa48("846") ? "" : (stryCov_9fa48("846"), 'claim_token'), null);
      }
    } else {
      if (stryMutAct_9fa48("847")) {
        {}
      } else {
        stryCov_9fa48("847");
        await supabase.from(stryMutAct_9fa48("848") ? "" : (stryCov_9fa48("848"), 'campaign_enrollments')).update(stryMutAct_9fa48("849") ? {} : (stryCov_9fa48("849"), {
          status: stryMutAct_9fa48("850") ? "" : (stryCov_9fa48("850"), 'completed'),
          completed_at: new Date().toISOString(),
          next_send_at: null,
          claimed_at: null,
          claim_token: null,
          updated_at: new Date().toISOString()
        })).eq(stryMutAct_9fa48("851") ? "" : (stryCov_9fa48("851"), 'id'), enrollmentId).eq(stryMutAct_9fa48("852") ? "" : (stryCov_9fa48("852"), 'status'), stryMutAct_9fa48("853") ? "" : (stryCov_9fa48("853"), 'active')).eq(stryMutAct_9fa48("854") ? "" : (stryCov_9fa48("854"), 'current_step'), stepNumber).is(stryMutAct_9fa48("855") ? "" : (stryCov_9fa48("855"), 'claim_token'), null);
      }
    }
  }
}

/**
 * Requeue the exact campaign step encoded in the sid (no skip / reorder).
 */
async function requeueExactCampaignStep(supabase: Supabase, enrollmentId: string, campaignId: string, stepNumber: number): Promise<boolean> {
  if (stryMutAct_9fa48("856")) {
    {}
  } else {
    stryCov_9fa48("856");
    const {
      data: enrollment
    } = await supabase.from(stryMutAct_9fa48("857") ? "" : (stryCov_9fa48("857"), 'campaign_enrollments')).select(stryMutAct_9fa48("858") ? "" : (stryCov_9fa48("858"), 'id, campaign_id, status')).eq(stryMutAct_9fa48("859") ? "" : (stryCov_9fa48("859"), 'id'), enrollmentId).eq(stryMutAct_9fa48("860") ? "" : (stryCov_9fa48("860"), 'status'), stryMutAct_9fa48("861") ? "" : (stryCov_9fa48("861"), 'active')).maybeSingle();
    if (stryMutAct_9fa48("864") ? false : stryMutAct_9fa48("863") ? true : stryMutAct_9fa48("862") ? decideRequeueEligibility({
      enrollmentFound: Boolean(enrollment),
      campaignMatches: enrollment?.campaign_id === campaignId
    }) : (stryCov_9fa48("862", "863", "864"), !decideRequeueEligibility(stryMutAct_9fa48("865") ? {} : (stryCov_9fa48("865"), {
      enrollmentFound: Boolean(enrollment),
      campaignMatches: stryMutAct_9fa48("868") ? enrollment?.campaign_id !== campaignId : stryMutAct_9fa48("867") ? false : stryMutAct_9fa48("866") ? true : (stryCov_9fa48("866", "867", "868"), (stryMutAct_9fa48("869") ? enrollment.campaign_id : (stryCov_9fa48("869"), enrollment?.campaign_id)) === campaignId)
    })))) {
      if (stryMutAct_9fa48("870")) {
        {}
      } else {
        stryCov_9fa48("870");
        return stryMutAct_9fa48("871") ? true : (stryCov_9fa48("871"), false);
      }
    }
    const {
      data,
      error
    } = await supabase.from(stryMutAct_9fa48("872") ? "" : (stryCov_9fa48("872"), 'campaign_enrollments')).update(stryMutAct_9fa48("873") ? {} : (stryCov_9fa48("873"), {
      current_step: stepNumber,
      next_send_at: new Date().toISOString(),
      claimed_at: null,
      claim_token: null,
      updated_at: new Date().toISOString()
    })).eq(stryMutAct_9fa48("874") ? "" : (stryCov_9fa48("874"), 'id'), enrollmentId).eq(stryMutAct_9fa48("875") ? "" : (stryCov_9fa48("875"), 'status'), stryMutAct_9fa48("876") ? "" : (stryCov_9fa48("876"), 'active')).eq(stryMutAct_9fa48("877") ? "" : (stryCov_9fa48("877"), 'campaign_id'), campaignId).select(ENROLLMENT_CLAIM_SELECT);
    if (stryMutAct_9fa48("880") ? error && !data?.length : stryMutAct_9fa48("879") ? false : stryMutAct_9fa48("878") ? true : (stryCov_9fa48("878", "879", "880"), error || (stryMutAct_9fa48("881") ? data?.length : (stryCov_9fa48("881"), !(stryMutAct_9fa48("882") ? data.length : (stryCov_9fa48("882"), data?.length)))))) {
      if (stryMutAct_9fa48("883")) {
        {}
      } else {
        stryCov_9fa48("883");
        // Stryker disable next-line StringLiteral: log-only message (no control flow)
        console.warn(stryMutAct_9fa48("885") ? `` : (stryCov_9fa48("885"), `requeueExactCampaignStep failed for ${enrollmentId} step ${stepNumber}:`), stryMutAct_9fa48("886") ? error.message : (stryCov_9fa48("886"), error?.message));
        return stryMutAct_9fa48("887") ? true : (stryCov_9fa48("887"), false);
      }
    }
    return stryMutAct_9fa48("888") ? false : (stryCov_9fa48("888"), true);
  }
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
  if (stryMutAct_9fa48("889")) {
    {}
  } else {
    stryCov_9fa48("889");
    const adapter = getMessagingAdapter();

    // Caps probe + reconcile both live inside the send module.
    let relayLookupSupported: boolean | undefined;
    if (stryMutAct_9fa48("891") ? false : stryMutAct_9fa48("890") ? true : (stryCov_9fa48("890", "891"), adapter.checkLookupSupport)) {
      if (stryMutAct_9fa48("892")) {
        {}
      } else {
        stryCov_9fa48("892");
        const support = await adapter.checkLookupSupport();
        relayLookupSupported = support.supported;
      }
    }

    // Deferred recoveries first (quiet-hours window may have opened).
    await processDeferredRecoveries();
    const reconcile = await reconcileAmbiguousSms();
    const ids = await listClaimableEnrollmentIds(100);
    if (stryMutAct_9fa48("895") ? ids.length !== 0 : stryMutAct_9fa48("894") ? false : stryMutAct_9fa48("893") ? true : (stryCov_9fa48("893", "894", "895"), ids.length === 0)) {
      if (stryMutAct_9fa48("896")) {
        {}
      } else {
        stryCov_9fa48("896");
        // Stryker disable next-line StringLiteral: log-only message (no control flow)
        if (stryMutAct_9fa48("897")) {
          ;
        } else {
          stryCov_9fa48("897");
          console.log('No due campaigns to process');
        }
        return stryMutAct_9fa48("899") ? {} : (stryCov_9fa48("899"), {
          processed: 0,
          errors: 0,
          skipped: 0,
          messagingProvider: adapter.name,
          relayLookupSupported,
          ...reconcile
        });
      }
    }
    let processed = 0;
    let errors = 0;
    let skipped = 0;
    for (const id of ids) {
      if (stryMutAct_9fa48("900")) {
        {}
      } else {
        stryCov_9fa48("900");
        try {
          if (stryMutAct_9fa48("901")) {
            {}
          } else {
            stryCov_9fa48("901");
            const token = await claimDueEnrollment(id);
            if (stryMutAct_9fa48("904") ? false : stryMutAct_9fa48("903") ? true : stryMutAct_9fa48("902") ? token : (stryCov_9fa48("902", "903", "904"), !token)) {
              if (stryMutAct_9fa48("905")) {
                {}
              } else {
                stryCov_9fa48("905");
                stryMutAct_9fa48("906") ? skipped-- : (stryCov_9fa48("906"), skipped++);
                continue;
              }
            }
            const success = await sendCampaignSMS(id, token);
            if (stryMutAct_9fa48("908") ? false : stryMutAct_9fa48("907") ? true : (stryCov_9fa48("907", "908"), success)) {
              if (stryMutAct_9fa48("909")) {
                {}
              } else {
                stryCov_9fa48("909");
                stryMutAct_9fa48("910") ? processed-- : (stryCov_9fa48("910"), processed++);
              }
            } else {
              if (stryMutAct_9fa48("911")) {
                {}
              } else {
                stryCov_9fa48("911");
                stryMutAct_9fa48("912") ? errors-- : (stryCov_9fa48("912"), errors++);
              }
            }
          }
        } catch (err) {
          if (stryMutAct_9fa48("913")) {
            {}
          } else {
            stryCov_9fa48("913");
            // Isolate per-enrollment failures (e.g. invalid timezone) so one bad
            // lead cannot 500 the whole cron run.
            // Stryker disable next-line StringLiteral: log-only message (no control flow)
            console.error(stryMutAct_9fa48("915") ? `` : (stryCov_9fa48("915"), `Campaign send failed for ${id}:`), err instanceof Error ? err.message : stryMutAct_9fa48("916") ? "" : (stryCov_9fa48("916"), 'unknown'));
            stryMutAct_9fa48("917") ? errors-- : (stryCov_9fa48("917"), errors++);
            try {
              if (stryMutAct_9fa48("918")) {
                {}
              } else {
                stryCov_9fa48("918");
                const supabase = createServerClient();
                await supabase.from(stryMutAct_9fa48("919") ? "" : (stryCov_9fa48("919"), 'campaign_enrollments')).update(stryMutAct_9fa48("920") ? {} : (stryCov_9fa48("920"), {
                  claim_token: null,
                  claimed_at: null,
                  next_send_at: parkedNextSendAt(),
                  updated_at: new Date().toISOString()
                })).eq(stryMutAct_9fa48("921") ? "" : (stryCov_9fa48("921"), 'id'), id).eq(stryMutAct_9fa48("922") ? "" : (stryCov_9fa48("922"), 'status'), stryMutAct_9fa48("923") ? "" : (stryCov_9fa48("923"), 'active'));
              }
            } catch {
              /* ignore release failure */
            }
          }
        }
        await new Promise(stryMutAct_9fa48("924") ? () => undefined : (stryCov_9fa48("924"), resolve => setTimeout(resolve, 200)));
      }
    }

    // Stryker disable next-line StringLiteral: log-only message (no control flow)
    console.log((stryMutAct_9fa48("926") ? `` : (stryCov_9fa48("926"), `Processed ${processed} campaigns, ${errors} errors, ${skipped} skipped `)) + (stryMutAct_9fa48("927") ? `` : (stryCov_9fa48("927"), `out of ${ids.length} candidates (provider=${adapter.name})`)));
    return stryMutAct_9fa48("928") ? {} : (stryCov_9fa48("928"), {
      processed,
      errors,
      skipped,
      messagingProvider: adapter.name,
      relayLookupSupported,
      ...reconcile
    });
  }
}