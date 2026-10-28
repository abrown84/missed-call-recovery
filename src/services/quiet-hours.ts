/**
 * Quiet-hours deferral for outbound SMS.
 * 47 CFR 64.1200(c)(1): generally 8:00–21:00 in the called party's local time.
 * Florida & Oklahoma: end at 20:00.
 * Defer (reschedule next_send_at) — never drop.
 */

export const QUIET_START_HOUR = 8;
export const QUIET_END_HOUR_DEFAULT = 21; // exclusive
export const QUIET_END_HOUR_FL_OK = 20; // exclusive

const AREA_CODE_TZ: Record<string, string> = {
  '305': 'America/New_York',
  '321': 'America/New_York',
  '352': 'America/New_York',
  '386': 'America/New_York',
  '407': 'America/New_York',
  '561': 'America/New_York',
  '727': 'America/New_York',
  '754': 'America/New_York',
  '772': 'America/New_York',
  '786': 'America/New_York',
  '813': 'America/New_York',
  '850': 'America/New_York',
  '863': 'America/New_York',
  '904': 'America/New_York',
  '941': 'America/New_York',
  '954': 'America/New_York',
  '405': 'America/Chicago',
  '539': 'America/Chicago',
  '580': 'America/Chicago',
  '918': 'America/Chicago',
  '212': 'America/New_York',
  '213': 'America/Los_Angeles',
  '312': 'America/Chicago',
  '404': 'America/New_York',
  '415': 'America/Los_Angeles',
  '512': 'America/Chicago',
  '602': 'America/Phoenix',
  '617': 'America/New_York',
  '702': 'America/Los_Angeles',
  '713': 'America/Chicago',
  '720': 'America/Denver',
  '801': 'America/Denver',
};

const FL_AREA = new Set([
  '305', '321', '352', '386', '407', '561', '727', '754', '772', '786',
  '813', '850', '863', '904', '941', '954',
]);
const OK_AREA = new Set(['405', '539', '580', '918']);

export function areaCodeFromE164(e164: string): string | null {
  const digits = e164.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1, 4);
  if (digits.length === 10) return digits.slice(0, 3);
  return null;
}

export function resolveLeadTimezone(opts: {
  callerPhoneE164?: string | null;
  leadTimezone?: string | null;
  businessTimezone?: string | null;
}): string {
  if (opts.leadTimezone?.trim()) return opts.leadTimezone.trim();
  const ac = opts.callerPhoneE164
    ? areaCodeFromE164(opts.callerPhoneE164)
    : null;
  if (ac && AREA_CODE_TZ[ac]) return AREA_CODE_TZ[ac];
  if (opts.businessTimezone?.trim()) return opts.businessTimezone.trim();
  return 'America/New_York';
}

export function quietEndHourForPhone(callerPhoneE164?: string | null): number {
  const ac = callerPhoneE164 ? areaCodeFromE164(callerPhoneE164) : null;
  if (ac && (FL_AREA.has(ac) || OK_AREA.has(ac))) return QUIET_END_HOUR_FL_OK;
  return QUIET_END_HOUR_DEFAULT;
}

export function localParts(
  instant: Date,
  timeZone: string
): { year: number; month: number; day: number; hour: number; minute: number; weekday: string } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
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
 * Find the next UTC instant whose local time in `timeZone` is `hour:00:00`,
 * strictly after `from` (or equal if from is already exactly that).
 */
export function nextLocalHour(
  from: Date,
  timeZone: string,
  hour: number
): Date {
  let t = from.getTime();
  const p0 = localParts(from, timeZone);
  if (p0.hour === hour && p0.minute === 0) return from;

  // Walk minute-by-minute up to 50 hours (covers DST long days).
  for (let i = 0; i < 60 * 50; i++) {
    t += 60_000;
    const p = localParts(new Date(t), timeZone);
    if (p.hour === hour && p.minute === 0) return new Date(t);
  }
  return new Date(from.getTime() + 24 * 60 * 60 * 1000);
}

export function deferUntilQuietHoursOpen(
  now: Date,
  opts: {
    callerPhoneE164?: string | null;
    leadTimezone?: string | null;
    businessTimezone?: string | null;
  }
):
  | { allowed: true }
  | {
      allowed: false;
      nextSendAt: Date;
      timeZone: string;
      endHour: number;
    } {
  const timeZone = resolveLeadTimezone(opts);
  const endHour = quietEndHourForPhone(opts.callerPhoneE164);
  if (isWithinQuietHoursWindow(now, timeZone, endHour)) {
    return { allowed: true };
  }
  const nextSendAt = nextLocalHour(now, timeZone, QUIET_START_HOUR);
  return { allowed: false, nextSendAt, timeZone, endHour };
}
