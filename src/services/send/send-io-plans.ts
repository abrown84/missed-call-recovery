/**
 * Pure DB payload builders for the send I/O shell.
 */

export function smsSendingInsertPayload(input: {
  leadId: string;
  body: string;
  sid: string;
  direction: string;
  status: string;
}): Record<string, unknown> {
  return {
    lead_id: input.leadId,
    direction: input.direction,
    body: input.body,
    message_sid: input.sid,
    status: input.status,
    key_supported_at_send: false,
  };
}

export function smsClaimDeferredPayload(input: {
  status: string;
  body: string;
}): Record<string, unknown> {
  return {
    status: input.status,
    next_retry_at: null,
    body: input.body,
  };
}

export function smsConfirmSentPayload(input: {
  providerStatus: string;
  keySupportedAtSend: boolean;
}): Record<string, unknown> {
  return {
    status: input.providerStatus,
    key_supported_at_send: input.keySupportedAtSend,
  };
}

export function smsStatusOnlyPayload(status: string): Record<string, unknown> {
  return { status };
}

export function smsParkAmbiguousPayload(input: {
  status: string;
  nextAttempts: number;
  nextRetryAt: string;
}): Record<string, unknown> {
  return {
    status: input.status,
    reconcile_attempts: input.nextAttempts,
    next_retry_at: input.nextRetryAt,
  };
}

export function leadOutboundSidPayload(sid: string): Record<string, unknown> {
  return { sms_outbound_sid: sid };
}

export function smsAbandonedRetryPayload(input: {
  status: string;
  abandonedSid: string;
}): Record<string, unknown> {
  return {
    status: input.status,
    message_sid: input.abandonedSid,
  };
}

export function smsNeedsReviewPayload(input: {
  status: string;
}): Record<string, unknown> {
  return {
    status: input.status,
    next_retry_at: null,
  };
}

export function clearLeadOutboundSidPayload(): Record<string, unknown> {
  return { sms_outbound_sid: null };
}
