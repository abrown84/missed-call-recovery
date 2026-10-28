/**
 * SMS Template Library
 * Multi-touch campaign templates organized by urgency level.
 * Bodies are trimmed so body + STOP footer fit one GSM-7 segment (≤160).
 */

import { OPT_OUT_FOOTER } from '@/services/opt-out';

export interface SMSTemplate {
  key: string;
  subject: string;
  body: string;
  variables: string[]; // Available variables: {business}, {name}, {issue}
}

/** FCC 26-67 (effective 2026-11-25): include opt-out instruction. */
export { OPT_OUT_FOOTER };

/** GSM-7 single-segment limit. */
export const GSM7_SEGMENT_LIMIT = 160;

/**
 * Emergency Templates — kept short for one GSM-7 segment with STOP footer.
 */
export const EMERGENCY_TEMPLATES: Record<string, SMSTemplate> = {
  emergency_initial: {
    key: 'emergency_initial',
    subject: 'Emergency Response',
    body: `{business}: we got your call - this sounds urgent. What's the emergency? Reply now and we'll prioritize.`,
    variables: ['business'],
  },
  emergency_followup_1: {
    key: 'emergency_followup_1',
    subject: 'Emergency Follow-up 1',
    body: `{business}: haven't heard back. Is the emergency resolved? Reply NOW if you still need help.`,
    variables: ['business'],
  },
  emergency_followup_2: {
    key: 'emergency_followup_2',
    subject: 'Emergency Follow-up 2',
    body: `Final check from {business}. Want to make sure you're safe. Reply if you need anything.`,
    variables: ['business'],
  },
};

export const HIGH_PRIORITY_TEMPLATES: Record<string, SMSTemplate> = {
  high_initial: {
    key: 'high_initial',
    subject: 'Urgent Service Request',
    body: `Hi, {business} here - we missed your call. What can we help with? Reply with details.`,
    variables: ['business'],
  },
  high_followup_1: {
    key: 'high_followup_1',
    subject: 'High Priority Follow-up 1',
    body: `{business} checking in - ready to help. Reply here or call us back.`,
    variables: ['business'],
  },
  high_followup_2: {
    key: 'high_followup_2',
    subject: 'High Priority Follow-up 2',
    body: `Still need {business}? We have availability this week. Reply YES to schedule.`,
    variables: ['business'],
  },
  high_followup_3: {
    key: 'high_followup_3',
    subject: 'High Priority Follow-up 3',
    body: `Last check-in from {business}. If you've found help, no worries - otherwise reply anytime.`,
    variables: ['business'],
  },
};

export const STANDARD_TEMPLATES: Record<string, SMSTemplate> = {
  standard_initial: {
    key: 'standard_initial',
    subject: 'Missed Call Response',
    body: `Hi, this is {business}. Sorry we missed your call! How can we help? Reply or call us back.`,
    variables: ['business'],
  },
  standard_followup_1: {
    key: 'standard_followup_1',
    subject: 'Follow-up 1',
    body: `{business} here - just following up! Still need help? Reply with your question.`,
    variables: ['business'],
  },
  standard_followup_2: {
    key: 'standard_followup_2',
    subject: 'Follow-up 2',
    body: `Hi from {business}! We're here when you're ready. What can we help with?`,
    variables: ['business'],
  },
  standard_followup_3: {
    key: 'standard_followup_3',
    subject: 'Follow-up 3',
    body: `{business} checking in. Need a quote or service? Happy to help - just reply.`,
    variables: ['business'],
  },
  standard_followup_4: {
    key: 'standard_followup_4',
    subject: 'Final Follow-up',
    body: `Last note from {business}. We're here if you need us later. Have a great week!`,
    variables: ['business'],
  },
};

export const ALL_TEMPLATES: Record<string, SMSTemplate> = {
  ...EMERGENCY_TEMPLATES,
  ...HIGH_PRIORITY_TEMPLATES,
  ...STANDARD_TEMPLATES,
};

/** Rough GSM-7 length (escapes count as 2). Non-GSM chars inflate toward UCS-2. */
export function gsm7Length(text: string): number {
  const gsm =
    '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
    '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
  const ext = '^{}\\[~]|€';
  let len = 0;
  for (const ch of text) {
    if (gsm.includes(ch)) len += 1;
    else if (ext.includes(ch)) len += 2;
    else return Infinity; // forces UCS-2 path in segmentCount
  }
  return len;
}

export function smsSegmentCount(text: string): number {
  const gsmLen = gsm7Length(text);
  if (gsmLen !== Infinity) {
    if (gsmLen <= 160) return 1;
    return Math.ceil(gsmLen / 153);
  }
  // UCS-2
  const n = [...text].length;
  if (n <= 70) return 1;
  return Math.ceil(n / 67);
}

export function getTemplate(
  templateKey: string,
  variables: Record<string, string>
): string {
  const template = ALL_TEMPLATES[templateKey];

  if (!template) {
    console.warn(`Template not found: ${templateKey}, using fallback`);
    return appendOptOutFooter(
      `Hi, this is ${variables.business}. We missed your call. How can we help?`
    );
  }

  let message = template.body;
  for (const [key, value] of Object.entries(variables)) {
    message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }

  return appendOptOutFooter(message);
}

/** Ensure FCC 26-67 STOP line is present exactly once. */
export function appendOptOutFooter(body: string): string {
  const trimmed = body.trimEnd();
  if (trimmed.includes(OPT_OUT_FOOTER)) return trimmed;
  return `${trimmed}\n${OPT_OUT_FOOTER}`;
}

export function getTemplateByUrgency(
  urgency: 'emergency' | 'high' | 'normal' | 'low' | null,
  stepNumber: number
): string {
  if (urgency === 'emergency') {
    const keys = ['emergency_initial', 'emergency_followup_1', 'emergency_followup_2'];
    return keys[stepNumber - 1] || keys[keys.length - 1];
  }

  if (urgency === 'high') {
    const keys = ['high_initial', 'high_followup_1', 'high_followup_2', 'high_followup_3'];
    return keys[stepNumber - 1] || keys[keys.length - 1];
  }

  const keys = [
    'standard_initial',
    'standard_followup_1',
    'standard_followup_2',
    'standard_followup_3',
    'standard_followup_4',
  ];
  return keys[stepNumber - 1] || keys[keys.length - 1];
}
