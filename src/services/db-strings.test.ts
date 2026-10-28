import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  CAMPAIGN_SELECT_STAR_STEPS,
  CAMPAIGN_SELECT_URGENCY,
  DIRECTION_OUTBOUND,
  ENROLLMENT_SELECT_ADVANCE,
  ENROLLMENT_SELECT_REQUEUE,
  ENROLLMENT_SELECT_SEND,
  ENROLLMENT_SELECT_STAR,
  ENROLLMENT_STATUS,
  LEAD_SELECT_GATES,
  LEAD_SELECT_OPTED_OUT,
  LEAD_SELECT_OUTBOUND,
  LEAD_SELECT_STAR_BIZ,
  PG_UNIQUE,
  SMS_SELECT_ABANDONED,
  SMS_SELECT_CONFIRMED,
  SMS_SELECT_DEFERRED,
  SMS_SELECT_RECONCILE,
  SMS_SELECT_STATUS,
  SMS_STATUS,
  STEP_SELECT_STAR,
  TABLE,
} from './db-strings';

describe('db-strings constants (kill StringLiteral mutants)', () => {
  it('table names', () => {
    expect(TABLE.leads).toBe('leads');
    expect(TABLE.businesses).toBe('businesses');
    expect(TABLE.smsMessages).toBe('sms_messages');
    expect(TABLE.campaigns).toBe('campaigns');
    expect(TABLE.campaignSteps).toBe('campaign_steps');
    expect(TABLE.campaignEnrollments).toBe('campaign_enrollments');
  });

  it('sms / enrollment statuses', () => {
    expect(SMS_STATUS.sending).toBe('sending');
    expect(SMS_STATUS.deferred).toBe('deferred');
    expect(SMS_STATUS.unknown).toBe('unknown');
    expect(SMS_STATUS.needsReview).toBe('needs_review');
    expect(SMS_STATUS.abandonedRetry).toBe('abandoned_retry');
    expect(SMS_STATUS.abandonedDone).toBe('abandoned_done');
    expect(SMS_STATUS.queued).toBe('queued');
    expect(SMS_STATUS.active).toBe('active');
    expect(SMS_STATUS.paused).toBe('paused');
    expect(SMS_STATUS.completed).toBe('completed');
    expect(ENROLLMENT_STATUS.active).toBe('active');
    expect(ENROLLMENT_STATUS.paused).toBe('paused');
    expect(ENROLLMENT_STATUS.completed).toBe('completed');
    expect(ENROLLMENT_STATUS.needsReview).toBe('needs_review');
  });

  it('select lists and misc', () => {
    expect(DIRECTION_OUTBOUND).toBe('outbound');
    expect(LEAD_SELECT_GATES).toBe('opted_out, timezone, sms_outbound_sid');
    expect(SMS_SELECT_STATUS).toBe('status');
    expect(SMS_SELECT_DEFERRED).toBe(
      'id, lead_id, message_sid, body, next_retry_at'
    );
    expect(SMS_SELECT_RECONCILE).toBe(
      'id, lead_id, message_sid, status, sent_at, reconcile_attempts, key_supported_at_send, next_retry_at'
    );
    expect(SMS_SELECT_ABANDONED).toBe('id, lead_id, message_sid, status');
    expect(SMS_SELECT_CONFIRMED).toBe('message_sid, status');
    expect(LEAD_SELECT_STAR_BIZ).toBe('*, businesses(*)');
    expect(LEAD_SELECT_OPTED_OUT).toBe('opted_out');
    expect(LEAD_SELECT_OUTBOUND).toBe('sms_outbound_sid');
    expect(ENROLLMENT_SELECT_STAR).toBe('*');
    expect(CAMPAIGN_SELECT_STAR_STEPS).toBe('*, campaign_steps(*)');
    expect(CAMPAIGN_SELECT_URGENCY).toBe('id, name, urgency_filter');
    expect(STEP_SELECT_STAR).toBe('*');
    expect(ENROLLMENT_SELECT_SEND).toBe(
      '*, leads!inner(*, businesses(*)), campaigns!inner(*)'
    );
    expect(ENROLLMENT_SELECT_ADVANCE).toBe(
      'id, campaign_id, current_step, status, claim_token'
    );
    expect(ENROLLMENT_SELECT_REQUEUE).toBe('id, campaign_id, status');
    expect(PG_UNIQUE).toBe('23505');
  });

  it('property: every TABLE value is non-empty snake_case', () => {
    fc.assert(
      fc.property(fc.constantFrom(...Object.values(TABLE)), (name) => {
        expect(name.length).toBeGreaterThan(0);
        expect(name).toMatch(/^[a-z_]+$/);
      }),
      { numRuns: 20 }
    );
  });
});
