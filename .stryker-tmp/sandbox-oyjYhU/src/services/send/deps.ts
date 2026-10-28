/**
 * Injectable dependencies for the send I/O shell.
 * Production uses defaultDeps(); tests inject fakes.
 */
// @ts-nocheck


import { createServerClient } from '@/lib/supabase';
import { getMessagingAdapter, type MessagingAdapter } from '@/lib/messaging';
import {
  ensureRelayKeySupportProbed,
  warnIfRelayLookupUnsupported,
} from '@/lib/messaging/brwn-relay';
import {
  SuppressionLookupError,
  isPhoneSuppressed,
} from '@/services/suppressions';
import { deferUntilQuietHoursOpen } from '@/services/quiet-hours';
import { isRelayKeySupportConfirmed } from '@/services/sms-sid';
import { isSendsEnabled } from './policy';
import type { QuietHoursInput } from './decisions';

export type SupabaseClient = ReturnType<typeof createServerClient>;

export type SendDeps = {
  db: () => SupabaseClient;
  adapter: () => MessagingAdapter;
  clock: () => Date;
  sendsEnabled: () => boolean;
  isPhoneSuppressed: (
    businessId: string,
    phone: string
  ) => Promise<boolean>;
  SuppressionLookupError: typeof SuppressionLookupError;
  quietHours: (
    now: Date,
    opts: {
      callerPhoneE164: string;
      leadTimezone: string | null;
      businessTimezone?: string | null;
    }
  ) => QuietHoursInput;
  capsConfirmed: () => boolean;
  ensureCaps: (adapter: MessagingAdapter) => Promise<boolean>;
  warnLookupUnsupported: (
    adapter: MessagingAdapter
  ) => Promise<unknown>;
};

export function defaultSendDeps(): SendDeps {
  return {
    db: () => createServerClient(),
    adapter: () => getMessagingAdapter(),
    clock: () => new Date(),
    sendsEnabled: () => isSendsEnabled(),
    isPhoneSuppressed,
    SuppressionLookupError,
    quietHours: (now, opts) => deferUntilQuietHoursOpen(now, opts),
    capsConfirmed: () => isRelayKeySupportConfirmed(),
    ensureCaps: (adapter) => ensureRelayKeySupportProbed(adapter),
    warnLookupUnsupported: (adapter) => warnIfRelayLookupUnsupported(adapter),
  };
}
