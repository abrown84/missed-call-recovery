/**
 * Injectable dependencies for the campaign I/O shell.
 * Production uses defaultCampaignDeps(); tests inject fakes.
 */

import { createServerClient } from '@/lib/supabase';
import { getMessagingAdapter, type MessagingAdapter } from '@/lib/messaging';
import {
  SuppressionLookupError,
  isPhoneSuppressed,
} from '@/services/suppressions';
import { sendMessage } from '@/services/send';
import { processDeferredRecoveries, sendRecoverySMS } from '@/services/sms';
import { notifyUnresolvedTimezone } from '@/services/escalation';
import { getTemplate } from '@/lib/templates';
import { randomUUID } from 'crypto';
import type { Database } from '@/types/database';

export type SupabaseClient = ReturnType<typeof createServerClient>;
type Business = Database['public']['Tables']['businesses']['Row'];

export type CampaignDeps = {
  db: () => SupabaseClient;
  clock: () => Date;
  adapter: () => MessagingAdapter;
  sendMessage: typeof sendMessage;
  sendRecoverySMS: typeof sendRecoverySMS;
  processDeferredRecoveries: typeof processDeferredRecoveries;
  isPhoneSuppressed: (
    businessId: string,
    phone: string
  ) => Promise<boolean>;
  SuppressionLookupError: typeof SuppressionLookupError;
  getTemplate: typeof getTemplate;
  uuid: () => string;
  sleep: (ms: number) => Promise<void>;
  /** Owner alert when quiet-hours zone is unknown (QC r11). */
  notifyUnresolvedTimezone: (
    leadId: string,
    business: Business,
    callerPhone: string,
    sleep?: (ms: number) => Promise<void>
  ) => Promise<boolean>;
};

export function defaultCampaignDeps(): CampaignDeps {
  return {
    db: () => createServerClient(),
    clock: () => new Date(),
    adapter: () => getMessagingAdapter(),
    sendMessage,
    sendRecoverySMS,
    processDeferredRecoveries,
    isPhoneSuppressed,
    SuppressionLookupError,
    getTemplate,
    uuid: () => randomUUID(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    notifyUnresolvedTimezone,
  };
}
