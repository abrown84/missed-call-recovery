/**
 * QC r7: behavioural killers for mut.py IDs that previously relied on
 * source-text greps (#16, #19, #22, #24, #25, #26, #31, #32, #49).
 * #50 lives in scripts/staging-ssl.mjs + src/lib/staging-ssl.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PGlite } from '@electric-sql/pglite';
import { classifyOptOut } from '@/services/opt-out';
import { smsConfirmSentPayload } from '@/services/send/send-io-plans';
import { reconcileOneWithDeps } from '@/services/send';
import { SuppressionLookupError } from '@/services/suppressions';
import {
  markRelayKeySupportConfirmed,
  resetRelayKeySupportConfirmed,
} from '@/services/sms-sid';
import {
  ENROLLMENT_CLAIM_SELECT,
  selectCoversFilterColumns,
} from '@/lib/postgrest-select';
import { switchEnrollmentCampaignWithDeps } from '@/services/campaign-runtime';
import { defaultCampaignDeps } from '@/services/campaign-deps';
import { CLAIM_STALE_MS } from '@/services/campaign-logic';

const mockFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: (...a: unknown[]) => mockFrom(...a) }),
}));

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

describe('mut.py #19 compact whole-message forms', () => {
  it('S T O P / STOP STOP compact to opt_out', () => {
    expect(classifyOptOut('S T O P').kind).toBe('opt_out');
    expect(classifyOptOut('STOP STOP').kind).toBe('opt_out');
    expect(classifyOptOut('  S   T   O   P  ').kind).toBe('opt_out');
  });
});

describe('mut.py #31 key_supported_at_send preserves false', () => {
  it('payload keeps false (not forced true)', () => {
    expect(
      smsConfirmSentPayload({
        providerStatus: 'queued',
        keySupportedAtSend: false,
      })
    ).toEqual({
      status: 'queued',
      key_supported_at_send: false,
    });
    expect(
      smsConfirmSentPayload({
        providerStatus: 'queued',
        keySupportedAtSend: true,
      }).key_supported_at_send
    ).toBe(true);
  });
});

describe('mut.py #32 reconcile uses stored key_supported_at_send', () => {
  beforeEach(() => {
    resetRelayKeySupportConfirmed();
    markRelayKeySupportConfirmed();
  });

  function reconcileDeps(lookup: ReturnType<typeof vi.fn>) {
    const api: Record<string, any> = {};
    const self = () => api;
    for (const m of [
      'eq',
      'lte',
      'lt',
      'is',
      'or',
      'in',
      'order',
      'limit',
      'select',
      'update',
    ]) {
      api[m] = vi.fn(self);
    }
    api.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    const deps = {
      db: () => ({ from: () => api }) as never,
      adapter: () =>
        ({
          name: 'm',
          lookupByIdempotencyKey: lookup,
          checkLookupSupport: async () => ({ supported: true }),
        }) as never,
      clock: () => new Date('2026-06-15T15:00:00.000Z'),
      sendsEnabled: () => true,
      isPhoneSuppressed: async () => false,
      SuppressionLookupError,
      quietHours: () => ({
        allowed: true as const,
        zones: ['America/New_York'] as string[],
        endHour: 21,
      }),
      capsConfirmed: () => true,
      ensureCaps: async () => true,
      warnLookupUnsupported: async () => ({ supported: true }),
    };
    return { api, deps };
  }

  it('never_sent + key_supported false → needs_review (not requeue)', async () => {
    // mut.py #32 forces keySupportedAtSend: true, which would requeue_never_sent.
    const lookup = vi.fn(async () => ({
      outcome: 'never_sent' as const,
      found: false,
    }));
    const { deps } = reconcileDeps(lookup);
    const result = await reconcileOneWithDeps(deps, {
      id: '1',
      lead_id: 'L',
      message_sid: 'mlf:campaign:E:C:step:1',
      status: 'unknown',
      reconcile_attempts: 0,
      key_supported_at_send: false,
    });
    expect(lookup).toHaveBeenCalled();
    expect(result.kind).toBe('needs_review');
    expect(result).toMatchObject({
      kind: 'needs_review',
      reason: 'never_sent_without_key_support',
    });
  });

  it('never_sent + key_supported true → requeue path', async () => {
    const lookup = vi.fn(async () => ({
      outcome: 'never_sent' as const,
      found: false,
    }));
    const { deps } = reconcileDeps(lookup);
    const result = await reconcileOneWithDeps(deps, {
      id: '1',
      lead_id: 'L',
      message_sid: 'mlf:campaign:E:C:step:1',
      status: 'unknown',
      reconcile_attempts: 0,
      key_supported_at_send: true,
    });
    expect(result.kind).toBe('never_sent');
  });
});

describe('mut.py #16 campaign leadTimezone from plan', () => {
  it('planCampaignSendPre exposes lead timezone (not null)', async () => {
    const { planCampaignSendPre } = await import(
      '@/services/campaign-send-plan'
    );
    const pre = planCampaignSendPre({
      enrollmentFound: true,
      claimToken: 'tok',
      optedOut: false,
      suppressed: false,
      suppressionLookupFailed: false,
      steps: [
        { step_number: 1, delay_minutes: 0, template_key: 's1' },
        { step_number: 2, delay_minutes: 30, template_key: 's2' },
      ],
      currentStep: 2,
      leadTimezone: 'America/Denver',
    });
    expect(pre.type).toBe('send');
    if (pre.type === 'send') {
      expect(pre.leadTimezone).toBe('America/Denver');
      expect(pre.leadTimezone).not.toBeNull();
    }
  });
});

describe('mut.py #49 switch select must cover claim filter columns', () => {
  it('switch succeeds only when claim_token/claimed_at are selectable (id-only CAS fails)', async () => {
    const now = new Date('2026-06-15T18:00:00.000Z');
    const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS).toISOString();
    // Claim columns referenced by the switch `.or(...)` filter (PostgREST 42703).
    const claimFilters = [
      { or: `claim_token.is.null,claimed_at.lt.${staleBefore}` },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaign_enrollments') {
        const b = chain({
          data: {
            id: 'e',
            lead_id: 'L',
            campaign_id: 'old',
            status: 'active',
            claimed_at: '2000-01-01T00:00:00.000Z',
            claim_token: 'stale',
          },
          error: null,
        });
        b.update = vi.fn(() => {
          const u = chain({
            data: {
              id: 'e',
              claim_token: null,
              claimed_at: null,
            },
            error: null,
          });
          u.select = vi.fn((cols: string) => {
            // Mimic PostgREST: filter columns missing from select → 42703 / lost claim.
            const cover = selectCoversFilterColumns(cols, claimFilters);
            if (!cover.ok) {
              u.maybeSingle = vi.fn(async () => ({
                data: null,
                error: {
                  code: '42703',
                  message: `missing filter cols: ${cover.missing.join(',')}`,
                },
              }));
            } else {
              // Representation must include claim fields used by the CAS filters.
              u.maybeSingle = vi.fn(async () => ({
                data: {
                  id: 'e',
                  claim_token: null,
                  claimed_at: null,
                },
                error: null,
              }));
            }
            return u;
          });
          return u;
        });
        return b;
      }
      if (table === 'leads') {
        return chain({
          data: {
            id: 'L',
            sms_outbound_sid: 'mlf:recovery:L',
            opted_out: false,
          },
          error: null,
        });
      }
      if (table === 'campaigns') {
        return chain({
          data: {
            id: 'new',
            name: 'Emergency',
            urgency_filter: 'emergency',
            campaign_steps: [
              { step_number: 1, delay_minutes: 0, template_key: 'e1' },
              { step_number: 2, delay_minutes: 30, template_key: 'e2' },
            ],
          },
          error: null,
        });
      }
      return chain({ data: null, error: null });
    });

    const ok = await switchEnrollmentCampaignWithDeps(
      {
        ...defaultCampaignDeps(),
        db: () => ({ from: mockFrom }) as never,
        clock: () => now,
      } as never,
      'L',
      'new'
    );
    expect(ok.enrolled).toBe(true);
    // Document the mutant: select('id') alone cannot cover claim filters.
    expect(selectCoversFilterColumns('id', claimFilters).ok).toBe(false);
    expect(
      selectCoversFilterColumns(ENROLLMENT_CLAIM_SELECT, claimFilters).ok
    ).toBe(true);
  });
});

describe('mut.py #22/#24/#25/#26 migration 003 behavioural (PGlite)', () => {
  function stripUnsupported(sql: string): string {
    return sql
      .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g, '')
      .replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto";/g, '');
  }

  async function bootWithMessages(
    messages: Array<{ body: string; sid: string }>
  ) {
    const db = new PGlite();
    await db.exec(`
      CREATE OR REPLACE FUNCTION uuid_generate_v4() RETURNS uuid
        AS $$ SELECT gen_random_uuid() $$ LANGUAGE sql;
    `);
    await db.exec(
      stripUnsupported(
        readFileSync(join(process.cwd(), 'supabase/schema.sql'), 'utf8')
      )
    );
    await db.exec(
      stripUnsupported(
        readFileSync(
          join(process.cwd(), 'supabase/migrations/001_campaigns.sql'),
          'utf8'
        )
      )
    );
    await db.exec(
      stripUnsupported(
        readFileSync(
          join(process.cwd(), 'supabase/migrations/002_secure_rls.sql'),
          'utf8'
        )
      )
    );
    await db.exec(`
      ALTER TABLE sms_messages DROP CONSTRAINT IF EXISTS sms_messages_message_sid_key;
      ALTER TABLE campaign_enrollments DROP CONSTRAINT IF EXISTS campaign_enrollments_lead_id_campaign_id_key;
      INSERT INTO businesses (id, name, phone) VALUES
        ('11111111-1111-4111-8111-111111111111', 'Acme', '+15551234567');
      INSERT INTO missed_calls (id, business_id, caller_phone, call_sid) VALUES
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', '+15559876543', 'c1');
      INSERT INTO leads (id, business_id, missed_call_id, caller_phone) VALUES
        ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111',
         'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '5559876543');
    `);
    for (const m of messages) {
      await db.exec(
        `INSERT INTO sms_messages (lead_id, direction, body, message_sid, sent_at)
         VALUES ('44444444-4444-4444-8444-444444444444', 'inbound', $$${m.body}$$, '${m.sid}', NOW())`
      );
    }
    await db.exec(`
      INSERT INTO campaign_enrollments (lead_id, campaign_id, current_step, status, enrolled_at, created_at)
      SELECT '44444444-4444-4444-8444-444444444444', id, 1, 'active', NULL, '2026-01-02'
      FROM campaigns WHERE name = 'Standard Follow-up' LIMIT 1;
      INSERT INTO campaign_enrollments (lead_id, campaign_id, current_step, status, enrolled_at, created_at)
      SELECT '44444444-4444-4444-8444-444444444444', id, 2, 'active', '2026-01-01', '2026-01-01'
      FROM campaigns WHERE name = 'Standard Follow-up' LIMIT 1;
    `);
    const forward = readFileSync(
      join(process.cwd(), 'supabase/migrations/003_campaign_idempotency.sql'),
      'utf8'
    );
    await db.exec(forward);
    return db;
  }

  it('#26 STOP PLEASE backfills; mid-sentence END does not', async () => {
    const db = await bootWithMessages([
      { body: 'STOP PLEASE', sid: 'sp1' },
      { body: 'Can you come by end of day?', sid: 'mid1' },
    ]);
    const suppress = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM sms_suppressions WHERE reason = 'opt_out_backfill'`
    );
    expect(suppress.rows[0].n).toBe(1);
    const lead = await db.query<{ opted_out: boolean }>(
      `SELECT opted_out FROM leads WHERE id = '44444444-4444-4444-8444-444444444444'`
    );
    expect(lead.rows[0].opted_out).toBe(true);
  }, 90_000);

  it('#25 NFKC fullwidth STOP PLEASE backfills (exact arm, not compact)', async () => {
    // Fullwidth "STOP PLEASE" — compact form STOPPLEASE is NOT in the compact
    // list, so only the NFKC exact-arm match works. mut.py #25 strips the
    // first normalize(..., NFKC); without it this must not suppress.
    const body =
      '\uFF33\uFF34\uFF2F\uFF30\u0020\uFF30\uFF2C\uFF25\uFF21\uFF33\uFF25';
    const db = await bootWithMessages([{ body, sid: 'fw1' }]);
    const suppress = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM sms_suppressions WHERE reason = 'opt_out_backfill'`
    );
    expect(suppress.rows[0].n).toBe(1);
  }, 90_000);

  it('#22 ON CONFLICT keeps a single suppression row after rebuild+backfill', async () => {
    // Pre-seed a suppression that survives DELETE→rebuild, then STOP backfill
    // hits the same (business_id, phone) — requires ON CONFLICT DO NOTHING.
    const db = await bootWithMessages([{ body: 'STOP', sid: 'a' }]);
    // Re-run only the backfill insert would conflict; full migration already
    // ran once. Insert a duplicate-prone second STOP and re-exec backfill SQL.
    await db.exec(
      `INSERT INTO sms_messages (lead_id, direction, body, message_sid, sent_at)
       VALUES ('44444444-4444-4444-8444-444444444444', 'inbound', 'STOP', 'a2', NOW())`
    );
    const forward = readFileSync(
      join(process.cwd(), 'supabase/migrations/003_campaign_idempotency.sql'),
      'utf8'
    );
    const backfill = forward.slice(
      forward.indexOf('-- 3) STOP backfill'),
      forward.indexOf('-- Mark leads opted_out')
    );
    await db.exec(backfill);
    const suppress = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM sms_suppressions`
    );
    expect(suppress.rows[0].n).toBe(1);
  }, 90_000);

  it('#24 NULLS LAST keeps enrolled_at over null', async () => {
    const db = await bootWithMessages([{ body: 'hello', sid: 'h1' }]);
    const enroll = await db.query<{ n: number; step: number }>(
      `SELECT COUNT(*)::int AS n, MAX(current_step)::int AS step
       FROM campaign_enrollments
       WHERE lead_id = '44444444-4444-4444-8444-444444444444'`
    );
    expect(enroll.rows[0].n).toBe(1);
    expect(enroll.rows[0].step).toBe(2);
  }, 90_000);
});
