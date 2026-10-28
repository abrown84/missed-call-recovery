import { describe, expect, it } from 'vitest';
import {
  clearLeadOutboundSidPayload,
  leadOutboundSidPayload,
  smsAbandonedRetryPayload,
  smsClaimDeferredPayload,
  smsConfirmSentPayload,
  smsNeedsReviewPayload,
  smsParkAmbiguousPayload,
  smsSendingInsertPayload,
  smsStatusOnlyPayload,
} from './send-io-plans';

describe('send-io-plans', () => {
  it('sending insert keeps key_supported_at_send false', () => {
    expect(
      smsSendingInsertPayload({
        leadId: 'L',
        body: 'hi',
        sid: 's',
        direction: 'outbound',
        status: 'sending',
      })
    ).toEqual({
      lead_id: 'L',
      direction: 'outbound',
      body: 'hi',
      message_sid: 's',
      status: 'sending',
      key_supported_at_send: false,
    });
  });

  it('claim deferred / confirm / park / abandoned / needs_review shapes', () => {
    expect(
      smsClaimDeferredPayload({ status: 'sending', body: 'b' })
    ).toEqual({
      status: 'sending',
      next_retry_at: null,
      body: 'b',
    });
    expect(
      smsConfirmSentPayload({
        providerStatus: 'queued',
        keySupportedAtSend: true,
      })
    ).toEqual({
      status: 'queued',
      key_supported_at_send: true,
    });
    expect(smsStatusOnlyPayload('needs_review')).toEqual({
      status: 'needs_review',
    });
    expect(
      smsParkAmbiguousPayload({
        status: 'unknown',
        nextAttempts: 2,
        nextRetryAt: 't',
      })
    ).toEqual({
      status: 'unknown',
      reconcile_attempts: 2,
      next_retry_at: 't',
    });
    expect(
      smsAbandonedRetryPayload({
        status: 'abandoned_retry',
        abandonedSid: 's:abandoned:1',
      })
    ).toEqual({
      status: 'abandoned_retry',
      message_sid: 's:abandoned:1',
    });
    expect(smsNeedsReviewPayload({ status: 'needs_review' })).toEqual({
      status: 'needs_review',
      next_retry_at: null,
    });
    expect(leadOutboundSidPayload('sid')).toEqual({ sms_outbound_sid: 'sid' });
    expect(clearLeadOutboundSidPayload()).toEqual({ sms_outbound_sid: null });
  });
});
