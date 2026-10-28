/**
 * Integration-style tests against the real send module + campaign entry points
 * (mocked supabase / relay — not helpers-only).
 */
// @ts-nocheck

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();
const mockSendMessage = vi.fn();
const mockLookup = vi.fn();
const mockCheckCaps = vi.fn();
const isPhoneSuppressed = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: (...a: unknown[]) => mockFrom(...a) }),
}));

vi.mock('@/lib/messaging', () => ({
  getMessagingAdapter: () => ({
    name: 'mock-relay',
    sendMessage: (...a: unknown[]) => mockSendMessage(...a),
    lookupByIdempotencyKey: (...a: unknown[]) => mockLookup(...a),
    checkLookupSupport: (...a: unknown[]) => mockCheckCaps(...a),
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
    capabilities: { idempotency: true, version: '1.7.6' },
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

import { sendMessage, isSendsEnabled, resetRelayKeySupportConfirmed } from './index';
import { deferUntilQuietHoursOpen } from '@/services/quiet-hours';
import { recoveryMessageSid } from '@/services/sms-sid';

const deferQuiet = vi.mocked(deferUntilQuietHoursOpen);

function chainable(result: { data: unknown; error: unknown }) {
  const obj: Record<string, any> = {};
  const self = () => obj;
  for (const method of [
    'select', 'insert', 'update', 'eq', 'lte', 'lt', 'is', 'or', 'in',
    'order', 'limit', 'single', 'maybeSingle',
  ]) {
    obj[method] = vi.fn(self);
  }
  obj.single = vi.fn(async () => result);
  obj.maybeSingle = vi.fn(async () => result);
  obj.select = vi.fn(() => {
    const nested = chainable(result);
    nested.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return nested;
  });
  obj.insert = vi.fn(() => chainable({ data: null, error: null }));
  obj.update = vi.fn(() => chainable({ data: null, error: null }));
  obj.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return obj;
}

describe('sendMessage module (real entry)', () => {
  const prevSends = process.env.SENDS_ENABLED;

  beforeEach(() => {
    mockFrom.mockReset();
    mockSendMessage.mockReset();
    mockLookup.mockReset();
    mockCheckCaps.mockReset();
    deferQuiet.mockReset();
    // Default: allow (quiet hours open) so other tests don't trip TCPA.
    deferQuiet.mockReturnValue({
      allowed: true,
      zones: ['America/New_York'],
      endHour: 21,
    } as never);
    isPhoneSuppressed.mockResolvedValue(false);
    resetRelayKeySupportConfirmed();
    process.env.SENDS_ENABLED = 'true';
    mockCheckCaps.mockResolvedValue({
      supported: true,
      capabilities: { idempotency: true, version: '1.7.6' },
    });
  });

  afterEach(() => {
    if (prevSends === undefined) delete process.env.SENDS_ENABLED;
    else process.env.SENDS_ENABLED = prevSends;
  });

  it('SENDS_ENABLED=false blocks every path', async () => {
    process.env.SENDS_ENABLED = 'false';
    expect(isSendsEnabled()).toBe(false);
    const out = await sendMessage({
      kind: 'recovery',
      leadId: 'L1',
      businessId: 'B1',
      to: '+12125550100',
      body: 'hi',
    });
    expect(out).toEqual({ kind: 'blocked', reason: 'sends_disabled' });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('normalizes to E.164 before calling the relay', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'leads') {
        return chainable({
          data: { opted_out: false, timezone: null, sms_outbound_sid: null },
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });
    mockSendMessage.mockResolvedValue({
      id: 'm1',
      status: 'queued',
      keyEchoed: true,
    });

    await sendMessage({
      kind: 'recovery',
      leadId: 'L1',
      businessId: 'B1',
      to: '2125550101', // raw national
      body: 'hi',
      idempotencyKey: recoveryMessageSid('L1'),
      skipQuietHours: true,
    });

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+12125550101' })
    );
  });

  it('503 maintenance parks as ambiguous, never needs_review', async () => {
    mockFrom.mockImplementation(() => chainable({ data: { opted_out: false }, error: null }));
    mockSendMessage.mockResolvedValue({
      id: 'maint',
      status: 'maintenance',
      ambiguous: true,
    });

    const out = await sendMessage({
      kind: 'recovery',
      leadId: 'L1',
      businessId: 'B1',
      to: '+12125550100',
      body: 'hi',
      idempotencyKey: recoveryMessageSid('L1'),
      skipQuietHours: true,
    });
    expect(out.kind).toBe('ambiguous');
    if (out.kind === 'ambiguous') expect(out.reason).toBe('maintenance');
  });

  it('invalid phone blocks without relay call', async () => {
    const out = await sendMessage({
      kind: 'recovery',
      leadId: 'L1',
      businessId: 'B1',
      to: '123',
      body: 'hi',
      skipQuietHours: true,
    });
    expect(out.kind).toBe('blocked');
    if (out.kind === 'blocked') expect(out.reason).toBe('invalid_phone');
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('recovery respects quiet hours by default (staging Florida 21:10 case)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'leads') {
        return chainable({
          data: { opted_out: false, timezone: 'America/New_York', sms_outbound_sid: null },
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });
    deferQuiet.mockReturnValue({
      allowed: false,
      nextSendAt: new Date('2026-10-29T12:00:00.000Z'),
      zones: ['America/New_York'],
      endHour: 21,
    } as never);

    const out = await sendMessage({
      kind: 'recovery',
      leadId: 'L1',
      businessId: 'B1',
      to: '+13055550100', // FL 305
      body: 'hi',
      idempotencyKey: recoveryMessageSid('L1'),
      // skipQuietHours intentionally omitted — recovery must gate.
    });

    expect(out).toMatchObject({
      kind: 'blocked',
      reason: 'quiet_hours_deferred',
    });
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(deferQuiet).toHaveBeenCalled();
  });
});
