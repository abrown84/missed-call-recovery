/**
 * Pure send-path decisions — no DB, no relay, no clock.
 * Exhaustively property/example tested; I/O shell only executes the results.
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
import { campaignStepMessageSid, recoveryMessageSid } from '@/services/sms-sid';
import { classifyRecoveryStatus, isConfirmedStatus, isFailedStatus, type RelaySendSignal, type RecoveryResolvedOutcome } from './machine';
import type { SendKind, SendOutcome, SendRequest } from './types';
export type QuietHoursInput = {
  allowed: true;
  zones: string[];
  endHour: number;
} | {
  allowed: false;
  unresolved?: false;
  nextSendAt: Date;
  zones: string[];
  endHour: number;
} | {
  allowed: false;
  unresolved: true;
  reason: string;
  zones: string[];
};

/** Pre-send gate after E.164 is known (suppression/opt-out/recovery/quiet). */
export function decideCustomerFacingGates(input: {
  kind: SendKind;
  stepNumber?: number;
  skipRecoveryGate?: boolean;
  skipQuietHours?: boolean;
  suppressed: boolean;
  optedOut: boolean;
  recovery?: RecoveryResolvedOutcome;
  quiet?: QuietHoursInput;
}): SendOutcome | null {
  if (stryMutAct_9fa48("1386")) {
    {}
  } else {
    stryCov_9fa48("1386");
    if (stryMutAct_9fa48("1389") ? input.kind !== 'recovery' || input.kind !== 'campaign' : stryMutAct_9fa48("1388") ? false : stryMutAct_9fa48("1387") ? true : (stryCov_9fa48("1387", "1388", "1389"), (stryMutAct_9fa48("1391") ? input.kind === 'recovery' : stryMutAct_9fa48("1390") ? true : (stryCov_9fa48("1390", "1391"), input.kind !== (stryMutAct_9fa48("1392") ? "" : (stryCov_9fa48("1392"), 'recovery')))) && (stryMutAct_9fa48("1394") ? input.kind === 'campaign' : stryMutAct_9fa48("1393") ? true : (stryCov_9fa48("1393", "1394"), input.kind !== (stryMutAct_9fa48("1395") ? "" : (stryCov_9fa48("1395"), 'campaign')))))) return null;
    if (stryMutAct_9fa48("1397") ? false : stryMutAct_9fa48("1396") ? true : (stryCov_9fa48("1396", "1397"), input.suppressed)) {
      if (stryMutAct_9fa48("1398")) {
        {}
      } else {
        stryCov_9fa48("1398");
        return stryMutAct_9fa48("1399") ? {} : (stryCov_9fa48("1399"), {
          kind: stryMutAct_9fa48("1400") ? "" : (stryCov_9fa48("1400"), 'blocked'),
          reason: stryMutAct_9fa48("1401") ? "" : (stryCov_9fa48("1401"), 'suppressed')
        });
      }
    }
    if (stryMutAct_9fa48("1403") ? false : stryMutAct_9fa48("1402") ? true : (stryCov_9fa48("1402", "1403"), input.optedOut)) {
      if (stryMutAct_9fa48("1404")) {
        {}
      } else {
        stryCov_9fa48("1404");
        return stryMutAct_9fa48("1405") ? {} : (stryCov_9fa48("1405"), {
          kind: stryMutAct_9fa48("1406") ? "" : (stryCov_9fa48("1406"), 'blocked'),
          reason: stryMutAct_9fa48("1407") ? "" : (stryCov_9fa48("1407"), 'opted_out')
        });
      }
    }
    if (stryMutAct_9fa48("1410") ? input.kind === 'campaign' && input.stepNumber === 1 || !input.skipRecoveryGate : stryMutAct_9fa48("1409") ? false : stryMutAct_9fa48("1408") ? true : (stryCov_9fa48("1408", "1409", "1410"), (stryMutAct_9fa48("1412") ? input.kind === 'campaign' || input.stepNumber === 1 : stryMutAct_9fa48("1411") ? true : (stryCov_9fa48("1411", "1412"), (stryMutAct_9fa48("1414") ? input.kind !== 'campaign' : stryMutAct_9fa48("1413") ? true : (stryCov_9fa48("1413", "1414"), input.kind === (stryMutAct_9fa48("1415") ? "" : (stryCov_9fa48("1415"), 'campaign')))) && (stryMutAct_9fa48("1417") ? input.stepNumber !== 1 : stryMutAct_9fa48("1416") ? true : (stryCov_9fa48("1416", "1417"), input.stepNumber === 1)))) && (stryMutAct_9fa48("1418") ? input.skipRecoveryGate : (stryCov_9fa48("1418"), !input.skipRecoveryGate)))) {
      if (stryMutAct_9fa48("1419")) {
        {}
      } else {
        stryCov_9fa48("1419");
        if (stryMutAct_9fa48("1422") ? input.recovery !== 'pending' : stryMutAct_9fa48("1421") ? false : stryMutAct_9fa48("1420") ? true : (stryCov_9fa48("1420", "1421", "1422"), input.recovery === (stryMutAct_9fa48("1423") ? "" : (stryCov_9fa48("1423"), 'pending')))) {
          if (stryMutAct_9fa48("1424")) {
            {}
          } else {
            stryCov_9fa48("1424");
            return stryMutAct_9fa48("1425") ? {} : (stryCov_9fa48("1425"), {
              kind: stryMutAct_9fa48("1426") ? "" : (stryCov_9fa48("1426"), 'blocked'),
              reason: stryMutAct_9fa48("1427") ? "" : (stryCov_9fa48("1427"), 'recovery_pending')
            });
          }
        }
        if (stryMutAct_9fa48("1430") ? input.recovery !== 'resolved_sent' : stryMutAct_9fa48("1429") ? false : stryMutAct_9fa48("1428") ? true : (stryCov_9fa48("1428", "1429", "1430"), input.recovery === (stryMutAct_9fa48("1431") ? "" : (stryCov_9fa48("1431"), 'resolved_sent')))) {
          if (stryMutAct_9fa48("1432")) {
            {}
          } else {
            stryCov_9fa48("1432");
            return stryMutAct_9fa48("1433") ? {} : (stryCov_9fa48("1433"), {
              kind: stryMutAct_9fa48("1434") ? "" : (stryCov_9fa48("1434"), 'skipped'),
              reason: stryMutAct_9fa48("1435") ? "" : (stryCov_9fa48("1435"), 'recovery_already_sent_skip_step_1')
            });
          }
        }
      }
    }
    if (stryMutAct_9fa48("1438") ? !input.skipQuietHours && input.quiet || !input.quiet.allowed : stryMutAct_9fa48("1437") ? false : stryMutAct_9fa48("1436") ? true : (stryCov_9fa48("1436", "1437", "1438"), (stryMutAct_9fa48("1440") ? !input.skipQuietHours || input.quiet : stryMutAct_9fa48("1439") ? true : (stryCov_9fa48("1439", "1440"), (stryMutAct_9fa48("1441") ? input.skipQuietHours : (stryCov_9fa48("1441"), !input.skipQuietHours)) && input.quiet)) && (stryMutAct_9fa48("1442") ? input.quiet.allowed : (stryCov_9fa48("1442"), !input.quiet.allowed)))) {
      if (stryMutAct_9fa48("1443")) {
        {}
      } else {
        stryCov_9fa48("1443");
        if (stryMutAct_9fa48("1446") ? 'unresolved' in input.quiet || input.quiet.unresolved : stryMutAct_9fa48("1445") ? false : stryMutAct_9fa48("1444") ? true : (stryCov_9fa48("1444", "1445", "1446"), (stryMutAct_9fa48("1447") ? "" : (stryCov_9fa48("1447"), 'unresolved')) in input.quiet && input.quiet.unresolved)) {
          if (stryMutAct_9fa48("1448")) {
            {}
          } else {
            stryCov_9fa48("1448");
            return stryMutAct_9fa48("1449") ? {} : (stryCov_9fa48("1449"), {
              kind: stryMutAct_9fa48("1450") ? "" : (stryCov_9fa48("1450"), 'blocked'),
              reason: stryMutAct_9fa48("1451") ? "" : (stryCov_9fa48("1451"), 'quiet_hours_unresolved'),
              detail: input.quiet.reason
            });
          }
        }
        if (stryMutAct_9fa48("1454") ? 'nextSendAt' in input.quiet || input.quiet.nextSendAt : stryMutAct_9fa48("1453") ? false : stryMutAct_9fa48("1452") ? true : (stryCov_9fa48("1452", "1453", "1454"), (stryMutAct_9fa48("1455") ? "" : (stryCov_9fa48("1455"), 'nextSendAt')) in input.quiet && input.quiet.nextSendAt)) {
          if (stryMutAct_9fa48("1456")) {
            {}
          } else {
            stryCov_9fa48("1456");
            return stryMutAct_9fa48("1457") ? {} : (stryCov_9fa48("1457"), {
              kind: stryMutAct_9fa48("1458") ? "" : (stryCov_9fa48("1458"), 'blocked'),
              reason: stryMutAct_9fa48("1459") ? "" : (stryCov_9fa48("1459"), 'quiet_hours_deferred'),
              nextSendAt: input.quiet.nextSendAt.toISOString()
            });
          }
        }
      }
    }
    return null;
  }
}
export function resolveIdempotencySid(req: Pick<SendRequest, 'idempotencyKey' | 'kind' | 'leadId' | 'enrollmentId' | 'campaignId' | 'stepNumber'>, nowMs: number): string {
  if (stryMutAct_9fa48("1460")) {
    {}
  } else {
    stryCov_9fa48("1460");
    if (stryMutAct_9fa48("1462") ? false : stryMutAct_9fa48("1461") ? true : (stryCov_9fa48("1461", "1462"), req.idempotencyKey)) return req.idempotencyKey;
    if (stryMutAct_9fa48("1465") ? req.kind !== 'recovery' : stryMutAct_9fa48("1464") ? false : stryMutAct_9fa48("1463") ? true : (stryCov_9fa48("1463", "1464", "1465"), req.kind === (stryMutAct_9fa48("1466") ? "" : (stryCov_9fa48("1466"), 'recovery')))) return recoveryMessageSid(req.leadId);
    if (stryMutAct_9fa48("1469") ? req.kind === 'campaign' && req.enrollmentId && req.campaignId || req.stepNumber : stryMutAct_9fa48("1468") ? false : stryMutAct_9fa48("1467") ? true : (stryCov_9fa48("1467", "1468", "1469"), (stryMutAct_9fa48("1471") ? req.kind === 'campaign' && req.enrollmentId || req.campaignId : stryMutAct_9fa48("1470") ? true : (stryCov_9fa48("1470", "1471"), (stryMutAct_9fa48("1473") ? req.kind === 'campaign' || req.enrollmentId : stryMutAct_9fa48("1472") ? true : (stryCov_9fa48("1472", "1473"), (stryMutAct_9fa48("1475") ? req.kind !== 'campaign' : stryMutAct_9fa48("1474") ? true : (stryCov_9fa48("1474", "1475"), req.kind === (stryMutAct_9fa48("1476") ? "" : (stryCov_9fa48("1476"), 'campaign')))) && req.enrollmentId)) && req.campaignId)) && req.stepNumber)) {
      if (stryMutAct_9fa48("1477")) {
        {}
      } else {
        stryCov_9fa48("1477");
        return campaignStepMessageSid(req.enrollmentId, req.campaignId, req.stepNumber);
      }
    }
    return stryMutAct_9fa48("1478") ? `` : (stryCov_9fa48("1478"), `mlf:${req.kind}:${req.leadId}:${nowMs}`);
  }
}
export type DuplicateSidDecision = {
  action: 'confirm_existing';
  status: string;
} | {
  action: 'needs_review';
  reason: 'duplicate_failed';
} | {
  action: 'claim_deferred';
} | {
  action: 'block_in_flight';
  detail: string;
};
export function decideDuplicateSid(existingStatus: string | null | undefined): DuplicateSidDecision {
  if (stryMutAct_9fa48("1479")) {
    {}
  } else {
    stryCov_9fa48("1479");
    if (stryMutAct_9fa48("1481") ? false : stryMutAct_9fa48("1480") ? true : (stryCov_9fa48("1480", "1481"), isConfirmedStatus(existingStatus))) {
      if (stryMutAct_9fa48("1482")) {
        {}
      } else {
        stryCov_9fa48("1482");
        return stryMutAct_9fa48("1483") ? {} : (stryCov_9fa48("1483"), {
          action: stryMutAct_9fa48("1484") ? "" : (stryCov_9fa48("1484"), 'confirm_existing'),
          status: existingStatus!
        });
      }
    }
    if (stryMutAct_9fa48("1487") ? isFailedStatus(existingStatus) && String(existingStatus ?? '').toLowerCase() === 'needs_review' : stryMutAct_9fa48("1486") ? false : stryMutAct_9fa48("1485") ? true : (stryCov_9fa48("1485", "1486", "1487"), isFailedStatus(existingStatus) || (stryMutAct_9fa48("1489") ? String(existingStatus ?? '').toLowerCase() !== 'needs_review' : stryMutAct_9fa48("1488") ? false : (stryCov_9fa48("1488", "1489"), (stryMutAct_9fa48("1490") ? String(existingStatus ?? '').toUpperCase() : (stryCov_9fa48("1490"), String(stryMutAct_9fa48("1491") ? existingStatus && '' : (stryCov_9fa48("1491"), existingStatus ?? (stryMutAct_9fa48("1492") ? "Stryker was here!" : (stryCov_9fa48("1492"), '')))).toLowerCase())) === (stryMutAct_9fa48("1493") ? "" : (stryCov_9fa48("1493"), 'needs_review')))))) {
      if (stryMutAct_9fa48("1494")) {
        {}
      } else {
        stryCov_9fa48("1494");
        return stryMutAct_9fa48("1495") ? {} : (stryCov_9fa48("1495"), {
          action: stryMutAct_9fa48("1496") ? "" : (stryCov_9fa48("1496"), 'needs_review'),
          reason: stryMutAct_9fa48("1497") ? "" : (stryCov_9fa48("1497"), 'duplicate_failed')
        });
      }
    }
    const st = stryMutAct_9fa48("1498") ? String(existingStatus ?? '').toUpperCase() : (stryCov_9fa48("1498"), String(stryMutAct_9fa48("1499") ? existingStatus && '' : (stryCov_9fa48("1499"), existingStatus ?? (stryMutAct_9fa48("1500") ? "Stryker was here!" : (stryCov_9fa48("1500"), '')))).toLowerCase());
    if (stryMutAct_9fa48("1503") ? st === 'deferred' && st === 'abandoned_retry' : stryMutAct_9fa48("1502") ? false : stryMutAct_9fa48("1501") ? true : (stryCov_9fa48("1501", "1502", "1503"), (stryMutAct_9fa48("1505") ? st !== 'deferred' : stryMutAct_9fa48("1504") ? false : (stryCov_9fa48("1504", "1505"), st === (stryMutAct_9fa48("1506") ? "" : (stryCov_9fa48("1506"), 'deferred')))) || (stryMutAct_9fa48("1508") ? st !== 'abandoned_retry' : stryMutAct_9fa48("1507") ? false : (stryCov_9fa48("1507", "1508"), st === (stryMutAct_9fa48("1509") ? "" : (stryCov_9fa48("1509"), 'abandoned_retry')))))) {
      if (stryMutAct_9fa48("1510")) {
        {}
      } else {
        stryCov_9fa48("1510");
        return stryMutAct_9fa48("1511") ? {} : (stryCov_9fa48("1511"), {
          action: stryMutAct_9fa48("1512") ? "" : (stryCov_9fa48("1512"), 'claim_deferred')
        });
      }
    }
    return stryMutAct_9fa48("1513") ? {} : (stryCov_9fa48("1513"), {
      action: stryMutAct_9fa48("1514") ? "" : (stryCov_9fa48("1514"), 'block_in_flight'),
      detail: stryMutAct_9fa48("1515") ? existingStatus && 'missing' : (stryCov_9fa48("1515"), existingStatus ?? (stryMutAct_9fa48("1516") ? "" : (stryCov_9fa48("1516"), 'missing')))
    });
  }
}
export function mapRelaySendResult(result: {
  conflict?: boolean;
  ambiguous?: boolean;
  status?: string;
  id: string;
  keyEchoed?: boolean;
  duplicate?: boolean;
}): RelaySendSignal {
  if (stryMutAct_9fa48("1517")) {
    {}
  } else {
    stryCov_9fa48("1517");
    if (stryMutAct_9fa48("1519") ? false : stryMutAct_9fa48("1518") ? true : (stryCov_9fa48("1518", "1519"), result.conflict)) return stryMutAct_9fa48("1520") ? {} : (stryCov_9fa48("1520"), {
      type: stryMutAct_9fa48("1521") ? "" : (stryCov_9fa48("1521"), 'conflict')
    });
    if (stryMutAct_9fa48("1523") ? false : stryMutAct_9fa48("1522") ? true : (stryCov_9fa48("1522", "1523"), result.ambiguous)) {
      if (stryMutAct_9fa48("1524")) {
        {}
      } else {
        stryCov_9fa48("1524");
        return (stryMutAct_9fa48("1527") ? result.status !== 'maintenance' : stryMutAct_9fa48("1526") ? false : stryMutAct_9fa48("1525") ? true : (stryCov_9fa48("1525", "1526", "1527"), result.status === (stryMutAct_9fa48("1528") ? "" : (stryCov_9fa48("1528"), 'maintenance')))) ? stryMutAct_9fa48("1529") ? {} : (stryCov_9fa48("1529"), {
          type: stryMutAct_9fa48("1530") ? "" : (stryCov_9fa48("1530"), 'maintenance')
        }) : stryMutAct_9fa48("1531") ? {} : (stryCov_9fa48("1531"), {
          type: stryMutAct_9fa48("1532") ? "" : (stryCov_9fa48("1532"), 'rate_limit')
        });
      }
    }
    if (stryMutAct_9fa48("1534") ? false : stryMutAct_9fa48("1533") ? true : (stryCov_9fa48("1533", "1534"), isFailedStatus(result.status))) {
      if (stryMutAct_9fa48("1535")) {
        {}
      } else {
        stryCov_9fa48("1535");
        return stryMutAct_9fa48("1536") ? {} : (stryCov_9fa48("1536"), {
          type: stryMutAct_9fa48("1537") ? "" : (stryCov_9fa48("1537"), 'failed'),
          status: result.status
        });
      }
    }
    return stryMutAct_9fa48("1538") ? {} : (stryCov_9fa48("1538"), {
      type: stryMutAct_9fa48("1539") ? "" : (stryCov_9fa48("1539"), 'ok'),
      messageId: result.id,
      status: stryMutAct_9fa48("1542") ? result.status && 'queued' : stryMutAct_9fa48("1541") ? false : stryMutAct_9fa48("1540") ? true : (stryCov_9fa48("1540", "1541", "1542"), result.status || (stryMutAct_9fa48("1543") ? "" : (stryCov_9fa48("1543"), 'queued'))),
      keyEchoed: Boolean(result.keyEchoed),
      duplicate: result.duplicate
    });
  }
}
export function classifyStatusRow(status: string | null | undefined): RecoveryResolvedOutcome {
  if (stryMutAct_9fa48("1544")) {
    {}
  } else {
    stryCov_9fa48("1544");
    return classifyRecoveryStatus(status);
  }
}
export type CampaignSendAction = {
  type: 'advance';
} | {
  type: 'release';
  nextSendAt: string;
  ok: boolean;
} | {
  type: 'park';
  nextSendAt?: string;
} | {
  type: 'pause_opt_out';
} | {
  type: 'needs_review_terminal';
  reason: string;
} | {
  type: 'flag_unresolved_tz';
  nextSendAt: string;
} | {
  type: 'noop_false';
};

/** Pure interpretation of sendMessage outcome for a campaign step. */
export function interpretCampaignSendOutcome(outcome: SendOutcome, parkedFallbackIso: string): CampaignSendAction {
  if (stryMutAct_9fa48("1545")) {
    {}
  } else {
    stryCov_9fa48("1545");
    if (stryMutAct_9fa48("1548") ? outcome.kind === 'skipped' || outcome.reason === 'recovery_already_sent_skip_step_1' : stryMutAct_9fa48("1547") ? false : stryMutAct_9fa48("1546") ? true : (stryCov_9fa48("1546", "1547", "1548"), (stryMutAct_9fa48("1550") ? outcome.kind !== 'skipped' : stryMutAct_9fa48("1549") ? true : (stryCov_9fa48("1549", "1550"), outcome.kind === (stryMutAct_9fa48("1551") ? "" : (stryCov_9fa48("1551"), 'skipped')))) && (stryMutAct_9fa48("1553") ? outcome.reason !== 'recovery_already_sent_skip_step_1' : stryMutAct_9fa48("1552") ? true : (stryCov_9fa48("1552", "1553"), outcome.reason === (stryMutAct_9fa48("1554") ? "" : (stryCov_9fa48("1554"), 'recovery_already_sent_skip_step_1')))))) {
      if (stryMutAct_9fa48("1555")) {
        {}
      } else {
        stryCov_9fa48("1555");
        return stryMutAct_9fa48("1556") ? {} : (stryCov_9fa48("1556"), {
          type: stryMutAct_9fa48("1557") ? "" : (stryCov_9fa48("1557"), 'advance')
        });
      }
    }
    if (stryMutAct_9fa48("1560") ? outcome.kind !== 'blocked' : stryMutAct_9fa48("1559") ? false : stryMutAct_9fa48("1558") ? true : (stryCov_9fa48("1558", "1559", "1560"), outcome.kind === (stryMutAct_9fa48("1561") ? "" : (stryCov_9fa48("1561"), 'blocked')))) {
      if (stryMutAct_9fa48("1562")) {
        {}
      } else {
        stryCov_9fa48("1562");
        if (stryMutAct_9fa48("1565") ? outcome.reason === 'quiet_hours_deferred' || outcome.nextSendAt : stryMutAct_9fa48("1564") ? false : stryMutAct_9fa48("1563") ? true : (stryCov_9fa48("1563", "1564", "1565"), (stryMutAct_9fa48("1567") ? outcome.reason !== 'quiet_hours_deferred' : stryMutAct_9fa48("1566") ? true : (stryCov_9fa48("1566", "1567"), outcome.reason === (stryMutAct_9fa48("1568") ? "" : (stryCov_9fa48("1568"), 'quiet_hours_deferred')))) && outcome.nextSendAt)) {
          if (stryMutAct_9fa48("1569")) {
            {}
          } else {
            stryCov_9fa48("1569");
            return stryMutAct_9fa48("1570") ? {} : (stryCov_9fa48("1570"), {
              type: stryMutAct_9fa48("1571") ? "" : (stryCov_9fa48("1571"), 'release'),
              nextSendAt: outcome.nextSendAt,
              ok: stryMutAct_9fa48("1572") ? false : (stryCov_9fa48("1572"), true)
            });
          }
        }
        if (stryMutAct_9fa48("1575") ? outcome.reason !== 'quiet_hours_unresolved' : stryMutAct_9fa48("1574") ? false : stryMutAct_9fa48("1573") ? true : (stryCov_9fa48("1573", "1574", "1575"), outcome.reason === (stryMutAct_9fa48("1576") ? "" : (stryCov_9fa48("1576"), 'quiet_hours_unresolved')))) {
          if (stryMutAct_9fa48("1577")) {
            {}
          } else {
            stryCov_9fa48("1577");
            return stryMutAct_9fa48("1578") ? {} : (stryCov_9fa48("1578"), {
              type: stryMutAct_9fa48("1579") ? "" : (stryCov_9fa48("1579"), 'flag_unresolved_tz'),
              nextSendAt: parkedFallbackIso
            });
          }
        }
        if (stryMutAct_9fa48("1582") ? outcome.reason !== 'recovery_pending' : stryMutAct_9fa48("1581") ? false : stryMutAct_9fa48("1580") ? true : (stryCov_9fa48("1580", "1581", "1582"), outcome.reason === (stryMutAct_9fa48("1583") ? "" : (stryCov_9fa48("1583"), 'recovery_pending')))) {
          if (stryMutAct_9fa48("1584")) {
            {}
          } else {
            stryCov_9fa48("1584");
            return stryMutAct_9fa48("1585") ? {} : (stryCov_9fa48("1585"), {
              type: stryMutAct_9fa48("1586") ? "" : (stryCov_9fa48("1586"), 'park')
            });
          }
        }
        if (stryMutAct_9fa48("1589") ? outcome.reason === 'suppressed' && outcome.reason === 'opted_out' : stryMutAct_9fa48("1588") ? false : stryMutAct_9fa48("1587") ? true : (stryCov_9fa48("1587", "1588", "1589"), (stryMutAct_9fa48("1591") ? outcome.reason !== 'suppressed' : stryMutAct_9fa48("1590") ? false : (stryCov_9fa48("1590", "1591"), outcome.reason === (stryMutAct_9fa48("1592") ? "" : (stryCov_9fa48("1592"), 'suppressed')))) || (stryMutAct_9fa48("1594") ? outcome.reason !== 'opted_out' : stryMutAct_9fa48("1593") ? false : (stryCov_9fa48("1593", "1594"), outcome.reason === (stryMutAct_9fa48("1595") ? "" : (stryCov_9fa48("1595"), 'opted_out')))))) {
          if (stryMutAct_9fa48("1596")) {
            {}
          } else {
            stryCov_9fa48("1596");
            return stryMutAct_9fa48("1597") ? {} : (stryCov_9fa48("1597"), {
              type: stryMutAct_9fa48("1598") ? "" : (stryCov_9fa48("1598"), 'pause_opt_out')
            });
          }
        }
        if (stryMutAct_9fa48("1601") ? outcome.reason !== 'sends_disabled' : stryMutAct_9fa48("1600") ? false : stryMutAct_9fa48("1599") ? true : (stryCov_9fa48("1599", "1600", "1601"), outcome.reason === (stryMutAct_9fa48("1602") ? "" : (stryCov_9fa48("1602"), 'sends_disabled')))) {
          if (stryMutAct_9fa48("1603")) {
            {}
          } else {
            stryCov_9fa48("1603");
            // Count as error for cron metrics; still release claim for retry.
            return stryMutAct_9fa48("1604") ? {} : (stryCov_9fa48("1604"), {
              type: stryMutAct_9fa48("1605") ? "" : (stryCov_9fa48("1605"), 'release'),
              nextSendAt: parkedFallbackIso,
              ok: stryMutAct_9fa48("1606") ? true : (stryCov_9fa48("1606"), false)
            });
          }
        }
        if (stryMutAct_9fa48("1609") ? outcome.reason !== 'duplicate_in_flight' : stryMutAct_9fa48("1608") ? false : stryMutAct_9fa48("1607") ? true : (stryCov_9fa48("1607", "1608", "1609"), outcome.reason === (stryMutAct_9fa48("1610") ? "" : (stryCov_9fa48("1610"), 'duplicate_in_flight')))) {
          if (stryMutAct_9fa48("1611")) {
            {}
          } else {
            stryCov_9fa48("1611");
            return stryMutAct_9fa48("1612") ? {} : (stryCov_9fa48("1612"), {
              type: stryMutAct_9fa48("1613") ? "" : (stryCov_9fa48("1613"), 'park')
            });
          }
        }
        return stryMutAct_9fa48("1614") ? {} : (stryCov_9fa48("1614"), {
          type: stryMutAct_9fa48("1615") ? "" : (stryCov_9fa48("1615"), 'noop_false')
        });
      }
    }
    if (stryMutAct_9fa48("1618") ? outcome.kind !== 'sent' : stryMutAct_9fa48("1617") ? false : stryMutAct_9fa48("1616") ? true : (stryCov_9fa48("1616", "1617", "1618"), outcome.kind === (stryMutAct_9fa48("1619") ? "" : (stryCov_9fa48("1619"), 'sent')))) return stryMutAct_9fa48("1620") ? {} : (stryCov_9fa48("1620"), {
      type: stryMutAct_9fa48("1621") ? "" : (stryCov_9fa48("1621"), 'advance')
    });
    if (stryMutAct_9fa48("1624") ? outcome.kind !== 'needs_review' : stryMutAct_9fa48("1623") ? false : stryMutAct_9fa48("1622") ? true : (stryCov_9fa48("1622", "1623", "1624"), outcome.kind === (stryMutAct_9fa48("1625") ? "" : (stryCov_9fa48("1625"), 'needs_review')))) {
      if (stryMutAct_9fa48("1626")) {
        {}
      } else {
        stryCov_9fa48("1626");
        return stryMutAct_9fa48("1627") ? {} : (stryCov_9fa48("1627"), {
          type: stryMutAct_9fa48("1628") ? "" : (stryCov_9fa48("1628"), 'needs_review_terminal'),
          reason: outcome.reason
        });
      }
    }
    if (stryMutAct_9fa48("1631") ? outcome.kind !== 'ambiguous' : stryMutAct_9fa48("1630") ? false : stryMutAct_9fa48("1629") ? true : (stryCov_9fa48("1629", "1630", "1631"), outcome.kind === (stryMutAct_9fa48("1632") ? "" : (stryCov_9fa48("1632"), 'ambiguous')))) {
      if (stryMutAct_9fa48("1633")) {
        {}
      } else {
        stryCov_9fa48("1633");
        return stryMutAct_9fa48("1634") ? {} : (stryCov_9fa48("1634"), {
          type: stryMutAct_9fa48("1635") ? "" : (stryCov_9fa48("1635"), 'park'),
          nextSendAt: stryMutAct_9fa48("1636") ? outcome.nextRetryAt && parkedFallbackIso : (stryCov_9fa48("1636"), outcome.nextRetryAt ?? parkedFallbackIso)
        });
      }
    }
    return stryMutAct_9fa48("1637") ? {} : (stryCov_9fa48("1637"), {
      type: stryMutAct_9fa48("1638") ? "" : (stryCov_9fa48("1638"), 'park')
    });
  }
}
export type RecoveryOutcomeAction = {
  type: 'persist_deferred';
  nextSendAt: string;
} | {
  type: 'log_blocked';
  reason: string;
} | {
  type: 'log_needs_review';
  sid: string;
} | {
  type: 'log_ambiguous';
  reason: string;
} | {
  type: 'log_sent';
  sid: string;
};
export function interpretRecoverySendOutcome(outcome: SendOutcome, fallbackDeferIso: string): RecoveryOutcomeAction {
  if (stryMutAct_9fa48("1639")) {
    {}
  } else {
    stryCov_9fa48("1639");
    if (stryMutAct_9fa48("1642") ? outcome.kind === 'blocked' || outcome.reason === 'quiet_hours_deferred' : stryMutAct_9fa48("1641") ? false : stryMutAct_9fa48("1640") ? true : (stryCov_9fa48("1640", "1641", "1642"), (stryMutAct_9fa48("1644") ? outcome.kind !== 'blocked' : stryMutAct_9fa48("1643") ? true : (stryCov_9fa48("1643", "1644"), outcome.kind === (stryMutAct_9fa48("1645") ? "" : (stryCov_9fa48("1645"), 'blocked')))) && (stryMutAct_9fa48("1647") ? outcome.reason !== 'quiet_hours_deferred' : stryMutAct_9fa48("1646") ? true : (stryCov_9fa48("1646", "1647"), outcome.reason === (stryMutAct_9fa48("1648") ? "" : (stryCov_9fa48("1648"), 'quiet_hours_deferred')))))) {
      if (stryMutAct_9fa48("1649")) {
        {}
      } else {
        stryCov_9fa48("1649");
        return stryMutAct_9fa48("1650") ? {} : (stryCov_9fa48("1650"), {
          type: stryMutAct_9fa48("1651") ? "" : (stryCov_9fa48("1651"), 'persist_deferred'),
          nextSendAt: stryMutAct_9fa48("1652") ? outcome.nextSendAt && fallbackDeferIso : (stryCov_9fa48("1652"), outcome.nextSendAt ?? fallbackDeferIso)
        });
      }
    }
    if (stryMutAct_9fa48("1655") ? outcome.kind === 'blocked' && outcome.kind === 'skipped' : stryMutAct_9fa48("1654") ? false : stryMutAct_9fa48("1653") ? true : (stryCov_9fa48("1653", "1654", "1655"), (stryMutAct_9fa48("1657") ? outcome.kind !== 'blocked' : stryMutAct_9fa48("1656") ? false : (stryCov_9fa48("1656", "1657"), outcome.kind === (stryMutAct_9fa48("1658") ? "" : (stryCov_9fa48("1658"), 'blocked')))) || (stryMutAct_9fa48("1660") ? outcome.kind !== 'skipped' : stryMutAct_9fa48("1659") ? false : (stryCov_9fa48("1659", "1660"), outcome.kind === (stryMutAct_9fa48("1661") ? "" : (stryCov_9fa48("1661"), 'skipped')))))) {
      if (stryMutAct_9fa48("1662")) {
        {}
      } else {
        stryCov_9fa48("1662");
        return stryMutAct_9fa48("1663") ? {} : (stryCov_9fa48("1663"), {
          type: stryMutAct_9fa48("1664") ? "" : (stryCov_9fa48("1664"), 'log_blocked'),
          reason: (stryMutAct_9fa48("1665") ? "" : (stryCov_9fa48("1665"), 'reason')) in outcome ? String(outcome.reason) : outcome.kind
        });
      }
    }
    if (stryMutAct_9fa48("1668") ? outcome.kind !== 'needs_review' : stryMutAct_9fa48("1667") ? false : stryMutAct_9fa48("1666") ? true : (stryCov_9fa48("1666", "1667", "1668"), outcome.kind === (stryMutAct_9fa48("1669") ? "" : (stryCov_9fa48("1669"), 'needs_review')))) {
      if (stryMutAct_9fa48("1670")) {
        {}
      } else {
        stryCov_9fa48("1670");
        return stryMutAct_9fa48("1671") ? {} : (stryCov_9fa48("1671"), {
          type: stryMutAct_9fa48("1672") ? "" : (stryCov_9fa48("1672"), 'log_needs_review'),
          sid: outcome.sid
        });
      }
    }
    if (stryMutAct_9fa48("1675") ? outcome.kind !== 'ambiguous' : stryMutAct_9fa48("1674") ? false : stryMutAct_9fa48("1673") ? true : (stryCov_9fa48("1673", "1674", "1675"), outcome.kind === (stryMutAct_9fa48("1676") ? "" : (stryCov_9fa48("1676"), 'ambiguous')))) {
      if (stryMutAct_9fa48("1677")) {
        {}
      } else {
        stryCov_9fa48("1677");
        return stryMutAct_9fa48("1678") ? {} : (stryCov_9fa48("1678"), {
          type: stryMutAct_9fa48("1679") ? "" : (stryCov_9fa48("1679"), 'log_ambiguous'),
          reason: outcome.reason
        });
      }
    }
    if (stryMutAct_9fa48("1682") ? outcome.kind !== 'sent' : stryMutAct_9fa48("1681") ? false : stryMutAct_9fa48("1680") ? true : (stryCov_9fa48("1680", "1681", "1682"), outcome.kind === (stryMutAct_9fa48("1683") ? "" : (stryCov_9fa48("1683"), 'sent')))) {
      if (stryMutAct_9fa48("1684")) {
        {}
      } else {
        stryCov_9fa48("1684");
        return stryMutAct_9fa48("1685") ? {} : (stryCov_9fa48("1685"), {
          type: stryMutAct_9fa48("1686") ? "" : (stryCov_9fa48("1686"), 'log_sent'),
          sid: outcome.sid
        });
      }
    }
    return stryMutAct_9fa48("1687") ? {} : (stryCov_9fa48("1687"), {
      type: stryMutAct_9fa48("1688") ? "" : (stryCov_9fa48("1688"), 'log_blocked'),
      reason: stryMutAct_9fa48("1689") ? "" : (stryCov_9fa48("1689"), 'unexpected')
    });
  }
}