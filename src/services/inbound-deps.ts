import { createServerClient } from '@/lib/supabase';
import { redactPhone } from '@/lib/pii';
import { tryNormalizeToE164 } from '@/lib/phone';
import { classifyUrgency, isOptOutMessage } from '@/services/classification';
import { classifyOptOut } from '@/services/opt-out';
import { escalateLead } from '@/services/escalation';
import {
  handleClassifiedReplyEnrollment,
  pauseCampaignForLead,
} from '@/services/campaigns';
import {
  markLeadOptedOut,
  suppressPhoneForBusiness,
} from '@/services/suppressions';
import { isLeadWithinLookupAge } from '@/services/campaign-logic';

export type SupabaseClient = ReturnType<typeof createServerClient>;

export type InboundDeps = {
  db: () => SupabaseClient;
  clock: () => Date;
  randomSuffix: () => string;
  classifyOptOut: typeof classifyOptOut;
  isOptOutMessage: typeof isOptOutMessage;
  classifyUrgency: typeof classifyUrgency;
  escalateLead: typeof escalateLead;
  handleClassifiedReplyEnrollment: typeof handleClassifiedReplyEnrollment;
  pauseCampaignForLead: typeof pauseCampaignForLead;
  markLeadOptedOut: typeof markLeadOptedOut;
  suppressPhoneForBusiness: typeof suppressPhoneForBusiness;
  tryNormalizeToE164: typeof tryNormalizeToE164;
  isLeadWithinLookupAge: typeof isLeadWithinLookupAge;
  redactPhone: typeof redactPhone;
};

export function defaultInboundDeps(): InboundDeps {
  return {
    db: () => createServerClient(),
    clock: () => new Date(),
    randomSuffix: () => Math.random().toString(36).slice(2, 10),
    classifyOptOut,
    isOptOutMessage,
    classifyUrgency,
    escalateLead,
    handleClassifiedReplyEnrollment,
    pauseCampaignForLead,
    markLeadOptedOut,
    suppressPhoneForBusiness,
    tryNormalizeToE164,
    isLeadWithinLookupAge,
    redactPhone,
  };
}
