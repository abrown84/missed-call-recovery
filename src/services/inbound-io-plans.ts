import {
  COL,
  DIRECTION_INBOUND,
  SMS_STATUS,
  LEAD_STATUS,
} from '@/services/db-strings';

export function inboundSmsInsertInput(input: {
  leadId: string;
  body: string;
  messageSid: string;
}) {
  return input;
}

export function inboundSmsReceivedPayload(input: {
  leadId: string;
  body: string;
  messageSid: string;
}) {
  return {
    [COL.leadId]: input.leadId,
    [COL.direction]: DIRECTION_INBOUND,
    [COL.body]: input.body,
    [COL.messageSid]: input.messageSid,
    [COL.status]: SMS_STATUS.received,
  };
}

export function inboundAmbiguousReviewPayload(input: {
  reason: string;
  flaggedAt: string;
}) {
  return {
    [COL.needsHumanReview]: true,
    [COL.needsHumanReviewAt]: input.flaggedAt,
    [COL.needsHumanReviewReason]: input.reason,
    [COL.updatedAt]: input.flaggedAt,
  };
}

export function inboundQualifiedLeadPayload(input: {
  urgency: string;
  issue: string | null;
  body: string;
  classifiedAt: string;
}) {
  return {
    [COL.status]: LEAD_STATUS.qualified,
    [COL.urgency]: input.urgency,
    [COL.issue]: input.issue,
    [COL.smsResponseText]: input.body,
    [COL.classifiedAt]: input.classifiedAt,
  };
}

/** Short-circuit wrapper for STOP lead lookup when raw phone equals normalized lookup key. */
export function stopLeadLookupResult<T>(anyLead: T | null | undefined, skipSecondLookup: boolean) {
  return skipSecondLookup ? { data: anyLead } : null;
}
