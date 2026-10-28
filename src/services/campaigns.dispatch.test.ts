/**
 * Cover sendCampaignSMS dispatch branches via mocked sendMessage.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();
const mockSendMessage = vi.fn();
const isPhoneSuppressed = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: (...a: unknown[]) => mockFrom(...a) }),
}));

vi.mock('@/lib/messaging', () => ({
  getMessagingAdapter: () => ({ name: 'mock', sendMessage: vi.fn() }),
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
  sendRecoverySMS: vi.fn(),
}));

import { sendCampaignSMS, pauseCampaignForLead } from './campaigns';
import { SuppressionLookupError } from '@/services/suppressions';
import type { SendOutcome } from '@/services/send/types';

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
  obj.update = vi.fn(() => {
    const u = chainable(result);
    u.select = vi.fn(() => chainable(result));
    return u;
  });
  obj.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject);
  return obj;
}

const enrollmentRow = {
  id: 'enr-1',
  current_step: 1,
  status: 'active',
  claim_token: 'tok',
  leads: {
    id: 'lead-1',
    caller_phone: '+12135550100',
    opted_out: false,
    issue: 'leak',
    timezone: 'America/Los_Angeles',
    businesses: {
      id: 'b',
      name: 'Acme',
      timezone: 'America/Los_Angeles',
    },
  },
  campaigns: { id: 'camp-std', name: 'Standard', urgency_filter: null },
};

const steps = [
  { step_number: 1, delay_minutes: 0, template_key: 'standard_initial' },
  { step_number: 2, delay_minutes: 60, template_key: 'standard_followup_1' },
];

function mockEnrollmentDb(overrides?: {
  enrollment?: typeof enrollmentRow | null;
  steps?: typeof steps;
}) {
  const enr = overrides?.enrollment === undefined
    ? enrollmentRow
    : overrides.enrollment;
  const st = overrides?.steps ?? steps;
  mockFrom.mockImplementation((table: string) => {
    if (table === 'campaign_enrollments') {
      const builder = chainable({ data: enr, error: enr ? null : { message: 'x' } });
      builder.single = vi.fn(async () => ({
        data: enr,
        error: enr ? null : { message: 'x' },
      }));
      builder.update = vi.fn(() => {
        const u = chainable({ data: [{ id: 'enr-1' }], error: null });
        u.select = vi.fn(() =>
          chainable({ data: [{ id: 'enr-1' }], error: null })
        );
        return u;
      });
      return builder;
    }
    if (table === 'campaign_steps') {
      return chainable({ data: st, error: null });
    }
    if (table === 'leads') {
      return chainable({ data: null, error: null });
    }
    return chainable({ data: null, error: null });
  });
}

describe('sendCampaignSMS dispatch (DI via mocked sendMessage)', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockSendMessage.mockReset();
    isPhoneSuppressed.mockReset();
    isPhoneSuppressed.mockResolvedValue(false);
  });

  it('returns false without claim token', async () => {
    mockEnrollmentDb({
      enrollment: {
        ...enrollmentRow,
        claim_token: null,
      } as unknown as typeof enrollmentRow,
    });
    await expect(sendCampaignSMS('enr-1')).resolves.toBe(false);
  });

  it('pauses on opted_out / suppressed', async () => {
    mockEnrollmentDb({
      enrollment: {
        ...enrollmentRow,
        leads: { ...enrollmentRow.leads, opted_out: true },
      },
    });
    await expect(sendCampaignSMS('enr-1', 'tok')).resolves.toBe(true);

    mockEnrollmentDb();
    isPhoneSuppressed.mockResolvedValue(true);
    await expect(sendCampaignSMS('enr-1', 'tok')).resolves.toBe(true);
  });

  it('release_fail on suppression lookup error', async () => {
    mockEnrollmentDb();
    isPhoneSuppressed.mockRejectedValue(new SuppressionLookupError('x'));
    await expect(sendCampaignSMS('enr-1', 'tok')).resolves.toBe(false);
  });

  const cases: Array<[SendOutcome, boolean]> = [
    [
      { kind: 'skipped', reason: 'recovery_already_sent_skip_step_1' },
      true,
    ],
    [
      {
        kind: 'blocked',
        reason: 'quiet_hours_deferred',
        nextSendAt: '2026-01-01T00:00:00.000Z',
      },
      true,
    ],
    [{ kind: 'blocked', reason: 'quiet_hours_unresolved' }, false],
    [{ kind: 'blocked', reason: 'recovery_pending' }, false],
    [{ kind: 'blocked', reason: 'suppressed' }, true],
    [{ kind: 'blocked', reason: 'opted_out' }, true],
    [{ kind: 'blocked', reason: 'sends_disabled' }, false],
    [{ kind: 'blocked', reason: 'duplicate_in_flight' }, false],
    [{ kind: 'blocked', reason: 'invalid_phone' }, false],
    [
      {
        kind: 'sent',
        sid: 's',
        messageId: 'm',
        providerStatus: 'queued',
        keySupportedAtSend: true,
      },
      true,
    ],
    [{ kind: 'needs_review', sid: 's', reason: 'dup' }, false],
    [
      {
        kind: 'ambiguous',
        sid: 's',
        reason: 'recent_send',
        nextRetryAt: '2099-01-01T00:00:00.000Z',
      },
      false,
    ],
    [{ kind: 'never_sent', sid: 's' }, false],
  ];

  for (const [outcome, expected] of cases) {
    it(`outcome ${outcome.kind}/${'reason' in outcome ? outcome.reason : ''} → ${expected}`, async () => {
      mockEnrollmentDb();
      mockSendMessage.mockResolvedValue(outcome);
      await expect(sendCampaignSMS('enr-1', 'tok')).resolves.toBe(expected);
    });
  }
});

describe('pauseCampaignForLead', () => {
  beforeEach(() => mockFrom.mockReset());

  it('updates active enrollments to paused', async () => {
    const updates: unknown[] = [];
    mockFrom.mockImplementation(() => {
      const b = chainable({ data: null, error: null });
      b.update = vi.fn((row: unknown) => {
        updates.push(row);
        return b;
      });
      return b;
    });
    await pauseCampaignForLead('lead-1');
    expect(updates[0]).toMatchObject({ status: 'paused' });
  });
});
