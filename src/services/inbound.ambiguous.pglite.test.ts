/**
 * Ambiguous opt-out: PGlite enrollment pause + DI paths (pause fail-closed, notify flag).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import {
  processInboundSmsWithDeps,
  type InboundSmsEvent,
} from './inbound';
import type { InboundDeps, SupabaseClient } from './inbound-deps';
import { classifyOptOut } from './opt-out';
import { pauseCampaignForLeadWithDeps } from './campaign-runtime';
import { defaultCampaignDeps } from './campaign-deps';

const FIXED = new Date('2026-10-28T12:00:00.000Z');
const BIZ = {
  id: '11111111-1111-4111-8111-111111111111',
  phone: '+15551234567',
  name: 'Acme',
  vertical: 'plumbing',
};

function stripUnsupported(sql: string): string {
  return sql
    .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g, '')
    .replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto";/g, '');
}

async function bootCampaignDb(): Promise<PGlite> {
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
  await db.exec(
    stripUnsupported(
      readFileSync(
        join(process.cwd(), 'supabase/migrations/003_campaign_idempotency.sql'),
        'utf8'
      )
    )
  );
  return db;
}

function pgliteCampaignDeps(db: PGlite) {
  return {
    ...defaultCampaignDeps(),
    db: () =>
      ({
        from: (table: string) => {
          const filters: Record<string, unknown> = {};
          const api: Record<string, unknown> = {};
          const self = () => api;
          for (const m of ['select', 'update', 'eq']) {
            api[m] = (...args: unknown[]) => {
              if (m === 'eq') {
                filters[String(args[0])] = args[1];
              }
              return self();
            };
          }
          api.then = (
            resolve: (v: unknown) => unknown,
            reject?: (e: unknown) => unknown
          ) => {
            if (table !== 'campaign_enrollments') {
              return Promise.resolve({ data: null, error: null }).then(
                resolve,
                reject
              );
            }
            const leadId = filters.lead_id as string | undefined;
            const status = filters.status as string | undefined;
            if (leadId && status === 'active') {
              return db
                .query(
                  `UPDATE campaign_enrollments
                   SET status = 'paused', paused_at = NOW(), updated_at = NOW()
                   WHERE lead_id = $1 AND status = 'active'
                   RETURNING id`,
                  [leadId]
                )
                .then(
                  (r) =>
                    resolve({
                      data: r.rows[0] ?? null,
                      error: r.rows.length ? null : { message: 'miss' },
                    }),
                  reject
                );
            }
            return Promise.resolve({ data: null, error: null }).then(
              resolve,
              reject
            );
          };
          return api;
        },
      }) as never,
    clock: () => FIXED,
  };
}

type QueryResult = { data: unknown; error: unknown };

function chain(result: QueryResult) {
  const obj: Record<string, unknown> = {};
  const self = () => obj;
  for (const m of [
    'select',
    'insert',
    'update',
    'eq',
    'in',
    'gte',
    'order',
    'limit',
  ]) {
    obj[m] = vi.fn(self);
  }
  obj.single = vi.fn(async () => result);
  obj.maybeSingle = vi.fn(async () => result);
  obj.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return obj;
}

function buildInboundDeps(over: Partial<InboundDeps> & {
  from?: ReturnType<typeof vi.fn>;
}): InboundDeps {
  const from =
    over.from ??
    vi.fn((table: string) => {
      if (table === 'businesses') {
        return chain({ data: BIZ, error: null });
      }
      return chain({ data: null, error: null });
    });

  return {
    db: () => ({ from }) as unknown as SupabaseClient,
    clock: () => FIXED,
    randomSuffix: () => 'amb00001',
    classifyOptOut,
    isOptOutMessage: () => false,
    classifyUrgency: vi.fn(async () => ({
      urgency: 'normal' as const,
      confidence: 0.5,
      keywords: [],
      issue: 'general',
    })),
    escalateLead: vi.fn(async () => undefined),
    notifyPossibleOptOut: vi.fn(async () => true),
    handleClassifiedReplyEnrollment: vi.fn(async () => ({
      action: 'noop',
      campaignName: undefined,
    })),
    pauseCampaignForLead: vi.fn(async () => undefined),
    leadHasActiveEnrollment: vi.fn(async () => false),
    markLeadOptedOut: vi.fn(async () => undefined),
    suppressPhoneForBusiness: vi.fn(async () => undefined),
    tryNormalizeToE164: (p: string) => (p.startsWith('+') ? p : null),
    isLeadWithinLookupAge: () => true,
    redactPhone: (p: string | null | undefined) => `***${String(p).slice(-4)}`,
    ...over,
  };
}

const ambiguousEvent = (body: string): InboundSmsEvent => ({
  from: '+15559876543',
  businessPhone: BIZ.phone,
  body,
  messageId: 'msg-ambiguous-pglite',
});

describe('ambiguous inbound (PGlite enrollment truth)', () => {
  it('pauses active enrollment for lead older than 7 days via SQL', async () => {
    const db = await bootCampaignDb();
    const leadId = '44444444-4444-4444-8444-444444444444';
    await db.exec(`
      INSERT INTO businesses (id, name, phone) VALUES
        ('${BIZ.id}', '${BIZ.name}', '${BIZ.phone}');
      INSERT INTO missed_calls (id, business_id, caller_phone, call_sid) VALUES
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '${BIZ.id}', '+15559876543', 'mc-old');
      INSERT INTO leads (id, business_id, missed_call_id, caller_phone, status, created_at) VALUES
        ('${leadId}', '${BIZ.id}', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '+15559876543', 'qualified',
         NOW() - INTERVAL '10 days');
      INSERT INTO campaign_enrollments (lead_id, campaign_id, current_step, status, enrolled_at)
      SELECT '${leadId}', id, 1, 'active', NOW() - INTERVAL '10 days'
      FROM campaigns WHERE name = 'Standard Follow-up' LIMIT 1;
    `);

    const deps = pgliteCampaignDeps(db);
    await pauseCampaignForLeadWithDeps(deps, leadId);

    const row = await db.query<{ status: string }>(
      `SELECT status::text AS status FROM campaign_enrollments WHERE lead_id = $1`,
      [leadId]
    );
    expect(row.rows[0].status).toBe('paused');
  }, 120_000);
});

describe('ambiguous inbound (DI — pause / notify contracts)', () => {
  it('propagates pause failure (not swallowed; campaignPaused not asserted on success path)', async () => {
    const lead = {
      id: 'lead-pause-fail',
      created_at: FIXED.toISOString(),
      status: 'pending',
    };
    const from = vi.fn((table: string) => {
      if (table === 'businesses') {
        return chain({ data: BIZ, error: null });
      }
      if (table === 'leads') {
        const c = chain({ data: lead, error: null });
        c.update = vi.fn(() => c);
        return c;
      }
      if (table === 'sms_messages') {
        const c = chain({ data: null, error: null });
        c.insert = vi.fn(() => c);
        return c;
      }
      return chain({ data: null, error: null });
    });

    const deps = buildInboundDeps({
      from,
      isLeadWithinLookupAge: () => true,
      pauseCampaignForLead: vi.fn(async () => {
        throw new Error('pause failed');
      }),
    });

    await expect(
      processInboundSmsWithDeps(
        deps,
        ambiguousEvent('Stop texting me, I already hired someone')
      )
    ).rejects.toThrow('pause failed');
  });

  it('notify false after pause → InboundError 502 (fail-closed for BRWN retry)', async () => {
    const lead = {
      id: 'lead-notify-false',
      created_at: FIXED.toISOString(),
      status: 'pending',
    };
    const from = vi.fn((table: string) => {
      if (table === 'businesses') {
        return chain({ data: BIZ, error: null });
      }
      if (table === 'leads') {
        const c = chain({ data: lead, error: null });
        c.update = vi.fn(() => c);
        return c;
      }
      if (table === 'sms_messages') {
        const c = chain({ data: null, error: null });
        c.insert = vi.fn(() => c);
        return c;
      }
      return chain({ data: null, error: null });
    });

    const deps = buildInboundDeps({
      from,
      notifyPossibleOptOut: vi.fn(async () => false),
    });

    await expect(
      processInboundSmsWithDeps(
        deps,
        ambiguousEvent('Can you stop by at 3?')
      )
    ).rejects.toMatchObject({
      name: 'InboundError',
      status: 502,
      message: expect.stringMatching(/notify failed/i),
    });
  });

  it('age-gated miss still pauses when leadHasActiveEnrollment finds enrollment', async () => {
    const staleLead = {
      id: 'lead-stale-enrolled',
      created_at: new Date(FIXED.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'qualified',
    };
    let leadsCalls = 0;
    const from = vi.fn((table: string) => {
      if (table === 'businesses') {
        return chain({ data: BIZ, error: null });
      }
      if (table === 'leads') {
        leadsCalls += 1;
        const enrollmentLookup = leadsCalls >= 3;
        const c = chain({ data: null, error: null });
        c.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
        if (enrollmentLookup) {
          c.then = (
            resolve: (v: unknown) => unknown,
            reject?: (e: unknown) => unknown
          ) =>
            Promise.resolve({ data: [staleLead], error: null }).then(
              resolve,
              reject
            );
        }
        c.update = vi.fn(() => c);
        return c;
      }
      if (table === 'sms_messages') {
        const c = chain({ data: null, error: null });
        c.insert = vi.fn(() => c);
        return c;
      }
      return chain({ data: null, error: null });
    });

    const pauseCampaignForLead = vi.fn(async () => undefined);
    const leadHasActiveEnrollment = vi.fn(async (id: string) => id === staleLead.id);

    const deps = buildInboundDeps({
      from,
      isLeadWithinLookupAge: () => false,
      leadHasActiveEnrollment,
      pauseCampaignForLead,
    });

    const result = await processInboundSmsWithDeps(
      deps,
      ambiguousEvent('Stop texting me, I already hired someone')
    );

    expect(result).toMatchObject({
      status: 'ambiguous_opt_out',
      leadId: staleLead.id,
      campaignPaused: true,
    });
    expect(leadHasActiveEnrollment).toHaveBeenCalledWith(staleLead.id);
    expect(pauseCampaignForLead).toHaveBeenCalledWith(staleLead.id);
    expect(leadsCalls).toBeGreaterThanOrEqual(3);
  });

  it('legacy raw phone is searched when E.164 differs (active enrollment)', async () => {
    const raw = '5559876543';
    const e164 = '+15559876543';
    const staleLead = {
      id: 'lead-legacy-phone',
      created_at: new Date(FIXED.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'qualified',
      caller_phone: raw,
    };
    const phonesQueried: string[] = [];
    const from = vi.fn((table: string) => {
      if (table === 'businesses') {
        return chain({ data: BIZ, error: null });
      }
      if (table === 'leads') {
        const c = chain({ data: null, error: null });
        c.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
        c.eq = vi.fn((col: string, val: unknown) => {
          if (col === 'caller_phone') phonesQueried.push(String(val));
          return c;
        });
        c.then = (
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown
        ) => {
          const phone = phonesQueried[phonesQueried.length - 1];
          const rows = phone === raw ? [staleLead] : [];
          return Promise.resolve({ data: rows, error: null }).then(
            resolve,
            reject
          );
        };
        c.update = vi.fn(() => c);
        return c;
      }
      if (table === 'sms_messages') {
        const c = chain({ data: null, error: null });
        c.insert = vi.fn(() => c);
        return c;
      }
      return chain({ data: null, error: null });
    });

    const pauseCampaignForLead = vi.fn(async () => undefined);
    const result = await processInboundSmsWithDeps(
      buildInboundDeps({
        from,
        isLeadWithinLookupAge: () => false,
        tryNormalizeToE164: (p: string) => (p === raw ? e164 : null),
        leadHasActiveEnrollment: vi.fn(async (id: string) => id === staleLead.id),
        pauseCampaignForLead,
      }),
      {
        from: raw,
        businessPhone: BIZ.phone,
        body: 'Stop texting me, I already hired someone',
        messageId: 'msg-legacy',
      }
    );

    expect(result).toMatchObject({
      status: 'ambiguous_opt_out',
      leadId: staleLead.id,
      campaignPaused: true,
    });
    expect(phonesQueried).toContain(raw);
    expect(pauseCampaignForLead).toHaveBeenCalledWith(staleLead.id);
  });

  it('null candidate list does not invent rows (Array.isArray guard)', async () => {
    const from = vi.fn((table: string) => {
      if (table === 'businesses') {
        return chain({ data: BIZ, error: null });
      }
      if (table === 'leads') {
        const c = chain({ data: null, error: null });
        c.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
        // Enrollment lookup returns SQL null (not []).
        c.then = (
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown
        ) => Promise.resolve({ data: null, error: null }).then(resolve, reject);
        return c;
      }
      return chain({ data: null, error: null });
    });
    const leadHasActiveEnrollment = vi.fn(async () => true);
    const result = await processInboundSmsWithDeps(
      buildInboundDeps({
        from,
        isLeadWithinLookupAge: () => false,
        leadHasActiveEnrollment,
      }),
      ambiguousEvent('Can you stop by at 3?')
    );
    expect(result).toEqual({ status: 'ambiguous_opt_out' });
    expect(leadHasActiveEnrollment).not.toHaveBeenCalled();
  });

  it('does not overwrite a found lead via forced legacy lookup', async () => {
    const raw = '5551112222';
    const e164 = '+15551112222';
    const recent = {
      id: 'lead-recent',
      created_at: FIXED.toISOString(),
      status: 'pending',
    };
    let legacyHits = 0;
    const from = vi.fn((table: string) => {
      if (table === 'businesses') {
        return chain({ data: BIZ, error: null });
      }
      if (table === 'leads') {
        const c = chain({ data: recent, error: null });
        c.eq = vi.fn((col: string, val: unknown) => {
          if (col === 'caller_phone' && val === raw) legacyHits += 1;
          return c;
        });
        c.maybeSingle = vi.fn(async () => {
          // Age-gated pending hit; legacy raw-phone lookup returns null.
          if (legacyHits > 0) return { data: null, error: null };
          return { data: recent, error: null };
        });
        c.update = vi.fn(() => c);
        return c;
      }
      if (table === 'sms_messages') {
        const c = chain({ data: null, error: null });
        c.insert = vi.fn(() => c);
        return c;
      }
      return chain({ data: null, error: null });
    });

    const result = await processInboundSmsWithDeps(
      buildInboundDeps({
        from,
        tryNormalizeToE164: (p: string) => (p === raw ? e164 : null),
        isLeadWithinLookupAge: () => true,
        pauseCampaignForLead: vi.fn(async () => undefined),
      }),
      {
        from: raw,
        businessPhone: BIZ.phone,
        body: 'Stop texting me, I already hired someone',
        messageId: 'msg-no-overwrite',
      }
    );

    expect(result).toMatchObject({
      status: 'ambiguous_opt_out',
      leadId: 'lead-recent',
      campaignPaused: true,
    });
  });
});
