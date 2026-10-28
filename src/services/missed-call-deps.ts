import { createServerClient } from '@/lib/supabase';
import { redactPhone } from '@/lib/pii';
import { normalizeToE164 } from '@/lib/phone';
import { enrollLeadInCampaign } from '@/services/campaigns';
import { sendRecoverySMS } from '@/services/sms';
import {
  SuppressionLookupError,
  isPhoneSuppressed,
} from '@/services/suppressions';

export type SupabaseClient = ReturnType<typeof createServerClient>;

export type MissedCallDeps = {
  db: () => SupabaseClient;
  clock: () => Date;
  normalizeToE164: typeof normalizeToE164;
  isPhoneSuppressed: typeof isPhoneSuppressed;
  SuppressionLookupError: typeof SuppressionLookupError;
  sendRecoverySMS: typeof sendRecoverySMS;
  enrollLeadInCampaign: typeof enrollLeadInCampaign;
  redactPhone: typeof redactPhone;
};

export function defaultMissedCallDeps(): MissedCallDeps {
  return {
    db: () => createServerClient(),
    clock: () => new Date(),
    normalizeToE164,
    isPhoneSuppressed,
    SuppressionLookupError,
    sendRecoverySMS,
    enrollLeadInCampaign,
    redactPhone,
  };
}
