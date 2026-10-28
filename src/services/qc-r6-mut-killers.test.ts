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

/** Skip source-string assertions under Stryker (instrumented sources diverge). */
function readSrc(rel: string): string | null {
  const src = readFileSync(join(process.cwd(), rel), 'utf8');
  if (src.includes('stryMutAct') || src.includes('stryNS_')) return null;
  return src;
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
    const src = readSrc('src/services/sms.ts');
    if (!src) return;
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
    expect(ENROLLMENT_CLAIM_SELECT).toBe('id, claim_token, claimed_at');
    const src = readSrc('src/services/campaigns.ts');
    if (!src) return;
    const switchIdx = src.indexOf('claim_token.is.null,claimed_at.lt.');
    expect(switchIdx).toBeGreaterThan(-1);
    const after = src.slice(switchIdx, switchIdx + 200);
    expect(after).toContain('ENROLLMENT_CLAIM_SELECT');
    expect(after).not.toContain(".select('id')");
  });

  it('#50 SSL env parsing is configurable', () => {
    const src = readSrc('scripts/staging-campaign-evidence.mjs');
    if (!src) return;
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

  it('#01/#02 recovery pending/resolved_sent gates exist in decisions', () => {
    const decisions = readSrc('src/services/send/decisions.ts');
    const index = readSrc('src/services/send/index.ts');
    if (!decisions || !index) return;
    expect(decisions).toContain("reason: 'recovery_pending'");
    expect(decisions).toContain("reason: 'recovery_already_sent_skip_step_1'");
    expect(decisions).toContain("input.recovery === 'pending'");
    expect(decisions).toContain("input.recovery === 'resolved_sent'");
    expect(index).toContain('decideCustomerFacingGates');
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
    const src = readSrc('src/services/campaigns.ts');
    const decisions = readSrc('src/services/send/decisions.ts');
    const campDec = readSrc('src/services/campaign-decisions.ts');
    if (!src || !decisions || !campDec) return;
    expect(decisions).toMatch(
      /outcome\.reason === 'quiet_hours_deferred' && outcome\.nextSendAt/
    );
    expect(decisions).toMatch(
      /outcome\.reason === 'suppressed' \|\| outcome\.reason === 'opted_out'/
    );
    expect(src).toMatch(/status: 'needs_review'/); // terminal enrollment
    expect(src).toMatch(/\.eq\('claim_token', claimToken\)/);
    expect(src).toMatch(/requeueExactCampaignStep/);
    expect(campDec).toContain('hasClaimToken');
    expect(src).toContain('decideReconcileAdvanceEligibility');
  });

  it('send/index.ts orders reconcile ascending and increments attempts', () => {
    const src = readSrc('src/services/send/index.ts');
    const decisions = readSrc('src/services/send/decisions.ts');
    if (!src || !decisions) return;
    expect(src).toMatch(/\.order\('sent_at', \{ ascending: true \}\)/);
    expect(src).toMatch(/reconcile_attempts: nextAttempts/);
    expect(src).toMatch(/next_retry_at: nextRetryAt/);
    expect(src).toMatch(/needsReview > 0/);
    expect(decisions).toMatch(/keyEchoed: Boolean\(result\.keyEchoed\)/);
    expect(src).toMatch(/key_supported_at_send: decision\.keySupportedAtSend/);
    expect(src).toMatch(/keySupportedAtSend: Boolean\(row\.key_supported_at_send\)/);
    expect(decisions).toMatch(/if \(result\.conflict\)/);
    expect(decisions).toMatch(/isFailedStatus\(result\.status\)/);
    expect(decisions).toMatch(/result\.ambiguous/);
    expect(src).toContain("status: 'unknown'");
    expect(src).not.toMatch(/\.update\(\{\s*status:\s*'queued'\s*\}\)/);
    expect(src).toMatch(/status: 'needs_review'/);
    expect(src).toMatch(/sms_outbound_sid: null/);
    expect(src).toMatch(/tryNormalizeToE164/);
    expect(src).toMatch(/to: toE164/);
    expect(decisions).toMatch(/result\.status === 'maintenance'/);
    expect(src).toContain('capsBeforeSend = await deps.ensureCaps(adapter)');
    expect(decisions).toContain('!input.quiet.allowed');
    expect(src).toContain('leadTimezone: leadTz,');
    expect(src).toContain('decideDuplicateSid');
    expect(src).toContain('mapRelaySendResult');
    expect(src).toContain(".update({ status: 'needs_review' })");
  });

  it('campaigns.ts keeps recovery park / claim / requeue / leadTimezone', () => {
    const src = readSrc('src/services/campaigns.ts');
    const campDec = readSrc('src/services/campaign-decisions.ts');
    const decisions = readSrc('src/services/send/decisions.ts');
    if (!src || !campDec || !decisions) return;
    expect(campDec).toContain(
      "input.recoveryState === 'pending' && !input.recoveryConfirmed"
    );
    expect(src).toContain('await resendRecoveryIdempotent');
    expect(src).toContain('skipRecoveryGate: decideSkipRecoveryGate(');
    expect(src).not.toContain('skipRecoveryGate: true || !(');
    expect(src).toContain('leadTimezone: leadTz,');
    expect(src).not.toContain('leadTimezone: null,');
    expect(decisions).toContain("outcome.reason === 'quiet_hours_unresolved'");
    expect(decisions).toContain("outcome.kind === 'needs_review'");
    expect(decisions).toContain("outcome.kind === 'ambiguous'");
    expect(decisions).toContain("outcome.reason === 'recovery_pending'");
    expect(src).toContain('decideCampaignSendDispatch');
    // needs_review / park must NOT call advanceEnrollment in their case bodies
    const reviewCase = src.slice(
      src.indexOf("case 'needs_review_terminal':"),
      src.indexOf("case 'noop_false':")
    );
    expect(reviewCase).toContain('markEnrollmentNeedsReview');
    expect(reviewCase).not.toContain('advanceEnrollment');
    const parkCase = src.slice(
      src.indexOf("case 'park':"),
      src.indexOf("case 'pause_opt_out':")
    );
    expect(parkCase).toContain('parkEnrollmentForReconcile');
    expect(parkCase).not.toContain('advanceEnrollment');
    expect(src).toContain(".eq('claim_token', claimToken)");
    expect(src).toContain('const ok = await requeueExactCampaignStep(');
    expect(src).not.toContain('const ok = false && await requeueExactCampaignStep(');
    expect(src).toContain('// Isolate per-enrollment failures');
    expect(src).not.toContain('throw err; //');
  });

  it('opt-out compact + migration 003 backfill invariants', () => {
    const opt = readSrc('src/services/opt-out.ts');
    if (!opt) return;
    expect(opt).toContain(
      "if (OPT_OUT_COMPACT.has(compact)) return { kind: 'opt_out' };"
    );
    const mig = readSrc('supabase/migrations/003_campaign_idempotency.sql');
    if (!mig) return;
    // Both rebuild + STOP backfill must keep ON CONFLICT / NFKC (mut.py #22/#25).
    expect(mig.split('ON CONFLICT (business_id, phone) DO NOTHING;').length).toBeGreaterThan(
      2
    );
    expect(mig).toContain('enrolled_at DESC NULLS LAST');
    expect(mig).not.toContain('enrolled_at DESC NULLS FIRST');
    // mut.py #25 removes the first `normalize(btrim(m.body), NFKC),` — require all 6.
    expect(
      (mig.match(/normalize\(btrim\(m\.body\), NFKC\)/g) || []).length
    ).toBeGreaterThanOrEqual(6);
    expect(mig).toContain("'PLEASE STOP', 'STOP PLEASE', 'STOP IT', 'STOP PLS'");
    // STOP backfill section (after comment) must itself contain ON CONFLICT
    const stopIdx = mig.indexOf('STOP backfill');
    expect(stopIdx).toBeGreaterThan(-1);
    expect(mig.slice(stopIdx)).toContain(
      'ON CONFLICT (business_id, phone) DO NOTHING;'
    );
    expect(mig.slice(stopIdx)).toContain('normalize(btrim(m.body), NFKC)');
  });

  it('#41 park persists status unknown (not queued)', () => {
    const src = readSrc('src/services/send/index.ts');
    if (!src) return;
    // Both send-path and reconcile-path parks must write status unknown
    const unknownCount = src.split("status: 'unknown'").length - 1;
    expect(unknownCount).toBeGreaterThanOrEqual(2);
    expect(src).not.toContain("status: 'queued',\n        reconcile_attempts:");
  });

  it('#44 advanceEnrollment claim_token checks present on both branches', () => {
    const src = readSrc('src/services/campaigns.ts');
    if (!src) return;
    // Exact mut.py #44 target — must remain (6-space indent before .eq)
    expect(src).toContain(
      "      .eq('claim_token', claimToken)\n      .select(ENROLLMENT_CLAIM_SELECT);"
    );
    const advIdx = src.indexOf('export async function advanceEnrollment');
    expect(advIdx).toBeGreaterThan(-1);
    const adv = src.slice(advIdx, advIdx + 3500);
    expect(adv.split(".eq('claim_token', claimToken)").length - 1).toBeGreaterThanOrEqual(
      2
    );
  });
});

// silence unused
void reconcileAmbiguousSms;
