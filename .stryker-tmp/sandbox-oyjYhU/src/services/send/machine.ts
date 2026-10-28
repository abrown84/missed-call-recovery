/**
 * Pure send/reconcile state machine.
 *
 * Lifecycle:
 *   queued → sent | never_sent | ambiguous → (reconcile) → resolved | needs_review
 *
 * Transitions are total and deterministic — property-tested with fast-check.
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
export const MAX_RECONCILE_ATTEMPTS = 5;

/** Base park interval (5 min); doubles each attempt, capped at 6h. */
export const PARK_BASE_MS = stryMutAct_9fa48("2107") ? 5 * 60 / 1000 : (stryCov_9fa48("2107"), (stryMutAct_9fa48("2108") ? 5 / 60 : (stryCov_9fa48("2108"), 5 * 60)) * 1000);
export const PARK_MAX_MS = stryMutAct_9fa48("2109") ? 6 * 60 * 60 / 1000 : (stryCov_9fa48("2109"), (stryMutAct_9fa48("2110") ? 6 * 60 / 60 : (stryCov_9fa48("2110"), (stryMutAct_9fa48("2111") ? 6 / 60 : (stryCov_9fa48("2111"), 6 * 60)) * 60)) * 1000);
export type RelaySendSignal = {
  type: 'ok';
  messageId: string;
  status: string;
  keyEchoed: boolean;
  duplicate?: boolean;
} | {
  type: 'conflict';
} | {
  type: 'rate_limit';
} | {
  type: 'maintenance';
} | {
  type: 'failed';
  status?: string;
} | {
  type: 'error';
};
export type RelayLookupSignal = {
  type: 'sent';
  status: string;
} | {
  type: 'never_sent';
} | {
  type: 'failed';
  status: string;
} | {
  type: 'unknown';
};
export type SendRowPhase = 'queued' | 'sending' | 'sent' | 'never_sent' | 'ambiguous' | 'needs_review' | 'resolved';
export type SendMachineEvent = {
  kind: 'send_result';
  signal: RelaySendSignal;
  capsBeforeSend: boolean;
} | {
  kind: 'lookup';
  signal: RelayLookupSignal;
  keySupportedAtSend: boolean;
  attempts: number;
};
export type SendMachineDecision = {
  action: 'confirm_sent';
  providerStatus: string;
  keySupportedAtSend: boolean;
  phase: 'sent';
} | {
  action: 'park_ambiguous';
  reason: string;
  phase: 'ambiguous';
  nextAttempts: number;
} | {
  action: 'needs_review';
  reason: string;
  phase: 'needs_review';
} | {
  action: 'requeue_never_sent';
  phase: 'never_sent';
} | {
  action: 'resolved';
  providerStatus: string;
  phase: 'resolved';
};
export function parkDelayMs(reconcileAttempts: number): number {
  if (stryMutAct_9fa48("2112")) {
    {}
  } else {
    stryCov_9fa48("2112");
    const n = Number(reconcileAttempts);
    // n > 0 (not >=): Math.floor(0) === 0 so >= is equivalent for the exp path;
    // still require finite + positive so NaN/Infinity/negatives park at base delay.
    // Stryker disable next-line EqualityOperator: n >= 0 ≡ n > 0 here (floor(0)===0)
    const exp = (stryMutAct_9fa48("2115") ? Number.isFinite(n) || n > 0 : stryMutAct_9fa48("2114") ? false : stryMutAct_9fa48("2113") ? true : (stryCov_9fa48("2113", "2114", "2115"), Number.isFinite(n) && (stryMutAct_9fa48("2116") ? true : (stryCov_9fa48("2116"), n > 0)))) ? Math.floor(n) : 0;
    const raw = stryMutAct_9fa48("2119") ? PARK_BASE_MS / 2 ** exp : (stryCov_9fa48("2119"), PARK_BASE_MS * 2 ** exp);
    return stryMutAct_9fa48("2120") ? Math.max(raw, PARK_MAX_MS) : (stryCov_9fa48("2120"), Math.min(raw, PARK_MAX_MS));
  }
}
export function parkNextAt(reconcileAttempts: number, now: Date = new Date()): Date {
  if (stryMutAct_9fa48("2121")) {
    {}
  } else {
    stryCov_9fa48("2121");
    return new Date(stryMutAct_9fa48("2122") ? now.getTime() - parkDelayMs(reconcileAttempts) : (stryCov_9fa48("2122"), now.getTime() + parkDelayMs(reconcileAttempts)));
  }
}
const FAILED_STATUSES = new Set(stryMutAct_9fa48("2123") ? [] : (stryCov_9fa48("2123"), [stryMutAct_9fa48("2124") ? "" : (stryCov_9fa48("2124"), 'failed'), stryMutAct_9fa48("2125") ? "" : (stryCov_9fa48("2125"), 'undelivered'), stryMutAct_9fa48("2126") ? "" : (stryCov_9fa48("2126"), 'rejected'), stryMutAct_9fa48("2127") ? "" : (stryCov_9fa48("2127"), 'error')]));
const CONFIRMED_STATUSES = new Set(stryMutAct_9fa48("2128") ? [] : (stryCov_9fa48("2128"), [stryMutAct_9fa48("2129") ? "" : (stryCov_9fa48("2129"), 'queued'), stryMutAct_9fa48("2130") ? "" : (stryCov_9fa48("2130"), 'dispatched'), stryMutAct_9fa48("2131") ? "" : (stryCov_9fa48("2131"), 'sent'), stryMutAct_9fa48("2132") ? "" : (stryCov_9fa48("2132"), 'delivered')]));

/**
 * Apply a send or lookup event to the row state machine.
 * Does not perform I/O — callers persist the decision.
 */
export function transitionSend(event: SendMachineEvent): SendMachineDecision {
  if (stryMutAct_9fa48("2133")) {
    {}
  } else {
    stryCov_9fa48("2133");
    if (stryMutAct_9fa48("2136") ? event.kind !== 'send_result' : stryMutAct_9fa48("2135") ? false : stryMutAct_9fa48("2134") ? true : (stryCov_9fa48("2134", "2135", "2136"), event.kind === (stryMutAct_9fa48("2137") ? "" : (stryCov_9fa48("2137"), 'send_result')))) {
      if (stryMutAct_9fa48("2138")) {
        {}
      } else {
        stryCov_9fa48("2138");
        return onSendResult(event.signal, event.capsBeforeSend);
      }
    }
    return onLookup(event.signal, event.keySupportedAtSend, event.attempts);
  }
}
function onSendResult(signal: RelaySendSignal, capsBeforeSend: boolean): SendMachineDecision {
  if (stryMutAct_9fa48("2139")) {
    {}
  } else {
    stryCov_9fa48("2139");
    switch (signal.type) {
      case stryMutAct_9fa48("2141") ? "" : (stryCov_9fa48("2141"), 'ok'):
        if (stryMutAct_9fa48("2140")) {} else {
          stryCov_9fa48("2140");
          {
            if (stryMutAct_9fa48("2142")) {
              {}
            } else {
              stryCov_9fa48("2142");
              if (stryMutAct_9fa48("2145") ? signal.duplicate || isFailedStatus(signal.status) : stryMutAct_9fa48("2144") ? false : stryMutAct_9fa48("2143") ? true : (stryCov_9fa48("2143", "2144", "2145"), signal.duplicate && isFailedStatus(signal.status))) {
                if (stryMutAct_9fa48("2146")) {
                  {}
                } else {
                  stryCov_9fa48("2146");
                  return stryMutAct_9fa48("2147") ? {} : (stryCov_9fa48("2147"), {
                    action: stryMutAct_9fa48("2148") ? "" : (stryCov_9fa48("2148"), 'needs_review'),
                    reason: stryMutAct_9fa48("2149") ? "" : (stryCov_9fa48("2149"), 'duplicate_failed'),
                    phase: stryMutAct_9fa48("2150") ? "" : (stryCov_9fa48("2150"), 'needs_review')
                  });
                }
              }
              if (stryMutAct_9fa48("2152") ? false : stryMutAct_9fa48("2151") ? true : (stryCov_9fa48("2151", "2152"), isFailedStatus(signal.status))) {
                if (stryMutAct_9fa48("2153")) {
                  {}
                } else {
                  stryCov_9fa48("2153");
                  return stryMutAct_9fa48("2154") ? {} : (stryCov_9fa48("2154"), {
                    action: stryMutAct_9fa48("2155") ? "" : (stryCov_9fa48("2155"), 'needs_review'),
                    reason: stryMutAct_9fa48("2156") ? "" : (stryCov_9fa48("2156"), 'relay_failed'),
                    phase: stryMutAct_9fa48("2157") ? "" : (stryCov_9fa48("2157"), 'needs_review')
                  });
                }
              }
              return stryMutAct_9fa48("2158") ? {} : (stryCov_9fa48("2158"), {
                action: stryMutAct_9fa48("2159") ? "" : (stryCov_9fa48("2159"), 'confirm_sent'),
                providerStatus: stryMutAct_9fa48("2162") ? signal.status && 'queued' : stryMutAct_9fa48("2161") ? false : stryMutAct_9fa48("2160") ? true : (stryCov_9fa48("2160", "2161", "2162"), signal.status || (stryMutAct_9fa48("2163") ? "" : (stryCov_9fa48("2163"), 'queued'))),
                keySupportedAtSend: stryMutAct_9fa48("2166") ? capsBeforeSend || signal.keyEchoed : stryMutAct_9fa48("2165") ? false : stryMutAct_9fa48("2164") ? true : (stryCov_9fa48("2164", "2165", "2166"), capsBeforeSend && signal.keyEchoed),
                phase: stryMutAct_9fa48("2167") ? "" : (stryCov_9fa48("2167"), 'sent')
              });
            }
          }
        }
      case stryMutAct_9fa48("2169") ? "" : (stryCov_9fa48("2169"), 'conflict'):
        if (stryMutAct_9fa48("2168")) {} else {
          stryCov_9fa48("2168");
          return stryMutAct_9fa48("2170") ? {} : (stryCov_9fa48("2170"), {
            action: stryMutAct_9fa48("2171") ? "" : (stryCov_9fa48("2171"), 'needs_review'),
            reason: stryMutAct_9fa48("2172") ? "" : (stryCov_9fa48("2172"), 'idempotency_conflict'),
            phase: stryMutAct_9fa48("2173") ? "" : (stryCov_9fa48("2173"), 'needs_review')
          });
        }
      case stryMutAct_9fa48("2175") ? "" : (stryCov_9fa48("2175"), 'failed'):
        if (stryMutAct_9fa48("2174")) {} else {
          stryCov_9fa48("2174");
          return stryMutAct_9fa48("2176") ? {} : (stryCov_9fa48("2176"), {
            action: stryMutAct_9fa48("2177") ? "" : (stryCov_9fa48("2177"), 'needs_review'),
            reason: stryMutAct_9fa48("2178") ? "" : (stryCov_9fa48("2178"), 'relay_failed'),
            phase: stryMutAct_9fa48("2179") ? "" : (stryCov_9fa48("2179"), 'needs_review')
          });
        }
      case stryMutAct_9fa48("2181") ? "" : (stryCov_9fa48("2181"), 'rate_limit'):
        if (stryMutAct_9fa48("2180")) {} else {
          stryCov_9fa48("2180");
          return stryMutAct_9fa48("2182") ? {} : (stryCov_9fa48("2182"), {
            action: stryMutAct_9fa48("2183") ? "" : (stryCov_9fa48("2183"), 'park_ambiguous'),
            reason: stryMutAct_9fa48("2184") ? "" : (stryCov_9fa48("2184"), 'recent_send'),
            phase: stryMutAct_9fa48("2185") ? "" : (stryCov_9fa48("2185"), 'ambiguous'),
            nextAttempts: 0
          });
        }
      case stryMutAct_9fa48("2187") ? "" : (stryCov_9fa48("2187"), 'maintenance'):
        if (stryMutAct_9fa48("2186")) {} else {
          stryCov_9fa48("2186");
          return stryMutAct_9fa48("2188") ? {} : (stryCov_9fa48("2188"), {
            action: stryMutAct_9fa48("2189") ? "" : (stryCov_9fa48("2189"), 'park_ambiguous'),
            reason: stryMutAct_9fa48("2190") ? "" : (stryCov_9fa48("2190"), 'maintenance'),
            phase: stryMutAct_9fa48("2191") ? "" : (stryCov_9fa48("2191"), 'ambiguous'),
            nextAttempts: 0
          });
        }
      // Stryker disable next-line StringLiteral,ConditionalExpression: case 'error' ≡ default body
      case 'error':
      default:
        if (stryMutAct_9fa48("2193")) {} else {
          stryCov_9fa48("2193");
          return stryMutAct_9fa48("2194") ? {} : (stryCov_9fa48("2194"), {
            action: stryMutAct_9fa48("2195") ? "" : (stryCov_9fa48("2195"), 'park_ambiguous'),
            reason: stryMutAct_9fa48("2196") ? "" : (stryCov_9fa48("2196"), 'send_error'),
            phase: stryMutAct_9fa48("2197") ? "" : (stryCov_9fa48("2197"), 'ambiguous'),
            nextAttempts: 0
          });
        }
    }
  }
}
function onLookup(signal: RelayLookupSignal, keySupportedAtSend: boolean, attempts: number): SendMachineDecision {
  if (stryMutAct_9fa48("2198")) {
    {}
  } else {
    stryCov_9fa48("2198");
    switch (signal.type) {
      case stryMutAct_9fa48("2200") ? "" : (stryCov_9fa48("2200"), 'sent'):
        if (stryMutAct_9fa48("2199")) {} else {
          stryCov_9fa48("2199");
          if (stryMutAct_9fa48("2202") ? false : stryMutAct_9fa48("2201") ? true : (stryCov_9fa48("2201", "2202"), isFailedStatus(signal.status))) {
            if (stryMutAct_9fa48("2203")) {
              {}
            } else {
              stryCov_9fa48("2203");
              return stryMutAct_9fa48("2204") ? {} : (stryCov_9fa48("2204"), {
                action: stryMutAct_9fa48("2205") ? "" : (stryCov_9fa48("2205"), 'needs_review'),
                reason: stryMutAct_9fa48("2206") ? "" : (stryCov_9fa48("2206"), 'relay_status_failed'),
                phase: stryMutAct_9fa48("2207") ? "" : (stryCov_9fa48("2207"), 'needs_review')
              });
            }
          }
          // Non-terminal / odd statuses on found:true → park (never invent resolved)
          if (stryMutAct_9fa48("2210") ? false : stryMutAct_9fa48("2209") ? true : stryMutAct_9fa48("2208") ? isConfirmedStatus(signal.status) : (stryCov_9fa48("2208", "2209", "2210"), !isConfirmedStatus(signal.status))) {
            if (stryMutAct_9fa48("2211")) {
              {}
            } else {
              stryCov_9fa48("2211");
              const next = stryMutAct_9fa48("2212") ? attempts - 1 : (stryCov_9fa48("2212"), attempts + 1);
              if (stryMutAct_9fa48("2216") ? next < MAX_RECONCILE_ATTEMPTS : stryMutAct_9fa48("2215") ? next > MAX_RECONCILE_ATTEMPTS : stryMutAct_9fa48("2214") ? false : stryMutAct_9fa48("2213") ? true : (stryCov_9fa48("2213", "2214", "2215", "2216"), next >= MAX_RECONCILE_ATTEMPTS)) {
                if (stryMutAct_9fa48("2217")) {
                  {}
                } else {
                  stryCov_9fa48("2217");
                  return stryMutAct_9fa48("2218") ? {} : (stryCov_9fa48("2218"), {
                    action: stryMutAct_9fa48("2219") ? "" : (stryCov_9fa48("2219"), 'needs_review'),
                    reason: stryMutAct_9fa48("2220") ? "" : (stryCov_9fa48("2220"), 'max_attempts'),
                    phase: stryMutAct_9fa48("2221") ? "" : (stryCov_9fa48("2221"), 'needs_review')
                  });
                }
              }
              return stryMutAct_9fa48("2222") ? {} : (stryCov_9fa48("2222"), {
                action: stryMutAct_9fa48("2223") ? "" : (stryCov_9fa48("2223"), 'park_ambiguous'),
                reason: stryMutAct_9fa48("2224") ? "" : (stryCov_9fa48("2224"), 'lookup_nonterminal'),
                phase: stryMutAct_9fa48("2225") ? "" : (stryCov_9fa48("2225"), 'ambiguous'),
                nextAttempts: next
              });
            }
          }
          // status is non-empty here: falsy values fail isConfirmedStatus above
          return stryMutAct_9fa48("2226") ? {} : (stryCov_9fa48("2226"), {
            action: stryMutAct_9fa48("2227") ? "" : (stryCov_9fa48("2227"), 'resolved'),
            providerStatus: signal.status,
            phase: stryMutAct_9fa48("2228") ? "" : (stryCov_9fa48("2228"), 'resolved')
          });
        }
      case stryMutAct_9fa48("2230") ? "" : (stryCov_9fa48("2230"), 'failed'):
        if (stryMutAct_9fa48("2229")) {} else {
          stryCov_9fa48("2229");
          return stryMutAct_9fa48("2231") ? {} : (stryCov_9fa48("2231"), {
            action: stryMutAct_9fa48("2232") ? "" : (stryCov_9fa48("2232"), 'needs_review'),
            reason: stryMutAct_9fa48("2233") ? "" : (stryCov_9fa48("2233"), 'relay_status_failed'),
            phase: stryMutAct_9fa48("2234") ? "" : (stryCov_9fa48("2234"), 'needs_review')
          });
        }
      case stryMutAct_9fa48("2236") ? "" : (stryCov_9fa48("2236"), 'never_sent'):
        if (stryMutAct_9fa48("2235")) {} else {
          stryCov_9fa48("2235");
          if (stryMutAct_9fa48("2239") ? false : stryMutAct_9fa48("2238") ? true : stryMutAct_9fa48("2237") ? keySupportedAtSend : (stryCov_9fa48("2237", "2238", "2239"), !keySupportedAtSend)) {
            if (stryMutAct_9fa48("2240")) {
              {}
            } else {
              stryCov_9fa48("2240");
              return stryMutAct_9fa48("2241") ? {} : (stryCov_9fa48("2241"), {
                action: stryMutAct_9fa48("2242") ? "" : (stryCov_9fa48("2242"), 'needs_review'),
                reason: stryMutAct_9fa48("2243") ? "" : (stryCov_9fa48("2243"), 'never_sent_without_key_support'),
                phase: stryMutAct_9fa48("2244") ? "" : (stryCov_9fa48("2244"), 'needs_review')
              });
            }
          }
          return stryMutAct_9fa48("2245") ? {} : (stryCov_9fa48("2245"), {
            action: stryMutAct_9fa48("2246") ? "" : (stryCov_9fa48("2246"), 'requeue_never_sent'),
            phase: stryMutAct_9fa48("2247") ? "" : (stryCov_9fa48("2247"), 'never_sent')
          });
        }
      case stryMutAct_9fa48("2248") ? "" : (stryCov_9fa48("2248"), 'unknown'):
      default:
        if (stryMutAct_9fa48("2249")) {} else {
          stryCov_9fa48("2249");
          {
            if (stryMutAct_9fa48("2250")) {
              {}
            } else {
              stryCov_9fa48("2250");
              const next = stryMutAct_9fa48("2251") ? Math.max(0, attempts) - 1 : (stryCov_9fa48("2251"), (stryMutAct_9fa48("2252") ? Math.min(0, attempts) : (stryCov_9fa48("2252"), Math.max(0, attempts))) + 1);
              if (stryMutAct_9fa48("2256") ? next < MAX_RECONCILE_ATTEMPTS : stryMutAct_9fa48("2255") ? next > MAX_RECONCILE_ATTEMPTS : stryMutAct_9fa48("2254") ? false : stryMutAct_9fa48("2253") ? true : (stryCov_9fa48("2253", "2254", "2255", "2256"), next >= MAX_RECONCILE_ATTEMPTS)) {
                if (stryMutAct_9fa48("2257")) {
                  {}
                } else {
                  stryCov_9fa48("2257");
                  return stryMutAct_9fa48("2258") ? {} : (stryCov_9fa48("2258"), {
                    action: stryMutAct_9fa48("2259") ? "" : (stryCov_9fa48("2259"), 'needs_review'),
                    reason: stryMutAct_9fa48("2260") ? "" : (stryCov_9fa48("2260"), 'max_attempts'),
                    phase: stryMutAct_9fa48("2261") ? "" : (stryCov_9fa48("2261"), 'needs_review')
                  });
                }
              }
              return stryMutAct_9fa48("2262") ? {} : (stryCov_9fa48("2262"), {
                action: stryMutAct_9fa48("2263") ? "" : (stryCov_9fa48("2263"), 'park_ambiguous'),
                reason: stryMutAct_9fa48("2264") ? "" : (stryCov_9fa48("2264"), 'lookup_unknown'),
                phase: stryMutAct_9fa48("2265") ? "" : (stryCov_9fa48("2265"), 'ambiguous'),
                nextAttempts: next
              });
            }
          }
        }
    }
  }
}
export function isFailedStatus(status: string | null | undefined): boolean {
  if (stryMutAct_9fa48("2266")) {
    {}
  } else {
    stryCov_9fa48("2266");
    return FAILED_STATUSES.has(stryMutAct_9fa48("2267") ? String(status ?? '').toUpperCase() : (stryCov_9fa48("2267"), String(stryMutAct_9fa48("2268") ? status && '' : (stryCov_9fa48("2268"), status ?? (stryMutAct_9fa48("2269") ? "Stryker was here!" : (stryCov_9fa48("2269"), '')))).toLowerCase()));
  }
}
export function isConfirmedStatus(status: string | null | undefined): boolean {
  if (stryMutAct_9fa48("2270")) {
    {}
  } else {
    stryCov_9fa48("2270");
    return CONFIRMED_STATUSES.has(stryMutAct_9fa48("2271") ? String(status ?? '').toUpperCase() : (stryCov_9fa48("2271"), String(stryMutAct_9fa48("2272") ? status && '' : (stryCov_9fa48("2272"), status ?? (stryMutAct_9fa48("2273") ? "Stryker was here!" : (stryCov_9fa48("2273"), '')))).toLowerCase()));
  }
}
export function isAmbiguousStatus(status: string | null | undefined): boolean {
  if (stryMutAct_9fa48("2274")) {
    {}
  } else {
    stryCov_9fa48("2274");
    const s = stryMutAct_9fa48("2275") ? String(status ?? '').toUpperCase() : (stryCov_9fa48("2275"), String(stryMutAct_9fa48("2276") ? status && '' : (stryCov_9fa48("2276"), status ?? (stryMutAct_9fa48("2277") ? "Stryker was here!" : (stryCov_9fa48("2277"), '')))).toLowerCase());
    return stryMutAct_9fa48("2280") ? (s === 'sending' || s === 'unknown' || s === 'deferred') && s === 'pending' : stryMutAct_9fa48("2279") ? false : stryMutAct_9fa48("2278") ? true : (stryCov_9fa48("2278", "2279", "2280"), (stryMutAct_9fa48("2282") ? (s === 'sending' || s === 'unknown') && s === 'deferred' : stryMutAct_9fa48("2281") ? false : (stryCov_9fa48("2281", "2282"), (stryMutAct_9fa48("2284") ? s === 'sending' && s === 'unknown' : stryMutAct_9fa48("2283") ? false : (stryCov_9fa48("2283", "2284"), (stryMutAct_9fa48("2286") ? s !== 'sending' : stryMutAct_9fa48("2285") ? false : (stryCov_9fa48("2285", "2286"), s === (stryMutAct_9fa48("2287") ? "" : (stryCov_9fa48("2287"), 'sending')))) || (stryMutAct_9fa48("2289") ? s !== 'unknown' : stryMutAct_9fa48("2288") ? false : (stryCov_9fa48("2288", "2289"), s === (stryMutAct_9fa48("2290") ? "" : (stryCov_9fa48("2290"), 'unknown')))))) || (stryMutAct_9fa48("2292") ? s !== 'deferred' : stryMutAct_9fa48("2291") ? false : (stryCov_9fa48("2291", "2292"), s === (stryMutAct_9fa48("2293") ? "" : (stryCov_9fa48("2293"), 'deferred')))))) || (stryMutAct_9fa48("2295") ? s !== 'pending' : stryMutAct_9fa48("2294") ? false : (stryCov_9fa48("2294", "2295"), s === (stryMutAct_9fa48("2296") ? "" : (stryCov_9fa48("2296"), 'pending')))));
  }
}

/** Recovery resolution used to gate campaign step 1. */
export type RecoveryResolvedOutcome = 'resolved_sent' | 'resolved_abandoned' | 'pending' | 'absent';
export function classifyRecoveryStatus(status: string | null | undefined): RecoveryResolvedOutcome {
  if (stryMutAct_9fa48("2297")) {
    {}
  } else {
    stryCov_9fa48("2297");
    if (stryMutAct_9fa48("2300") ? false : stryMutAct_9fa48("2299") ? true : stryMutAct_9fa48("2298") ? status : (stryCov_9fa48("2298", "2299", "2300"), !status)) return stryMutAct_9fa48("2301") ? "" : (stryCov_9fa48("2301"), 'absent');
    const s = stryMutAct_9fa48("2302") ? String(status).toUpperCase() : (stryCov_9fa48("2302"), String(status).toLowerCase());
    if (stryMutAct_9fa48("2304") ? false : stryMutAct_9fa48("2303") ? true : (stryCov_9fa48("2303", "2304"), isConfirmedStatus(s))) return stryMutAct_9fa48("2305") ? "" : (stryCov_9fa48("2305"), 'resolved_sent');
    if (stryMutAct_9fa48("2308") ? s === 'abandoned_retry' && s === 'abandoned_done' : stryMutAct_9fa48("2307") ? false : stryMutAct_9fa48("2306") ? true : (stryCov_9fa48("2306", "2307", "2308"), (stryMutAct_9fa48("2310") ? s !== 'abandoned_retry' : stryMutAct_9fa48("2309") ? false : (stryCov_9fa48("2309", "2310"), s === (stryMutAct_9fa48("2311") ? "" : (stryCov_9fa48("2311"), 'abandoned_retry')))) || (stryMutAct_9fa48("2313") ? s !== 'abandoned_done' : stryMutAct_9fa48("2312") ? false : (stryCov_9fa48("2312", "2313"), s === (stryMutAct_9fa48("2314") ? "" : (stryCov_9fa48("2314"), 'abandoned_done')))))) return stryMutAct_9fa48("2315") ? "" : (stryCov_9fa48("2315"), 'resolved_abandoned');
    // Ambiguous / failed / needs_review / deferred / unknown vocabulary → pending
    // (never treat as absent → no step-1 double send). Prior explicit pending
    // branches were equivalent to this fallthrough and only fed survivor mutants.
    return stryMutAct_9fa48("2316") ? "" : (stryCov_9fa48("2316"), 'pending');
  }
}