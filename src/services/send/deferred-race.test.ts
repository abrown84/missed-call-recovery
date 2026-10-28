/**
 * QC r8 P2: two concurrent deferred CAS claimers — only one sender wins.
 * In-memory store applies status='deferred' → 'sending' atomically.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessageWithDeps, type SendDeps } from './index';
import { SuppressionLookupError } from '@/services/suppressions';
import {
  markRelayKeySupportConfirmed,
  resetRelayKeySupportConfirmed,
} from '@/services/sms-sid';
import { COL, KIND_RECOVERY, SEND_REASON, SMS_STATUS, TABLE } from '@/services/db-strings';

type Row = Record<string, unknown>;

/**
 * Minimal supabase-shaped store with atomic deferred CAS on update+maybeSingle.
 */
function makeCasDb(state: {
  leads?: Row | null;
  smsBySid: Map<string, Row>;
  insertError?: { code: string; message: string } | null;
}) {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = [];
  let casGate = Promise.resolve();

  function table(name: string) {
    const ctx: {
      filters: Record<string, unknown>;
      payload?: Record<string, unknown>;
    } = { filters: {} };

    const api: Record<string, unknown> = {};
    const asList = (): Record<string, unknown> => {
      const list: Record<string, unknown> = { ...api };
      list.then = (
        resolve: (v: unknown) => unknown,
        reject?: (e: unknown) => unknown
      ) => Promise.resolve({ data: null, error: null }).then(resolve, reject);
      for (const m of ['eq', 'select', 'update', 'maybeSingle', 'single']) {
        list[m] = api[m];
      }
      return list;
    };

    api.eq = (...args: unknown[]) => {
      calls.push({ table: name, op: 'eq', args });
      if (args[0] === COL.messageSid) ctx.filters.message_sid = args[1];
      if (args[0] === COL.status) ctx.filters.status = args[1];
      return asList();
    };
    api.select = (cols?: string) => {
      calls.push({ table: name, op: 'select', args: [cols] });
      return asList();
    };
    api.insert = (payload: unknown) => {
      calls.push({ table: name, op: 'insert', args: [payload] });
      return {
        then: (
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown
        ) =>
          Promise.resolve({
            data: null,
            error: state.insertError ?? null,
          }).then(resolve, reject),
      };
    };
    api.update = (payload: unknown) => {
      calls.push({ table: name, op: 'update', args: [payload] });
      ctx.payload = payload as Record<string, unknown>;
      return asList();
    };

    api.maybeSingle = async () => {
      calls.push({ table: name, op: 'maybeSingle', args: [] });
      if (name === TABLE.leads) {
        return { data: state.leads ?? null, error: null };
      }
      if (name !== TABLE.smsMessages) {
        return { data: null, error: null };
      }

      const sid = ctx.filters.message_sid as string | undefined;
      if (!sid) return { data: null, error: null };

      // Serialize CAS so two concurrent claimers cannot both observe deferred.
      const prev = casGate;
      let release!: () => void;
      casGate = new Promise<void>((r) => {
        release = r;
      });
      await prev;
      try {
        const row = state.smsBySid.get(sid) ?? null;
        if (!row) return { data: null, error: null };

        if (ctx.payload && ctx.filters.status !== undefined) {
          if (String(row.status) !== String(ctx.filters.status)) {
            return { data: null, error: null };
          }
          const next = { ...row, ...ctx.payload };
          state.smsBySid.set(sid, next);
          return { data: next, error: null };
        }

        return { data: row, error: null };
      } finally {
        release();
      }
    };
    api.single = api.maybeSingle;
    return api;
  }

  return { from: (name: string) => table(name), calls, smsBySid: state.smsBySid };
}

function baseDeps(
  overrides: Partial<SendDeps> & { dbImpl?: ReturnType<typeof makeCasDb> }
): SendDeps {
  const dbImpl = overrides.dbImpl ?? makeCasDb({ smsBySid: new Map() });
  return {
    db: () => dbImpl as never,
    adapter: () =>
      ({
        name: 'mock',
        sendMessage: vi.fn(async () => ({
          id: 'mid',
          status: 'queued',
          keyEchoed: true,
        })),
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
    ...overrides,
  };
}

describe('deferred CAS two-sender race (QC r8)', () => {
  beforeEach(() => {
    resetRelayKeySupportConfirmed();
    markRelayKeySupportConfirmed();
  });

  it('only one of two concurrent claimers dispatches to relay', async () => {
    const sid = 'mlf:recovery:Lrace';
    const smsBySid = new Map<string, Row>([[sid, { status: SMS_STATUS.deferred }]]);
    const db = makeCasDb({
      leads: { opted_out: false },
      insertError: { code: '23505', message: 'dup' },
      smsBySid,
    });

    let inFlight = 0;
    let maxInFlight = 0;
    const send = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return { id: 'm', status: 'queued', keyEchoed: true };
    });

    const req = {
      kind: KIND_RECOVERY,
      leadId: 'Lrace',
      businessId: 'B',
      to: '+12135550100',
      body: 'race-body',
      idempotencyKey: sid,
      skipQuietHours: true,
    } as const;

    const depsA = baseDeps({
      dbImpl: db,
      adapter: () => ({ name: 'a', sendMessage: send }) as never,
    });
    const depsB = baseDeps({
      dbImpl: db,
      adapter: () => ({ name: 'b', sendMessage: send }) as never,
    });

    const [a, b] = await Promise.all([
      sendMessageWithDeps(depsA, req),
      sendMessageWithDeps(depsB, req),
    ]);

    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(['blocked', 'sent']);
    const lost = [a, b].find((o) => o.kind === 'blocked');
    expect(lost).toMatchObject({
      kind: 'blocked',
      reason: SEND_REASON.duplicateInFlight,
      detail: 'deferred_claim_lost',
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(maxInFlight).toBe(1);
    expect(smsBySid.get(sid)?.status).toBe(SMS_STATUS.sending);
  });
});
