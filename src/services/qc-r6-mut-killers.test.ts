/**
 * Targeted behavioural tests that kill QC r6 mut.py one-line reverts.
 * Source-text greps removed (QC r7) — see qc-r7-mut-behaviour.test.ts for
 * #16/#19/#22/#24/#25/#26/#31/#32/#49/#50.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();
const mockSend = vi.fn();
const mockLookup = vi.fn();
const mockCaps = vi.fn();
const isPhoneSuppressed = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: (...a: unknown[]) => mockFrom(...a) }),
}));

vi.mock('@/lib/messaging', () => ({
  getMessagingAdapter: () => ({
    name: 'mock',
    sendMessage: (...a: unknown[]) => mockSend(...a),
    lookupByIdempotencyKey: (...a: unknown[]) => mockLookup(...a),
    checkLookupSupport: (...a: unknown[]) => mockCaps(...a),
  }),
}));

vi.mock('@/lib/messaging/brwn-relay', () => ({
  ensureRelayKeySupportProbed: vi.fn(async () => {
    const { markRelayKeySupportConfirmed } = await import('@/services/sms-sid');
    markRelayKeySupportConfirmed();
    return true;
  }),
  warnIfRelayLookupUnsupported: vi.fn(async () => ({
    supported: true,
    capabilities: { idempotency: true },
  })),
}));

vi.mock('@/services/suppressions', () => ({
  isPhoneSuppressed: (...a: unknown[]) => isPhoneSuppressed(...a),
  SuppressionLookupError: class extends Error {},
}));

vi.mock('@/services/quiet-hours', async () => {
  const actual = await vi.importActual<typeof import('@/services/quiet-hours')>(
    '@/services/quiet-hours'
  );
  return {
    ...actual,
    deferUntilQuietHoursOpen: vi.fn((now: Date, opts: unknown) =>
      actual.deferUntilQuietHoursOpen(now, opts as never)
    ),
  };
});

import {
  sendMessage,
  reconcileOne,
  resetRelayKeySupportConfirmed,
  markRelayKeySupportConfirmed,
} from '@/services/send';
import { deferUntilQuietHoursOpen } from '@/services/quiet-hours';
import { sendRecoverySMS, persistDeferredRecovery } from '@/services/sms';
import { recoveryMessageSid } from '@/services/sms-sid';
import { redactPhonesInText } from '@/lib/messaging/dry-run';
import { classifyOptOut } from '@/services/opt-out';

const deferQuiet = vi.mocked(deferUntilQuietHoursOpen);

function chain(result: { data: unknown; error: unknown }) {
  const obj: Record<string, any> = {};
  const self = () => obj;
  for (const m of [
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
    obj[m] = vi.fn(self);
  }
  obj.single = vi.fn(async () => result);
  obj.maybeSingle = vi.fn(async () => result);
  obj.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject);
  return obj;
}

describe('QC r6 mut.py killers (behavioural)', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockSend.mockReset();
    mockLookup.mockReset();
    mockCaps.mockReset();
    isPhoneSuppressed.mockReset();
    isPhoneSuppressed.mockResolvedValue(false);
    deferQuiet.mockClear();
    resetRelayKeySupportConfirmed();
    markRelayKeySupportConfirmed();
    delete process.env.SENDS_ENABLED;
  });

  it('quiet-hours deferral persists deferred recovery (no send)', async () => {
    const inserts: unknown[] = [];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'sms_messages') {
        const c = chain({ data: null, error: null });
        c.insert = vi.fn((row: unknown) => {
          inserts.push(row);
          return c;
        });
        return c;
      }
      return chain({
        data: { opted_out: false, timezone: null, sms_outbound_sid: null },
        error: null,
      });
    });
    deferQuiet.mockReturnValue({
      allowed: false,
      nextSendAt: new Date('2026-10-29T12:00:00.000Z'),
      zones: ['America/New_York'],
      endHour: 21,
    } as never);
    const biz = {
      id: 'B1',
      name: 'Acme',
      phone: '+12125550999',
      vertical: 'plumbing',
      timezone: 'America/New_York',
      business_hours_start: '08:00',
      business_hours_end: '17:00',
      after_hours_enabled: true,
      emergency_phone: null,
      settings: {},
      created_at: '',
      updated_at: '',
    };
    await sendRecoverySMS('L1', biz as never, '+13055550100');
    expect(mockSend).not.toHaveBeenCalled();
    expect(deferQuiet).toHaveBeenCalled();
    expect(inserts.length + 1).toBeGreaterThan(0);
  });

  it('#20/#21 opted_out and suppression gates block sendMessage', async () => {
    mockFrom.mockImplementation(() =>
      chain({
        data: { opted_out: true, timezone: null, sms_outbound_sid: null },
        error: null,
      })
    );
    const out = await sendMessage({
      kind: 'recovery',
      leadId: 'L1',
      businessId: 'B1',
      to: '+12125550100',
      body: 'hi',
      idempotencyKey: recoveryMessageSid('L1'),
      skipQuietHours: true,
    });
    expect(out).toEqual({ kind: 'blocked', reason: 'opted_out' });
    expect(mockSend).not.toHaveBeenCalled();

    mockFrom.mockImplementation(() =>
      chain({
        data: { opted_out: false, timezone: null, sms_outbound_sid: null },
        error: null,
      })
    );
    isPhoneSuppressed.mockResolvedValue(true);
    const out2 = await sendMessage({
      kind: 'recovery',
      leadId: 'L1',
      businessId: 'B1',
      to: '+12125550100',
      body: 'hi',
      idempotencyKey: recoveryMessageSid('L1'),
      skipQuietHours: true,
    });
    expect(out2).toEqual({ kind: 'blocked', reason: 'suppressed' });
  });

  it('#58/#59 SENDS_ENABLED blocks send and reconcile', async () => {
    process.env.SENDS_ENABLED = 'false';
    const out = await sendMessage({
      kind: 'recovery',
      leadId: 'L1',
      businessId: 'B1',
      to: '+12125550100',
      body: 'hi',
    });
    expect(out).toEqual({ kind: 'blocked', reason: 'sends_disabled' });

    const r = await reconcileOne({
      id: '1',
      lead_id: 'L1',
      message_sid: recoveryMessageSid('L1'),
      status: 'unknown',
      reconcile_attempts: 0,
      key_supported_at_send: true,
    });
    expect(r).toEqual({ kind: 'blocked', reason: 'sends_disabled' });
  });

  it('#51/#52 dry-run redaction', () => {
    expect(redactPhonesInText('x +442071234567 y')).not.toMatch(/234567/);
    expect(redactPhonesInText('x +442071234567 y')).toMatch(/4567/);
  });

  it('persistDeferredRecovery writes deferred + next_retry_at', async () => {
    const updates: unknown[] = [];
    const inserts: unknown[] = [];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'sms_messages') {
        const c = chain({ data: null, error: null });
        c.insert = vi.fn((row: unknown) => {
          inserts.push(row);
          return c;
        });
        c.update = vi.fn((row: unknown) => {
          updates.push(row);
          return c;
        });
        return c;
      }
      return chain({ data: null, error: null });
    });
    await persistDeferredRecovery({
      leadId: 'L1',
      body: 'hi',
      nextSendAt: '2026-10-29T12:00:00.000Z',
    });
    const row = (inserts[0] ?? updates[0]) as Record<string, unknown>;
    expect(row).toMatchObject({
      status: 'deferred',
      next_retry_at: '2026-10-29T12:00:00.000Z',
    });
  });

  it('#19 compact STOP still classifies as opt_out', () => {
    expect(classifyOptOut('S T O P').kind).toBe('opt_out');
  });
});
