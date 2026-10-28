/**
 * Pure send/reconcile state machine decisions (no I/O).
 *
 * Advance on duplicate sid ONLY if that row is confirmed sent (not failed).
 * Requeue ONLY on explicit never_sent AND key_supported_at_send.
 * Older/pre-key rows → needs_review, never requeue.
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
import { isConfirmedSmsStatus, isFailedSmsStatus, parseMessageSid, type ParsedSid, type RelayLookupOutcome } from '@/services/sms-sid';
export type DuplicateSidDecision = {
  action: 'advance';
} | {
  action: 'park';
} | {
  action: 'needs_review';
};
export function decideOnDuplicateSid(existingStatus: string | null | undefined): DuplicateSidDecision {
  if (stryMutAct_9fa48("1248")) {
    {}
  } else {
    stryCov_9fa48("1248");
    if (stryMutAct_9fa48("1250") ? false : stryMutAct_9fa48("1249") ? true : (stryCov_9fa48("1249", "1250"), isFailedSmsStatus(existingStatus))) return stryMutAct_9fa48("1251") ? {} : (stryCov_9fa48("1251"), {
      action: stryMutAct_9fa48("1252") ? "" : (stryCov_9fa48("1252"), 'needs_review')
    });
    if (stryMutAct_9fa48("1254") ? false : stryMutAct_9fa48("1253") ? true : (stryCov_9fa48("1253", "1254"), isConfirmedSmsStatus(existingStatus))) return stryMutAct_9fa48("1255") ? {} : (stryCov_9fa48("1255"), {
      action: stryMutAct_9fa48("1256") ? "" : (stryCov_9fa48("1256"), 'advance')
    });
    return stryMutAct_9fa48("1257") ? {} : (stryCov_9fa48("1257"), {
      action: stryMutAct_9fa48("1258") ? "" : (stryCov_9fa48("1258"), 'park')
    });
  }
}
export type ReconcileRowDecision = {
  action: 'confirm';
  providerStatus: string;
  parsed: ParsedSid;
} | {
  action: 'requeue_campaign';
  enrollmentId: string;
  campaignId: string;
  stepNumber: number;
} | {
  action: 'requeue_recovery';
  leadId: string;
} | {
  action: 'park';
} | {
  action: 'needs_review';
  reason?: string;
};

/** Max unknown reconcile attempts before needs_review. */
export const MAX_RECONCILE_ATTEMPTS = 5;

/**
 * Normalize a raw relay lookup (may lack `outcome`) into a safe outcome.
 * found:true + status=failed → failed.
 * found:true without outcome → sent (unless failed).
 * found:false without outcome → never_sent.
 * Missing outcome / silence → unknown (never invent never_sent).
 */
export function normalizeLookupOutcome(lookup: {
  outcome?: RelayLookupOutcome | string | null;
  found?: boolean;
  status?: string;
  id?: string;
}): {
  outcome: RelayLookupOutcome;
  providerStatus: string;
} {
  if (stryMutAct_9fa48("1259")) {
    {}
  } else {
    stryCov_9fa48("1259");
    const status = stryMutAct_9fa48("1262") ? lookup.status && 'queued' : stryMutAct_9fa48("1261") ? false : stryMutAct_9fa48("1260") ? true : (stryCov_9fa48("1260", "1261", "1262"), lookup.status || (stryMutAct_9fa48("1263") ? "" : (stryCov_9fa48("1263"), 'queued')));
    if (stryMutAct_9fa48("1266") ? (lookup.outcome === 'sent' || lookup.outcome === 'never_sent' || lookup.outcome === 'unknown') && lookup.outcome === 'failed' : stryMutAct_9fa48("1265") ? false : stryMutAct_9fa48("1264") ? true : (stryCov_9fa48("1264", "1265", "1266"), (stryMutAct_9fa48("1268") ? (lookup.outcome === 'sent' || lookup.outcome === 'never_sent') && lookup.outcome === 'unknown' : stryMutAct_9fa48("1267") ? false : (stryCov_9fa48("1267", "1268"), (stryMutAct_9fa48("1270") ? lookup.outcome === 'sent' && lookup.outcome === 'never_sent' : stryMutAct_9fa48("1269") ? false : (stryCov_9fa48("1269", "1270"), (stryMutAct_9fa48("1272") ? lookup.outcome !== 'sent' : stryMutAct_9fa48("1271") ? false : (stryCov_9fa48("1271", "1272"), lookup.outcome === (stryMutAct_9fa48("1273") ? "" : (stryCov_9fa48("1273"), 'sent')))) || (stryMutAct_9fa48("1275") ? lookup.outcome !== 'never_sent' : stryMutAct_9fa48("1274") ? false : (stryCov_9fa48("1274", "1275"), lookup.outcome === (stryMutAct_9fa48("1276") ? "" : (stryCov_9fa48("1276"), 'never_sent')))))) || (stryMutAct_9fa48("1278") ? lookup.outcome !== 'unknown' : stryMutAct_9fa48("1277") ? false : (stryCov_9fa48("1277", "1278"), lookup.outcome === (stryMutAct_9fa48("1279") ? "" : (stryCov_9fa48("1279"), 'unknown')))))) || (stryMutAct_9fa48("1281") ? lookup.outcome !== 'failed' : stryMutAct_9fa48("1280") ? false : (stryCov_9fa48("1280", "1281"), lookup.outcome === (stryMutAct_9fa48("1282") ? "" : (stryCov_9fa48("1282"), 'failed')))))) {
      if (stryMutAct_9fa48("1283")) {
        {}
      } else {
        stryCov_9fa48("1283");
        if (stryMutAct_9fa48("1286") ? lookup.outcome === 'sent' || isFailedSmsStatus(status) : stryMutAct_9fa48("1285") ? false : stryMutAct_9fa48("1284") ? true : (stryCov_9fa48("1284", "1285", "1286"), (stryMutAct_9fa48("1288") ? lookup.outcome !== 'sent' : stryMutAct_9fa48("1287") ? true : (stryCov_9fa48("1287", "1288"), lookup.outcome === (stryMutAct_9fa48("1289") ? "" : (stryCov_9fa48("1289"), 'sent')))) && isFailedSmsStatus(status))) {
          if (stryMutAct_9fa48("1290")) {
            {}
          } else {
            stryCov_9fa48("1290");
            return stryMutAct_9fa48("1291") ? {} : (stryCov_9fa48("1291"), {
              outcome: stryMutAct_9fa48("1292") ? "" : (stryCov_9fa48("1292"), 'failed'),
              providerStatus: status
            });
          }
        }
        return stryMutAct_9fa48("1293") ? {} : (stryCov_9fa48("1293"), {
          outcome: lookup.outcome,
          providerStatus: status
        });
      }
    }
    if (stryMutAct_9fa48("1296") ? lookup.found !== true : stryMutAct_9fa48("1295") ? false : stryMutAct_9fa48("1294") ? true : (stryCov_9fa48("1294", "1295", "1296"), lookup.found === (stryMutAct_9fa48("1297") ? false : (stryCov_9fa48("1297"), true)))) {
      if (stryMutAct_9fa48("1298")) {
        {}
      } else {
        stryCov_9fa48("1298");
        if (stryMutAct_9fa48("1300") ? false : stryMutAct_9fa48("1299") ? true : (stryCov_9fa48("1299", "1300"), isFailedSmsStatus(status))) {
          if (stryMutAct_9fa48("1301")) {
            {}
          } else {
            stryCov_9fa48("1301");
            return stryMutAct_9fa48("1302") ? {} : (stryCov_9fa48("1302"), {
              outcome: stryMutAct_9fa48("1303") ? "" : (stryCov_9fa48("1303"), 'failed'),
              providerStatus: status
            });
          }
        }
        if (stryMutAct_9fa48("1306") ? lookup.id && lookup.status : stryMutAct_9fa48("1305") ? false : stryMutAct_9fa48("1304") ? true : (stryCov_9fa48("1304", "1305", "1306"), lookup.id || lookup.status)) {
          if (stryMutAct_9fa48("1307")) {
            {}
          } else {
            stryCov_9fa48("1307");
            return stryMutAct_9fa48("1308") ? {} : (stryCov_9fa48("1308"), {
              outcome: stryMutAct_9fa48("1309") ? "" : (stryCov_9fa48("1309"), 'sent'),
              providerStatus: status
            });
          }
        }
      }
    }
    if (stryMutAct_9fa48("1312") ? lookup.found !== false : stryMutAct_9fa48("1311") ? false : stryMutAct_9fa48("1310") ? true : (stryCov_9fa48("1310", "1311", "1312"), lookup.found === (stryMutAct_9fa48("1313") ? true : (stryCov_9fa48("1313"), false)))) {
      if (stryMutAct_9fa48("1314")) {
        {}
      } else {
        stryCov_9fa48("1314");
        return stryMutAct_9fa48("1315") ? {} : (stryCov_9fa48("1315"), {
          outcome: stryMutAct_9fa48("1316") ? "" : (stryCov_9fa48("1316"), 'never_sent'),
          providerStatus: stryMutAct_9fa48("1317") ? "" : (stryCov_9fa48("1317"), 'queued')
        });
      }
    }
    return stryMutAct_9fa48("1318") ? {} : (stryCov_9fa48("1318"), {
      outcome: stryMutAct_9fa48("1319") ? "" : (stryCov_9fa48("1319"), 'unknown'),
      providerStatus: status
    });
  }
}
export function decideReconcileRow(opts: {
  sid: string;
  outcome: RelayLookupOutcome | string | null | undefined;
  providerStatus?: string;
  reconcileAttempts?: number;
  /** True only when this row was sent after key support was confirmed (or key echoed). */
  keySupportedAtSend?: boolean | null;
}): ReconcileRowDecision {
  if (stryMutAct_9fa48("1320")) {
    {}
  } else {
    stryCov_9fa48("1320");
    const parsed = parseMessageSid(opts.sid);
    const attempts = stryMutAct_9fa48("1321") ? opts.reconcileAttempts && 0 : (stryCov_9fa48("1321"), opts.reconcileAttempts ?? 0);
    if (stryMutAct_9fa48("1324") ? opts.outcome !== 'failed' : stryMutAct_9fa48("1323") ? false : stryMutAct_9fa48("1322") ? true : (stryCov_9fa48("1322", "1323", "1324"), opts.outcome === (stryMutAct_9fa48("1325") ? "" : (stryCov_9fa48("1325"), 'failed')))) {
      if (stryMutAct_9fa48("1326")) {
        {}
      } else {
        stryCov_9fa48("1326");
        return stryMutAct_9fa48("1327") ? {} : (stryCov_9fa48("1327"), {
          action: stryMutAct_9fa48("1328") ? "" : (stryCov_9fa48("1328"), 'needs_review'),
          reason: stryMutAct_9fa48("1329") ? "" : (stryCov_9fa48("1329"), 'relay_status_failed')
        });
      }
    }
    if (stryMutAct_9fa48("1332") ? opts.outcome !== 'sent' : stryMutAct_9fa48("1331") ? false : stryMutAct_9fa48("1330") ? true : (stryCov_9fa48("1330", "1331", "1332"), opts.outcome === (stryMutAct_9fa48("1333") ? "" : (stryCov_9fa48("1333"), 'sent')))) {
      if (stryMutAct_9fa48("1334")) {
        {}
      } else {
        stryCov_9fa48("1334");
        if (stryMutAct_9fa48("1336") ? false : stryMutAct_9fa48("1335") ? true : (stryCov_9fa48("1335", "1336"), isFailedSmsStatus(opts.providerStatus))) {
          if (stryMutAct_9fa48("1337")) {
            {}
          } else {
            stryCov_9fa48("1337");
            return stryMutAct_9fa48("1338") ? {} : (stryCov_9fa48("1338"), {
              action: stryMutAct_9fa48("1339") ? "" : (stryCov_9fa48("1339"), 'needs_review'),
              reason: stryMutAct_9fa48("1340") ? "" : (stryCov_9fa48("1340"), 'relay_status_failed')
            });
          }
        }
        return stryMutAct_9fa48("1341") ? {} : (stryCov_9fa48("1341"), {
          action: stryMutAct_9fa48("1342") ? "" : (stryCov_9fa48("1342"), 'confirm'),
          providerStatus: stryMutAct_9fa48("1345") ? opts.providerStatus && 'queued' : stryMutAct_9fa48("1344") ? false : stryMutAct_9fa48("1343") ? true : (stryCov_9fa48("1343", "1344", "1345"), opts.providerStatus || (stryMutAct_9fa48("1346") ? "" : (stryCov_9fa48("1346"), 'queued'))),
          parsed
        });
      }
    }

    // ONLY explicit never_sent may requeue — and ONLY if the row was keyed
    // after lookup support was confirmed. Pre-upgrade / rollback rows → review.
    if (stryMutAct_9fa48("1349") ? opts.outcome !== 'never_sent' : stryMutAct_9fa48("1348") ? false : stryMutAct_9fa48("1347") ? true : (stryCov_9fa48("1347", "1348", "1349"), opts.outcome === (stryMutAct_9fa48("1350") ? "" : (stryCov_9fa48("1350"), 'never_sent')))) {
      if (stryMutAct_9fa48("1351")) {
        {}
      } else {
        stryCov_9fa48("1351");
        if (stryMutAct_9fa48("1354") ? false : stryMutAct_9fa48("1353") ? true : stryMutAct_9fa48("1352") ? opts.keySupportedAtSend : (stryCov_9fa48("1352", "1353", "1354"), !opts.keySupportedAtSend)) {
          if (stryMutAct_9fa48("1355")) {
            {}
          } else {
            stryCov_9fa48("1355");
            return stryMutAct_9fa48("1356") ? {} : (stryCov_9fa48("1356"), {
              action: stryMutAct_9fa48("1357") ? "" : (stryCov_9fa48("1357"), 'needs_review'),
              reason: stryMutAct_9fa48("1358") ? "" : (stryCov_9fa48("1358"), 'never_sent_without_key_support')
            });
          }
        }
        if (stryMutAct_9fa48("1361") ? parsed.kind !== 'campaign' : stryMutAct_9fa48("1360") ? false : stryMutAct_9fa48("1359") ? true : (stryCov_9fa48("1359", "1360", "1361"), parsed.kind === (stryMutAct_9fa48("1362") ? "" : (stryCov_9fa48("1362"), 'campaign')))) {
          if (stryMutAct_9fa48("1363")) {
            {}
          } else {
            stryCov_9fa48("1363");
            return stryMutAct_9fa48("1364") ? {} : (stryCov_9fa48("1364"), {
              action: stryMutAct_9fa48("1365") ? "" : (stryCov_9fa48("1365"), 'requeue_campaign'),
              enrollmentId: parsed.enrollmentId,
              campaignId: parsed.campaignId,
              stepNumber: parsed.stepNumber
            });
          }
        }
        if (stryMutAct_9fa48("1368") ? parsed.kind !== 'recovery' : stryMutAct_9fa48("1367") ? false : stryMutAct_9fa48("1366") ? true : (stryCov_9fa48("1366", "1367", "1368"), parsed.kind === (stryMutAct_9fa48("1369") ? "" : (stryCov_9fa48("1369"), 'recovery')))) {
          if (stryMutAct_9fa48("1370")) {
            {}
          } else {
            stryCov_9fa48("1370");
            return stryMutAct_9fa48("1371") ? {} : (stryCov_9fa48("1371"), {
              action: stryMutAct_9fa48("1372") ? "" : (stryCov_9fa48("1372"), 'requeue_recovery'),
              leadId: parsed.leadId
            });
          }
        }
        return stryMutAct_9fa48("1373") ? {} : (stryCov_9fa48("1373"), {
          action: stryMutAct_9fa48("1374") ? "" : (stryCov_9fa48("1374"), 'park')
        });
      }
    }

    // unknown / missing / anything else → park (or needs_review after N attempts)
    if (stryMutAct_9fa48("1378") ? attempts + 1 < MAX_RECONCILE_ATTEMPTS : stryMutAct_9fa48("1377") ? attempts + 1 > MAX_RECONCILE_ATTEMPTS : stryMutAct_9fa48("1376") ? false : stryMutAct_9fa48("1375") ? true : (stryCov_9fa48("1375", "1376", "1377", "1378"), (stryMutAct_9fa48("1379") ? attempts - 1 : (stryCov_9fa48("1379"), attempts + 1)) >= MAX_RECONCILE_ATTEMPTS)) {
      if (stryMutAct_9fa48("1380")) {
        {}
      } else {
        stryCov_9fa48("1380");
        return stryMutAct_9fa48("1381") ? {} : (stryCov_9fa48("1381"), {
          action: stryMutAct_9fa48("1382") ? "" : (stryCov_9fa48("1382"), 'needs_review'),
          reason: stryMutAct_9fa48("1383") ? "" : (stryCov_9fa48("1383"), 'max_attempts')
        });
      }
    }
    return stryMutAct_9fa48("1384") ? {} : (stryCov_9fa48("1384"), {
      action: stryMutAct_9fa48("1385") ? "" : (stryCov_9fa48("1385"), 'park')
    });
  }
}