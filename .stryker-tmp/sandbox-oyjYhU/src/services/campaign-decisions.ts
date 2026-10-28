/**
 * Pure campaign enrollment / send orchestration decisions (no DB, no relay).
 */
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
import { planEnrollmentStart, parkedNextSendAt, type StepLike } from '@/services/campaign-logic';
import { interpretCampaignSendOutcome, type CampaignSendAction } from '@/services/send/decisions';
import type { SendOutcome } from '@/services/send/types';
export type RecoverySendState = 'confirmed' | 'pending' | 'absent' | 'abandoned';
export type EnrollmentGate = {
  ok: false;
  reason: string;
} | {
  ok: true;
};

/** Pre-insert enrollment gates (lead fetch / opt-out / existing). */
export function decideEnrollmentGates(input: {
  leadFound: boolean;
  optedOut: boolean;
  existingStatus?: string | null;
}): EnrollmentGate {
  if (stryMutAct_9fa48("0")) {
    {}
  } else {
    stryCov_9fa48("0");
    if (stryMutAct_9fa48("3") ? false : stryMutAct_9fa48("2") ? true : stryMutAct_9fa48("1") ? input.leadFound : (stryCov_9fa48("1", "2", "3"), !input.leadFound)) return stryMutAct_9fa48("4") ? {} : (stryCov_9fa48("4"), {
      ok: stryMutAct_9fa48("5") ? true : (stryCov_9fa48("5"), false),
      reason: stryMutAct_9fa48("6") ? "" : (stryCov_9fa48("6"), 'lead_not_found')
    });
    if (stryMutAct_9fa48("8") ? false : stryMutAct_9fa48("7") ? true : (stryCov_9fa48("7", "8"), input.optedOut)) return stryMutAct_9fa48("9") ? {} : (stryCov_9fa48("9"), {
      ok: stryMutAct_9fa48("10") ? true : (stryCov_9fa48("10"), false),
      reason: stryMutAct_9fa48("11") ? "" : (stryCov_9fa48("11"), 'opted_out')
    });
    if (stryMutAct_9fa48("14") ? input.existingStatus == null : stryMutAct_9fa48("13") ? false : stryMutAct_9fa48("12") ? true : (stryCov_9fa48("12", "13", "14"), input.existingStatus != null)) {
      if (stryMutAct_9fa48("15")) {
        {}
      } else {
        stryCov_9fa48("15");
        return stryMutAct_9fa48("16") ? {} : (stryCov_9fa48("16"), {
          ok: stryMutAct_9fa48("17") ? true : (stryCov_9fa48("17"), false),
          reason: stryMutAct_9fa48("18") ? `` : (stryCov_9fa48("18"), `already_enrolled:${input.existingStatus}`)
        });
      }
    }
    return stryMutAct_9fa48("19") ? {} : (stryCov_9fa48("19"), {
      ok: stryMutAct_9fa48("20") ? false : (stryCov_9fa48("20"), true)
    });
  }
}
export type EnrollmentPlanDecision = {
  ok: false;
  reason: string;
} | {
  ok: true;
  currentStep: number;
  nextSendAt: string;
  skippedInitial: boolean;
};

/** Pure plan after campaign + steps + recovery state are known. */
export function decideEnrollmentPlan(input: {
  steps: StepLike[];
  recoveryState: RecoverySendState;
  recoveryConfirmed: boolean;
  treatRecoveryAsInitial: boolean;
  now?: Date;
  parkedIso?: string;
}): EnrollmentPlanDecision {
  if (stryMutAct_9fa48("21")) {
    {}
  } else {
    stryCov_9fa48("21");
    if (stryMutAct_9fa48("24") ? input.steps.length !== 0 : stryMutAct_9fa48("23") ? false : stryMutAct_9fa48("22") ? true : (stryCov_9fa48("22", "23", "24"), input.steps.length === 0)) {
      if (stryMutAct_9fa48("25")) {
        {}
      } else {
        stryCov_9fa48("25");
        return stryMutAct_9fa48("26") ? {} : (stryCov_9fa48("26"), {
          ok: stryMutAct_9fa48("27") ? true : (stryCov_9fa48("27"), false),
          reason: stryMutAct_9fa48("28") ? "" : (stryCov_9fa48("28"), 'no_steps')
        });
      }
    }
    const plan = planEnrollmentStart(input.steps, stryMutAct_9fa48("29") ? {} : (stryCov_9fa48("29"), {
      recoveryAlreadySent: input.recoveryConfirmed,
      treatRecoveryAsInitial: input.treatRecoveryAsInitial,
      now: input.now
    }));
    if (stryMutAct_9fa48("32") ? plan.skippedInitial && plan.currentStep === input.steps[0].step_number || input.steps.length === 1 : stryMutAct_9fa48("31") ? false : stryMutAct_9fa48("30") ? true : (stryCov_9fa48("30", "31", "32"), (stryMutAct_9fa48("34") ? plan.skippedInitial || plan.currentStep === input.steps[0].step_number : stryMutAct_9fa48("33") ? true : (stryCov_9fa48("33", "34"), plan.skippedInitial && (stryMutAct_9fa48("36") ? plan.currentStep !== input.steps[0].step_number : stryMutAct_9fa48("35") ? true : (stryCov_9fa48("35", "36"), plan.currentStep === input.steps[0].step_number)))) && (stryMutAct_9fa48("38") ? input.steps.length !== 1 : stryMutAct_9fa48("37") ? true : (stryCov_9fa48("37", "38"), input.steps.length === 1)))) {
      if (stryMutAct_9fa48("39")) {
        {}
      } else {
        stryCov_9fa48("39");
        return stryMutAct_9fa48("40") ? {} : (stryCov_9fa48("40"), {
          ok: stryMutAct_9fa48("41") ? true : (stryCov_9fa48("41"), false),
          reason: stryMutAct_9fa48("42") ? "" : (stryCov_9fa48("42"), 'only_initial_already_sent')
        });
      }
    }
    let nextSendAt = plan.nextSendAt.toISOString();
    if (stryMutAct_9fa48("45") ? input.recoveryState === 'pending' || !input.recoveryConfirmed : stryMutAct_9fa48("44") ? false : stryMutAct_9fa48("43") ? true : (stryCov_9fa48("43", "44", "45"), (stryMutAct_9fa48("47") ? input.recoveryState !== 'pending' : stryMutAct_9fa48("46") ? true : (stryCov_9fa48("46", "47"), input.recoveryState === (stryMutAct_9fa48("48") ? "" : (stryCov_9fa48("48"), 'pending')))) && (stryMutAct_9fa48("49") ? input.recoveryConfirmed : (stryCov_9fa48("49"), !input.recoveryConfirmed)))) {
      if (stryMutAct_9fa48("50")) {
        {}
      } else {
        stryCov_9fa48("50");
        nextSendAt = stryMutAct_9fa48("51") ? input.parkedIso && parkedNextSendAt(input.now ?? new Date()) : (stryCov_9fa48("51"), input.parkedIso ?? parkedNextSendAt(stryMutAct_9fa48("52") ? input.now && new Date() : (stryCov_9fa48("52"), input.now ?? new Date())));
      }
    }
    return stryMutAct_9fa48("53") ? {} : (stryCov_9fa48("53"), {
      ok: stryMutAct_9fa48("54") ? false : (stryCov_9fa48("54"), true),
      currentStep: plan.currentStep,
      nextSendAt,
      skippedInitial: plan.skippedInitial
    });
  }
}

/** Map resolveRecoveryOutcome → recovery send state used by enrollment. */
export function mapRecoveryOutcomeToState(outcome: string): RecoverySendState {
  if (stryMutAct_9fa48("55")) {
    {}
  } else {
    stryCov_9fa48("55");
    if (stryMutAct_9fa48("58") ? outcome !== 'resolved_sent' : stryMutAct_9fa48("57") ? false : stryMutAct_9fa48("56") ? true : (stryCov_9fa48("56", "57", "58"), outcome === (stryMutAct_9fa48("59") ? "" : (stryCov_9fa48("59"), 'resolved_sent')))) return stryMutAct_9fa48("60") ? "" : (stryCov_9fa48("60"), 'confirmed');
    if (stryMutAct_9fa48("63") ? outcome !== 'resolved_abandoned' : stryMutAct_9fa48("62") ? false : stryMutAct_9fa48("61") ? true : (stryCov_9fa48("61", "62", "63"), outcome === (stryMutAct_9fa48("64") ? "" : (stryCov_9fa48("64"), 'resolved_abandoned')))) return stryMutAct_9fa48("65") ? "" : (stryCov_9fa48("65"), 'abandoned');
    if (stryMutAct_9fa48("68") ? outcome !== 'pending' : stryMutAct_9fa48("67") ? false : stryMutAct_9fa48("66") ? true : (stryCov_9fa48("66", "67", "68"), outcome === (stryMutAct_9fa48("69") ? "" : (stryCov_9fa48("69"), 'pending')))) return stryMutAct_9fa48("70") ? "" : (stryCov_9fa48("70"), 'pending');
    return stryMutAct_9fa48("71") ? "" : (stryCov_9fa48("71"), 'absent');
  }
}

/** Whether campaign step 1 should skip the recovery gate. */
export function decideSkipRecoveryGate(input: {
  delayMinutes: number;
  currentStep: number;
  firstStepNumber: number | undefined;
}): boolean {
  if (stryMutAct_9fa48("72")) {
    {}
  } else {
    stryCov_9fa48("72");
    return stryMutAct_9fa48("73") ? input.delayMinutes === 0 && input.currentStep === input.firstStepNumber : (stryCov_9fa48("73"), !(stryMutAct_9fa48("76") ? input.delayMinutes === 0 || input.currentStep === input.firstStepNumber : stryMutAct_9fa48("75") ? false : stryMutAct_9fa48("74") ? true : (stryCov_9fa48("74", "75", "76"), (stryMutAct_9fa48("78") ? input.delayMinutes !== 0 : stryMutAct_9fa48("77") ? true : (stryCov_9fa48("77", "78"), input.delayMinutes === 0)) && (stryMutAct_9fa48("80") ? input.currentStep !== input.firstStepNumber : stryMutAct_9fa48("79") ? true : (stryCov_9fa48("79", "80"), input.currentStep === input.firstStepNumber)))));
  }
}
export type CampaignSendDispatch = CampaignSendAction & {
  /** Boolean return for sendCampaignSMS. */
  success: boolean;
};

/** Pure outcome → action + success flag for sendCampaignSMS. */
export function decideCampaignSendDispatch(outcome: SendOutcome, parkedFallbackIso: string): CampaignSendDispatch {
  if (stryMutAct_9fa48("81")) {
    {}
  } else {
    stryCov_9fa48("81");
    const action = interpretCampaignSendOutcome(outcome, parkedFallbackIso);
    switch (action.type) {
      case stryMutAct_9fa48("82") ? "" : (stryCov_9fa48("82"), 'advance'):
      case stryMutAct_9fa48("84") ? "" : (stryCov_9fa48("84"), 'pause_opt_out'):
        if (stryMutAct_9fa48("83")) {} else {
          stryCov_9fa48("83");
          return stryMutAct_9fa48("85") ? {} : (stryCov_9fa48("85"), {
            ...action,
            success: stryMutAct_9fa48("86") ? false : (stryCov_9fa48("86"), true)
          });
        }
      case stryMutAct_9fa48("88") ? "" : (stryCov_9fa48("88"), 'release'):
        if (stryMutAct_9fa48("87")) {} else {
          stryCov_9fa48("87");
          return stryMutAct_9fa48("89") ? {} : (stryCov_9fa48("89"), {
            ...action,
            success: action.ok
          });
        }
      case stryMutAct_9fa48("90") ? "" : (stryCov_9fa48("90"), 'park'):
      case stryMutAct_9fa48("91") ? "" : (stryCov_9fa48("91"), 'needs_review_terminal'):
      case stryMutAct_9fa48("92") ? "" : (stryCov_9fa48("92"), 'flag_unresolved_tz'):
      case stryMutAct_9fa48("94") ? "" : (stryCov_9fa48("94"), 'noop_false'):
        if (stryMutAct_9fa48("93")) {} else {
          stryCov_9fa48("93");
          return stryMutAct_9fa48("95") ? {} : (stryCov_9fa48("95"), {
            ...action,
            success: stryMutAct_9fa48("96") ? true : (stryCov_9fa48("96"), false)
          });
        }
      default:
        if (stryMutAct_9fa48("97")) {} else {
          stryCov_9fa48("97");
          {
            if (stryMutAct_9fa48("98")) {
              {}
            } else {
              stryCov_9fa48("98");
              const _exhaustive: never = action;
              return stryMutAct_9fa48("99") ? {} : (stryCov_9fa48("99"), {
                type: stryMutAct_9fa48("100") ? "" : (stryCov_9fa48("100"), 'noop_false'),
                success: stryMutAct_9fa48("101") ? true : (stryCov_9fa48("101"), false),
                ...(_exhaustive as object)
              });
            }
          }
        }
    }
  }
}

/** Pre-send lead gates inside sendCampaignSMS. */
export function decideCampaignLeadGates(input: {
  optedOut: boolean;
  suppressed: boolean;
  suppressionLookupFailed: boolean;
}): {
  action: 'pause';
  success: true;
} | {
  action: 'release_fail';
  success: false;
} | {
  action: 'continue';
} {
  if (stryMutAct_9fa48("102")) {
    {}
  } else {
    stryCov_9fa48("102");
    if (stryMutAct_9fa48("105") ? input.optedOut && input.suppressed : stryMutAct_9fa48("104") ? false : stryMutAct_9fa48("103") ? true : (stryCov_9fa48("103", "104", "105"), input.optedOut || input.suppressed)) {
      if (stryMutAct_9fa48("106")) {
        {}
      } else {
        stryCov_9fa48("106");
        return stryMutAct_9fa48("107") ? {} : (stryCov_9fa48("107"), {
          action: stryMutAct_9fa48("108") ? "" : (stryCov_9fa48("108"), 'pause'),
          success: stryMutAct_9fa48("109") ? false : (stryCov_9fa48("109"), true)
        });
      }
    }
    if (stryMutAct_9fa48("111") ? false : stryMutAct_9fa48("110") ? true : (stryCov_9fa48("110", "111"), input.suppressionLookupFailed)) {
      if (stryMutAct_9fa48("112")) {
        {}
      } else {
        stryCov_9fa48("112");
        return stryMutAct_9fa48("113") ? {} : (stryCov_9fa48("113"), {
          action: stryMutAct_9fa48("114") ? "" : (stryCov_9fa48("114"), 'release_fail'),
          success: stryMutAct_9fa48("115") ? true : (stryCov_9fa48("115"), false)
        });
      }
    }
    return stryMutAct_9fa48("116") ? {} : (stryCov_9fa48("116"), {
      action: stryMutAct_9fa48("117") ? "" : (stryCov_9fa48("117"), 'continue')
    });
  }
}

/** Switch/enroll claim freshness gate. */
export function decideSwitchClaimGate(input: {
  hasEnrollment: boolean;
  freshClaim: boolean;
}): EnrollmentGate {
  if (stryMutAct_9fa48("118")) {
    {}
  } else {
    stryCov_9fa48("118");
    if (stryMutAct_9fa48("121") ? false : stryMutAct_9fa48("120") ? true : stryMutAct_9fa48("119") ? input.hasEnrollment : (stryCov_9fa48("119", "120", "121"), !input.hasEnrollment)) return stryMutAct_9fa48("122") ? {} : (stryCov_9fa48("122"), {
      ok: stryMutAct_9fa48("123") ? true : (stryCov_9fa48("123"), false),
      reason: stryMutAct_9fa48("124") ? "" : (stryCov_9fa48("124"), 'no_enrollment')
    });
    if (stryMutAct_9fa48("126") ? false : stryMutAct_9fa48("125") ? true : (stryCov_9fa48("125", "126"), input.freshClaim)) return stryMutAct_9fa48("127") ? {} : (stryCov_9fa48("127"), {
      ok: stryMutAct_9fa48("128") ? true : (stryCov_9fa48("128"), false),
      reason: stryMutAct_9fa48("129") ? "" : (stryCov_9fa48("129"), 'deferred_fresh_claim')
    });
    return stryMutAct_9fa48("130") ? {} : (stryCov_9fa48("130"), {
      ok: stryMutAct_9fa48("131") ? false : (stryCov_9fa48("131"), true)
    });
  }
}

/** After reconcile confirms send: may we advance? */
export function decideReconcileAdvanceEligibility(input: {
  enrollmentFound: boolean;
  campaignMatches: boolean;
  stepMatches: boolean;
  hasClaimToken: boolean;
}): boolean {
  if (stryMutAct_9fa48("132")) {
    {}
  } else {
    stryCov_9fa48("132");
    if (stryMutAct_9fa48("135") ? false : stryMutAct_9fa48("134") ? true : stryMutAct_9fa48("133") ? input.enrollmentFound : (stryCov_9fa48("133", "134", "135"), !input.enrollmentFound)) return stryMutAct_9fa48("136") ? true : (stryCov_9fa48("136"), false);
    if (stryMutAct_9fa48("139") ? false : stryMutAct_9fa48("138") ? true : stryMutAct_9fa48("137") ? input.campaignMatches : (stryCov_9fa48("137", "138", "139"), !input.campaignMatches)) return stryMutAct_9fa48("140") ? true : (stryCov_9fa48("140"), false);
    if (stryMutAct_9fa48("143") ? false : stryMutAct_9fa48("142") ? true : stryMutAct_9fa48("141") ? input.stepMatches : (stryCov_9fa48("141", "142", "143"), !input.stepMatches)) return stryMutAct_9fa48("144") ? true : (stryCov_9fa48("144"), false);
    if (stryMutAct_9fa48("146") ? false : stryMutAct_9fa48("145") ? true : (stryCov_9fa48("145", "146"), input.hasClaimToken)) return stryMutAct_9fa48("147") ? true : (stryCov_9fa48("147"), false);
    return stryMutAct_9fa48("148") ? false : (stryCov_9fa48("148"), true);
  }
}

/** Requeue exact step eligibility. */
export function decideRequeueEligibility(input: {
  enrollmentFound: boolean;
  campaignMatches: boolean;
}): boolean {
  if (stryMutAct_9fa48("149")) {
    {}
  } else {
    stryCov_9fa48("149");
    return stryMutAct_9fa48("152") ? input.enrollmentFound || input.campaignMatches : stryMutAct_9fa48("151") ? false : stryMutAct_9fa48("150") ? true : (stryCov_9fa48("150", "151", "152"), input.enrollmentFound && input.campaignMatches);
  }
}