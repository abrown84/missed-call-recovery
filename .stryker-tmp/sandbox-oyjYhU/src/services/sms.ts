/**
 * Recovery / follow-up SMS — thin DI wrappers around the single send module.
 * Decisions in send/decisions; this file only does I/O + templates.
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
import { createServerClient } from '@/lib/supabase';
import { appendOptOutFooter } from '@/lib/templates';
import { redactPhone } from '@/lib/pii';
import { sendMessage, type SendOutcome } from '@/services/send';
import { interpretRecoverySendOutcome } from '@/services/send/decisions';
import { recoveryMessageSid } from '@/services/sms-sid';
import { SuppressionLookupError, isPhoneSuppressed } from '@/services/suppressions';
import type { Database } from '@/types/database';
type Business = Database['public']['Tables']['businesses']['Row'];
type Supabase = ReturnType<typeof createServerClient>;

/** Kept short so body + STOP footer fit reasonably. */
export const SMS_TEMPLATES: Record<string, string> = stryMutAct_9fa48("2330") ? {} : (stryCov_9fa48("2330"), {
  plumbing: stryMutAct_9fa48("2331") ? `` : (stryCov_9fa48("2331"), `Hi, {business} here - we missed your call. What plumbing issue can we help with? Reply or call back.`),
  hvac: stryMutAct_9fa48("2332") ? `` : (stryCov_9fa48("2332"), `Hi, {business} here - missed your call. Heating/cooling issue? Reply with details and we'll help ASAP.`),
  electrical: stryMutAct_9fa48("2333") ? `` : (stryCov_9fa48("2333"), `Hi, {business} here - we missed your call. What electrical issue can we help with? Reply anytime.`),
  general: stryMutAct_9fa48("2334") ? `` : (stryCov_9fa48("2334"), `Hi, this is {business}. Sorry we missed your call! How can we help? Reply or call us back.`)
});
export type SmsDeps = {
  db: () => Supabase;
  clock: () => Date;
  sendMessage: (req: Parameters<typeof sendMessage>[0]) => Promise<SendOutcome>;
  isPhoneSuppressed: (businessId: string, phone: string) => Promise<boolean>;
  SuppressionLookupError: typeof SuppressionLookupError;
};
export function defaultSmsDeps(): SmsDeps {
  if (stryMutAct_9fa48("2335")) {
    {}
  } else {
    stryCov_9fa48("2335");
    return stryMutAct_9fa48("2336") ? {} : (stryCov_9fa48("2336"), {
      db: stryMutAct_9fa48("2337") ? () => undefined : (stryCov_9fa48("2337"), () => createServerClient()),
      clock: stryMutAct_9fa48("2338") ? () => undefined : (stryCov_9fa48("2338"), () => new Date()),
      sendMessage,
      isPhoneSuppressed,
      SuppressionLookupError
    });
  }
}
export function buildRecoveryBody(business: Business): string {
  if (stryMutAct_9fa48("2339")) {
    {}
  } else {
    stryCov_9fa48("2339");
    const customTemplate = (business.settings as Record<string, unknown>)?.smsTemplate as string | undefined;
    const template = stryMutAct_9fa48("2342") ? (customTemplate || SMS_TEMPLATES[business.vertical]) && SMS_TEMPLATES.general : stryMutAct_9fa48("2341") ? false : stryMutAct_9fa48("2340") ? true : (stryCov_9fa48("2340", "2341", "2342"), (stryMutAct_9fa48("2344") ? customTemplate && SMS_TEMPLATES[business.vertical] : stryMutAct_9fa48("2343") ? false : (stryCov_9fa48("2343", "2344"), customTemplate || SMS_TEMPLATES[business.vertical])) || SMS_TEMPLATES.general);
    return appendOptOutFooter(template.replace(stryMutAct_9fa48("2345") ? "" : (stryCov_9fa48("2345"), '{business}'), business.name));
  }
}
export function fallbackDeferIso(now: Date): string {
  if (stryMutAct_9fa48("2346")) {
    {}
  } else {
    stryCov_9fa48("2346");
    return new Date(stryMutAct_9fa48("2347") ? now.getTime() - 8 * 60 * 60 * 1000 : (stryCov_9fa48("2347"), now.getTime() + (stryMutAct_9fa48("2348") ? 8 * 60 * 60 / 1000 : (stryCov_9fa48("2348"), (stryMutAct_9fa48("2349") ? 8 * 60 / 60 : (stryCov_9fa48("2349"), (stryMutAct_9fa48("2350") ? 8 / 60 : (stryCov_9fa48("2350"), 8 * 60)) * 60)) * 1000)))).toISOString();
  }
}

/**
 * Persist a quiet-hours-deferred recovery so cron can send when the window opens.
 * Never drop — Defer, don't discard (quiet-hours docstring + QC r6 P0).
 */
export async function persistDeferredRecovery(opts: {
  leadId: string;
  body: string;
  nextSendAt: string;
}): Promise<void> {
  if (stryMutAct_9fa48("2351")) {
    {}
  } else {
    stryCov_9fa48("2351");
    return persistDeferredRecoveryWithDeps(defaultSmsDeps(), opts);
  }
}
export async function persistDeferredRecoveryWithDeps(deps: SmsDeps, opts: {
  leadId: string;
  body: string;
  nextSendAt: string;
}): Promise<void> {
  if (stryMutAct_9fa48("2352")) {
    {}
  } else {
    stryCov_9fa48("2352");
    const supabase = deps.db();
    const sid = recoveryMessageSid(opts.leadId);
    const {
      data: existing
    } = await supabase.from(stryMutAct_9fa48("2353") ? "" : (stryCov_9fa48("2353"), 'sms_messages')).select(stryMutAct_9fa48("2354") ? "" : (stryCov_9fa48("2354"), 'id, status')).eq(stryMutAct_9fa48("2355") ? "" : (stryCov_9fa48("2355"), 'message_sid'), sid).maybeSingle();
    if (stryMutAct_9fa48("2357") ? false : stryMutAct_9fa48("2356") ? true : (stryCov_9fa48("2356", "2357"), existing)) {
      if (stryMutAct_9fa48("2358")) {
        {}
      } else {
        stryCov_9fa48("2358");
        await supabase.from(stryMutAct_9fa48("2359") ? "" : (stryCov_9fa48("2359"), 'sms_messages')).update(stryMutAct_9fa48("2360") ? {} : (stryCov_9fa48("2360"), {
          status: stryMutAct_9fa48("2361") ? "" : (stryCov_9fa48("2361"), 'deferred'),
          next_retry_at: opts.nextSendAt,
          body: opts.body
        })).eq(stryMutAct_9fa48("2362") ? "" : (stryCov_9fa48("2362"), 'message_sid'), sid);
        return;
      }
    }
    const {
      error
    } = await supabase.from(stryMutAct_9fa48("2363") ? "" : (stryCov_9fa48("2363"), 'sms_messages')).insert(stryMutAct_9fa48("2364") ? {} : (stryCov_9fa48("2364"), {
      lead_id: opts.leadId,
      direction: stryMutAct_9fa48("2365") ? "" : (stryCov_9fa48("2365"), 'outbound'),
      body: opts.body,
      message_sid: sid,
      status: stryMutAct_9fa48("2366") ? "" : (stryCov_9fa48("2366"), 'deferred'),
      next_retry_at: opts.nextSendAt,
      key_supported_at_send: stryMutAct_9fa48("2367") ? true : (stryCov_9fa48("2367"), false)
    }));
    if (stryMutAct_9fa48("2370") ? error || error.code !== '23505' : stryMutAct_9fa48("2369") ? false : stryMutAct_9fa48("2368") ? true : (stryCov_9fa48("2368", "2369", "2370"), error && (stryMutAct_9fa48("2372") ? error.code === '23505' : stryMutAct_9fa48("2371") ? true : (stryCov_9fa48("2371", "2372"), error.code !== (stryMutAct_9fa48("2373") ? "" : (stryCov_9fa48("2373"), '23505')))))) {
      if (stryMutAct_9fa48("2374")) {
        {}
      } else {
        stryCov_9fa48("2374");
        // Stryker disable next-line StringLiteral: log-only message (no control flow)
        if (stryMutAct_9fa48("2375")) {
          ;
        } else {
          stryCov_9fa48("2375");
          console.error('persistDeferredRecovery insert failed:', error.message);
        }
      }
    }
    if (stryMutAct_9fa48("2379") ? error?.code !== '23505' : stryMutAct_9fa48("2378") ? false : stryMutAct_9fa48("2377") ? true : (stryCov_9fa48("2377", "2378", "2379"), (stryMutAct_9fa48("2380") ? error.code : (stryCov_9fa48("2380"), error?.code)) === (stryMutAct_9fa48("2381") ? "" : (stryCov_9fa48("2381"), '23505')))) {
      if (stryMutAct_9fa48("2382")) {
        {}
      } else {
        stryCov_9fa48("2382");
        await supabase.from(stryMutAct_9fa48("2383") ? "" : (stryCov_9fa48("2383"), 'sms_messages')).update(stryMutAct_9fa48("2384") ? {} : (stryCov_9fa48("2384"), {
          status: stryMutAct_9fa48("2385") ? "" : (stryCov_9fa48("2385"), 'deferred'),
          next_retry_at: opts.nextSendAt,
          body: opts.body
        })).eq(stryMutAct_9fa48("2386") ? "" : (stryCov_9fa48("2386"), 'message_sid'), sid);
      }
    }
  }
}
export async function sendRecoverySMS(leadId: string, business: Business, callerPhone: string): Promise<void> {
  if (stryMutAct_9fa48("2387")) {
    {}
  } else {
    stryCov_9fa48("2387");
    return sendRecoverySMSWithDeps(defaultSmsDeps(), leadId, business, callerPhone);
  }
}
export async function sendRecoverySMSWithDeps(deps: SmsDeps, leadId: string, business: Business, callerPhone: string): Promise<void> {
  if (stryMutAct_9fa48("2388")) {
    {}
  } else {
    stryCov_9fa48("2388");
    const messageBody = buildRecoveryBody(business);
    const outcome = await deps.sendMessage(stryMutAct_9fa48("2389") ? {} : (stryCov_9fa48("2389"), {
      kind: stryMutAct_9fa48("2390") ? "" : (stryCov_9fa48("2390"), 'recovery'),
      leadId,
      businessId: business.id,
      to: callerPhone,
      body: messageBody,
      idempotencyKey: recoveryMessageSid(leadId),
      businessTimezone: business.timezone,
      skipQuietHours: stryMutAct_9fa48("2391") ? true : (stryCov_9fa48("2391"), false)
    }));
    const action = interpretRecoverySendOutcome(outcome, fallbackDeferIso(deps.clock()));
    switch (action.type) {
      case stryMutAct_9fa48("2393") ? "" : (stryCov_9fa48("2393"), 'persist_deferred'):
        if (stryMutAct_9fa48("2392")) {} else {
          stryCov_9fa48("2392");
          await persistDeferredRecoveryWithDeps(deps, stryMutAct_9fa48("2394") ? {} : (stryCov_9fa48("2394"), {
            leadId,
            body: messageBody,
            nextSendAt: action.nextSendAt
          }));
          // Stryker disable next-line StringLiteral: log-only message (no control flow)
          console.log(stryMutAct_9fa48("2396") ? `` : (stryCov_9fa48("2396"), `Recovery SMS deferred for ${redactPhone(callerPhone)} until ${action.nextSendAt}`));
          return;
        }
      case stryMutAct_9fa48("2398") ? "" : (stryCov_9fa48("2398"), 'log_blocked'):
        if (stryMutAct_9fa48("2397")) {} else {
          stryCov_9fa48("2397");
          // Stryker disable next-line StringLiteral: log-only message (no control flow)
          console.log(stryMutAct_9fa48("2400") ? `` : (stryCov_9fa48("2400"), `Recovery SMS blocked for ${redactPhone(callerPhone)}: ${action.reason}`));
          return;
        }
      case stryMutAct_9fa48("2402") ? "" : (stryCov_9fa48("2402"), 'log_needs_review'):
        if (stryMutAct_9fa48("2401")) {} else {
          stryCov_9fa48("2401");
          // Stryker disable next-line StringLiteral: log-only message (no control flow)
          if (stryMutAct_9fa48("2403")) {
            ;
          } else {
            stryCov_9fa48("2403");
            console.error(`ALERT: recovery SMS needs_review sid=${action.sid}`);
          }
          return;
        }
      case stryMutAct_9fa48("2406") ? "" : (stryCov_9fa48("2406"), 'log_ambiguous'):
        if (stryMutAct_9fa48("2405")) {} else {
          stryCov_9fa48("2405");
          // Stryker disable next-line StringLiteral: log-only message (no control flow)
          console.warn(stryMutAct_9fa48("2408") ? `` : (stryCov_9fa48("2408"), `Recovery SMS ambiguous for ${redactPhone(callerPhone)}; parked (${action.reason})`));
          return;
        }
      case stryMutAct_9fa48("2410") ? "" : (stryCov_9fa48("2410"), 'log_sent'):
        if (stryMutAct_9fa48("2409")) {} else {
          stryCov_9fa48("2409");
          // Stryker disable next-line StringLiteral: log-only message (no control flow)
          console.log(stryMutAct_9fa48("2412") ? `` : (stryCov_9fa48("2412"), `Recovery SMS queued to ${redactPhone(callerPhone)} sid=${action.sid}`));
          return;
        }
    }
  }
}

/**
 * Cron: send recoveries whose quiet-hours deferral window has opened.
 */
export async function processDeferredRecoveries(): Promise<{
  sent: number;
  deferred: number;
  errors: number;
}> {
  if (stryMutAct_9fa48("2413")) {
    {}
  } else {
    stryCov_9fa48("2413");
    return processDeferredRecoveriesWithDeps(defaultSmsDeps());
  }
}
export async function processDeferredRecoveriesWithDeps(deps: SmsDeps): Promise<{
  sent: number;
  deferred: number;
  errors: number;
}> {
  if (stryMutAct_9fa48("2414")) {
    {}
  } else {
    stryCov_9fa48("2414");
    const supabase = deps.db();
    const nowIso = deps.clock().toISOString();
    const {
      data: rows,
      error
    } = await supabase.from(stryMutAct_9fa48("2415") ? "" : (stryCov_9fa48("2415"), 'sms_messages')).select(stryMutAct_9fa48("2416") ? "" : (stryCov_9fa48("2416"), 'id, lead_id, message_sid, body, next_retry_at')).eq(stryMutAct_9fa48("2417") ? "" : (stryCov_9fa48("2417"), 'status'), stryMutAct_9fa48("2418") ? "" : (stryCov_9fa48("2418"), 'deferred')).lte(stryMutAct_9fa48("2419") ? "" : (stryCov_9fa48("2419"), 'next_retry_at'), nowIso).limit(50);
    if (stryMutAct_9fa48("2421") ? false : stryMutAct_9fa48("2420") ? true : (stryCov_9fa48("2420", "2421"), error)) {
      if (stryMutAct_9fa48("2422")) {
        {}
      } else {
        stryCov_9fa48("2422");
        // Stryker disable next-line StringLiteral: log-only message (no control flow)
        if (stryMutAct_9fa48("2423")) {
          ;
        } else {
          stryCov_9fa48("2423");
          console.error('processDeferredRecoveries query failed:', error.message);
        }
        return stryMutAct_9fa48("2425") ? {} : (stryCov_9fa48("2425"), {
          sent: 0,
          deferred: 0,
          errors: 1
        });
      }
    }
    let sent = 0;
    let deferred = 0;
    let errors = 0;
    for (const row of stryMutAct_9fa48("2426") ? rows && [] : (stryCov_9fa48("2426"), rows ?? (stryMutAct_9fa48("2427") ? ["Stryker was here"] : (stryCov_9fa48("2427"), [])))) {
      if (stryMutAct_9fa48("2428")) {
        {}
      } else {
        stryCov_9fa48("2428");
        try {
          if (stryMutAct_9fa48("2429")) {
            {}
          } else {
            stryCov_9fa48("2429");
            const {
              data: lead
            } = await supabase.from(stryMutAct_9fa48("2430") ? "" : (stryCov_9fa48("2430"), 'leads')).select(stryMutAct_9fa48("2431") ? "" : (stryCov_9fa48("2431"), '*, businesses(*)')).eq(stryMutAct_9fa48("2432") ? "" : (stryCov_9fa48("2432"), 'id'), row.lead_id).single();
            if (stryMutAct_9fa48("2435") ? false : stryMutAct_9fa48("2434") ? true : stryMutAct_9fa48("2433") ? lead?.businesses : (stryCov_9fa48("2433", "2434", "2435"), !(stryMutAct_9fa48("2436") ? lead.businesses : (stryCov_9fa48("2436"), lead?.businesses)))) {
              if (stryMutAct_9fa48("2437")) {
                {}
              } else {
                stryCov_9fa48("2437");
                stryMutAct_9fa48("2438") ? errors -= 1 : (stryCov_9fa48("2438"), errors += 1);
                continue;
              }
            }
            const business = lead.businesses as unknown as Business;
            const body = stryMutAct_9fa48("2441") ? row.body && buildRecoveryBody(business) : stryMutAct_9fa48("2440") ? false : stryMutAct_9fa48("2439") ? true : (stryCov_9fa48("2439", "2440", "2441"), row.body || buildRecoveryBody(business));
            const outcome = await deps.sendMessage(stryMutAct_9fa48("2442") ? {} : (stryCov_9fa48("2442"), {
              kind: stryMutAct_9fa48("2443") ? "" : (stryCov_9fa48("2443"), 'recovery'),
              leadId: lead.id,
              businessId: business.id,
              to: lead.caller_phone,
              body,
              idempotencyKey: recoveryMessageSid(lead.id),
              businessTimezone: business.timezone,
              skipQuietHours: stryMutAct_9fa48("2444") ? true : (stryCov_9fa48("2444"), false)
            }));
            if (stryMutAct_9fa48("2447") ? outcome.kind === 'blocked' || outcome.reason === 'quiet_hours_deferred' : stryMutAct_9fa48("2446") ? false : stryMutAct_9fa48("2445") ? true : (stryCov_9fa48("2445", "2446", "2447"), (stryMutAct_9fa48("2449") ? outcome.kind !== 'blocked' : stryMutAct_9fa48("2448") ? true : (stryCov_9fa48("2448", "2449"), outcome.kind === (stryMutAct_9fa48("2450") ? "" : (stryCov_9fa48("2450"), 'blocked')))) && (stryMutAct_9fa48("2452") ? outcome.reason !== 'quiet_hours_deferred' : stryMutAct_9fa48("2451") ? true : (stryCov_9fa48("2451", "2452"), outcome.reason === (stryMutAct_9fa48("2453") ? "" : (stryCov_9fa48("2453"), 'quiet_hours_deferred')))))) {
              if (stryMutAct_9fa48("2454")) {
                {}
              } else {
                stryCov_9fa48("2454");
                await persistDeferredRecoveryWithDeps(deps, stryMutAct_9fa48("2455") ? {} : (stryCov_9fa48("2455"), {
                  leadId: lead.id,
                  body,
                  nextSendAt: stryMutAct_9fa48("2456") ? outcome.nextSendAt && fallbackDeferIso(deps.clock()) : (stryCov_9fa48("2456"), outcome.nextSendAt ?? fallbackDeferIso(deps.clock()))
                }));
                stryMutAct_9fa48("2457") ? deferred -= 1 : (stryCov_9fa48("2457"), deferred += 1);
                continue;
              }
            }
            if (stryMutAct_9fa48("2460") ? outcome.kind !== 'sent' : stryMutAct_9fa48("2459") ? false : stryMutAct_9fa48("2458") ? true : (stryCov_9fa48("2458", "2459", "2460"), outcome.kind === (stryMutAct_9fa48("2461") ? "" : (stryCov_9fa48("2461"), 'sent')))) {
              if (stryMutAct_9fa48("2462")) {
                {}
              } else {
                stryCov_9fa48("2462");
                stryMutAct_9fa48("2463") ? sent -= 1 : (stryCov_9fa48("2463"), sent += 1);
                continue;
              }
            }
            if (stryMutAct_9fa48("2466") ? outcome.kind === 'blocked' && outcome.kind === 'skipped' : stryMutAct_9fa48("2465") ? false : stryMutAct_9fa48("2464") ? true : (stryCov_9fa48("2464", "2465", "2466"), (stryMutAct_9fa48("2468") ? outcome.kind !== 'blocked' : stryMutAct_9fa48("2467") ? false : (stryCov_9fa48("2467", "2468"), outcome.kind === (stryMutAct_9fa48("2469") ? "" : (stryCov_9fa48("2469"), 'blocked')))) || (stryMutAct_9fa48("2471") ? outcome.kind !== 'skipped' : stryMutAct_9fa48("2470") ? false : (stryCov_9fa48("2470", "2471"), outcome.kind === (stryMutAct_9fa48("2472") ? "" : (stryCov_9fa48("2472"), 'skipped')))))) {
              if (stryMutAct_9fa48("2473")) {
                {}
              } else {
                stryCov_9fa48("2473");
                await supabase.from(stryMutAct_9fa48("2474") ? "" : (stryCov_9fa48("2474"), 'sms_messages')).update(stryMutAct_9fa48("2475") ? {} : (stryCov_9fa48("2475"), {
                  status: stryMutAct_9fa48("2476") ? "" : (stryCov_9fa48("2476"), 'abandoned_done'),
                  next_retry_at: null
                })).eq(stryMutAct_9fa48("2477") ? "" : (stryCov_9fa48("2477"), 'id'), row.id);
                continue;
              }
            }
            if (stryMutAct_9fa48("2480") ? outcome.kind === 'ambiguous' && outcome.kind === 'needs_review' : stryMutAct_9fa48("2479") ? false : stryMutAct_9fa48("2478") ? true : (stryCov_9fa48("2478", "2479", "2480"), (stryMutAct_9fa48("2482") ? outcome.kind !== 'ambiguous' : stryMutAct_9fa48("2481") ? false : (stryCov_9fa48("2481", "2482"), outcome.kind === (stryMutAct_9fa48("2483") ? "" : (stryCov_9fa48("2483"), 'ambiguous')))) || (stryMutAct_9fa48("2485") ? outcome.kind !== 'needs_review' : stryMutAct_9fa48("2484") ? false : (stryCov_9fa48("2484", "2485"), outcome.kind === (stryMutAct_9fa48("2486") ? "" : (stryCov_9fa48("2486"), 'needs_review')))))) {
              if (stryMutAct_9fa48("2487")) {
                {}
              } else {
                stryCov_9fa48("2487");
                stryMutAct_9fa48("2488") ? deferred -= 1 : (stryCov_9fa48("2488"), deferred += 1);
              }
            }
          }
        } catch (err) {
          if (stryMutAct_9fa48("2489")) {
            {}
          } else {
            stryCov_9fa48("2489");
            // Stryker disable next-line StringLiteral: log-only message (no control flow)
            console.error(stryMutAct_9fa48("2491") ? "" : (stryCov_9fa48("2491"), 'processDeferredRecoveries row failed:'), err instanceof Error ? err.message : stryMutAct_9fa48("2492") ? "" : (stryCov_9fa48("2492"), 'unknown'));
            stryMutAct_9fa48("2493") ? errors -= 1 : (stryCov_9fa48("2493"), errors += 1);
          }
        }
      }
    }
    return stryMutAct_9fa48("2494") ? {} : (stryCov_9fa48("2494"), {
      sent,
      deferred,
      errors
    });
  }
}
export async function sendFollowUpSMS(leadId: string, business: Business, callerPhone: string, customMessage?: string): Promise<void> {
  if (stryMutAct_9fa48("2495")) {
    {}
  } else {
    stryCov_9fa48("2495");
    return sendFollowUpSMSWithDeps(defaultSmsDeps(), leadId, business, callerPhone, customMessage);
  }
}
export async function sendFollowUpSMSWithDeps(deps: SmsDeps, leadId: string, business: Business, callerPhone: string, customMessage?: string): Promise<void> {
  if (stryMutAct_9fa48("2496")) {
    {}
  } else {
    stryCov_9fa48("2496");
    // Restore suppression / opt-out checks (QC r6 P2)
    try {
      if (stryMutAct_9fa48("2497")) {
        {}
      } else {
        stryCov_9fa48("2497");
        if (stryMutAct_9fa48("2499") ? false : stryMutAct_9fa48("2498") ? true : (stryCov_9fa48("2498", "2499"), await deps.isPhoneSuppressed(business.id, callerPhone))) {
          if (stryMutAct_9fa48("2500")) {
            {}
          } else {
            stryCov_9fa48("2500");
            // Stryker disable next-line StringLiteral: log-only message (no control flow)
            console.log(stryMutAct_9fa48("2502") ? `` : (stryCov_9fa48("2502"), `Skipping follow-up; phone suppressed: ${redactPhone(callerPhone)}`));
            return;
          }
        }
      }
    } catch (err) {
      if (stryMutAct_9fa48("2503")) {
        {}
      } else {
        stryCov_9fa48("2503");
        if (stryMutAct_9fa48("2505") ? false : stryMutAct_9fa48("2504") ? true : (stryCov_9fa48("2504", "2505"), err instanceof deps.SuppressionLookupError)) {
          if (stryMutAct_9fa48("2506")) {
            {}
          } else {
            stryCov_9fa48("2506");
            // Stryker disable next-line StringLiteral: log-only message (no control flow)
            console.log(stryMutAct_9fa48("2508") ? `` : (stryCov_9fa48("2508"), `Skipping follow-up; suppression lookup failed closed: ${redactPhone(callerPhone)}`));
            return;
          }
        }
        throw err;
      }
    }
    const supabase = deps.db();
    const {
      data: lead
    } = await supabase.from(stryMutAct_9fa48("2509") ? "" : (stryCov_9fa48("2509"), 'leads')).select(stryMutAct_9fa48("2510") ? "" : (stryCov_9fa48("2510"), 'opted_out')).eq(stryMutAct_9fa48("2511") ? "" : (stryCov_9fa48("2511"), 'id'), leadId).maybeSingle();
    if (stryMutAct_9fa48("2514") ? lead.opted_out : stryMutAct_9fa48("2513") ? false : stryMutAct_9fa48("2512") ? true : (stryCov_9fa48("2512", "2513", "2514"), lead?.opted_out)) {
      if (stryMutAct_9fa48("2515")) {
        {}
      } else {
        stryCov_9fa48("2515");
        // Stryker disable next-line StringLiteral: log-only message (no control flow)
        console.log(stryMutAct_9fa48("2517") ? `` : (stryCov_9fa48("2517"), `Skipping follow-up; lead opted out: ${redactPhone(callerPhone)}`));
        return;
      }
    }
    const messageBody = appendOptOutFooter(stryMutAct_9fa48("2520") ? customMessage && `Hi, this is ${business.name}. Just following up on your recent inquiry. How can we help?` : stryMutAct_9fa48("2519") ? false : stryMutAct_9fa48("2518") ? true : (stryCov_9fa48("2518", "2519", "2520"), customMessage || (stryMutAct_9fa48("2521") ? `` : (stryCov_9fa48("2521"), `Hi, this is ${business.name}. Just following up on your recent inquiry. How can we help?`))));
    const outcome = await deps.sendMessage(stryMutAct_9fa48("2522") ? {} : (stryCov_9fa48("2522"), {
      kind: stryMutAct_9fa48("2523") ? "" : (stryCov_9fa48("2523"), 'manual'),
      leadId,
      businessId: business.id,
      to: callerPhone,
      body: messageBody,
      businessTimezone: business.timezone,
      skipQuietHours: stryMutAct_9fa48("2524") ? false : (stryCov_9fa48("2524"), true)
    }));
    if (stryMutAct_9fa48("2527") ? outcome.kind !== 'sent' : stryMutAct_9fa48("2526") ? false : stryMutAct_9fa48("2525") ? true : (stryCov_9fa48("2525", "2526", "2527"), outcome.kind === (stryMutAct_9fa48("2528") ? "" : (stryCov_9fa48("2528"), 'sent')))) {
      if (stryMutAct_9fa48("2529")) {
        {}
      } else {
        stryCov_9fa48("2529");
        await supabase.from(stryMutAct_9fa48("2530") ? "" : (stryCov_9fa48("2530"), 'sms_messages')).insert(stryMutAct_9fa48("2531") ? {} : (stryCov_9fa48("2531"), {
          lead_id: leadId,
          direction: stryMutAct_9fa48("2532") ? "" : (stryCov_9fa48("2532"), 'outbound'),
          body: messageBody,
          message_sid: outcome.sid,
          status: outcome.providerStatus
        }));
      }
    }
  }
}