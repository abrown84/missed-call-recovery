/**
 * Drive reconcile post-pass helpers (advanceAfter / requeue / resend) and
 * sendCampaignSMS park / needs_review with payload assertions.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();
const mockSendMessage = vi.fn();
const isPhoneSuppressed = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: (...a: unknown[]) => mockFrom(...a) }),
}));

vi.mock('@/lib/messaging', () => ({
  getMessagingAdapter: () => ({
    name: 'mock',
    sendMessage: vi.fn(),
    checkLookupSupport: vi.fn(async () => ({ supported: true })),
  }),
}));

vi.mock('@/services/send', async () => {
  const actual = await vi.importActual<typeof import('@/services/send')>(
    '@/services/send'
  );
  return {
    ...actual,
    sendMessage: (...a: unknown[]) => mockSendMessage(...a),
    reconcileAmbiguousSms: vi.fn(async () => ({
      unknownCount: 0,
      stuckSendingCount: 0,
      requeued: 0,
      confirmed: 0,
      parked: 0,
      needsReview: 0,
      alert: false,
    })),
  };
});

vi.mock('@/services/suppressions', () => ({
  isPhoneSuppressed: (...a: unknown[]) => isPhoneSuppressed(...a),
  SuppressionLookupError: class extends Error {},
}));

vi.mock('@/services/sms', () => ({
  processDeferredRecoveries: vi.fn(async () => ({
    sent: 0,
    deferred: 0,
    errors: 0,
  })),
  sendRecoverySMS: vi.fn(async () => undefined),
}));

import { reconcileAmbiguousSms, sendCampaignSMS } from './campaigns';
import { ENROLLMENT_STATUS, SMS_STATUS } from '@/services/db-strings';

function chainable(result: { data: unknown; error: unknown }) {
  const obj: Record<string, any> = {};
  const self = () => obj;
  for (const method of [
    'select',
    'insert',
    'update',
    'eq',
    'lte',
    'lt',
    'is',
    'or',
    'in',
    'like',
    'order',
    'limit',
    'single',
    'maybeSingle',
  ]) {
    obj[method] = vi.fn(self);
  }
  obj.single = vi.fn(async () => result);
  obj.maybeSingle = vi.fn(async () => result);
  obj.select = vi.fn(() => {
    const nested = chainable(result);
    nested.then = (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject);
    return nested;
  });
  obj.update = vi.fn((payload: unknown) => {
    obj._lastUpdate = payload;
    const u = chainable(result);
    u.select = vi.fn(() => chainable(result));
    u._payload = payload;
    return u;
  });
  obj.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject);
  return obj;
}

describe('campaigns reconcile post-pass DI', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockSendMessage.mockReset();
    isPhoneSuppressed.mockReset();
    isPhoneSuppressed.mockResolvedValue(false);
  });

  it('abandoned campaign requeues exact step with payload', async () => {
    const updates: unknown[] = [];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'sms_messages') {
        const b = chainable({
          data: [
            {
              id: '1',
              lead_id: 'L',
              message_sid: 'mlf:campaign:enr1:camp1:step:2:abandoned:9',
              status: 'abandoned_retry',
            },
          ],
          error: null,
        });
        b.update = vi.fn((payload: unknown) => {
          updates.push({ table, payload });
          return chainable({ data: null, error: null });
        });
        return b;
      }
      if (table === 'campaign_enrollments') {
        const b = chainable({
          data: {
            id: 'enr1',
            campaign_id: 'camp1',
            status: 'active',
            current_step: 3,
            claim_token: null,
          },
          error: null,
        });
        b.update = vi.fn((payload: unknown) => {
          updates.push({ table, payload });
          const u = chainable({ data: [{ id: 'enr1' }], error: null });
          u.select = vi.fn(() =>
            chainable({ data: [{ id: 'enr1' }], error: null })
          );
          return u;
        });
        return b;
      }
      return chainable({ data: [], error: null });
    });

    const r = await reconcileAmbiguousSms();
    expect(r.requeued).toBeGreaterThanOrEqual(1);
    expect(
      updates.some(
        (u) =>
          (u as { table: string; payload: Record<string, unknown> }).table ===
            'campaign_enrollments' &&
          (u as { payload: Record<string, unknown> }).payload.current_step === 2
      )
    ).toBe(true);
    expect(
      updates.some(
        (u) =>
          (u as { payload: Record<string, unknown> }).payload.status ===
          SMS_STATUS.abandonedDone
      )
    ).toBe(true);
  });

  it('confirmed campaign advances with reconcileAdvancePayload', async () => {
    const updates: unknown[] = [];
    let smsPass = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'sms_messages') {
        smsPass += 1;
        // first query: abandoned (empty); second: confirmed
        if (smsPass === 1) {
          return chainable({ data: [], error: null });
        }
        return chainable({
          data: [
            {
              id: 'c1',
              lead_id: 'L',
              message_sid: 'mlf:campaign:enr1:camp1:step:1',
              status: 'delivered',
            },
          ],
          error: null,
        });
      }
      if (table === 'campaign_enrollments') {
        const b = chainable({
          data: {
            id: 'enr1',
            campaign_id: 'camp1',
            status: 'active',
            current_step: 1,
            claim_token: null,
          },
          error: null,
        });
        b.update = vi.fn((payload: unknown) => {
          updates.push(payload);
          return chainable({ data: [{ id: 'enr1' }], error: null });
        });
        return b;
      }
      if (table === 'campaign_steps') {
        return chainable({
          data: [
            { step_number: 1, delay_minutes: 0 },
            { step_number: 2, delay_minutes: 30 },
          ],
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });

    await reconcileAmbiguousSms();
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0]).toMatchObject({
      current_step: 2,
      claim_token: null,
      claimed_at: null,
    });
  });

  it('confirmed last step completes enrollment', async () => {
    const updates: unknown[] = [];
    let smsPass = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'sms_messages') {
        smsPass += 1;
        if (smsPass === 1) return chainable({ data: [], error: null });
        return chainable({
          data: [
            {
              id: 'c1',
              message_sid: 'mlf:campaign:enr1:camp1:step:2',
              status: 'delivered',
            },
          ],
          error: null,
        });
      }
      if (table === 'campaign_enrollments') {
        const b = chainable({
          data: {
            id: 'enr1',
            campaign_id: 'camp1',
            status: 'active',
            current_step: 2,
            claim_token: null,
          },
          error: null,
        });
        b.update = vi.fn((payload: unknown) => {
          updates.push(payload);
          return chainable({ data: [{ id: 'enr1' }], error: null });
        });
        return b;
      }
      if (table === 'campaign_steps') {
        return chainable({
          data: [
            { step_number: 1, delay_minutes: 0 },
            { step_number: 2, delay_minutes: 30 },
          ],
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });

    await reconcileAmbiguousSms();
    expect(updates[0]).toMatchObject({
      status: ENROLLMENT_STATUS.completed,
      next_send_at: null,
      claim_token: null,
    });
  });

  it('recovery abandoned clears outbound sid then resends', async () => {
    const { sendRecoverySMS } = await import('@/services/sms');
    const updates: unknown[] = [];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'sms_messages') {
        const b = chainable({
          data: [
            {
              id: '1',
              lead_id: 'L',
              message_sid: 'mlf:recovery:L:abandoned:1',
              status: 'abandoned_retry',
            },
          ],
          error: null,
        });
        b.update = vi.fn((payload: unknown) => {
          updates.push({ table, payload });
          return chainable({ data: null, error: null });
        });
        return b;
      }
      if (table === 'leads') {
        const b = chainable({
          data: {
            id: 'L',
            opted_out: false,
            caller_phone: '+12135550100',
            sms_outbound_sid: 'mlf:recovery:L',
            businesses: {
              id: 'B',
              name: 'Acme',
              timezone: 'America/New_York',
              vertical: 'plumbing',
              settings: {},
            },
          },
          error: null,
        });
        b.update = vi.fn((payload: unknown) => {
          updates.push({ table, payload });
          return b;
        });
        return b;
      }
      return chainable({ data: null, error: null });
    });

    const r = await reconcileAmbiguousSms();
    expect(r.requeued).toBeGreaterThanOrEqual(1);
    expect(
      updates.some(
        (u) =>
          (u as { table: string; payload: Record<string, unknown> }).table ===
            'leads' &&
          (u as { payload: Record<string, unknown> }).payload
            .sms_outbound_sid === null
      )
    ).toBe(true);
    expect(sendRecoverySMS).toHaveBeenCalled();
  });
});

describe('sendCampaignSMS park / needs_review payload', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockSendMessage.mockReset();
    isPhoneSuppressed.mockResolvedValue(false);
  });

  const enrollmentRow = {
    id: 'enr-1',
    current_step: 2,
    status: 'active',
    claim_token: 'tok',
    leads: {
      id: 'lead-1',
      caller_phone: '+12135550100',
      opted_out: false,
      issue: '',
      timezone: 'America/Los_Angeles',
      businesses: {
        id: 'b',
        name: 'Acme',
        timezone: 'America/Los_Angeles',
      },
    },
    campaigns: { id: 'camp-std', name: 'Standard', urgency_filter: null },
  };

  function mockDb(capture: { updates: unknown[] }) {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaign_enrollments') {
        const b = chainable({ data: enrollmentRow, error: null });
        b.single = vi.fn(async () => ({ data: enrollmentRow, error: null }));
        b.update = vi.fn((payload: unknown) => {
          capture.updates.push(payload);
          const u = chainable({ data: [{ id: 'enr-1' }], error: null });
          u.select = vi.fn(() =>
            chainable({ data: [{ id: 'enr-1' }], error: null })
          );
          return u;
        });
        return b;
      }
      if (table === 'campaign_steps') {
        return chainable({
          data: [
            { step_number: 1, delay_minutes: 0, template_key: 'a' },
            { step_number: 2, delay_minutes: 60, template_key: 'b' },
          ],
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });
  }

  it('ambiguous parks with far-future next_send_at', async () => {
    const capture = { updates: [] as unknown[] };
    mockDb(capture);
    mockSendMessage.mockResolvedValue({
      kind: 'ambiguous',
      sid: 's',
      reason: 'recent_send',
      nextRetryAt: '2099-01-01T00:00:00.000Z',
    });
    await expect(sendCampaignSMS('enr-1', 'tok')).resolves.toBe(false);
    expect(capture.updates.length).toBeGreaterThan(0);
    expect(capture.updates[0]).toMatchObject({
      claim_token: null,
      next_send_at: '2099-01-01T00:00:00.000Z',
    });
  });

  it('needs_review marks terminal status (no re-park)', async () => {
    const capture = { updates: [] as unknown[] };
    mockDb(capture);
    mockSendMessage.mockResolvedValue({
      kind: 'needs_review',
      sid: 's',
      reason: 'max_attempts',
    });
    await expect(sendCampaignSMS('enr-1', 'tok')).resolves.toBe(false);
    expect(capture.updates[0]).toMatchObject({
      status: ENROLLMENT_STATUS.needsReview,
      next_send_at: null,
      claim_token: null,
    });
  });
});
