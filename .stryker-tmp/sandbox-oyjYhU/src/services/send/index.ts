/**
 * Single outbound SMS module — thin I/O shell over pure decisions + machine.
 *
 * EVERY live send and every relay lookup goes through here.
 * Decisions live in ./decisions and ./machine; this file only does I/O.
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
import { tryNormalizeToE164 } from '@/lib/phone';
import { redactPhone } from '@/lib/pii';
import { classifyRelayLookupResponse, parseMessageSid, markRelayKeySupportConfirmed, resetRelayKeySupportConfirmed, recoveryMessageSid } from '@/services/sms-sid';
import { classifyRecoveryStatus, parkNextAt, transitionSend, MAX_RECONCILE_ATTEMPTS, type RelayLookupSignal, type RelaySendSignal } from './machine';
import { isSendsEnabled } from './policy';
import { decideCustomerFacingGates, decideDuplicateSid, mapRelaySendResult, resolveIdempotencySid } from './decisions';
import { defaultSendDeps, type SendDeps, type SupabaseClient } from './deps';
import type { ReconcileOutcome, SendOutcome, SendRequest } from './types';
export { MAX_RECONCILE_ATTEMPTS, parkDelayMs, parkNextAt, transitionSend, classifyRecoveryStatus, isConfirmedStatus, isFailedStatus, isAmbiguousStatus } from './machine';
export { isSendsEnabled } from './policy';
export type { SendOutcome, SendRequest, ReconcileOutcome, SendKind, RecoveryResolvedOutcome } from './types';
export type { SendDeps } from './deps';
export { defaultSendDeps } from './deps';

/** Test-only: dry-run must not set production key-support trust. */
export function noteDryRunIsTestOnly(): void {
  // Documented for CAMPAIGNS.md / PR disclosure. No runtime effect.
}
export async function sendMessage(req: SendRequest): Promise<SendOutcome> {
  if (stryMutAct_9fa48("1690")) {
    {}
  } else {
    stryCov_9fa48("1690");
    return sendMessageWithDeps(defaultSendDeps(), req);
  }
}

/**
 * THE single send entry point (DI). Normalizes to E.164, gates on SENDS_ENABLED,
 * quiet hours, suppression, and (for campaign step 1) recovery resolution.
 */
export async function sendMessageWithDeps(deps: SendDeps, req: SendRequest): Promise<SendOutcome> {
  if (stryMutAct_9fa48("1691")) {
    {}
  } else {
    stryCov_9fa48("1691");
    if (stryMutAct_9fa48("1694") ? false : stryMutAct_9fa48("1693") ? true : stryMutAct_9fa48("1692") ? deps.sendsEnabled() : (stryCov_9fa48("1692", "1693", "1694"), !deps.sendsEnabled())) {
      if (stryMutAct_9fa48("1695")) {
        {}
      } else {
        stryCov_9fa48("1695");
        return stryMutAct_9fa48("1696") ? {} : (stryCov_9fa48("1696"), {
          kind: stryMutAct_9fa48("1697") ? "" : (stryCov_9fa48("1697"), 'blocked'),
          reason: stryMutAct_9fa48("1698") ? "" : (stryCov_9fa48("1698"), 'sends_disabled')
        });
      }
    }
    const toE164 = tryNormalizeToE164(req.to);
    if (stryMutAct_9fa48("1701") ? false : stryMutAct_9fa48("1700") ? true : stryMutAct_9fa48("1699") ? toE164 : (stryCov_9fa48("1699", "1700", "1701"), !toE164)) {
      if (stryMutAct_9fa48("1702")) {
        {}
      } else {
        stryCov_9fa48("1702");
        return stryMutAct_9fa48("1703") ? {} : (stryCov_9fa48("1703"), {
          kind: stryMutAct_9fa48("1704") ? "" : (stryCov_9fa48("1704"), 'blocked'),
          reason: stryMutAct_9fa48("1705") ? "" : (stryCov_9fa48("1705"), 'invalid_phone'),
          detail: stryMutAct_9fa48("1706") ? `` : (stryCov_9fa48("1706"), `cannot normalize ${redactPhone(req.to)}`)
        });
      }
    }
    const supabase = deps.db();
    if (stryMutAct_9fa48("1709") ? req.kind === 'recovery' && req.kind === 'campaign' : stryMutAct_9fa48("1708") ? false : stryMutAct_9fa48("1707") ? true : (stryCov_9fa48("1707", "1708", "1709"), (stryMutAct_9fa48("1711") ? req.kind !== 'recovery' : stryMutAct_9fa48("1710") ? false : (stryCov_9fa48("1710", "1711"), req.kind === (stryMutAct_9fa48("1712") ? "" : (stryCov_9fa48("1712"), 'recovery')))) || (stryMutAct_9fa48("1714") ? req.kind !== 'campaign' : stryMutAct_9fa48("1713") ? false : (stryCov_9fa48("1713", "1714"), req.kind === (stryMutAct_9fa48("1715") ? "" : (stryCov_9fa48("1715"), 'campaign')))))) {
      if (stryMutAct_9fa48("1716")) {
        {}
      } else {
        stryCov_9fa48("1716");
        let suppressed = stryMutAct_9fa48("1717") ? true : (stryCov_9fa48("1717"), false);
        try {
          if (stryMutAct_9fa48("1718")) {
            {}
          } else {
            stryCov_9fa48("1718");
            suppressed = await deps.isPhoneSuppressed(req.businessId, toE164);
          }
        } catch (err) {
          if (stryMutAct_9fa48("1719")) {
            {}
          } else {
            stryCov_9fa48("1719");
            if (stryMutAct_9fa48("1721") ? false : stryMutAct_9fa48("1720") ? true : (stryCov_9fa48("1720", "1721"), err instanceof deps.SuppressionLookupError)) {
              if (stryMutAct_9fa48("1722")) {
                {}
              } else {
                stryCov_9fa48("1722");
                return stryMutAct_9fa48("1723") ? {} : (stryCov_9fa48("1723"), {
                  kind: stryMutAct_9fa48("1724") ? "" : (stryCov_9fa48("1724"), 'blocked'),
                  reason: stryMutAct_9fa48("1725") ? "" : (stryCov_9fa48("1725"), 'suppressed'),
                  detail: stryMutAct_9fa48("1726") ? "" : (stryCov_9fa48("1726"), 'lookup_failed_closed')
                });
              }
            }
            throw err;
          }
        }
        const {
          data: lead
        } = await supabase.from(stryMutAct_9fa48("1727") ? "" : (stryCov_9fa48("1727"), 'leads')).select(stryMutAct_9fa48("1728") ? "" : (stryCov_9fa48("1728"), 'opted_out, timezone, sms_outbound_sid')).eq(stryMutAct_9fa48("1729") ? "" : (stryCov_9fa48("1729"), 'id'), req.leadId).maybeSingle();
        let recovery: ReturnType<typeof classifyRecoveryStatus> | undefined;
        if (stryMutAct_9fa48("1732") ? req.kind === 'campaign' && req.stepNumber === 1 || !req.skipRecoveryGate : stryMutAct_9fa48("1731") ? false : stryMutAct_9fa48("1730") ? true : (stryCov_9fa48("1730", "1731", "1732"), (stryMutAct_9fa48("1734") ? req.kind === 'campaign' || req.stepNumber === 1 : stryMutAct_9fa48("1733") ? true : (stryCov_9fa48("1733", "1734"), (stryMutAct_9fa48("1736") ? req.kind !== 'campaign' : stryMutAct_9fa48("1735") ? true : (stryCov_9fa48("1735", "1736"), req.kind === (stryMutAct_9fa48("1737") ? "" : (stryCov_9fa48("1737"), 'campaign')))) && (stryMutAct_9fa48("1739") ? req.stepNumber !== 1 : stryMutAct_9fa48("1738") ? true : (stryCov_9fa48("1738", "1739"), req.stepNumber === 1)))) && (stryMutAct_9fa48("1740") ? req.skipRecoveryGate : (stryCov_9fa48("1740"), !req.skipRecoveryGate)))) {
          if (stryMutAct_9fa48("1741")) {
            {}
          } else {
            stryCov_9fa48("1741");
            recovery = await resolveRecoveryOutcomeWithDeps(deps, supabase, req.leadId);
          }
        }
        let quiet = undefined;
        if (stryMutAct_9fa48("1744") ? false : stryMutAct_9fa48("1743") ? true : stryMutAct_9fa48("1742") ? req.skipQuietHours : (stryCov_9fa48("1742", "1743", "1744"), !req.skipQuietHours)) {
          if (stryMutAct_9fa48("1745")) {
            {}
          } else {
            stryCov_9fa48("1745");
            const leadTz = stryMutAct_9fa48("1746") ? (req.leadTimezone ?? (lead as {
              timezone?: string | null;
            } | null)?.timezone) && null : (stryCov_9fa48("1746"), (stryMutAct_9fa48("1747") ? req.leadTimezone && (lead as {
              timezone?: string | null;
            } | null)?.timezone : (stryCov_9fa48("1747"), req.leadTimezone ?? (stryMutAct_9fa48("1748") ? (lead as {
              timezone?: string | null;
            } | null).timezone : (stryCov_9fa48("1748"), (lead as {
              timezone?: string | null;
            } | null)?.timezone)))) ?? null);
            quiet = deps.quietHours(deps.clock(), stryMutAct_9fa48("1749") ? {} : (stryCov_9fa48("1749"), {
              callerPhoneE164: toE164,
              leadTimezone: leadTz,
              businessTimezone: req.businessTimezone
            }));
          }
        }
        const gate = decideCustomerFacingGates(stryMutAct_9fa48("1750") ? {} : (stryCov_9fa48("1750"), {
          kind: req.kind,
          stepNumber: req.stepNumber,
          skipRecoveryGate: req.skipRecoveryGate,
          skipQuietHours: req.skipQuietHours,
          suppressed,
          optedOut: Boolean(stryMutAct_9fa48("1751") ? lead.opted_out : (stryCov_9fa48("1751"), lead?.opted_out)),
          recovery,
          quiet
        }));
        if (stryMutAct_9fa48("1753") ? false : stryMutAct_9fa48("1752") ? true : (stryCov_9fa48("1752", "1753"), gate)) return gate;
      }
    }
    const sid = resolveIdempotencySid(req, deps.clock().getTime());
    if (stryMutAct_9fa48("1756") ? req.kind === 'recovery' && req.kind === 'campaign' : stryMutAct_9fa48("1755") ? false : stryMutAct_9fa48("1754") ? true : (stryCov_9fa48("1754", "1755", "1756"), (stryMutAct_9fa48("1758") ? req.kind !== 'recovery' : stryMutAct_9fa48("1757") ? false : (stryCov_9fa48("1757", "1758"), req.kind === (stryMutAct_9fa48("1759") ? "" : (stryCov_9fa48("1759"), 'recovery')))) || (stryMutAct_9fa48("1761") ? req.kind !== 'campaign' : stryMutAct_9fa48("1760") ? false : (stryCov_9fa48("1760", "1761"), req.kind === (stryMutAct_9fa48("1762") ? "" : (stryCov_9fa48("1762"), 'campaign')))))) {
      if (stryMutAct_9fa48("1763")) {
        {}
      } else {
        stryCov_9fa48("1763");
        const {
          error: insertError
        } = await supabase.from(stryMutAct_9fa48("1764") ? "" : (stryCov_9fa48("1764"), 'sms_messages')).insert(stryMutAct_9fa48("1765") ? {} : (stryCov_9fa48("1765"), {
          lead_id: req.leadId,
          direction: stryMutAct_9fa48("1766") ? "" : (stryCov_9fa48("1766"), 'outbound'),
          body: req.body,
          message_sid: sid,
          status: stryMutAct_9fa48("1767") ? "" : (stryCov_9fa48("1767"), 'sending'),
          key_supported_at_send: stryMutAct_9fa48("1768") ? true : (stryCov_9fa48("1768"), false)
        }));
        if (stryMutAct_9fa48("1771") ? insertError?.code !== '23505' : stryMutAct_9fa48("1770") ? false : stryMutAct_9fa48("1769") ? true : (stryCov_9fa48("1769", "1770", "1771"), (stryMutAct_9fa48("1772") ? insertError.code : (stryCov_9fa48("1772"), insertError?.code)) === (stryMutAct_9fa48("1773") ? "" : (stryCov_9fa48("1773"), '23505')))) {
          if (stryMutAct_9fa48("1774")) {
            {}
          } else {
            stryCov_9fa48("1774");
            const {
              data: existing
            } = await supabase.from(stryMutAct_9fa48("1775") ? "" : (stryCov_9fa48("1775"), 'sms_messages')).select(stryMutAct_9fa48("1776") ? "" : (stryCov_9fa48("1776"), 'status')).eq(stryMutAct_9fa48("1777") ? "" : (stryCov_9fa48("1777"), 'message_sid'), sid).maybeSingle();
            const dup = decideDuplicateSid(stryMutAct_9fa48("1778") ? existing.status : (stryCov_9fa48("1778"), existing?.status));
            if (stryMutAct_9fa48("1781") ? dup.action !== 'confirm_existing' : stryMutAct_9fa48("1780") ? false : stryMutAct_9fa48("1779") ? true : (stryCov_9fa48("1779", "1780", "1781"), dup.action === (stryMutAct_9fa48("1782") ? "" : (stryCov_9fa48("1782"), 'confirm_existing')))) {
              if (stryMutAct_9fa48("1783")) {
                {}
              } else {
                stryCov_9fa48("1783");
                return stryMutAct_9fa48("1784") ? {} : (stryCov_9fa48("1784"), {
                  kind: stryMutAct_9fa48("1785") ? "" : (stryCov_9fa48("1785"), 'sent'),
                  sid,
                  messageId: sid,
                  providerStatus: dup.status,
                  keySupportedAtSend: stryMutAct_9fa48("1786") ? true : (stryCov_9fa48("1786"), false)
                });
              }
            }
            if (stryMutAct_9fa48("1789") ? dup.action !== 'needs_review' : stryMutAct_9fa48("1788") ? false : stryMutAct_9fa48("1787") ? true : (stryCov_9fa48("1787", "1788", "1789"), dup.action === (stryMutAct_9fa48("1790") ? "" : (stryCov_9fa48("1790"), 'needs_review')))) {
              if (stryMutAct_9fa48("1791")) {
                {}
              } else {
                stryCov_9fa48("1791");
                return stryMutAct_9fa48("1792") ? {} : (stryCov_9fa48("1792"), {
                  kind: stryMutAct_9fa48("1793") ? "" : (stryCov_9fa48("1793"), 'needs_review'),
                  sid,
                  reason: dup.reason
                });
              }
            }
            if (stryMutAct_9fa48("1796") ? dup.action !== 'claim_deferred' : stryMutAct_9fa48("1795") ? false : stryMutAct_9fa48("1794") ? true : (stryCov_9fa48("1794", "1795", "1796"), dup.action === (stryMutAct_9fa48("1797") ? "" : (stryCov_9fa48("1797"), 'claim_deferred')))) {
              if (stryMutAct_9fa48("1798")) {
                {}
              } else {
                stryCov_9fa48("1798");
                await supabase.from(stryMutAct_9fa48("1799") ? "" : (stryCov_9fa48("1799"), 'sms_messages')).update(stryMutAct_9fa48("1800") ? {} : (stryCov_9fa48("1800"), {
                  status: stryMutAct_9fa48("1801") ? "" : (stryCov_9fa48("1801"), 'sending'),
                  next_retry_at: null,
                  body: req.body
                })).eq(stryMutAct_9fa48("1802") ? "" : (stryCov_9fa48("1802"), 'message_sid'), sid);
                return dispatchToRelay(deps, supabase, req, sid, toE164);
              }
            }
            return stryMutAct_9fa48("1803") ? {} : (stryCov_9fa48("1803"), {
              kind: stryMutAct_9fa48("1804") ? "" : (stryCov_9fa48("1804"), 'blocked'),
              reason: stryMutAct_9fa48("1805") ? "" : (stryCov_9fa48("1805"), 'duplicate_in_flight'),
              detail: dup.detail
            });
          }
        }
        if (stryMutAct_9fa48("1807") ? false : stryMutAct_9fa48("1806") ? true : (stryCov_9fa48("1806", "1807"), insertError)) {
          if (stryMutAct_9fa48("1808")) {
            {}
          } else {
            stryCov_9fa48("1808");
            throw new Error(stryMutAct_9fa48("1810") ? `` : (stryCov_9fa48("1810"), `sms_messages insert failed: ${insertError.message}`));
          }
        }
      }
    }
    return dispatchToRelay(deps, supabase, req, sid, toE164);
  }
}
async function dispatchToRelay(deps: SendDeps, supabase: SupabaseClient, req: SendRequest, sid: string, toE164: string): Promise<SendOutcome> {
  if (stryMutAct_9fa48("1811")) {
    {}
  } else {
    stryCov_9fa48("1811");
    const adapter = deps.adapter();
    let capsBeforeSend = deps.capsConfirmed();
    if (stryMutAct_9fa48("1814") ? !capsBeforeSend || adapter.checkLookupSupport : stryMutAct_9fa48("1813") ? false : stryMutAct_9fa48("1812") ? true : (stryCov_9fa48("1812", "1813", "1814"), (stryMutAct_9fa48("1815") ? capsBeforeSend : (stryCov_9fa48("1815"), !capsBeforeSend)) && adapter.checkLookupSupport)) {
      if (stryMutAct_9fa48("1816")) {
        {}
      } else {
        stryCov_9fa48("1816");
        capsBeforeSend = await deps.ensureCaps(adapter);
      }
    }
    let signal: RelaySendSignal;
    try {
      if (stryMutAct_9fa48("1817")) {
        {}
      } else {
        stryCov_9fa48("1817");
        const result = await adapter.sendMessage(stryMutAct_9fa48("1818") ? {} : (stryCov_9fa48("1818"), {
          to: toE164,
          body: req.body,
          auto: stryMutAct_9fa48("1819") ? req.auto && true : (stryCov_9fa48("1819"), req.auto ?? (stryMutAct_9fa48("1820") ? false : (stryCov_9fa48("1820"), true))),
          idempotencyKey: sid
        }));
        signal = mapRelaySendResult(result);
      }
    } catch (err) {
      if (stryMutAct_9fa48("1821")) {
        {}
      } else {
        stryCov_9fa48("1821");
        // Stryker disable next-line StringLiteral: log-only message (no control flow)
        console.error(stryMutAct_9fa48("1823") ? `` : (stryCov_9fa48("1823"), `sendMessage relay error sid=${sid}:`), err instanceof Error ? err.message : stryMutAct_9fa48("1824") ? "" : (stryCov_9fa48("1824"), 'unknown'));
        signal = stryMutAct_9fa48("1825") ? {} : (stryCov_9fa48("1825"), {
          type: stryMutAct_9fa48("1826") ? "" : (stryCov_9fa48("1826"), 'error')
        });
      }
    }
    const decision = transitionSend(stryMutAct_9fa48("1827") ? {} : (stryCov_9fa48("1827"), {
      kind: stryMutAct_9fa48("1828") ? "" : (stryCov_9fa48("1828"), 'send_result'),
      signal,
      capsBeforeSend
    }));
    if (stryMutAct_9fa48("1831") ? decision.action !== 'confirm_sent' : stryMutAct_9fa48("1830") ? false : stryMutAct_9fa48("1829") ? true : (stryCov_9fa48("1829", "1830", "1831"), decision.action === (stryMutAct_9fa48("1832") ? "" : (stryCov_9fa48("1832"), 'confirm_sent')))) {
      if (stryMutAct_9fa48("1833")) {
        {}
      } else {
        stryCov_9fa48("1833");
        if (stryMutAct_9fa48("1836") ? req.kind === 'recovery' && req.kind === 'campaign' : stryMutAct_9fa48("1835") ? false : stryMutAct_9fa48("1834") ? true : (stryCov_9fa48("1834", "1835", "1836"), (stryMutAct_9fa48("1838") ? req.kind !== 'recovery' : stryMutAct_9fa48("1837") ? false : (stryCov_9fa48("1837", "1838"), req.kind === (stryMutAct_9fa48("1839") ? "" : (stryCov_9fa48("1839"), 'recovery')))) || (stryMutAct_9fa48("1841") ? req.kind !== 'campaign' : stryMutAct_9fa48("1840") ? false : (stryCov_9fa48("1840", "1841"), req.kind === (stryMutAct_9fa48("1842") ? "" : (stryCov_9fa48("1842"), 'campaign')))))) {
          if (stryMutAct_9fa48("1843")) {
            {}
          } else {
            stryCov_9fa48("1843");
            await supabase.from(stryMutAct_9fa48("1844") ? "" : (stryCov_9fa48("1844"), 'sms_messages')).update(stryMutAct_9fa48("1845") ? {} : (stryCov_9fa48("1845"), {
              status: decision.providerStatus,
              key_supported_at_send: decision.keySupportedAtSend
            })).eq(stryMutAct_9fa48("1846") ? "" : (stryCov_9fa48("1846"), 'message_sid'), sid);
            if (stryMutAct_9fa48("1849") ? req.kind !== 'recovery' : stryMutAct_9fa48("1848") ? false : stryMutAct_9fa48("1847") ? true : (stryCov_9fa48("1847", "1848", "1849"), req.kind === (stryMutAct_9fa48("1850") ? "" : (stryCov_9fa48("1850"), 'recovery')))) {
              if (stryMutAct_9fa48("1851")) {
                {}
              } else {
                stryCov_9fa48("1851");
                await supabase.from(stryMutAct_9fa48("1852") ? "" : (stryCov_9fa48("1852"), 'leads')).update(stryMutAct_9fa48("1853") ? {} : (stryCov_9fa48("1853"), {
                  sms_outbound_sid: sid
                })).eq(stryMutAct_9fa48("1854") ? "" : (stryCov_9fa48("1854"), 'id'), req.leadId);
              }
            }
          }
        }
        return stryMutAct_9fa48("1855") ? {} : (stryCov_9fa48("1855"), {
          kind: stryMutAct_9fa48("1856") ? "" : (stryCov_9fa48("1856"), 'sent'),
          sid,
          messageId: (stryMutAct_9fa48("1859") ? signal.type !== 'ok' : stryMutAct_9fa48("1858") ? false : stryMutAct_9fa48("1857") ? true : (stryCov_9fa48("1857", "1858", "1859"), signal.type === (stryMutAct_9fa48("1860") ? "" : (stryCov_9fa48("1860"), 'ok')))) ? signal.messageId : sid,
          providerStatus: decision.providerStatus,
          keySupportedAtSend: decision.keySupportedAtSend
        });
      }
    }
    if (stryMutAct_9fa48("1863") ? decision.action !== 'needs_review' : stryMutAct_9fa48("1862") ? false : stryMutAct_9fa48("1861") ? true : (stryCov_9fa48("1861", "1862", "1863"), decision.action === (stryMutAct_9fa48("1864") ? "" : (stryCov_9fa48("1864"), 'needs_review')))) {
      if (stryMutAct_9fa48("1865")) {
        {}
      } else {
        stryCov_9fa48("1865");
        if (stryMutAct_9fa48("1868") ? req.kind === 'recovery' && req.kind === 'campaign' : stryMutAct_9fa48("1867") ? false : stryMutAct_9fa48("1866") ? true : (stryCov_9fa48("1866", "1867", "1868"), (stryMutAct_9fa48("1870") ? req.kind !== 'recovery' : stryMutAct_9fa48("1869") ? false : (stryCov_9fa48("1869", "1870"), req.kind === (stryMutAct_9fa48("1871") ? "" : (stryCov_9fa48("1871"), 'recovery')))) || (stryMutAct_9fa48("1873") ? req.kind !== 'campaign' : stryMutAct_9fa48("1872") ? false : (stryCov_9fa48("1872", "1873"), req.kind === (stryMutAct_9fa48("1874") ? "" : (stryCov_9fa48("1874"), 'campaign')))))) {
          if (stryMutAct_9fa48("1875")) {
            {}
          } else {
            stryCov_9fa48("1875");
            await supabase.from(stryMutAct_9fa48("1876") ? "" : (stryCov_9fa48("1876"), 'sms_messages')).update(stryMutAct_9fa48("1877") ? {} : (stryCov_9fa48("1877"), {
              status: stryMutAct_9fa48("1878") ? "" : (stryCov_9fa48("1878"), 'needs_review')
            })).eq(stryMutAct_9fa48("1879") ? "" : (stryCov_9fa48("1879"), 'message_sid'), sid);
          }
        }
        return stryMutAct_9fa48("1880") ? {} : (stryCov_9fa48("1880"), {
          kind: stryMutAct_9fa48("1881") ? "" : (stryCov_9fa48("1881"), 'needs_review'),
          sid,
          reason: decision.reason
        });
      }
    }
    if (stryMutAct_9fa48("1884") ? decision.action === 'park_ambiguous' : stryMutAct_9fa48("1883") ? false : stryMutAct_9fa48("1882") ? true : (stryCov_9fa48("1882", "1883", "1884"), decision.action !== (stryMutAct_9fa48("1885") ? "" : (stryCov_9fa48("1885"), 'park_ambiguous')))) {
      if (stryMutAct_9fa48("1886")) {
        {}
      } else {
        stryCov_9fa48("1886");
        return stryMutAct_9fa48("1887") ? {} : (stryCov_9fa48("1887"), {
          kind: stryMutAct_9fa48("1888") ? "" : (stryCov_9fa48("1888"), 'needs_review'),
          sid,
          reason: stryMutAct_9fa48("1889") ? "" : (stryCov_9fa48("1889"), 'unexpected_decision')
        });
      }
    }
    const nextRetryAt = parkNextAt(decision.nextAttempts, deps.clock()).toISOString();
    if (stryMutAct_9fa48("1892") ? req.kind === 'recovery' && req.kind === 'campaign' : stryMutAct_9fa48("1891") ? false : stryMutAct_9fa48("1890") ? true : (stryCov_9fa48("1890", "1891", "1892"), (stryMutAct_9fa48("1894") ? req.kind !== 'recovery' : stryMutAct_9fa48("1893") ? false : (stryCov_9fa48("1893", "1894"), req.kind === (stryMutAct_9fa48("1895") ? "" : (stryCov_9fa48("1895"), 'recovery')))) || (stryMutAct_9fa48("1897") ? req.kind !== 'campaign' : stryMutAct_9fa48("1896") ? false : (stryCov_9fa48("1896", "1897"), req.kind === (stryMutAct_9fa48("1898") ? "" : (stryCov_9fa48("1898"), 'campaign')))))) {
      if (stryMutAct_9fa48("1899")) {
        {}
      } else {
        stryCov_9fa48("1899");
        await supabase.from(stryMutAct_9fa48("1900") ? "" : (stryCov_9fa48("1900"), 'sms_messages')).update(stryMutAct_9fa48("1901") ? {} : (stryCov_9fa48("1901"), {
          status: stryMutAct_9fa48("1902") ? "" : (stryCov_9fa48("1902"), 'unknown'),
          reconcile_attempts: decision.nextAttempts,
          next_retry_at: nextRetryAt
        })).eq(stryMutAct_9fa48("1903") ? "" : (stryCov_9fa48("1903"), 'message_sid'), sid);
      }
    }
    return stryMutAct_9fa48("1904") ? {} : (stryCov_9fa48("1904"), {
      kind: stryMutAct_9fa48("1905") ? "" : (stryCov_9fa48("1905"), 'ambiguous'),
      sid,
      reason: decision.reason,
      nextRetryAt
    });
  }
}
export async function resolveRecoveryOutcome(supabase: SupabaseClient, leadId: string): Promise<ReturnType<typeof classifyRecoveryStatus>> {
  if (stryMutAct_9fa48("1906")) {
    {}
  } else {
    stryCov_9fa48("1906");
    return resolveRecoveryOutcomeWithDeps(defaultSendDeps(), supabase, leadId);
  }
}
export async function resolveRecoveryOutcomeWithDeps(deps: SendDeps, supabase: SupabaseClient, leadId: string): Promise<ReturnType<typeof classifyRecoveryStatus>> {
  if (stryMutAct_9fa48("1907")) {
    {}
  } else {
    stryCov_9fa48("1907");
    void deps;
    const sid = recoveryMessageSid(leadId);
    const {
      data
    } = await supabase.from(stryMutAct_9fa48("1908") ? "" : (stryCov_9fa48("1908"), 'sms_messages')).select(stryMutAct_9fa48("1909") ? "" : (stryCov_9fa48("1909"), 'status')).eq(stryMutAct_9fa48("1910") ? "" : (stryCov_9fa48("1910"), 'message_sid'), sid).maybeSingle();
    if (stryMutAct_9fa48("1913") ? data.status : stryMutAct_9fa48("1912") ? false : stryMutAct_9fa48("1911") ? true : (stryCov_9fa48("1911", "1912", "1913"), data?.status)) return classifyRecoveryStatus(data.status);
    const {
      data: lead
    } = await supabase.from(stryMutAct_9fa48("1914") ? "" : (stryCov_9fa48("1914"), 'leads')).select(stryMutAct_9fa48("1915") ? "" : (stryCov_9fa48("1915"), 'sms_outbound_sid')).eq(stryMutAct_9fa48("1916") ? "" : (stryCov_9fa48("1916"), 'id'), leadId).maybeSingle();
    if (stryMutAct_9fa48("1919") ? false : stryMutAct_9fa48("1918") ? true : stryMutAct_9fa48("1917") ? lead?.sms_outbound_sid : (stryCov_9fa48("1917", "1918", "1919"), !(stryMutAct_9fa48("1920") ? lead.sms_outbound_sid : (stryCov_9fa48("1920"), lead?.sms_outbound_sid)))) return stryMutAct_9fa48("1921") ? "" : (stryCov_9fa48("1921"), 'absent');
    const {
      data: byLead
    } = await supabase.from(stryMutAct_9fa48("1922") ? "" : (stryCov_9fa48("1922"), 'sms_messages')).select(stryMutAct_9fa48("1923") ? "" : (stryCov_9fa48("1923"), 'status')).eq(stryMutAct_9fa48("1924") ? "" : (stryCov_9fa48("1924"), 'message_sid'), lead.sms_outbound_sid).maybeSingle();
    return classifyRecoveryStatus(stryMutAct_9fa48("1925") ? byLead.status : (stryCov_9fa48("1925"), byLead?.status));
  }
}
export async function reconcileOne(row: {
  id: string;
  lead_id: string;
  message_sid: string;
  status: string;
  reconcile_attempts?: number | null;
  key_supported_at_send?: boolean | null;
  next_retry_at?: string | null;
}): Promise<ReconcileOutcome> {
  if (stryMutAct_9fa48("1926")) {
    {}
  } else {
    stryCov_9fa48("1926");
    return reconcileOneWithDeps(defaultSendDeps(), row);
  }
}
export async function reconcileOneWithDeps(deps: SendDeps, row: {
  id: string;
  lead_id: string;
  message_sid: string;
  status: string;
  reconcile_attempts?: number | null;
  key_supported_at_send?: boolean | null;
  next_retry_at?: string | null;
}): Promise<ReconcileOutcome> {
  if (stryMutAct_9fa48("1927")) {
    {}
  } else {
    stryCov_9fa48("1927");
    if (stryMutAct_9fa48("1930") ? false : stryMutAct_9fa48("1929") ? true : stryMutAct_9fa48("1928") ? deps.sendsEnabled() : (stryCov_9fa48("1928", "1929", "1930"), !deps.sendsEnabled())) {
      if (stryMutAct_9fa48("1931")) {
        {}
      } else {
        stryCov_9fa48("1931");
        return stryMutAct_9fa48("1932") ? {} : (stryCov_9fa48("1932"), {
          kind: stryMutAct_9fa48("1933") ? "" : (stryCov_9fa48("1933"), 'blocked'),
          reason: stryMutAct_9fa48("1934") ? "" : (stryCov_9fa48("1934"), 'sends_disabled')
        });
      }
    }
    const adapter = deps.adapter();
    if (stryMutAct_9fa48("1937") ? false : stryMutAct_9fa48("1936") ? true : stryMutAct_9fa48("1935") ? adapter.lookupByIdempotencyKey : (stryCov_9fa48("1935", "1936", "1937"), !adapter.lookupByIdempotencyKey)) {
      if (stryMutAct_9fa48("1938")) {
        {}
      } else {
        stryCov_9fa48("1938");
        return stryMutAct_9fa48("1939") ? {} : (stryCov_9fa48("1939"), {
          kind: stryMutAct_9fa48("1940") ? "" : (stryCov_9fa48("1940"), 'needs_review'),
          sid: row.message_sid,
          reason: stryMutAct_9fa48("1941") ? "" : (stryCov_9fa48("1941"), 'lookup_unsupported')
        });
      }
    }
    const supabase = deps.db();
    let signal: RelayLookupSignal;
    try {
      if (stryMutAct_9fa48("1942")) {
        {}
      } else {
        stryCov_9fa48("1942");
        const lookup = await adapter.lookupByIdempotencyKey(row.message_sid);
        const outcome = stryMutAct_9fa48("1943") ? lookup.outcome && classifyRelayLookupResponse({
          httpStatus: 200,
          body: lookup
        }) : (stryCov_9fa48("1943"), lookup.outcome ?? classifyRelayLookupResponse(stryMutAct_9fa48("1944") ? {} : (stryCov_9fa48("1944"), {
          httpStatus: 200,
          body: lookup
        })));
        if (stryMutAct_9fa48("1947") ? outcome !== 'sent' : stryMutAct_9fa48("1946") ? false : stryMutAct_9fa48("1945") ? true : (stryCov_9fa48("1945", "1946", "1947"), outcome === (stryMutAct_9fa48("1948") ? "" : (stryCov_9fa48("1948"), 'sent')))) {
          if (stryMutAct_9fa48("1949")) {
            {}
          } else {
            stryCov_9fa48("1949");
            signal = stryMutAct_9fa48("1950") ? {} : (stryCov_9fa48("1950"), {
              type: stryMutAct_9fa48("1951") ? "" : (stryCov_9fa48("1951"), 'sent'),
              status: (stryMutAct_9fa48("1952") ? "" : (stryCov_9fa48("1952"), 'status')) in lookup ? lookup.status : stryMutAct_9fa48("1953") ? "" : (stryCov_9fa48("1953"), 'queued')
            });
          }
        } else if (stryMutAct_9fa48("1956") ? outcome !== 'failed' : stryMutAct_9fa48("1955") ? false : stryMutAct_9fa48("1954") ? true : (stryCov_9fa48("1954", "1955", "1956"), outcome === (stryMutAct_9fa48("1957") ? "" : (stryCov_9fa48("1957"), 'failed')))) {
          if (stryMutAct_9fa48("1958")) {
            {}
          } else {
            stryCov_9fa48("1958");
            signal = stryMutAct_9fa48("1959") ? {} : (stryCov_9fa48("1959"), {
              type: stryMutAct_9fa48("1960") ? "" : (stryCov_9fa48("1960"), 'failed'),
              status: (stryMutAct_9fa48("1961") ? "" : (stryCov_9fa48("1961"), 'status')) in lookup ? String(lookup.status) : stryMutAct_9fa48("1962") ? "" : (stryCov_9fa48("1962"), 'failed')
            });
          }
        } else if (stryMutAct_9fa48("1965") ? outcome !== 'never_sent' : stryMutAct_9fa48("1964") ? false : stryMutAct_9fa48("1963") ? true : (stryCov_9fa48("1963", "1964", "1965"), outcome === (stryMutAct_9fa48("1966") ? "" : (stryCov_9fa48("1966"), 'never_sent')))) {
          if (stryMutAct_9fa48("1967")) {
            {}
          } else {
            stryCov_9fa48("1967");
            signal = stryMutAct_9fa48("1968") ? {} : (stryCov_9fa48("1968"), {
              type: stryMutAct_9fa48("1969") ? "" : (stryCov_9fa48("1969"), 'never_sent')
            });
          }
        } else {
          if (stryMutAct_9fa48("1970")) {
            {}
          } else {
            stryCov_9fa48("1970");
            signal = stryMutAct_9fa48("1971") ? {} : (stryCov_9fa48("1971"), {
              type: stryMutAct_9fa48("1972") ? "" : (stryCov_9fa48("1972"), 'unknown')
            });
          }
        }
      }
    } catch {
      if (stryMutAct_9fa48("1973")) {
        {}
      } else {
        stryCov_9fa48("1973");
        signal = stryMutAct_9fa48("1974") ? {} : (stryCov_9fa48("1974"), {
          type: stryMutAct_9fa48("1975") ? "" : (stryCov_9fa48("1975"), 'unknown')
        });
      }
    }
    const attempts = stryMutAct_9fa48("1976") ? row.reconcile_attempts && 0 : (stryCov_9fa48("1976"), row.reconcile_attempts ?? 0);
    const decision = transitionSend(stryMutAct_9fa48("1977") ? {} : (stryCov_9fa48("1977"), {
      kind: stryMutAct_9fa48("1978") ? "" : (stryCov_9fa48("1978"), 'lookup'),
      signal,
      keySupportedAtSend: Boolean(row.key_supported_at_send),
      attempts
    }));
    if (stryMutAct_9fa48("1981") ? decision.action !== 'resolved' : stryMutAct_9fa48("1980") ? false : stryMutAct_9fa48("1979") ? true : (stryCov_9fa48("1979", "1980", "1981"), decision.action === (stryMutAct_9fa48("1982") ? "" : (stryCov_9fa48("1982"), 'resolved')))) {
      if (stryMutAct_9fa48("1983")) {
        {}
      } else {
        stryCov_9fa48("1983");
        await supabase.from(stryMutAct_9fa48("1984") ? "" : (stryCov_9fa48("1984"), 'sms_messages')).update(stryMutAct_9fa48("1985") ? {} : (stryCov_9fa48("1985"), {
          status: decision.providerStatus
        })).eq(stryMutAct_9fa48("1986") ? "" : (stryCov_9fa48("1986"), 'id'), row.id);
        return stryMutAct_9fa48("1987") ? {} : (stryCov_9fa48("1987"), {
          kind: stryMutAct_9fa48("1988") ? "" : (stryCov_9fa48("1988"), 'resolved'),
          sid: row.message_sid,
          providerStatus: decision.providerStatus
        });
      }
    }
    if (stryMutAct_9fa48("1991") ? decision.action !== 'requeue_never_sent' : stryMutAct_9fa48("1990") ? false : stryMutAct_9fa48("1989") ? true : (stryCov_9fa48("1989", "1990", "1991"), decision.action === (stryMutAct_9fa48("1992") ? "" : (stryCov_9fa48("1992"), 'requeue_never_sent')))) {
      if (stryMutAct_9fa48("1993")) {
        {}
      } else {
        stryCov_9fa48("1993");
        const abandoned = stryMutAct_9fa48("1994") ? `` : (stryCov_9fa48("1994"), `${row.message_sid}:abandoned:${deps.clock().getTime()}`);
        await supabase.from(stryMutAct_9fa48("1995") ? "" : (stryCov_9fa48("1995"), 'sms_messages')).update(stryMutAct_9fa48("1996") ? {} : (stryCov_9fa48("1996"), {
          status: stryMutAct_9fa48("1997") ? "" : (stryCov_9fa48("1997"), 'abandoned_retry'),
          message_sid: abandoned
        })).eq(stryMutAct_9fa48("1998") ? "" : (stryCov_9fa48("1998"), 'id'), row.id);
        return stryMutAct_9fa48("1999") ? {} : (stryCov_9fa48("1999"), {
          kind: stryMutAct_9fa48("2000") ? "" : (stryCov_9fa48("2000"), 'never_sent'),
          sid: row.message_sid,
          requeued: stryMutAct_9fa48("2001") ? false : (stryCov_9fa48("2001"), true)
        });
      }
    }
    if (stryMutAct_9fa48("2004") ? decision.action !== 'needs_review' : stryMutAct_9fa48("2003") ? false : stryMutAct_9fa48("2002") ? true : (stryCov_9fa48("2002", "2003", "2004"), decision.action === (stryMutAct_9fa48("2005") ? "" : (stryCov_9fa48("2005"), 'needs_review')))) {
      if (stryMutAct_9fa48("2006")) {
        {}
      } else {
        stryCov_9fa48("2006");
        await supabase.from(stryMutAct_9fa48("2007") ? "" : (stryCov_9fa48("2007"), 'sms_messages')).update(stryMutAct_9fa48("2008") ? {} : (stryCov_9fa48("2008"), {
          status: stryMutAct_9fa48("2009") ? "" : (stryCov_9fa48("2009"), 'needs_review'),
          next_retry_at: null
        })).eq(stryMutAct_9fa48("2010") ? "" : (stryCov_9fa48("2010"), 'id'), row.id);
        return stryMutAct_9fa48("2011") ? {} : (stryCov_9fa48("2011"), {
          kind: stryMutAct_9fa48("2012") ? "" : (stryCov_9fa48("2012"), 'needs_review'),
          sid: row.message_sid,
          reason: decision.reason
        });
      }
    }
    if (stryMutAct_9fa48("2015") ? decision.action === 'park_ambiguous' : stryMutAct_9fa48("2014") ? false : stryMutAct_9fa48("2013") ? true : (stryCov_9fa48("2013", "2014", "2015"), decision.action !== (stryMutAct_9fa48("2016") ? "" : (stryCov_9fa48("2016"), 'park_ambiguous')))) {
      if (stryMutAct_9fa48("2017")) {
        {}
      } else {
        stryCov_9fa48("2017");
        return stryMutAct_9fa48("2018") ? {} : (stryCov_9fa48("2018"), {
          kind: stryMutAct_9fa48("2019") ? "" : (stryCov_9fa48("2019"), 'needs_review'),
          sid: row.message_sid,
          reason: stryMutAct_9fa48("2020") ? "" : (stryCov_9fa48("2020"), 'unexpected_decision')
        });
      }
    }
    const nextAttempts = decision.nextAttempts;
    const nextRetryAt = parkNextAt(nextAttempts, deps.clock()).toISOString();
    await supabase.from(stryMutAct_9fa48("2021") ? "" : (stryCov_9fa48("2021"), 'sms_messages')).update(stryMutAct_9fa48("2022") ? {} : (stryCov_9fa48("2022"), {
      status: stryMutAct_9fa48("2023") ? "" : (stryCov_9fa48("2023"), 'unknown'),
      reconcile_attempts: nextAttempts,
      next_retry_at: nextRetryAt
    })).eq(stryMutAct_9fa48("2024") ? "" : (stryCov_9fa48("2024"), 'id'), row.id);
    return stryMutAct_9fa48("2025") ? {} : (stryCov_9fa48("2025"), {
      kind: stryMutAct_9fa48("2026") ? "" : (stryCov_9fa48("2026"), 'ambiguous'),
      sid: row.message_sid,
      attempts: nextAttempts,
      nextRetryAt
    });
  }
}
export async function reconcileAmbiguousSms(): Promise<{
  unknownCount: number;
  stuckSendingCount: number;
  requeued: number;
  confirmed: number;
  parked: number;
  needsReview: number;
  alert: boolean;
}> {
  if (stryMutAct_9fa48("2027")) {
    {}
  } else {
    stryCov_9fa48("2027");
    return reconcileAmbiguousSmsWithDeps(defaultSendDeps());
  }
}
export async function reconcileAmbiguousSmsWithDeps(deps: SendDeps): Promise<{
  unknownCount: number;
  stuckSendingCount: number;
  requeued: number;
  confirmed: number;
  parked: number;
  needsReview: number;
  alert: boolean;
}> {
  if (stryMutAct_9fa48("2028")) {
    {}
  } else {
    stryCov_9fa48("2028");
    const {
      UNKNOWN_SMS_ALERT_THRESHOLD,
      STUCK_SENDING_MS
    } = await import('@/services/campaign-logic');
    const supabase = deps.db();
    const adapter = deps.adapter();
    if (stryMutAct_9fa48("2030") ? false : stryMutAct_9fa48("2029") ? true : (stryCov_9fa48("2029", "2030"), adapter.checkLookupSupport)) {
      if (stryMutAct_9fa48("2031")) {
        {}
      } else {
        stryCov_9fa48("2031");
        await deps.warnLookupUnsupported(adapter);
      }
    }
    const now = deps.clock();
    const cutoff = new Date(stryMutAct_9fa48("2032") ? now.getTime() + STUCK_SENDING_MS : (stryCov_9fa48("2032"), now.getTime() - STUCK_SENDING_MS)).toISOString();
    const nowIso = now.toISOString();
    const {
      data: rows
    } = await supabase.from(stryMutAct_9fa48("2033") ? "" : (stryCov_9fa48("2033"), 'sms_messages')).select(stryMutAct_9fa48("2034") ? "" : (stryCov_9fa48("2034"), 'id, lead_id, message_sid, status, sent_at, reconcile_attempts, key_supported_at_send, next_retry_at')).in(stryMutAct_9fa48("2035") ? "" : (stryCov_9fa48("2035"), 'status'), stryMutAct_9fa48("2036") ? [] : (stryCov_9fa48("2036"), [stryMutAct_9fa48("2037") ? "" : (stryCov_9fa48("2037"), 'unknown'), stryMutAct_9fa48("2038") ? "" : (stryCov_9fa48("2038"), 'sending')])).or((stryMutAct_9fa48("2039") ? `` : (stryCov_9fa48("2039"), `and(status.eq.unknown,next_retry_at.is.null),`)) + (stryMutAct_9fa48("2040") ? `` : (stryCov_9fa48("2040"), `and(status.eq.unknown,next_retry_at.lte.${nowIso}),`)) + (stryMutAct_9fa48("2041") ? `` : (stryCov_9fa48("2041"), `and(status.eq.sending,sent_at.lt.${cutoff})`))).order(stryMutAct_9fa48("2042") ? "" : (stryCov_9fa48("2042"), 'sent_at'), stryMutAct_9fa48("2043") ? {} : (stryCov_9fa48("2043"), {
      ascending: stryMutAct_9fa48("2044") ? false : (stryCov_9fa48("2044"), true)
    })).limit(50);
    let requeued = 0;
    let confirmed = 0;
    let parked = 0;
    let needsReview = 0;
    let unknownCount = 0;
    let stuckSendingCount = 0;
    for (const row of stryMutAct_9fa48("2045") ? rows && [] : (stryCov_9fa48("2045"), rows ?? (stryMutAct_9fa48("2046") ? ["Stryker was here"] : (stryCov_9fa48("2046"), [])))) {
      if (stryMutAct_9fa48("2047")) {
        {}
      } else {
        stryCov_9fa48("2047");
        if (stryMutAct_9fa48("2050") ? row.status !== 'unknown' : stryMutAct_9fa48("2049") ? false : stryMutAct_9fa48("2048") ? true : (stryCov_9fa48("2048", "2049", "2050"), row.status === (stryMutAct_9fa48("2051") ? "" : (stryCov_9fa48("2051"), 'unknown')))) stryMutAct_9fa48("2052") ? unknownCount -= 1 : (stryCov_9fa48("2052"), unknownCount += 1);
        if (stryMutAct_9fa48("2055") ? row.status !== 'sending' : stryMutAct_9fa48("2054") ? false : stryMutAct_9fa48("2053") ? true : (stryCov_9fa48("2053", "2054", "2055"), row.status === (stryMutAct_9fa48("2056") ? "" : (stryCov_9fa48("2056"), 'sending')))) stryMutAct_9fa48("2057") ? stuckSendingCount -= 1 : (stryCov_9fa48("2057"), stuckSendingCount += 1);
        const result = await reconcileOneWithDeps(deps, row);
        if (stryMutAct_9fa48("2060") ? result.kind !== 'resolved' : stryMutAct_9fa48("2059") ? false : stryMutAct_9fa48("2058") ? true : (stryCov_9fa48("2058", "2059", "2060"), result.kind === (stryMutAct_9fa48("2061") ? "" : (stryCov_9fa48("2061"), 'resolved')))) {
          if (stryMutAct_9fa48("2062")) {
            {}
          } else {
            stryCov_9fa48("2062");
            stryMutAct_9fa48("2063") ? confirmed -= 1 : (stryCov_9fa48("2063"), confirmed += 1);
            await onReconcileResolved(supabase, row.message_sid);
          }
        } else if (stryMutAct_9fa48("2066") ? result.kind !== 'never_sent' : stryMutAct_9fa48("2065") ? false : stryMutAct_9fa48("2064") ? true : (stryCov_9fa48("2064", "2065", "2066"), result.kind === (stryMutAct_9fa48("2067") ? "" : (stryCov_9fa48("2067"), 'never_sent')))) {
          if (stryMutAct_9fa48("2068")) {
            {}
          } else {
            stryCov_9fa48("2068");
            stryMutAct_9fa48("2069") ? requeued -= 1 : (stryCov_9fa48("2069"), requeued += 1);
            await onReconcileNeverSent(supabase, row.message_sid, row.lead_id);
          }
        } else if (stryMutAct_9fa48("2072") ? result.kind !== 'needs_review' : stryMutAct_9fa48("2071") ? false : stryMutAct_9fa48("2070") ? true : (stryCov_9fa48("2070", "2071", "2072"), result.kind === (stryMutAct_9fa48("2073") ? "" : (stryCov_9fa48("2073"), 'needs_review')))) {
          if (stryMutAct_9fa48("2074")) {
            {}
          } else {
            stryCov_9fa48("2074");
            stryMutAct_9fa48("2075") ? needsReview -= 1 : (stryCov_9fa48("2075"), needsReview += 1);
          }
        } else if (stryMutAct_9fa48("2078") ? result.kind !== 'ambiguous' : stryMutAct_9fa48("2077") ? false : stryMutAct_9fa48("2076") ? true : (stryCov_9fa48("2076", "2077", "2078"), result.kind === (stryMutAct_9fa48("2079") ? "" : (stryCov_9fa48("2079"), 'ambiguous')))) {
          if (stryMutAct_9fa48("2080")) {
            {}
          } else {
            stryCov_9fa48("2080");
            stryMutAct_9fa48("2081") ? parked -= 1 : (stryCov_9fa48("2081"), parked += 1);
          }
        }
      }
    }
    const alert = stryMutAct_9fa48("2084") ? unknownCount + stuckSendingCount >= UNKNOWN_SMS_ALERT_THRESHOLD && needsReview > 0 : stryMutAct_9fa48("2083") ? false : stryMutAct_9fa48("2082") ? true : (stryCov_9fa48("2082", "2083", "2084"), (stryMutAct_9fa48("2087") ? unknownCount + stuckSendingCount < UNKNOWN_SMS_ALERT_THRESHOLD : stryMutAct_9fa48("2086") ? unknownCount + stuckSendingCount > UNKNOWN_SMS_ALERT_THRESHOLD : stryMutAct_9fa48("2085") ? false : (stryCov_9fa48("2085", "2086", "2087"), (stryMutAct_9fa48("2088") ? unknownCount - stuckSendingCount : (stryCov_9fa48("2088"), unknownCount + stuckSendingCount)) >= UNKNOWN_SMS_ALERT_THRESHOLD)) || (stryMutAct_9fa48("2091") ? needsReview <= 0 : stryMutAct_9fa48("2090") ? needsReview >= 0 : stryMutAct_9fa48("2089") ? false : (stryCov_9fa48("2089", "2090", "2091"), needsReview > 0)));
    return stryMutAct_9fa48("2092") ? {} : (stryCov_9fa48("2092"), {
      unknownCount,
      stuckSendingCount,
      requeued,
      confirmed,
      parked,
      needsReview,
      alert
    });
  }
}
async function onReconcileResolved(supabase: SupabaseClient, sid: string) {
  if (stryMutAct_9fa48("2093")) {
    {}
  } else {
    stryCov_9fa48("2093");
    const parsed = parseMessageSid(sid);
    if (stryMutAct_9fa48("2096") ? parsed.kind === 'campaign' : stryMutAct_9fa48("2095") ? false : stryMutAct_9fa48("2094") ? true : (stryCov_9fa48("2094", "2095", "2096"), parsed.kind !== (stryMutAct_9fa48("2097") ? "" : (stryCov_9fa48("2097"), 'campaign')))) return;
    void supabase;
    void parsed;
  }
}
async function onReconcileNeverSent(supabase: SupabaseClient, sid: string, leadId: string) {
  if (stryMutAct_9fa48("2098")) {
    {}
  } else {
    stryCov_9fa48("2098");
    const parsed = parseMessageSid(sid);
    if (stryMutAct_9fa48("2101") ? parsed.kind !== 'recovery' : stryMutAct_9fa48("2100") ? false : stryMutAct_9fa48("2099") ? true : (stryCov_9fa48("2099", "2100", "2101"), parsed.kind === (stryMutAct_9fa48("2102") ? "" : (stryCov_9fa48("2102"), 'recovery')))) {
      if (stryMutAct_9fa48("2103")) {
        {}
      } else {
        stryCov_9fa48("2103");
        await supabase.from(stryMutAct_9fa48("2104") ? "" : (stryCov_9fa48("2104"), 'leads')).update(stryMutAct_9fa48("2105") ? {} : (stryCov_9fa48("2105"), {
          sms_outbound_sid: null
        })).eq(stryMutAct_9fa48("2106") ? "" : (stryCov_9fa48("2106"), 'id'), leadId);
      }
    }
  }
}

/** Test helper re-exports */
export { markRelayKeySupportConfirmed, resetRelayKeySupportConfirmed };