/**
 * Quiet-hours deferral for outbound SMS.
 * 47 CFR 64.1200(c)(1): generally 8:00–21:00 in the called party's local time.
 * Florida & Oklahoma: end at 20:00.
 * Defer (reschedule next_send_at) — never drop.
 *
 * When the lead zone is unknown or ambiguous (multiple candidates), require
 * EVERY candidate zone AND the business zone to be open; otherwise defer or
 * mark unresolved (send nothing).
 */

export const QUIET_START_HOUR = 8;
export const QUIET_END_HOUR_DEFAULT = 21; // exclusive
export const QUIET_END_HOUR_FL_OK = 20; // exclusive

/** NANP area code → IANA zone(s). Multiple = ambiguous (require all open). */
const AREA_CODE_ZONES: Record<string, string[]> = {
  // Florida (Eastern except panhandle 850 → Central)
  '239': ['America/New_York'],
  '305': ['America/New_York'],
  '321': ['America/New_York'],
  '352': ['America/New_York'],
  '386': ['America/New_York'],
  '407': ['America/New_York'],
  '448': ['America/New_York'],
  '561': ['America/New_York'],
  '645': ['America/New_York'],
  '656': ['America/New_York'],
  '689': ['America/New_York'],
  '727': ['America/New_York'],
  '728': ['America/New_York'],
  '754': ['America/New_York'],
  '772': ['America/New_York'],
  '786': ['America/New_York'],
  '813': ['America/New_York'],
  '850': ['America/Chicago'], // FL panhandle (Central)
  '863': ['America/New_York'],
  '904': ['America/New_York'],
  '941': ['America/New_York'],
  '954': ['America/New_York'],
  // Oklahoma
  '405': ['America/Chicago'],
  '539': ['America/Chicago'],
  '572': ['America/Chicago'],
  '580': ['America/Chicago'],
  '918': ['America/Chicago'],
  // Hawaii / Alaska
  '808': ['Pacific/Honolulu'],
  '907': ['America/Anchorage'],
  // Major US (sample + common)
  '201': ['America/New_York'],
  '202': ['America/New_York'],
  '203': ['America/New_York'],
  '205': ['America/Chicago'],
  '206': ['America/Los_Angeles'],
  '207': ['America/New_York'],
  '208': ['America/Denver', 'America/Los_Angeles'], // ID ambiguous
  '209': ['America/Los_Angeles'],
  '210': ['America/Chicago'],
  '212': ['America/New_York'],
  '213': ['America/Los_Angeles'],
  '214': ['America/Chicago'],
  '215': ['America/New_York'],
  '216': ['America/New_York'],
  '217': ['America/Chicago'],
  '218': ['America/Chicago'],
  '219': ['America/Chicago', 'America/New_York'], // NW IN ambiguous
  '224': ['America/Chicago'],
  '225': ['America/Chicago'],
  '228': ['America/Chicago'],
  '229': ['America/New_York'],
  '231': ['America/New_York', 'America/Chicago'],
  '234': ['America/New_York'],
  '240': ['America/New_York'],
  '248': ['America/New_York'],
  '251': ['America/Chicago'],
  '252': ['America/New_York'],
  '253': ['America/Los_Angeles'],
  '254': ['America/Chicago'],
  '256': ['America/Chicago'],
  '260': ['America/New_York', 'America/Chicago'],
  '262': ['America/Chicago'],
  '267': ['America/New_York'],
  '269': ['America/New_York', 'America/Chicago'],
  '270': ['America/New_York', 'America/Chicago'],
  '272': ['America/New_York'],
  '276': ['America/New_York'],
  '281': ['America/Chicago'],
  '301': ['America/New_York'],
  '302': ['America/New_York'],
  '303': ['America/Denver'],
  '304': ['America/New_York'],
  '307': ['America/Denver'],
  '308': ['America/Chicago', 'America/Denver'],
  '309': ['America/Chicago'],
  '310': ['America/Los_Angeles'],
  '312': ['America/Chicago'],
  '313': ['America/New_York'],
  '314': ['America/Chicago'],
  '315': ['America/New_York'],
  '316': ['America/Chicago'],
  '317': ['America/New_York', 'America/Chicago'],
  '318': ['America/Chicago'],
  '319': ['America/Chicago'],
  '320': ['America/Chicago'],
  '323': ['America/Los_Angeles'],
  '325': ['America/Chicago'],
  '330': ['America/New_York'],
  '331': ['America/Chicago'],
  '332': ['America/New_York'],
  '334': ['America/Chicago'],
  '336': ['America/New_York'],
  '337': ['America/Chicago'],
  '339': ['America/New_York'],
  '340': ['America/St_Thomas'],
  '341': ['America/Los_Angeles'],
  '346': ['America/Chicago'],
  '347': ['America/New_York'],
  '351': ['America/New_York'],
  '360': ['America/Los_Angeles'],
  '361': ['America/Chicago'],
  '364': ['America/New_York', 'America/Chicago'],
  '380': ['America/New_York'],
  '385': ['America/Denver'],
  '401': ['America/New_York'],
  '402': ['America/Chicago'],
  '404': ['America/New_York'],
  '406': ['America/Denver'],
  '408': ['America/Los_Angeles'],
  '409': ['America/Chicago'],
  '410': ['America/New_York'],
  '412': ['America/New_York'],
  '413': ['America/New_York'],
  '414': ['America/Chicago'],
  '415': ['America/Los_Angeles'],
  '417': ['America/Chicago'],
  '419': ['America/New_York'],
  '423': ['America/New_York'],
  '424': ['America/Los_Angeles'],
  '425': ['America/Los_Angeles'],
  '430': ['America/Chicago'],
  '432': ['America/Chicago'],
  '434': ['America/New_York'],
  '435': ['America/Denver'],
  '440': ['America/New_York'],
  '442': ['America/Los_Angeles'],
  '443': ['America/New_York'],
  '445': ['America/New_York'],
  '458': ['America/Los_Angeles'],
  '463': ['America/New_York', 'America/Chicago'],
  '469': ['America/Chicago'],
  '470': ['America/New_York'],
  '475': ['America/New_York'],
  '478': ['America/New_York'],
  '479': ['America/Chicago'],
  '480': ['America/Phoenix'],
  '484': ['America/New_York'],
  '501': ['America/Chicago'],
  '502': ['America/New_York', 'America/Chicago'],
  '503': ['America/Los_Angeles'],
  '504': ['America/Chicago'],
  '505': ['America/Denver'],
  '507': ['America/Chicago'],
  '508': ['America/New_York'],
  '509': ['America/Los_Angeles'],
  '510': ['America/Los_Angeles'],
  '512': ['America/Chicago'],
  '513': ['America/New_York'],
  '515': ['America/Chicago'],
  '516': ['America/New_York'],
  '517': ['America/New_York'],
  '518': ['America/New_York'],
  '520': ['America/Phoenix'],
  '530': ['America/Los_Angeles'],
  '531': ['America/Chicago'],
  '534': ['America/Chicago'],
  '540': ['America/New_York'],
  '541': ['America/Los_Angeles'],
  '551': ['America/New_York'],
  '559': ['America/Los_Angeles'],
  '562': ['America/Los_Angeles'],
  '563': ['America/Chicago'],
  '567': ['America/New_York'],
  '570': ['America/New_York'],
  '571': ['America/New_York'],
  '573': ['America/Chicago'],
  '574': ['America/New_York', 'America/Chicago'],
  '575': ['America/Denver'],
  '585': ['America/New_York'],
  '586': ['America/New_York'],
  '601': ['America/Chicago'],
  '602': ['America/Phoenix'],
  '603': ['America/New_York'],
  '605': ['America/Chicago'],
  '606': ['America/New_York'],
  '607': ['America/New_York'],
  '608': ['America/Chicago'],
  '609': ['America/New_York'],
  '610': ['America/New_York'],
  '612': ['America/Chicago'],
  '614': ['America/New_York'],
  '615': ['America/Chicago'],
  '616': ['America/New_York'],
  '617': ['America/New_York'],
  '618': ['America/Chicago'],
  '619': ['America/Los_Angeles'],
  '620': ['America/Chicago'],
  '623': ['America/Phoenix'],
  '626': ['America/Los_Angeles'],
  '628': ['America/Los_Angeles'],
  '629': ['America/Chicago'],
  '630': ['America/Chicago'],
  '631': ['America/New_York'],
  '636': ['America/Chicago'],
  '641': ['America/Chicago'],
  '646': ['America/New_York'],
  '650': ['America/Los_Angeles'],
  '651': ['America/Chicago'],
  '657': ['America/Los_Angeles'],
  '660': ['America/Chicago'],
  '661': ['America/Los_Angeles'],
  '662': ['America/Chicago'],
  '667': ['America/New_York'],
  '669': ['America/Los_Angeles'],
  '678': ['America/New_York'],
  '681': ['America/New_York'],
  '682': ['America/Chicago'],
  '701': ['America/Chicago'],
  '702': ['America/Los_Angeles'],
  '703': ['America/New_York'],
  '704': ['America/New_York'],
  '706': ['America/New_York'],
  '707': ['America/Los_Angeles'],
  '708': ['America/Chicago'],
  '712': ['America/Chicago'],
  '713': ['America/Chicago'],
  '714': ['America/Los_Angeles'],
  '715': ['America/Chicago'],
  '716': ['America/New_York'],
  '717': ['America/New_York'],
  '718': ['America/New_York'],
  '719': ['America/Denver'],
  '720': ['America/Denver'],
  '724': ['America/New_York'],
  '725': ['America/Los_Angeles'],
  '726': ['America/Chicago'],
  '731': ['America/Chicago'],
  '732': ['America/New_York'],
  '734': ['America/New_York'],
  '737': ['America/Chicago'],
  '740': ['America/New_York'],
  '743': ['America/New_York'],
  '747': ['America/Los_Angeles'],
  '757': ['America/New_York'],
  '760': ['America/Los_Angeles'],
  '762': ['America/New_York'],
  '763': ['America/Chicago'],
  '765': ['America/New_York', 'America/Chicago'],
  '769': ['America/Chicago'],
  '770': ['America/New_York'],
  '773': ['America/Chicago'],
  '774': ['America/New_York'],
  '775': ['America/Los_Angeles'],
  '779': ['America/Chicago'],
  '781': ['America/New_York'],
  '785': ['America/Chicago'],
  '801': ['America/Denver'],
  '802': ['America/New_York'],
  '803': ['America/New_York'],
  '804': ['America/New_York'],
  '805': ['America/Los_Angeles'],
  '806': ['America/Chicago'],
  '810': ['America/New_York'],
  '812': ['America/New_York', 'America/Chicago'],
  '814': ['America/New_York'],
  '815': ['America/Chicago'],
  '816': ['America/Chicago'],
  '817': ['America/Chicago'],
  '818': ['America/Los_Angeles'],
  '828': ['America/New_York'],
  '830': ['America/Chicago'],
  '831': ['America/Los_Angeles'],
  '832': ['America/Chicago'],
  '843': ['America/New_York'],
  '845': ['America/New_York'],
  '847': ['America/Chicago'],
  '848': ['America/New_York'],
  '854': ['America/New_York'],
  '856': ['America/New_York'],
  '857': ['America/New_York'],
  '858': ['America/Los_Angeles'],
  '859': ['America/New_York'],
  '860': ['America/New_York'],
  '862': ['America/New_York'],
  '864': ['America/New_York'],
  '865': ['America/New_York'],
  '870': ['America/Chicago'],
  '872': ['America/Chicago'],
  '878': ['America/New_York'],
  '901': ['America/Chicago'],
  '903': ['America/Chicago'],
  '906': ['America/New_York', 'America/Chicago'],
  '908': ['America/New_York'],
  '909': ['America/Los_Angeles'],
  '910': ['America/New_York'],
  '912': ['America/New_York'],
  '913': ['America/Chicago'],
  '914': ['America/New_York'],
  '915': ['America/Denver'],
  '916': ['America/Los_Angeles'],
  '917': ['America/New_York'],
  '919': ['America/New_York'],
  '920': ['America/Chicago'],
  '925': ['America/Los_Angeles'],
  '928': ['America/Phoenix'],
  '929': ['America/New_York'],
  '930': ['America/New_York', 'America/Chicago'],
  '931': ['America/Chicago'],
  '936': ['America/Chicago'],
  '937': ['America/New_York'],
  '938': ['America/Chicago'],
  '940': ['America/Chicago'],
  '947': ['America/New_York'],
  '949': ['America/Los_Angeles'],
  '951': ['America/Los_Angeles'],
  '952': ['America/Chicago'],
  '956': ['America/Chicago'],
  '959': ['America/New_York'],
  '970': ['America/Denver'],
  '971': ['America/Los_Angeles'],
  '972': ['America/Chicago'],
  '973': ['America/New_York'],
  '978': ['America/New_York'],
  '979': ['America/Chicago'],
  '980': ['America/New_York'],
  '984': ['America/New_York'],
  '985': ['America/Chicago'],
  '989': ['America/New_York'],
};

const FL_AREA = new Set([
  '239', '305', '321', '352', '386', '407', '448', '561', '645', '656', '689',
  '727', '728', '754', '772', '786', '813', '850', '863', '904', '941', '954',
]);
const OK_AREA = new Set(['405', '539', '572', '580', '918']);

const VALID_TZ_CACHE = new Map<string, boolean>();

export function isValidTimeZone(tz: string): boolean {
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
  const endHour =
    ac && (FL_AREA.has(ac) || OK_AREA.has(ac))
      ? QUIET_END_HOUR_FL_OK
      : QUIET_END_HOUR_DEFAULT;

  if (opts.leadTimezone?.trim() && isValidTimeZone(opts.leadTimezone.trim())) {
    return {
      zones: [opts.leadTimezone.trim()],
      ambiguous: false,
      known: true,
      endHour,
    };
  }

  if (ac && AREA_CODE_ZONES[ac]) {
    const zones = AREA_CODE_ZONES[ac].filter(isValidTimeZone);
    if (zones.length === 1) {
      return { zones, ambiguous: false, known: true, endHour };
    }
    if (zones.length > 1) {
      const biz = opts.businessTimezone?.trim();
      const all = [...zones];
      if (biz && isValidTimeZone(biz) && !all.includes(biz)) all.push(biz);
      return { zones: all, ambiguous: true, known: true, endHour };
    }
  }

  // Unknown area code — require business TZ if valid; else unresolved
  const biz = opts.businessTimezone?.trim();
  if (biz && isValidTimeZone(biz)) {
    return { zones: [biz], ambiguous: false, known: false, endHour };
  }
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

export function quietEndHourForPhone(callerPhoneE164?: string | null): number {
  const ac = callerPhoneE164 ? areaCodeFromE164(callerPhoneE164) : null;
  if (ac && (FL_AREA.has(ac) || OK_AREA.has(ac))) return QUIET_END_HOUR_FL_OK;
  return QUIET_END_HOUR_DEFAULT;
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
