/**
 * QC r10/r11 P2: real two-connection race on the app's deferred claim path.
 *
 * Runs sendMessageWithDeps over two pg.Pool clients (CI postgres:16 via
 * RACE_DATABASE_URL). Shared-file PGlite smoke removed (load-flaky under
 * Stryker; real Postgres covers the race).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { sendMessageWithDeps, type SendDeps } from './index';
import { SuppressionLookupError } from '@/services/suppressions';
import {
  markRelayKeySupportConfirmed,
  resetRelayKeySupportConfirmed,
} from '@/services/sms-sid';
import {
  KIND_RECOVERY,
  SEND_REASON,
  SMS_STATUS,
} from '@/services/db-strings';

type SqlResult = { rows: Record<string, unknown>[]; rowCount: number };

type SqlExec = (
  text: string,
  params?: unknown[]
) => Promise<SqlResult>;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS leads (
    id text PRIMARY KEY,
    opted_out boolean NOT NULL DEFAULT false,
    sms_outbound_sid text
  );
  CREATE TABLE IF NOT EXISTS sms_messages (
    message_sid text PRIMARY KEY,
    lead_id text,
    direction text,
    body text,
    status text NOT NULL,
    key_supported_at_send boolean DEFAULT false,
    next_retry_at timestamptz,
    reconcile_attempts int DEFAULT 0
  );
`;

/** Minimal PostgREST-shaped client over a raw SQL executor (pg). */
function makeSqlClient(exec: SqlExec) {
  function from(table: string) {
    const state: {
      op: 'select' | 'insert' | 'update' | null;
      payload?: Record<string, unknown>;
      filters: Array<[string, unknown]>;
      columns?: string;
    } = { op: null, filters: [] };

    const api: Record<string, unknown> = {};
    const chain = (): Record<string, unknown> => {
      const list: Record<string, unknown> = { ...api };
      list.then = (
        resolve: (v: unknown) => unknown,
        reject?: (e: unknown) => unknown
      ) => run().then(resolve, reject);
      for (const m of [
        'eq',
        'select',
        'update',
        'insert',
        'maybeSingle',
        'single',
      ]) {
        list[m] = api[m];
      }
      return list;
    };

    api.select = (cols?: string) => {
      if (state.op === null) state.op = 'select';
      state.columns = cols;
      return chain();
    };
    api.insert = (payload: unknown) => {
      state.op = 'insert';
      state.payload = payload as Record<string, unknown>;
      return chain();
    };
    api.update = (payload: unknown) => {
      state.op = 'update';
      state.payload = payload as Record<string, unknown>;
      return chain();
    };
    api.eq = (col: string, val: unknown) => {
      state.filters.push([col, val]);
      return chain();
    };
    api.maybeSingle = async () => {
      const r = await run();
      if (r.error) return { data: null, error: r.error };
      return { data: r.data?.[0] ?? null, error: null };
    };
    api.single = api.maybeSingle;

    async function run(): Promise<{
      data: Record<string, unknown>[] | null;
      error: { code: string; message: string } | null;
    }> {
      try {
        if (state.op === 'insert') {
          const row = state.payload as Record<string, unknown>;
          const cols = Object.keys(row);
          const vals = cols.map((_, i) => `$${i + 1}`);
          await exec(
            `INSERT INTO ${table} (${cols.join(',')}) VALUES (${vals.join(',')})`,
            cols.map((c) => row[c])
          );
          return { data: null, error: null };
        }
        if (state.op === 'update') {
          const row = state.payload as Record<string, unknown>;
          const cols = Object.keys(row);
          const sets = cols.map((c, i) => `${c} = $${i + 1}`);
          const params: unknown[] = cols.map((c) => row[c]);
          const wheres = state.filters.map(([c], i) => {
            params.push(state.filters[i][1]);
            return `${c} = $${cols.length + i + 1}`;
          });
          const returning = state.columns
            ? ` RETURNING ${state.columns}`
            : ' RETURNING *';
          const res = await exec(
            `UPDATE ${table} SET ${sets.join(', ')} WHERE ${wheres.join(' AND ')}${returning}`,
            params
          );
          return { data: res.rows, error: null };
        }
        const params: unknown[] = [];
        const wheres = state.filters.map(([c], i) => {
          params.push(state.filters[i][1]);
          return `${c} = $${i + 1}`;
        });
        const cols = state.columns ?? '*';
        const res = await exec(
          `SELECT ${cols} FROM ${table}${
            wheres.length ? ` WHERE ${wheres.join(' AND ')}` : ''
          }`,
          params
        );
        return { data: res.rows, error: null };
      } catch (err) {
        const e = err as { code?: string; message?: string };
        return {
          data: null,
          error: {
            code: String(e.code ?? 'XX000'),
            message: e.message ?? 'sql error',
          },
        };
      }
    }

    return api;
  }

  return { from };
}

function baseDeps(
  dbImpl: ReturnType<typeof makeSqlClient>,
  send: ReturnType<typeof vi.fn>
): SendDeps {
  return {
    db: () => dbImpl as never,
    adapter: () =>
      ({
        name: 'mock',
        sendMessage: send,
        checkLookupSupport: vi.fn(async () => ({
          supported: true,
          capabilities: { idempotency: true, version: '1.7.6' },
        })),
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
  };
}

const pgUrl =
  process.env.RACE_DATABASE_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  '';

describe('deferred claim two-connection race (QC r10/r11)', () => {
  beforeEach(() => {
    resetRelayKeySupportConfirmed();
    markRelayKeySupportConfirmed();
  });

  const pgDescribe = pgUrl ? describe : describe.skip;

  pgDescribe('real Postgres sendMessageWithDeps claim path', () => {
    let pool: pg.Pool;

    beforeAll(async () => {
      pool = new pg.Pool({ connectionString: pgUrl, max: 4 });
      const c = await pool.connect();
      try {
        await c.query(SCHEMA);
      } finally {
        c.release();
      }
    });

    afterAll(async () => {
      await pool.end();
    });

    it('exactly one of two concurrent claimers dispatches (50 rounds)', async () => {
      let winners = 0;
      let losers = 0;

      for (let round = 0; round < 50; round++) {
        const sid = `mlf:recovery:Lpg-race-${round}`;
        const leadId = `Lpg-race-${round}`;
        const clientA = await pool.connect();
        const clientB = await pool.connect();
        try {
          const execFor =
            (client: pg.PoolClient): SqlExec =>
            async (text, params = []) => {
              const r = await client.query(text, params);
              return {
                rows: r.rows as Record<string, unknown>[],
                rowCount: r.rowCount ?? 0,
              };
            };
          const execA = execFor(clientA);
          const execB = execFor(clientB);

          await execA(`DELETE FROM sms_messages WHERE message_sid = $1`, [sid]);
          await execA(`DELETE FROM leads WHERE id = $1`, [leadId]);
          await execA(`INSERT INTO leads (id, opted_out) VALUES ($1, false)`, [
            leadId,
          ]);
          await execA(
            `INSERT INTO sms_messages (message_sid, lead_id, direction, body, status)
             VALUES ($1, $2, 'outbound', 'seed', $3)`,
            [sid, leadId, SMS_STATUS.deferred]
          );

          const send = vi.fn(async () => {
            await new Promise((r) => setTimeout(r, 5));
            return { id: 'm', status: 'queued', keyEchoed: true };
          });

          const req = {
            kind: KIND_RECOVERY,
            leadId,
            businessId: 'B',
            to: '+12135550100',
            body: `race-body-${round}`,
            idempotencyKey: sid,
            skipQuietHours: true,
          } as const;

          const [a, b] = await Promise.all([
            sendMessageWithDeps(baseDeps(makeSqlClient(execA), send), req),
            sendMessageWithDeps(baseDeps(makeSqlClient(execB), send), req),
          ]);

          expect(send).toHaveBeenCalledTimes(1);
          const kinds = [a.kind, b.kind].sort();
          const okPair =
            (kinds[0] === 'blocked' && kinds[1] === 'sent') ||
            (kinds[0] === 'sent' && kinds[1] === 'sent');
          expect(
            okPair,
            `round ${round}: unexpected outcomes ${JSON.stringify([a, b])}`
          ).toBe(true);
          if (kinds[0] === 'blocked') {
            const lost = [a, b].find((o) => o.kind === 'blocked') as {
              detail?: string;
            };
            expect(lost).toMatchObject({
              kind: 'blocked',
              reason: SEND_REASON.duplicateInFlight,
            });
            expect([
              'deferred_claim_lost',
              'sending',
              'duplicate_in_flight',
            ]).toContain(lost.detail);
            losers += 1;
          }
          winners += 1;
        } finally {
          clientA.release();
          clientB.release();
        }
      }

      expect(winners).toBe(50);
      expect(losers).toBeGreaterThan(0);
    }, 60_000);
  });
});
