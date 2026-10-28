import {
  COL,
  LEAD_STATUS,
} from '@/services/db-strings';

export function missedCallRowPayload(input: {
  businessId: string;
  callerPhone: string;
  callSid: string;
  ringDuration: number;
}) {
  return {
    [COL.businessId]: input.businessId,
    [COL.callerPhone]: input.callerPhone,
    [COL.ringDuration]: input.ringDuration,
    [COL.callSid]: input.callSid,
  };
}

export const EMPTY_LOOKUP = { data: null } as const;

export function missedCallLeadPayload(input: {
  businessId: string;
  missedCallId: string;
  callerE164: string;
  suppressed: boolean;
  optedOutAt: string | null;
}) {
  return {
    [COL.businessId]: input.businessId,
    [COL.missedCallId]: input.missedCallId,
    [COL.callerPhone]: input.callerE164,
    [COL.status]: input.suppressed ? LEAD_STATUS.spam : LEAD_STATUS.pending,
    [COL.optedOut]: input.suppressed,
    [COL.optedOutAt]: input.optedOutAt,
  };
}

export function missedCallLeadInsertInput(input: {
  businessId: string;
  missedCallId: string;
  callerE164: string;
  suppressed: boolean;
  optedOutAt: string | null;
}) {
  return input;
}
