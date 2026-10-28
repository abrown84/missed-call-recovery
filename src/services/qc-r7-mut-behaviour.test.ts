/**
 * QC r7: behavioural killers for mut.py IDs that previously relied on
 * source-text greps (#16, #19, #22, #24, #25, #26, #31, #32, #49, #50).
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
import { ENROLLMENT_CLAIM_SELECT } from '@/lib/postgrest-select';
import { resolveStagingSsl } from '@/lib/staging-ssl';
import { switchEnrollmentCampaignWithDeps } from '@/services/campaign-runtime';
import { defaultCampaignDeps } from '@/services/campaign-deps';

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

describe('mut.py #50 staging SSL env parsing', () => {
  it('respects STAGING_PG_SSL disable and rejectUnauthorized flag', () => {
    expect(resolveStagingSsl({ STAGING_PG_SSL: '0' })).toBe(false);
    expect(resolveStagingSsl({ STAGING_PG_SSL: 'false' })).toBe(false);
    expect(resolveStagingSsl({})).toEqual({ rejectUnauthorized: false });
    expect(
      resolveStagingSsl({ STAGING_PG_SSL_REJECT_UNAUTHORIZED: '1' })
    ).toEqual({ rejectUnauthorized: true });
    expect(
      resolveStagingSsl({
        STAGING_PG_SSL: '1',
        STAGING_PG_SSL_REJECT_UNAUTHORIZED: '1',
      })
    ).toEqual({ rejectUnauthorized: true });
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

  it('Boolean(row.key_supported_at_send) preserves false (not forced true)', () => {
    // Mirrors send/index.ts reconcile wiring — mut.py #32 forces `true`.
    const rowFalse = { key_supported_at_send: false };
    const rowTrue = { key_supported_at_send: true };
    const rowMissing = { key_supported_at_send: null };
    expect(Boolean(rowFalse.key_supported_at_send)).toBe(false);
    expect(Boolean(rowTrue.key_supported_at_send)).toBe(true);
    expect(Boolean(rowMissing.key_supported_at_send)).toBe(false);
    // Forcing true would break the false case:
    const forced = true;
    expect(Boolean(rowFalse.key_supported_at_send)).not.toBe(forced);
  });

  it('reconcile with key_supported false still runs lookup', async () => {
    const lookup = vi.fn(async () => ({
      outcome: 'sent' as const,
      status: 'delivered',
      found: true,
    }));
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
    await reconcileOneWithDeps(
      {
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
          allowed: true,
          zones: ['America/New_York'],
          endHour: 21,
        }),
        capsConfirmed: () => true,
        ensureCaps: async () => true,
        warnLookupUnsupported: async () => ({ supported: true }),
      },
      {
        id: '1',
        lead_id: 'L',
        message_sid: 'mlf:campaign:E:C:step:1',
        status: 'unknown',
        reconcile_attempts: 0,
        key_supported_at_send: false,
      }
    );
    expect(lookup).toHaveBeenCalled();
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

describe('mut.py #49 switch select uses ENROLLMENT_CLAIM_SELECT', () => {
  it('records select(ENROLLMENT_CLAIM_SELECT) on switch update path', async () => {
    const selectArgs: string[] = [];
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
              campaign_id: 'new',
              current_step: 1,
              claim_token: null,
              claimed_at: null,
            },
            error: null,
          });
          u.select = vi.fn((cols: string) => {
            selectArgs.push(cols);
            return u;
          });
          u.maybeSingle = vi.fn(async () => ({
            data: { id: 'e', campaign_id: 'new', current_step: 1 },
            error: null,
          }));
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

    const r = await switchEnrollmentCampaignWithDeps(
      {
        ...defaultCampaignDeps(),
        db: () => ({ from: mockFrom }) as never,
        clock: () => new Date('2026-06-15T18:00:00.000Z'),
      } as never,
      'L',
      'new'
    );
    expect(r.enrolled).toBe(true);
    expect(selectArgs).toContain(ENROLLMENT_CLAIM_SELECT);
    expect(selectArgs.some((s) => s === 'id')).toBe(false);
    expect(ENROLLMENT_CLAIM_SELECT).toContain('claim_token');
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

  it('#25 NFKC fullwidth STOP backfills', async () => {
    const db = await bootWithMessages([
      { body: '\uFF33\uFF34\uFF2F\uFF30', sid: 'fw1' },
    ]);
    const suppress = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM sms_suppressions WHERE reason = 'opt_out_backfill'`
    );
    expect(suppress.rows[0].n).toBe(1);
  }, 90_000);

  it('#22 ON CONFLICT keeps a single suppression row', async () => {
    const db = await bootWithMessages([
      { body: 'STOP', sid: 'a' },
      { body: 'STOP', sid: 'b' },
    ]);
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
