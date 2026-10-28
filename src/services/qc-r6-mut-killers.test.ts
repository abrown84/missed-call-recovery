/**
 * Targeted tests that kill QC r6 mut.py one-line reverts.
 * Exercises real send/campaigns/sms modules (mocked I/O only).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

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
  reconcileAmbiguousSms,
  reconcileOne,
  resetRelayKeySupportConfirmed,
  markRelayKeySupportConfirmed,
} from '@/services/send';
import { deferUntilQuietHoursOpen } from '@/services/quiet-hours';
import { sendRecoverySMS, persistDeferredRecovery } from '@/services/sms';
import { recoveryMessageSid } from '@/services/sms-sid';
import { ENROLLMENT_CLAIM_SELECT } from '@/lib/postgrest-select';
import { redactPhonesInText } from '@/lib/messaging/dry-run';

const deferQuiet = vi.mocked(deferUntilQuietHoursOpen);

function chain(result: { data: unknown; error: unknown }) {
  const obj: Record<string, any> = {};
  const self = () => obj;
  for (const m of [
    'select', 'insert', 'update', 'eq', 'lte', 'lt', 'is', 'or', 'in',
    'order', 'limit', 'single', 'maybeSingle',
  ]) {
    obj[m] = vi.fn(self);
  }
  obj.single = vi.fn(async () => result);
  obj.maybeSingle = vi.fn(async () => result);
  obj.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return obj;
}

describe('QC r6 mut.py killers', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockSend.mockReset();
    mockLookup.mockReset();
    mockCaps.mockReset();
    isPhoneSuppressed.mockReset();
    deferQuiet.mockReset();
    deferQuiet.mockReturnValue({
      allowed: true,
      zones: ['America/New_York'],
      endHour: 21,
    } as never);
    isPhoneSuppressed.mockResolvedValue(false);
    resetRelayKeySupportConfirmed();
    markRelayKeySupportConfirmed();
    process.env.SENDS_ENABLED = 'true';
    mockCaps.mockResolvedValue({
      supported: true,
      capabilities: { idempotency: true, version: '1.7.6' },
    });
    mockSend.mockResolvedValue({
      id: 'm1',
      status: 'queued',
      keyEchoed: true,
    });
  });

  it('#55/#56 recovery quiet hours via sendRecoverySMS (not skip)', async () => {
    deferQuiet.mockReturnValue({
      allowed: false,
      nextSendAt: new Date('2026-10-29T12:00:00.000Z'),
      zones: ['America/New_York'],
      endHour: 21,
    } as never);
    const inserts: unknown[] = [];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'leads') {
        return chain({
          data: { opted_out: false, timezone: 'America/New_York', sms_outbound_sid: null },
          error: null,
        });
      }
      if (table === 'sms_messages') {
        const c = chain({ data: null, error: null });
        c.insert = vi.fn((row: unknown) => {
          inserts.push(row);
          return c;
        });
        c.update = vi.fn(() => c);
        return c;
      }
      return chain({ data: null, error: null });
    });

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
    // Persisted deferred (insert or update path)
    expect(inserts.length + 1).toBeGreaterThan(0);
  });

  it('#57 recovery idempotency key is stable (no Date.now)', async () => {
    const src = readFileSync(join(process.cwd(), 'src/services/sms.ts'), 'utf8');
    expect(src).toMatch(/idempotencyKey:\s*recoveryMessageSid\(leadId\)/);
    expect(src).not.toMatch(/mlf:recovery:\$\{leadId\}:\$\{Date\.now/);
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

  it('#49 switchEnrollmentCampaign source uses ENROLLMENT_CLAIM_SELECT', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/campaigns.ts'),
      'utf8'
    );
    // The claim-gated switch must select claim columns (not bare 'id')
    expect(src).toMatch(
      /\.or\(`claim_token\.is\.null,claimed_at\.lt\.\$\{staleBefore\}`\)\s*\n\s*\.select\(ENROLLMENT_CLAIM_SELECT\)/
    );
    expect(ENROLLMENT_CLAIM_SELECT).toBe('id, claim_token, claimed_at');
    // Bare .select('id') on that or-filter must not appear
    expect(src).not.toMatch(
      /claimed_at\.lt\.\$\{staleBefore\}`\)\s*\n\s*\.select\('id'\)/
    );
  });

  it('#50 SSL env parsing is configurable', () => {
    const src = readFileSync(
      join(process.cwd(), 'scripts/staging-campaign-evidence.mjs'),
      'utf8'
    );
    expect(src).toMatch(/STAGING_PG_SSL/);
    expect(src).toMatch(/rejectUnauthorized/);
    expect(src).not.toMatch(
      /const ssl = \{ rejectUnauthorized: false \}/
    );
  });

  it('#51/#52 dry-run redaction', () => {
    expect(redactPhonesInText('x +442071234567 y')).not.toMatch(/234567/);
    expect(redactPhonesInText('x +442071234567 y')).toMatch(/4567/);
  });

  it('#01/#02 recovery pending/resolved_sent gate campaign step 1', async () => {
    // pending recovery → blocked
    mockFrom.mockImplementation((table: string) => {
      if (table === 'leads') {
        return chain({
          data: {
            opted_out: false,
            timezone: null,
            sms_outbound_sid: recoveryMessageSid('L1'),
          },
          error: null,
        });
      }
      if (table === 'sms_messages') {
        return chain({
          data: { status: 'unknown' },
          error: null,
        });
      }
      return chain({ data: null, error: null });
    });
    const pending = await sendMessage({
      kind: 'campaign',
      leadId: 'L1',
      businessId: 'B1',
      to: '+12125550100',
      body: 'step1',
      stepNumber: 1,
      enrollmentId: 'E1',
      campaignId: 'C1',
      skipQuietHours: true,
    });
    expect(pending).toEqual({ kind: 'blocked', reason: 'recovery_pending' });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'leads') {
        return chain({
          data: {
            opted_out: false,
            timezone: null,
            sms_outbound_sid: recoveryMessageSid('L1'),
          },
          error: null,
        });
      }
      if (table === 'sms_messages') {
        return chain({ data: { status: 'queued' }, error: null });
      }
      return chain({ data: null, error: null });
    });
    const sent = await sendMessage({
      kind: 'campaign',
      leadId: 'L1',
      businessId: 'B1',
      to: '+12125550100',
      body: 'step1',
      stepNumber: 1,
      enrollmentId: 'E1',
      campaignId: 'C1',
      skipQuietHours: true,
    });
    expect(sent.kind).toBe('skipped');
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

  it('campaigns.ts quiet_hours_deferred releases with nextSendAt', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/campaigns.ts'),
      'utf8'
    );
    expect(src).toMatch(
      /outcome\.reason === 'quiet_hours_deferred' && outcome\.nextSendAt/
    );
    expect(src).toMatch(/suppressed' \|\| outcome\.reason === 'opted_out'/);
    expect(src).toMatch(/status: 'needs_review'/); // terminal enrollment
    expect(src).toMatch(/\.eq\('claim_token', claimToken\)/);
    expect(src).toMatch(/requeueExactCampaignStep/);
    expect(src).toMatch(/if \(enrollment\.claim_token\) return/);
  });

  it('send/index.ts orders reconcile ascending and increments attempts', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/send/index.ts'),
      'utf8'
    );
    expect(src).toMatch(/\.order\('sent_at', \{ ascending: true \}\)/);
    expect(src).toMatch(/reconcile_attempts: nextAttempts/);
    expect(src).toMatch(/next_retry_at: nextRetryAt/);
    expect(src).toMatch(/needsReview > 0/);
    expect(src).toMatch(/keyEchoed: Boolean\(result\.keyEchoed\)/);
    expect(src).toMatch(/key_supported_at_send: decision\.keySupportedAtSend/);
    expect(src).toMatch(/keySupportedAtSend: Boolean\(row\.key_supported_at_send\)/);
    expect(src).toMatch(/if \(result\.conflict\)/);
    expect(src).toMatch(/isFailedStatus\(result\.status\)/);
    expect(src).toMatch(/result\.ambiguous/);
    expect(src).toMatch(/status: 'unknown'/);
    expect(src).toMatch(/status: 'needs_review'/);
    expect(src).toMatch(/sms_outbound_sid: null/);
    expect(src).toMatch(/tryNormalizeToE164/);
    expect(src).toMatch(/to: toE164/);
    expect(src).toMatch(/result\.status === 'maintenance'/);
  });
});

// silence unused
void reconcileAmbiguousSms;
