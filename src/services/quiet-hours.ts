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

export const QUIET_START_HOUR = 8;
export const QUIET_END_HOUR_DEFAULT = 21; // exclusive
export const QUIET_END_HOUR_FL_OK = 20; // exclusive

import { AREA_CODE_ZONES, FL_AREA, OK_AREA } from './quiet-hours-zones';


const VALID_TZ_CACHE = new Map<string, boolean>();

export function isValidTimeZone(tz: string): boolean {
  // Stryker disable next-line ConditionalExpression: cache hit is a pure perf shortcut (same result)
  if (VALID_TZ_CACHE.has(tz)) return VALID_TZ_CACHE.get(tz)!;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    VALID_TZ_CACHE.set(tz, true);
    return true;
  } catch {
    VALID_TZ_CACHE.set(tz, false);
    return false;
  }
}

export function areaCodeFromE164(e164: string): string | null {
  const digits = e164.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1, 4);
  if (digits.length === 10) return digits.slice(0, 3);
  return null;
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
  const ac = opts.callerPhoneE164
    ? areaCodeFromE164(opts.callerPhoneE164)
    : null;
  const endHour = endHourForAreaCode(ac);

  // Explicit lead timezone always wins when valid.
  // Stryker disable next-line StringLiteral: || '' vs non-IANA filler are equivalent (both fail isValidTimeZone)
  const leadTz = opts.leadTimezone?.trim() || '';
  if (leadTz && isValidTimeZone(leadTz)) {
    return {
      zones: [leadTz],
      ambiguous: false,
      known: true,
      endHour,
    };
  }

  const mapped = ac ? AREA_CODE_ZONES[ac] : undefined;
  if (mapped) {
    // Stryker disable next-line MethodExpression: AREA_CODE_ZONES only lists real IANA zones (filter is identity)
    const zones = mapped.filter(isValidTimeZone);
    if (zones.length > 1) {
      // Ambiguous (e.g. 850 ET+CT): require EVERY zone open.
      return { zones, ambiguous: true, known: true, endHour };
    }
    // Stryker disable next-line ConditionalExpression: zones.length===0 unreachable (map never empty after filter)
    if (zones.length === 1) {
      return { zones, ambiguous: false, known: true, endHour };
    }
  }

  // Unmapped / missing area code → UNRESOLVED. Never fall back to business TZ.
  void opts.businessTimezone;
  return { zones: [], ambiguous: false, known: false, endHour };
}

/** @deprecated Prefer resolveLeadTimezones */
export function resolveLeadTimezone(opts: {
  callerPhoneE164?: string | null;
  leadTimezone?: string | null;
  businessTimezone?: string | null;
}): string {
  const r = resolveLeadTimezones(opts);
  return r.zones[0] || 'America/New_York';
}

export function endHourForAreaCode(ac: string | null): number {
  if (ac && (FL_AREA.has(ac) || OK_AREA.has(ac))) return QUIET_END_HOUR_FL_OK;
  return QUIET_END_HOUR_DEFAULT;
}

export function quietEndHourForPhone(callerPhoneE164?: string | null): number {
  const ac = callerPhoneE164 ? areaCodeFromE164(callerPhoneE164) : null;
  return endHourForAreaCode(ac);
}

export function localParts(
  instant: Date,
  timeZone: string
): { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: string } {
  if (!isValidTimeZone(timeZone)) {
    throw new Error(`Invalid time zone: ${timeZone}`);
  }
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(instant).map((p) => [p.type, p.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: String(parts.weekday),
  };
}

export function isWithinQuietHoursWindow(
  instant: Date,
  timeZone: string,
  endHourExclusive: number
): boolean {
  const { hour } = localParts(instant, timeZone);
  return hour >= QUIET_START_HOUR && hour < endHourExclusive;
}

/**
 * Next UTC instant whose local time in `timeZone` is exactly `hour:00:00`,
 * strictly after `from` (or equal if from is already exactly that).
 * Aligns to minute boundaries so 7:59:59 → 8:00:00 (not 8:00:59).
 */
export function nextLocalHour(
  from: Date,
  timeZone: string,
  hour: number
): Date {
  const p0 = localParts(from, timeZone);
  if (p0.hour === hour && p0.minute === 0 && p0.second === 0) return from;

  // Align to the next whole UTC minute (avoids landing on :59 forever).
  // Stryker disable next-line ArithmeticOperator: +1 vs -1 ms is equivalent for IANA zones (see EQUIVALENT.md)
  let t = Math.ceil((from.getTime() + 1) / 60_000) * 60_000;
  for (let i = 0; i < 60 * 50; i++) {
    const p = localParts(new Date(t), timeZone);
    if (p.hour === hour && p.minute === 0) return new Date(t);
    t += 60_000;
  }
  return new Date(from.getTime() + 24 * 60 * 60 * 1000);
}

export type QuietHoursDecision =
  | { allowed: true; zones: string[] }
  | {
      allowed: false;
      nextSendAt: Date;
      zones: string[];
      endHour: number;
      unresolved?: false;
    }
  | {
      allowed: false;
      unresolved: true;
      reason: string;
      zones: string[];
    };

export function deferUntilQuietHoursOpen(
  now: Date,
  opts: {
    callerPhoneE164?: string | null;
    leadTimezone?: string | null;
    businessTimezone?: string | null;
  }
): QuietHoursDecision {
  const resolution = resolveLeadTimezones(opts);
  if (resolution.zones.length === 0) {
    return {
      allowed: false,
      unresolved: true,
      reason: 'no_valid_timezone',
      zones: [],
    };
  }

  // Ambiguous / unknown: every candidate zone must be open.
  const allOpen = resolution.zones.every((tz) =>
    isWithinQuietHoursWindow(now, tz, resolution.endHour)
  );
  if (allOpen) {
    return { allowed: true, zones: resolution.zones };
  }

  // Next send = latest next-open across all zones (when all are open together).
  let next = now;
  for (let guard = 0; guard < 48; guard++) {
    const candidates = resolution.zones.map((tz) =>
      isWithinQuietHoursWindow(next, tz, resolution.endHour)
        ? next
        : nextLocalHour(next, tz, QUIET_START_HOUR)
    );
    const latest = new Date(Math.max(...candidates.map((d) => d.getTime())));
    const ok = resolution.zones.every((tz) =>
      isWithinQuietHoursWindow(latest, tz, resolution.endHour)
    );
    if (ok) {
      return {
        allowed: false,
        nextSendAt: latest,
        zones: resolution.zones,
        endHour: resolution.endHour,
      };
    }
    // Nudge forward 1 minute past latest and retry
    next = new Date(latest.getTime() + 60_000);
  }

  return {
    allowed: false,
    unresolved: true,
    reason: 'cannot_align_windows',
    zones: resolution.zones,
  };
}
