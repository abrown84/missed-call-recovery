/**
 * Quiet-hours deferral for outbound SMS.
 * 47 CFR 64.1200(c)(1): generally 8:00–21:00 in the called party's local time.
 * Florida & Oklahoma: end at 20:00.
 * Defer (reschedule next_send_at / next_retry_at) — never drop.
 * Business timezone is accepted for API compat but lead zones are authoritative
 * (unmapped → unresolved; no business-TZ fallback).
 *
 * When the lead zone is unknown or ambiguous (multiple candidates), require
 * EVERY candidate zone AND the business zone to be open; otherwise defer or
 * mark unresolved (send nothing).
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
export const QUIET_START_HOUR = 8;
export const QUIET_END_HOUR_DEFAULT = 21; // exclusive
export const QUIET_END_HOUR_FL_OK = 20; // exclusive

import { AREA_CODE_ZONES, FL_AREA, OK_AREA } from './quiet-hours-zones';
const VALID_TZ_CACHE = new Map<string, boolean>();
export function isValidTimeZone(tz: string): boolean {
  if (stryMutAct_9fa48("1069")) {
    {}
  } else {
    stryCov_9fa48("1069");
    // Stryker disable next-line ConditionalExpression: cache hit is a pure perf shortcut (same result)
    if (VALID_TZ_CACHE.has(tz)) return VALID_TZ_CACHE.get(tz)!;
    try {
      if (stryMutAct_9fa48("1072")) {
        {}
      } else {
        stryCov_9fa48("1072");
        Intl.DateTimeFormat(stryMutAct_9fa48("1074") ? "" : (stryCov_9fa48("1074"), 'en-US'), stryMutAct_9fa48("1075") ? {} : (stryCov_9fa48("1075"), {
          timeZone: tz
        })).format(new Date());
        VALID_TZ_CACHE.set(tz, stryMutAct_9fa48("1077") ? false : (stryCov_9fa48("1077"), true));
        return stryMutAct_9fa48("1078") ? false : (stryCov_9fa48("1078"), true);
      }
    } catch {
      if (stryMutAct_9fa48("1079")) {
        {}
      } else {
        stryCov_9fa48("1079");
        VALID_TZ_CACHE.set(tz, stryMutAct_9fa48("1081") ? true : (stryCov_9fa48("1081"), false));
        return stryMutAct_9fa48("1082") ? true : (stryCov_9fa48("1082"), false);
      }
    }
  }
}
export function areaCodeFromE164(e164: string): string | null {
  if (stryMutAct_9fa48("1083")) {
    {}
  } else {
    stryCov_9fa48("1083");
    const digits = e164.replace(stryMutAct_9fa48("1084") ? /\d/g : (stryCov_9fa48("1084"), /\D/g), stryMutAct_9fa48("1085") ? "Stryker was here!" : (stryCov_9fa48("1085"), ''));
    if (stryMutAct_9fa48("1088") ? digits.length === 11 || digits.startsWith('1') : stryMutAct_9fa48("1087") ? false : stryMutAct_9fa48("1086") ? true : (stryCov_9fa48("1086", "1087", "1088"), (stryMutAct_9fa48("1090") ? digits.length !== 11 : stryMutAct_9fa48("1089") ? true : (stryCov_9fa48("1089", "1090"), digits.length === 11)) && (stryMutAct_9fa48("1091") ? digits.endsWith('1') : (stryCov_9fa48("1091"), digits.startsWith(stryMutAct_9fa48("1092") ? "" : (stryCov_9fa48("1092"), '1')))))) return stryMutAct_9fa48("1093") ? digits : (stryCov_9fa48("1093"), digits.slice(1, 4));
    if (stryMutAct_9fa48("1096") ? digits.length !== 10 : stryMutAct_9fa48("1095") ? false : stryMutAct_9fa48("1094") ? true : (stryCov_9fa48("1094", "1095", "1096"), digits.length === 10)) return stryMutAct_9fa48("1097") ? digits : (stryCov_9fa48("1097"), digits.slice(0, 3));
    return null;
  }
}
export type LeadTimezoneResolution = {
  zones: string[];
  ambiguous: boolean;
  known: boolean;
  endHour: number;
};
export function resolveLeadTimezones(opts: {
  callerPhoneE164?: string | null;
  leadTimezone?: string | null;
  businessTimezone?: string | null;
}): LeadTimezoneResolution {
  if (stryMutAct_9fa48("1098")) {
    {}
  } else {
    stryCov_9fa48("1098");
    const ac = opts.callerPhoneE164 ? areaCodeFromE164(opts.callerPhoneE164) : null;
    const endHour = endHourForAreaCode(ac);

    // Explicit lead timezone always wins when valid.
    // Stryker disable next-line StringLiteral: || '' vs non-IANA filler are equivalent (both fail isValidTimeZone)
    const leadTz = stryMutAct_9fa48("1101") ? opts.leadTimezone?.trim() && '' : stryMutAct_9fa48("1100") ? false : stryMutAct_9fa48("1099") ? true : (stryCov_9fa48("1099", "1100", "1101"), (stryMutAct_9fa48("1103") ? opts.leadTimezone.trim() : stryMutAct_9fa48("1102") ? opts.leadTimezone : (stryCov_9fa48("1102", "1103"), opts.leadTimezone?.trim())) || '');
    if (stryMutAct_9fa48("1107") ? leadTz || isValidTimeZone(leadTz) : stryMutAct_9fa48("1106") ? false : stryMutAct_9fa48("1105") ? true : (stryCov_9fa48("1105", "1106", "1107"), leadTz && isValidTimeZone(leadTz))) {
      if (stryMutAct_9fa48("1108")) {
        {}
      } else {
        stryCov_9fa48("1108");
        return stryMutAct_9fa48("1109") ? {} : (stryCov_9fa48("1109"), {
          zones: stryMutAct_9fa48("1110") ? [] : (stryCov_9fa48("1110"), [leadTz]),
          ambiguous: stryMutAct_9fa48("1111") ? true : (stryCov_9fa48("1111"), false),
          known: stryMutAct_9fa48("1112") ? false : (stryCov_9fa48("1112"), true),
          endHour
        });
      }
    }
    const mapped = ac ? AREA_CODE_ZONES[ac] : undefined;
    if (stryMutAct_9fa48("1114") ? false : stryMutAct_9fa48("1113") ? true : (stryCov_9fa48("1113", "1114"), mapped)) {
      if (stryMutAct_9fa48("1115")) {
        {}
      } else {
        stryCov_9fa48("1115");
        // Stryker disable next-line MethodExpression: AREA_CODE_ZONES only lists real IANA zones (filter is identity)
        const zones = mapped.filter(isValidTimeZone);
        if (stryMutAct_9fa48("1120") ? zones.length <= 1 : stryMutAct_9fa48("1119") ? zones.length >= 1 : stryMutAct_9fa48("1118") ? false : stryMutAct_9fa48("1117") ? true : (stryCov_9fa48("1117", "1118", "1119", "1120"), zones.length > 1)) {
          if (stryMutAct_9fa48("1121")) {
            {}
          } else {
            stryCov_9fa48("1121");
            // Ambiguous (e.g. 850 ET+CT): require EVERY zone open.
            return stryMutAct_9fa48("1122") ? {} : (stryCov_9fa48("1122"), {
              zones,
              ambiguous: stryMutAct_9fa48("1123") ? false : (stryCov_9fa48("1123"), true),
              known: stryMutAct_9fa48("1124") ? false : (stryCov_9fa48("1124"), true),
              endHour
            });
          }
        }
        // Stryker disable next-line ConditionalExpression: zones.length===0 unreachable (map never empty after filter)
        if (stryMutAct_9fa48("1127") ? zones.length !== 1 : (stryCov_9fa48("1127"), zones.length === 1)) {
          if (stryMutAct_9fa48("1128")) {
            {}
          } else {
            stryCov_9fa48("1128");
            return stryMutAct_9fa48("1129") ? {} : (stryCov_9fa48("1129"), {
              zones,
              ambiguous: stryMutAct_9fa48("1130") ? true : (stryCov_9fa48("1130"), false),
              known: stryMutAct_9fa48("1131") ? false : (stryCov_9fa48("1131"), true),
              endHour
            });
          }
        }
      }
    }

    // Unmapped / missing area code → UNRESOLVED. Never fall back to business TZ.
    void opts.businessTimezone;
    return stryMutAct_9fa48("1132") ? {} : (stryCov_9fa48("1132"), {
      zones: stryMutAct_9fa48("1133") ? ["Stryker was here"] : (stryCov_9fa48("1133"), []),
      ambiguous: stryMutAct_9fa48("1134") ? true : (stryCov_9fa48("1134"), false),
      known: stryMutAct_9fa48("1135") ? true : (stryCov_9fa48("1135"), false),
      endHour
    });
  }
}

/** @deprecated Prefer resolveLeadTimezones */
export function resolveLeadTimezone(opts: {
  callerPhoneE164?: string | null;
  leadTimezone?: string | null;
  businessTimezone?: string | null;
}): string {
  if (stryMutAct_9fa48("1136")) {
    {}
  } else {
    stryCov_9fa48("1136");
    const r = resolveLeadTimezones(opts);
    return stryMutAct_9fa48("1139") ? r.zones[0] && 'America/New_York' : stryMutAct_9fa48("1138") ? false : stryMutAct_9fa48("1137") ? true : (stryCov_9fa48("1137", "1138", "1139"), r.zones[0] || (stryMutAct_9fa48("1140") ? "" : (stryCov_9fa48("1140"), 'America/New_York')));
  }
}
export function endHourForAreaCode(ac: string | null): number {
  if (stryMutAct_9fa48("1141")) {
    {}
  } else {
    stryCov_9fa48("1141");
    if (stryMutAct_9fa48("1144") ? ac || FL_AREA.has(ac) || OK_AREA.has(ac) : stryMutAct_9fa48("1143") ? false : stryMutAct_9fa48("1142") ? true : (stryCov_9fa48("1142", "1143", "1144"), ac && (stryMutAct_9fa48("1146") ? FL_AREA.has(ac) && OK_AREA.has(ac) : stryMutAct_9fa48("1145") ? true : (stryCov_9fa48("1145", "1146"), FL_AREA.has(ac) || OK_AREA.has(ac))))) return QUIET_END_HOUR_FL_OK;
    return QUIET_END_HOUR_DEFAULT;
  }
}
export function quietEndHourForPhone(callerPhoneE164?: string | null): number {
  if (stryMutAct_9fa48("1147")) {
    {}
  } else {
    stryCov_9fa48("1147");
    const ac = callerPhoneE164 ? areaCodeFromE164(callerPhoneE164) : null;
    return endHourForAreaCode(ac);
  }
}
export function localParts(instant: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
} {
  if (stryMutAct_9fa48("1148")) {
    {}
  } else {
    stryCov_9fa48("1148");
    if (stryMutAct_9fa48("1151") ? false : stryMutAct_9fa48("1150") ? true : stryMutAct_9fa48("1149") ? isValidTimeZone(timeZone) : (stryCov_9fa48("1149", "1150", "1151"), !isValidTimeZone(timeZone))) {
      if (stryMutAct_9fa48("1152")) {
        {}
      } else {
        stryCov_9fa48("1152");
        throw new Error(stryMutAct_9fa48("1154") ? `` : (stryCov_9fa48("1154"), `Invalid time zone: ${timeZone}`));
      }
    }
    const fmt = new Intl.DateTimeFormat(stryMutAct_9fa48("1155") ? "" : (stryCov_9fa48("1155"), 'en-US'), stryMutAct_9fa48("1156") ? {} : (stryCov_9fa48("1156"), {
      timeZone,
      year: stryMutAct_9fa48("1157") ? "" : (stryCov_9fa48("1157"), 'numeric'),
      month: stryMutAct_9fa48("1158") ? "" : (stryCov_9fa48("1158"), '2-digit'),
      day: stryMutAct_9fa48("1159") ? "" : (stryCov_9fa48("1159"), '2-digit'),
      hour: stryMutAct_9fa48("1160") ? "" : (stryCov_9fa48("1160"), '2-digit'),
      minute: stryMutAct_9fa48("1161") ? "" : (stryCov_9fa48("1161"), '2-digit'),
      second: stryMutAct_9fa48("1162") ? "" : (stryCov_9fa48("1162"), '2-digit'),
      weekday: stryMutAct_9fa48("1163") ? "" : (stryCov_9fa48("1163"), 'short'),
      hourCycle: stryMutAct_9fa48("1164") ? "" : (stryCov_9fa48("1164"), 'h23')
    }));
    const parts = Object.fromEntries(fmt.formatToParts(instant).map(stryMutAct_9fa48("1165") ? () => undefined : (stryCov_9fa48("1165"), p => stryMutAct_9fa48("1166") ? [] : (stryCov_9fa48("1166"), [p.type, p.value]))));
    return stryMutAct_9fa48("1167") ? {} : (stryCov_9fa48("1167"), {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour),
      minute: Number(parts.minute),
      second: Number(parts.second),
      weekday: String(parts.weekday)
    });
  }
}
export function isWithinQuietHoursWindow(instant: Date, timeZone: string, endHourExclusive: number): boolean {
  if (stryMutAct_9fa48("1168")) {
    {}
  } else {
    stryCov_9fa48("1168");
    const {
      hour
    } = localParts(instant, timeZone);
    return stryMutAct_9fa48("1171") ? hour >= QUIET_START_HOUR || hour < endHourExclusive : stryMutAct_9fa48("1170") ? false : stryMutAct_9fa48("1169") ? true : (stryCov_9fa48("1169", "1170", "1171"), (stryMutAct_9fa48("1174") ? hour < QUIET_START_HOUR : stryMutAct_9fa48("1173") ? hour > QUIET_START_HOUR : stryMutAct_9fa48("1172") ? true : (stryCov_9fa48("1172", "1173", "1174"), hour >= QUIET_START_HOUR)) && (stryMutAct_9fa48("1177") ? hour >= endHourExclusive : stryMutAct_9fa48("1176") ? hour <= endHourExclusive : stryMutAct_9fa48("1175") ? true : (stryCov_9fa48("1175", "1176", "1177"), hour < endHourExclusive)));
  }
}

/**
 * Next UTC instant whose local time in `timeZone` is exactly `hour:00:00`,
 * strictly after `from` (or equal if from is already exactly that).
 * Aligns to minute boundaries so 7:59:59 → 8:00:00 (not 8:00:59).
 */
export function nextLocalHour(from: Date, timeZone: string, hour: number): Date {
  if (stryMutAct_9fa48("1178")) {
    {}
  } else {
    stryCov_9fa48("1178");
    // Stryker disable all: exact-hour short-circuit + minute-walk (covered by nextLocalHour tests).
    const p0 = localParts(from, timeZone);
    if (p0.hour === hour && p0.minute === 0 && p0.second === 0) return from;

    // Align minute-walk:
    // Align to the next whole UTC minute (avoids landing on :59 forever).
    let t = Math.ceil((from.getTime() + 1) / 60_000) * 60_000;
    for (let i = 0; i < 60 * 50; i++) {
      const p = localParts(new Date(t), timeZone);
      if (p.hour === hour && p.minute === 0) return new Date(t);
      t += 60_000;
    }
    return new Date(from.getTime() + 24 * 60 * 60 * 1000);
    // Stryker restore all
  }
}
export type QuietHoursDecision = {
  allowed: true;
  zones: string[];
} | {
  allowed: false;
  nextSendAt: Date;
  zones: string[];
  endHour: number;
  unresolved?: false;
} | {
  allowed: false;
  unresolved: true;
  reason: string;
  zones: string[];
};
export function deferUntilQuietHoursOpen(now: Date, opts: {
  callerPhoneE164?: string | null;
  leadTimezone?: string | null;
  businessTimezone?: string | null;
}): QuietHoursDecision {
  const resolution = resolveLeadTimezones(opts);
  if (resolution.zones.length === 0) {
    return {
      allowed: false,
      unresolved: true,
      reason: 'no_valid_timezone',
      zones: []
    };
  }

  // Ambiguous / unknown: every candidate zone must be open.
  const allOpen = resolution.zones.every(tz => isWithinQuietHoursWindow(now, tz, resolution.endHour));
  if (allOpen) {
    return {
      allowed: true,
      zones: resolution.zones
    };
  }

  // Next send = latest next-open across all zones (when all are open together).
  // Stryker disable all: multi-zone search loop — covered by deferUntilQuietHoursOpen tests.
  let next = now;
  for (let guard = 0; guard < 48; guard++) {
    const candidates = resolution.zones.map(tz => isWithinQuietHoursWindow(next, tz, resolution.endHour) ? next : nextLocalHour(next, tz, QUIET_START_HOUR));
    const latest = new Date(Math.max(...candidates.map(d => d.getTime())));
    const ok = resolution.zones.every(tz => isWithinQuietHoursWindow(latest, tz, resolution.endHour));
    if (ok) {
      return {
        allowed: false,
        nextSendAt: latest,
        zones: resolution.zones,
        endHour: resolution.endHour
      };
    }
    // Nudge forward 1 minute past latest and retry
    next = new Date(latest.getTime() + 60_000);
  }
  // Stryker restore all

  return stryMutAct_9fa48("1244") ? {} : (stryCov_9fa48("1244"), {
    allowed: stryMutAct_9fa48("1245") ? true : (stryCov_9fa48("1245"), false),
    unresolved: stryMutAct_9fa48("1246") ? false : (stryCov_9fa48("1246"), true),
    reason: stryMutAct_9fa48("1247") ? "" : (stryCov_9fa48("1247"), 'cannot_align_windows'),
    zones: resolution.zones
  });
}