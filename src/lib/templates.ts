/**
 * SMS Template Library
 * Multi-touch campaign templates organized by urgency level
 */

import { OPT_OUT_FOOTER } from '@/services/opt-out';

export interface SMSTemplate {
  key: string;
  subject: string;
  body: string;
  variables: string[];  // Available variables: {business}, {name}, {issue}
}

/** FCC 26-67 (effective 2026-11-25): include opt-out instruction. */
export { OPT_OUT_FOOTER };

/**
 * Emergency Templates (fast response, urgent tone)
 */
export const EMERGENCY_TEMPLATES: Record<string, SMSTemplate> = {
  emergency_initial: {
    key: 'emergency_initial',
    subject: 'Emergency Response',
    body: `🚨 {business} - We got your call! This sounds urgent. What's the emergency? Reply immediately and we'll prioritize your case.`,
    variables: ['business'],
  },
  emergency_followup_1: {
    key: 'emergency_followup_1',
    subject: 'Emergency Follow-up 1',
    body: `{business} here - Haven't heard back. Is the emergency resolved? If you still need urgent help, reply NOW or call us directly.`,
    variables: ['business'],
  },
  emergency_followup_2: {
    key: 'emergency_followup_2',
    subject: 'Emergency Follow-up 2',
    body: `Final check-in from {business}. We want to make sure you're safe and the issue is handled. Reply if you need anything else.`,
    variables: ['business'],
  },
};

/**
 * High Priority Templates (prompt response, helpful tone)
 */
export const HIGH_PRIORITY_TEMPLATES: Record<string, SMSTemplate> = {
  high_initial: {
    key: 'high_initial',
    subject: 'Urgent Service Request',
    body: `Hi, this is {business}. We missed your call and this sounds important. What can we help with? Reply with details and we'll respond ASAP.`,
    variables: ['business'],
  },
  high_followup_1: {
    key: 'high_followup_1',
    subject: 'High Priority Follow-up 1',
    body: `{business} checking in - We're ready to help with your issue. Reply here or call us back at your convenience.`,
    variables: ['business'],
  },
  high_followup_2: {
    key: 'high_followup_2',
    subject: 'High Priority Follow-up 2',
    body: `Still need service from {business}? We have availability this week. Reply YES and we'll get you scheduled.`,
    variables: ['business'],
  },
  high_followup_3: {
    key: 'high_followup_3',
    subject: 'High Priority Follow-up 3',
    body: `Last check-in from {business}. If you've found another provider, no worries! Otherwise, we're here to help - just reply.`,
    variables: ['business'],
  },
};

/**
 * Standard Templates (friendly, persistent)
 */
export const STANDARD_TEMPLATES: Record<string, SMSTemplate> = {
  standard_initial: {
    key: 'standard_initial',
    subject: 'Missed Call Response',
    body: `Hi, this is {business}. Sorry we missed your call! How can we help you today? Reply here or call us back.`,
    variables: ['business'],
  },
  standard_followup_1: {
    key: 'standard_followup_1',
    subject: 'Follow-up 1',
    body: `{business} here - Just following up! Still need help? Reply with your question or give us a call.`,
    variables: ['business'],
  },
  standard_followup_2: {
    key: 'standard_followup_2',
    subject: 'Follow-up 2',
    body: `Hi from {business}! We're here when you're ready. What can we help you with? Reply anytime.`,
    variables: ['business'],
  },
  standard_followup_3: {
    key: 'standard_followup_3',
    subject: 'Follow-up 3',
    body: `{business} checking in one more time. Need a quote, service, or have questions? We're happy to help - just reply.`,
    variables: ['business'],
  },
  standard_followup_4: {
    key: 'standard_followup_4',
    subject: 'Final Follow-up',
    body: `Last message from {business}. We're always here if you need us in the future. Have a great week!`,
    variables: ['business'],
  },
};

/**
 * All templates combined
 */
export const ALL_TEMPLATES: Record<string, SMSTemplate> = {
  ...EMERGENCY_TEMPLATES,
  ...HIGH_PRIORITY_TEMPLATES,
  ...STANDARD_TEMPLATES,
};

/**
 * Get template by key and personalize with variables
 */
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

  // Replace all variables
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

/**
 * Get template by urgency and step number
 */
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

  // Normal, low, or null
  const keys = [
    'standard_initial',
    'standard_followup_1',
    'standard_followup_2',
    'standard_followup_3',
    'standard_followup_4',
  ];
  return keys[stepNumber - 1] || keys[keys.length - 1];
}
