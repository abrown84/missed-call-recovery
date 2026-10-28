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
import { getTemplate } from '@/lib/templates';
import { randomUUID } from 'crypto';

export type SupabaseClient = ReturnType<typeof createServerClient>;

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
    // Stryker disable next-line ArrowFunction: default sleep delay is unused under DI tests (EQUIVALENT.md campaign-deps-default-factory-sleep)
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}
