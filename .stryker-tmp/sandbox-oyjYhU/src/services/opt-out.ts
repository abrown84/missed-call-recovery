/**
 * TCPA / carrier opt-out detection.
 * Contains-keyword match after NFKC + confusable folding + zero-width strip.
 * Shared token list is the source of truth for migration 003 STOP backfill.
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
import { AMBIGUOUS, CONFUSABLES, OPT_OUT_COMPACT, OPT_OUT_CONTAINS_KEYWORDS, OPT_OUT_CONTAINS_PHRASES, OPT_OUT_EXACT, optOutBackfillCompactList, optOutBackfillExactList } from './opt-out-data';
export type OptOutVerdict = {
  kind: 'opt_out';
} | {
  kind: 'ambiguous';
  reason: string;
} | {
  kind: 'not_opt_out';
};
export { OPT_OUT_EXACT, OPT_OUT_COMPACT, OPT_OUT_CONTAINS_KEYWORDS, OPT_OUT_CONTAINS_PHRASES };
const ZERO_WIDTH_RE = stryMutAct_9fa48("929") ? /[^\u200B-\u200D\uFEFF\u2060\u180E\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u3164\uFFA0]/g : (stryCov_9fa48("929"), /[\u200B-\u200D\uFEFF\u2060\u180E\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u3164\uFFA0]/g);
export function foldConfusables(raw: string): string {
  if (stryMutAct_9fa48("930")) {
    {}
  } else {
    stryCov_9fa48("930");
    let out = stryMutAct_9fa48("931") ? "Stryker was here!" : (stryCov_9fa48("931"), '');
    for (const ch of raw) {
      if (stryMutAct_9fa48("932")) {
        {}
      } else {
        stryCov_9fa48("932");
        stryMutAct_9fa48("933") ? out -= CONFUSABLES[ch] ?? ch : (stryCov_9fa48("933"), out += stryMutAct_9fa48("934") ? CONFUSABLES[ch] && ch : (stryCov_9fa48("934"), CONFUSABLES[ch] ?? ch));
      }
    }
    return out;
  }
}

/**
 * Canonical normalizer used by inbound webhook AND migration 003 backfill.
 */
export function normalizeOptOutText(raw: string): string {
  if (stryMutAct_9fa48("935")) {
    {}
  } else {
    stryCov_9fa48("935");
    return stryMutAct_9fa48("937") ? foldConfusables(raw).normalize('NFKC').replace(ZERO_WIDTH_RE, '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\u00a0/g, ' ').replace(/[\r\n]+/g, ' ').replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, '').replace(/[?!.,…]+$/g, '').replace(/\s+/g, ' ').toUpperCase() : stryMutAct_9fa48("936") ? foldConfusables(raw).normalize('NFKC').replace(ZERO_WIDTH_RE, '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\u00a0/g, ' ').replace(/[\r\n]+/g, ' ').trim().replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, '').replace(/[?!.,…]+$/g, '').replace(/\s+/g, ' ').toLowerCase() : (stryCov_9fa48("936", "937"), foldConfusables(raw).normalize(stryMutAct_9fa48("938") ? "" : (stryCov_9fa48("938"), 'NFKC')).replace(ZERO_WIDTH_RE, stryMutAct_9fa48("939") ? "Stryker was here!" : (stryCov_9fa48("939"), '')).replace(stryMutAct_9fa48("940") ? /[^\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu : (stryCov_9fa48("940"), /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu), stryMutAct_9fa48("941") ? "Stryker was here!" : (stryCov_9fa48("941"), '')).replace(/\u00a0/g, stryMutAct_9fa48("942") ? "" : (stryCov_9fa48("942"), ' ')).replace(stryMutAct_9fa48("944") ? /[^\r\n]+/g : stryMutAct_9fa48("943") ? /[\r\n]/g : (stryCov_9fa48("943", "944"), /[\r\n]+/g), stryMutAct_9fa48("945") ? "" : (stryCov_9fa48("945"), ' ')).trim().replace(stryMutAct_9fa48("951") ? /^["'`“”‘’]+|[^"'`“”‘’]+$/g : stryMutAct_9fa48("950") ? /^["'`“”‘’]+|["'`“”‘’]$/g : stryMutAct_9fa48("949") ? /^["'`“”‘’]+|["'`“”‘’]+/g : stryMutAct_9fa48("948") ? /^[^"'`“”‘’]+|["'`“”‘’]+$/g : stryMutAct_9fa48("947") ? /^["'`“”‘’]|["'`“”‘’]+$/g : stryMutAct_9fa48("946") ? /["'`“”‘’]+|["'`“”‘’]+$/g : (stryCov_9fa48("946", "947", "948", "949", "950", "951"), /^["'`“”‘’]+|["'`“”‘’]+$/g), stryMutAct_9fa48("952") ? "Stryker was here!" : (stryCov_9fa48("952"), '')).replace(stryMutAct_9fa48("955") ? /[^?!.,…]+$/g : stryMutAct_9fa48("954") ? /[?!.,…]$/g : stryMutAct_9fa48("953") ? /[?!.,…]+/g : (stryCov_9fa48("953", "954", "955"), /[?!.,…]+$/g), stryMutAct_9fa48("956") ? "Stryker was here!" : (stryCov_9fa48("956"), '')).replace(stryMutAct_9fa48("958") ? /\S+/g : stryMutAct_9fa48("957") ? /\s/g : (stryCov_9fa48("957", "958"), /\s+/g), stryMutAct_9fa48("959") ? "" : (stryCov_9fa48("959"), ' ')).toUpperCase());
  }
}

/** Spaceless form so 'S T O P' and 'STOP STOP' compact to STOP / STOPSTOP. */
export function compactOptOutText(normalized: string): string {
  if (stryMutAct_9fa48("960")) {
    {}
  } else {
    stryCov_9fa48("960");
    return normalized.replace(stryMutAct_9fa48("961") ? /[A-Z0-9]/g : (stryCov_9fa48("961"), /[^A-Z0-9]/g), stryMutAct_9fa48("962") ? "Stryker was here!" : (stryCov_9fa48("962"), ''));
  }
}

/**
 * Classify an inbound body for opt-out.
 * Any message containing a per-se keyword → opt_out (or ambiguous for service talk).
 */
export function classifyOptOut(raw: string): OptOutVerdict {
  if (stryMutAct_9fa48("963")) {
    {}
  } else {
    stryCov_9fa48("963");
    const normalized = normalizeOptOutText(raw);
    if (stryMutAct_9fa48("966") ? false : stryMutAct_9fa48("965") ? true : stryMutAct_9fa48("964") ? normalized : (stryCov_9fa48("964", "965", "966"), !normalized)) return stryMutAct_9fa48("967") ? {} : (stryCov_9fa48("967"), {
      kind: stryMutAct_9fa48("968") ? "" : (stryCov_9fa48("968"), 'not_opt_out')
    });
    for (const token of OPT_OUT_EXACT) {
      if (stryMutAct_9fa48("969")) {
        {}
      } else {
        stryCov_9fa48("969");
        if (stryMutAct_9fa48("972") ? normalized !== token : stryMutAct_9fa48("971") ? false : stryMutAct_9fa48("970") ? true : (stryCov_9fa48("970", "971", "972"), normalized === token)) return stryMutAct_9fa48("973") ? {} : (stryCov_9fa48("973"), {
          kind: stryMutAct_9fa48("974") ? "" : (stryCov_9fa48("974"), 'opt_out')
        });
      }
    }
    const compact = compactOptOutText(normalized);
    // Stryker disable next-line ConditionalExpression: COMPACT entries are also hit by containsOptOutKeyword
    if (OPT_OUT_COMPACT.has(compact)) return stryMutAct_9fa48("977") ? {} : (stryCov_9fa48("977"), {
      kind: stryMutAct_9fa48("978") ? "" : (stryCov_9fa48("978"), 'opt_out')
    });

    // Service talk with STOP → needs human review (never silent not_opt_out)
    if (stryMutAct_9fa48("980") ? false : stryMutAct_9fa48("979") ? true : (stryCov_9fa48("979", "980"), isServiceTalkWithStop(normalized))) {
      if (stryMutAct_9fa48("981")) {
        {}
      } else {
        stryCov_9fa48("981");
        return stryMutAct_9fa48("982") ? {} : (stryCov_9fa48("982"), {
          kind: stryMutAct_9fa48("983") ? "" : (stryCov_9fa48("983"), 'ambiguous'),
          reason: stryMutAct_9fa48("984") ? "" : (stryCov_9fa48("984"), 'needs_human_review')
        });
      }
    }

    // Contains per-se keyword / phrase (FCC any reasonable means)
    if (stryMutAct_9fa48("986") ? false : stryMutAct_9fa48("985") ? true : (stryCov_9fa48("985", "986"), containsOptOutKeyword(normalized, compact))) {
      if (stryMutAct_9fa48("987")) {
        {}
      } else {
        stryCov_9fa48("987");
        return stryMutAct_9fa48("988") ? {} : (stryCov_9fa48("988"), {
          kind: stryMutAct_9fa48("989") ? "" : (stryCov_9fa48("989"), 'opt_out')
        });
      }
    }
    const cleanedRaw = stryMutAct_9fa48("990") ? foldConfusables(raw).normalize('NFKC').replace(ZERO_WIDTH_RE, '') : (stryCov_9fa48("990"), foldConfusables(raw).normalize(stryMutAct_9fa48("991") ? "" : (stryCov_9fa48("991"), 'NFKC')).replace(ZERO_WIDTH_RE, stryMutAct_9fa48("992") ? "Stryker was here!" : (stryCov_9fa48("992"), '')).trim());
    for (const re of AMBIGUOUS) {
      if (stryMutAct_9fa48("993")) {
        {}
      } else {
        stryCov_9fa48("993");
        // Stryker disable next-line ConditionalExpression,StringLiteral: STOP already returned via OPT_OUT_EXACT above
        if (stryMutAct_9fa48("996") ? re.test(cleanedRaw) || normalized !== 'STOP' : (stryCov_9fa48("996"), re.test(cleanedRaw) && (stryMutAct_9fa48("998") ? normalized === 'STOP' : (stryCov_9fa48("998"), normalized !== 'STOP')))) {
          if (stryMutAct_9fa48("1000")) {
            {}
          } else {
            stryCov_9fa48("1000");
            return stryMutAct_9fa48("1001") ? {} : (stryCov_9fa48("1001"), {
              kind: stryMutAct_9fa48("1002") ? "" : (stryCov_9fa48("1002"), 'ambiguous'),
              reason: stryMutAct_9fa48("1003") ? "" : (stryCov_9fa48("1003"), 'needs_human_review')
            });
          }
        }
      }
    }
    return stryMutAct_9fa48("1004") ? {} : (stryCov_9fa48("1004"), {
      kind: stryMutAct_9fa48("1005") ? "" : (stryCov_9fa48("1005"), 'not_opt_out')
    });
  }
}

/** True when a per-se keyword or phrase appears in the message. */
export function containsOptOutKeyword(normalized: string, compact: string = compactOptOutText(normalized)): boolean {
  if (stryMutAct_9fa48("1006")) {
    {}
  } else {
    stryCov_9fa48("1006");
    for (const phrase of OPT_OUT_CONTAINS_PHRASES) {
      if (stryMutAct_9fa48("1007")) {
        {}
      } else {
        stryCov_9fa48("1007");
        if (stryMutAct_9fa48("1009") ? false : stryMutAct_9fa48("1008") ? true : (stryCov_9fa48("1008", "1009"), normalized.includes(phrase))) return stryMutAct_9fa48("1010") ? false : (stryCov_9fa48("1010"), true);
      }
    }
    for (const kw of OPT_OUT_CONTAINS_KEYWORDS) {
      if (stryMutAct_9fa48("1011")) {
        {}
      } else {
        stryCov_9fa48("1011");
        if (stryMutAct_9fa48("1013") ? false : stryMutAct_9fa48("1012") ? true : (stryCov_9fa48("1012", "1013"), kw.includes(stryMutAct_9fa48("1014") ? "" : (stryCov_9fa48("1014"), ' ')))) {
          if (stryMutAct_9fa48("1015")) {
            {}
          } else {
            stryCov_9fa48("1015");
            if (stryMutAct_9fa48("1017") ? false : stryMutAct_9fa48("1016") ? true : (stryCov_9fa48("1016", "1017"), normalized.includes(kw))) return stryMutAct_9fa48("1018") ? false : (stryCov_9fa48("1018"), true);
            continue;
          }
        }
        // Word-boundary style: keyword as whole token
        const re = new RegExp(stryMutAct_9fa48("1019") ? `` : (stryCov_9fa48("1019"), `(?:^|[^A-Z0-9])${kw}(?:[^A-Z0-9]|$)`));
        if (stryMutAct_9fa48("1021") ? false : stryMutAct_9fa48("1020") ? true : (stryCov_9fa48("1020", "1021"), re.test(normalized))) return stryMutAct_9fa48("1022") ? false : (stryCov_9fa48("1022"), true);
        if (stryMutAct_9fa48("1025") ? compact.includes(kw) || kw.length >= 3 : stryMutAct_9fa48("1024") ? false : stryMutAct_9fa48("1023") ? true : (stryCov_9fa48("1023", "1024", "1025"), compact.includes(kw) && (stryMutAct_9fa48("1028") ? kw.length < 3 : stryMutAct_9fa48("1027") ? kw.length > 3 : stryMutAct_9fa48("1026") ? true : (stryCov_9fa48("1026", "1027", "1028"), kw.length >= 3)))) {
          if (stryMutAct_9fa48("1029")) {
            {}
          } else {
            stryCov_9fa48("1029");
            // Compact: STOPPLEASE / PLEASESTOP / STOPSTOPSTOP — stem vocabulary gate.
            // (Prior start/end/eq/dup OR-arms were equivalent to this regex for the
            // current keyword list and only produced survivor mutants.)
            if (stryMutAct_9fa48("1031") ? false : stryMutAct_9fa48("1030") ? true : (stryCov_9fa48("1030", "1031"), /STOP|QUIT|END|CANCEL|REVOKE|UNSUBSCRIBE|OPTOUT/.test(compact))) {
              if (stryMutAct_9fa48("1032")) {
                {}
              } else {
                stryCov_9fa48("1032");
                return stryMutAct_9fa48("1033") ? false : (stryCov_9fa48("1033"), true);
              }
            }
          }
        }
      }
    }
    return stryMutAct_9fa48("1034") ? true : (stryCov_9fa48("1034"), false);
  }
}

/** True when STOP appears inside service language (not an auto opt-out). */
export function isServiceTalkWithStop(normalized: string): boolean {
  if (stryMutAct_9fa48("1035")) {
    {}
  } else {
    stryCov_9fa48("1035");
    if (stryMutAct_9fa48("1038") ? normalized !== 'STOP' : stryMutAct_9fa48("1037") ? false : stryMutAct_9fa48("1036") ? true : (stryCov_9fa48("1036", "1037", "1038"), normalized === (stryMutAct_9fa48("1039") ? "" : (stryCov_9fa48("1039"), 'STOP')))) return stryMutAct_9fa48("1040") ? true : (stryCov_9fa48("1040"), false);
    if (stryMutAct_9fa48("1043") ? false : stryMutAct_9fa48("1042") ? true : stryMutAct_9fa48("1041") ? /\bSTOP\b/.test(normalized) : (stryCov_9fa48("1041", "1042", "1043"), !/\bSTOP\b/.test(normalized))) return stryMutAct_9fa48("1044") ? true : (stryCov_9fa48("1044"), false);
    return stryMutAct_9fa48("1047") ? (/^(WON'?T|CANT|CAN'T|DOESN'?T|DIDN'?T|NEVER)\b/.test(normalized) || /\bSTOP\s+(BY|IN|AT|THE|LEAKING|DRIPPING|COMING)\b/.test(normalized)) && /\b(WON'?T|DOESN'?T)\s+STOP\b/.test(normalized) : stryMutAct_9fa48("1046") ? false : stryMutAct_9fa48("1045") ? true : (stryCov_9fa48("1045", "1046", "1047"), (stryMutAct_9fa48("1049") ? /^(WON'?T|CANT|CAN'T|DOESN'?T|DIDN'?T|NEVER)\b/.test(normalized) && /\bSTOP\s+(BY|IN|AT|THE|LEAKING|DRIPPING|COMING)\b/.test(normalized) : stryMutAct_9fa48("1048") ? false : (stryCov_9fa48("1048", "1049"), (stryMutAct_9fa48("1053") ? /^(WON'?T|CANT|CAN'T|DOESN'?T|DIDN'T|NEVER)\b/ : stryMutAct_9fa48("1052") ? /^(WON'?T|CANT|CAN'T|DOESN'T|DIDN'?T|NEVER)\b/ : stryMutAct_9fa48("1051") ? /^(WON'T|CANT|CAN'T|DOESN'?T|DIDN'?T|NEVER)\b/ : stryMutAct_9fa48("1050") ? /(WON'?T|CANT|CAN'T|DOESN'?T|DIDN'?T|NEVER)\b/ : (stryCov_9fa48("1050", "1051", "1052", "1053"), /^(WON'?T|CANT|CAN'T|DOESN'?T|DIDN'?T|NEVER)\b/)).test(normalized) || (stryMutAct_9fa48("1055") ? /\bSTOP\S+(BY|IN|AT|THE|LEAKING|DRIPPING|COMING)\b/ : stryMutAct_9fa48("1054") ? /\bSTOP\s(BY|IN|AT|THE|LEAKING|DRIPPING|COMING)\b/ : (stryCov_9fa48("1054", "1055"), /\bSTOP\s+(BY|IN|AT|THE|LEAKING|DRIPPING|COMING)\b/)).test(normalized))) || (stryMutAct_9fa48("1059") ? /\b(WON'?T|DOESN'?T)\S+STOP\b/ : stryMutAct_9fa48("1058") ? /\b(WON'?T|DOESN'?T)\sSTOP\b/ : stryMutAct_9fa48("1057") ? /\b(WON'?T|DOESN'T)\s+STOP\b/ : stryMutAct_9fa48("1056") ? /\b(WON'T|DOESN'?T)\s+STOP\b/ : (stryCov_9fa48("1056", "1057", "1058", "1059"), /\b(WON'?T|DOESN'?T)\s+STOP\b/)).test(normalized));
  }
}

/** True only for definite auto opt-out. */
export function isDefiniteOptOut(raw: string): boolean {
  if (stryMutAct_9fa48("1060")) {
    {}
  } else {
    stryCov_9fa48("1060");
    return stryMutAct_9fa48("1063") ? classifyOptOut(raw).kind !== 'opt_out' : stryMutAct_9fa48("1062") ? false : stryMutAct_9fa48("1061") ? true : (stryCov_9fa48("1061", "1062", "1063"), classifyOptOut(raw).kind === (stryMutAct_9fa48("1064") ? "" : (stryCov_9fa48("1064"), 'opt_out')));
  }
}

/**
 * Tokens for migration 003 STOP backfill — same list as runtime.
 */
export function optOutBackfillTokens(): string[] {
  if (stryMutAct_9fa48("1065")) {
    {}
  } else {
    stryCov_9fa48("1065");
    const set = new Set<string>(stryMutAct_9fa48("1066") ? [] : (stryCov_9fa48("1066"), [...optOutBackfillExactList(), ...optOutBackfillCompactList()]));
    return stryMutAct_9fa48("1067") ? [] : (stryCov_9fa48("1067"), [...set]);
  }
}
export const OPT_OUT_FOOTER = stryMutAct_9fa48("1068") ? "" : (stryCov_9fa48("1068"), 'Reply STOP to opt out.');