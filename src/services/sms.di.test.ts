import { describe, expect, it, vi } from 'vitest';
import {
  buildRecoveryBody,
  fallbackDeferIso,
  persistDeferredRecoveryWithDeps,
  processDeferredRecoveriesWithDeps,
  sendFollowUpSMSWithDeps,
  sendRecoverySMSWithDeps,
  SMS_TEMPLATES,
  type SmsDeps,
  type SmsLogger,
} from './sms';
import { SuppressionLookupError } from '@/services/suppressions';
import { recoveryMessageSid } from '@/services/sms-sid';
import type { SendOutcome } from '@/services/send/types';
import {
  COL,
  DIRECTION_OUTBOUND,
  KIND_MANUAL,
  KIND_RECOVERY,
  SMS_SELECT_DEFERRED,
  SMS_SELECT_ID_STATUS,
  SMS_STATUS,
  TABLE,
} from '@/services/db-strings';

type Business = {
  id: string;
  name: string;
  vertical: string;
  timezone: string;
  settings: Record<string, unknown>;
};

const business: Business = {
  id: 'B',
  name: 'Acme Plumbing',
  vertical: 'plumbing',
  timezone: 'America/Los_Angeles',
  settings: {},
};

function makeLogger(): SmsLogger & { calls: Array<{ level: string; args: unknown[] }> } {
  const calls: Array<{ level: string; args: unknown[] }> = [];
  return {
    calls,
    log: (...args: unknown[]) => {
      calls.push({ level: 'log', args });
    },
    warn: (...args: unknown[]) => {
      calls.push({ level: 'warn', args });
    },
    error: (...args: unknown[]) => {
      calls.push({ level: 'error', args });
    },
  };
}

function makeDb(state: {
  existing?: { id: string; status: string } | null;
  insertError?: { code: string; message: string } | null;
  deferredRows?: Array<Record<string, unknown>>;
  lead?: Record<string, unknown> | null;
  queryError?: { message: string } | null;
}) {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = [];
  return {
    calls,
    from: (table: string) => {
      const api: Record<string, unknown> = {};
      const chain = () => api;
      const asList = () => ({
        ...api,
        then: (
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown
        ) => {
          if (table === TABLE.smsMessages && state.deferredRows !== undefined) {
            return Promise.resolve({
              data: state.deferredRows,
              error: state.queryError ?? null,
            }).then(resolve, reject);
          }
          return Promise.resolve({
            data: null,
            error: state.insertError ?? null,
          }).then(resolve, reject);
        },
      });
      for (const m of ['eq', 'lte', 'limit', 'order']) {
        api[m] = (...args: unknown[]) => {
          calls.push({ table, op: m, args });
          return asList();
        };
      }
      api.select = (...args: unknown[]) => {
        calls.push({ table, op: 'select', args });
        return asList();
      };
      api.insert = (payload: unknown) => {
        calls.push({ table, op: 'insert', args: [payload] });
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
        calls.push({ table, op: 'update', args: [payload] });
        return asList();
      };
      api.maybeSingle = async () => {
        calls.push({ table, op: 'maybeSingle', args: [] });
        if (table === TABLE.smsMessages) {
          return { data: state.existing ?? null, error: null };
        }
        if (table === TABLE.leads) {
          return { data: state.lead ?? null, error: null };
        }
        return { data: null, error: null };
      };
      api.single = async () => {
        calls.push({ table, op: 'single', args: [] });
        return { data: state.lead ?? null, error: null };
      };
      return api;
    },
  };
}

function deps(
  overrides: Partial<SmsDeps> & { dbImpl?: ReturnType<typeof makeDb>; logImpl?: ReturnType<typeof makeLogger> } = {}
): SmsDeps {
  const dbImpl = overrides.dbImpl ?? makeDb({});
  const logImpl = overrides.logImpl ?? makeLogger();
  return {
    db: () => dbImpl as never,
    clock: () => new Date('2026-06-15T18:00:00.000Z'),
    sendMessage: async () =>
      ({
        kind: 'sent',
        sid: 's',
        messageId: 'm',
        providerStatus: 'queued',
        keySupportedAtSend: true,
      }) satisfies SendOutcome,
    isPhoneSuppressed: async () => false,
    SuppressionLookupError,
    log: logImpl,
    ...overrides,
    // keep log/db after spread if provided via overrides without wiping
    ...(overrides.log ? {} : { log: logImpl }),
    ...(overrides.db ? {} : { db: () => dbImpl as never }),
  };
}

describe('buildRecoveryBody', () => {
  it('uses vertical template / custom / general fallback', () => {
    expect(buildRecoveryBody(business as never)).toContain('plumbing');
    expect(buildRecoveryBody(business as never)).toContain('STOP');
    expect(
      buildRecoveryBody({
        ...business,
        vertical: 'unknown',
        settings: {},
      } as never)
    ).toContain(SMS_TEMPLATES.general.split('{business}')[0].slice(0, 10));
    expect(
      buildRecoveryBody({
        ...business,
        settings: { smsTemplate: 'Custom {business} hi' },
      } as never)
    ).toContain('Custom Acme Plumbing hi');
  });
});

describe('fallbackDeferIso', () => {
  it('is ~8h ahead', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    expect(fallbackDeferIso(now)).toBe('2026-01-01T08:00:00.000Z');
  });
});

describe('persistDeferredRecoveryWithDeps', () => {
  it('selects id,status by message_sid and updates existing', async () => {
    const db = makeDb({ existing: { id: '1', status: 'sending' } });
    await persistDeferredRecoveryWithDeps(deps({ dbImpl: db }), {
      leadId: 'L',
      body: 'b',
      nextSendAt: 't',
    });
    expect(db.calls).toContainEqual({
      table: TABLE.smsMessages,
      op: 'select',
      args: [SMS_SELECT_ID_STATUS],
    });
    expect(db.calls).toContainEqual({
      table: TABLE.smsMessages,
      op: 'eq',
      args: [COL.messageSid, 'mlf:recovery:L'],
    });
    const upd = db.calls.find((c) => c.op === 'update');
    expect(upd?.args[0]).toMatchObject({ status: SMS_STATUS.deferred, body: 'b' });
  });

  it('inserts when absent; handles 23505 race; logs non-unique errors', async () => {
    const db = makeDb({
      existing: null,
      insertError: { code: '23505', message: 'dup' },
    });
    const log = makeLogger();
    await persistDeferredRecoveryWithDeps(deps({ dbImpl: db, logImpl: log }), {
      leadId: 'L',
      body: 'b',
      nextSendAt: 't',
    });
    expect(db.calls.some((c) => c.op === 'insert')).toBe(true);
    const raceUpdates = db.calls.filter((c) => c.op === 'update');
    expect(raceUpdates.length).toBeGreaterThan(0);
    expect(raceUpdates[0]?.args[0]).toEqual({
      status: SMS_STATUS.deferred,
      next_retry_at: 't',
      body: 'b',
    });
    // Unique race must NOT log insert_failed
    expect(log.calls.some((c) => c.args[0] === 'persist_deferred_insert_failed')).toBe(
      false
    );

    const dbErr = makeDb({
      existing: null,
      insertError: { code: '42501', message: 'perm' },
    });
    const logErr = makeLogger();
    await persistDeferredRecoveryWithDeps(
      deps({ dbImpl: dbErr, logImpl: logErr }),
      { leadId: 'L', body: 'b', nextSendAt: 't' }
    );
    expect(logErr.calls.some((c) => c.args[0] === 'persist_deferred_insert_failed')).toBe(
      true
    );
    // Non-unique error must NOT take the unique-race update path
    expect(dbErr.calls.filter((c) => c.op === 'update')).toHaveLength(0);

    // Clean insert (no error) must NOT update (kills error?.code === PG_UNIQUE → true)
    const dbOk = makeDb({ existing: null, insertError: null });
    await persistDeferredRecoveryWithDeps(deps({ dbImpl: dbOk }), {
      leadId: 'L',
      body: 'b',
      nextSendAt: 't',
    });
    expect(dbOk.calls.some((c) => c.op === 'insert')).toBe(true);
    expect(dbOk.calls.filter((c) => c.op === 'update')).toHaveLength(0);
  });

  it('insert payload uses deferred/outbound constants', async () => {
    const db = makeDb({ existing: null });
    await persistDeferredRecoveryWithDeps(deps({ dbImpl: db }), {
      leadId: 'L',
      body: 'hello',
      nextSendAt: '2026-01-01T00:00:00.000Z',
    });
    const insert = db.calls.find((c) => c.op === 'insert');
    expect(insert?.args[0]).toEqual({
      lead_id: 'L',
      direction: DIRECTION_OUTBOUND,
      body: 'hello',
      message_sid: 'mlf:recovery:L',
      status: SMS_STATUS.deferred,
      next_retry_at: '2026-01-01T00:00:00.000Z',
      key_supported_at_send: false,
    });
  });
});

describe('sendRecoverySMSWithDeps', () => {
  it('persists deferred and logs recovery_deferred', async () => {
    const db = makeDb({ existing: null });
    const log = makeLogger();
    await sendRecoverySMSWithDeps(
      deps({
        dbImpl: db,
        logImpl: log,
        sendMessage: async () => ({
          kind: 'blocked',
          reason: 'quiet_hours_deferred',
          nextSendAt: '2026-06-16T12:00:00.000Z',
        }),
      }),
      'L',
      business as never,
      '+12135550100'
    );
    expect(db.calls.some((c) => c.op === 'insert' || c.op === 'update')).toBe(true);
    expect(log.calls.some((c) => c.args[0] === 'recovery_deferred')).toBe(true);
  });

  it('logs distinct events per outcome kind (kills case-label mutants)', async () => {
    const cases: Array<{ outcome: SendOutcome; event: string; level: string }> = [
      {
        outcome: { kind: 'blocked', reason: 'suppressed' },
        event: 'recovery_blocked',
        level: 'log',
      },
      {
        outcome: { kind: 'skipped', reason: 'x' },
        event: 'recovery_blocked',
        level: 'log',
      },
      {
        outcome: { kind: 'needs_review', sid: 's', reason: 'r' },
        event: 'recovery_needs_review',
        level: 'error',
      },
      {
        outcome: { kind: 'ambiguous', sid: 's', reason: 'r' },
        event: 'recovery_ambiguous',
        level: 'warn',
      },
      {
        outcome: {
          kind: 'sent',
          sid: 's',
          messageId: 'm',
          providerStatus: 'queued',
          keySupportedAtSend: true,
        },
        event: 'recovery_sent',
        level: 'log',
      },
    ];
    for (const c of cases) {
      const log = makeLogger();
      await sendRecoverySMSWithDeps(
        deps({
          dbImpl: makeDb({}),
          logImpl: log,
          sendMessage: async () => c.outcome,
        }),
        'L',
        business as never,
        '+12135550100'
      );
      expect(log.calls.some((x) => x.level === c.level && x.args[0] === c.event)).toBe(
        true
      );
    }
  });
});

describe('processDeferredRecoveriesWithDeps', () => {
  it('query error → errors:1 and logs', async () => {
    const log = makeLogger();
    const r = await processDeferredRecoveriesWithDeps(
      deps({
        logImpl: log,
        dbImpl: makeDb({
          deferredRows: [],
          queryError: { message: 'boom' },
        }),
      })
    );
    expect(r).toEqual({ sent: 0, deferred: 0, errors: 1 });
    expect(log.calls.some((c) => c.args[0] === 'deferred_query_failed')).toBe(true);
  });

  it('filters deferred by status+next_retry_at columns', async () => {
    const db = makeDb({ deferredRows: [], lead: null });
    await processDeferredRecoveriesWithDeps(deps({ dbImpl: db }));
    expect(db.calls).toContainEqual({
      table: TABLE.smsMessages,
      op: 'select',
      args: [SMS_SELECT_DEFERRED],
    });
    expect(db.calls).toContainEqual({
      table: TABLE.smsMessages,
      op: 'eq',
      args: [COL.status, SMS_STATUS.deferred],
    });
    expect(
      db.calls.some(
        (c) => c.op === 'lte' && c.args[0] === COL.nextRetryAt
      )
    ).toBe(true);
    expect(
      db.calls.some(
        (c) =>
          c.op === 'order' &&
          c.args[0] === COL.nextRetryAt &&
          (c.args[1] as { ascending?: boolean })?.ascending === true
      )
    ).toBe(true);
  });

  it('sends / re-defers / abandons / parks / catches', async () => {
    const lead = {
      id: 'L',
      caller_phone: '+12135550100',
      businesses: business,
    };
    const rows = [
      {
        id: '1',
        lead_id: 'L',
        message_sid: 'mlf:recovery:L',
        body: 'hi',
        next_retry_at: '2026-01-01T00:00:00.000Z',
      },
    ];

    let r = await processDeferredRecoveriesWithDeps(
      deps({
        dbImpl: makeDb({ deferredRows: rows, lead }),
        sendMessage: async (req) => {
          expect(req.kind).toBe(KIND_RECOVERY);
          expect(req.skipQuietHours).toBe(false);
          // mut.py #57 — stable recovery sid, not Date.now()
          expect(req.idempotencyKey).toBe(recoveryMessageSid(lead.id));
          expect(req.idempotencyKey).not.toMatch(/:\d{10,}$/);
          return {
            kind: 'sent',
            sid: 's',
            messageId: 'm',
            providerStatus: 'queued',
            keySupportedAtSend: true,
          } as SendOutcome;
        },
      })
    );
    expect(r.sent).toBe(1);

    r = await processDeferredRecoveriesWithDeps(
      deps({
        dbImpl: makeDb({ deferredRows: rows, lead, existing: null }),
        sendMessage: async () => ({
          kind: 'blocked',
          reason: 'quiet_hours_deferred',
          nextSendAt: 't',
        }),
      })
    );
    expect(r.deferred).toBe(1);

    // quiet hours without nextSendAt → fallback
    r = await processDeferredRecoveriesWithDeps(
      deps({
        dbImpl: makeDb({ deferredRows: rows, lead, existing: null }),
        sendMessage: async () => ({
          kind: 'blocked',
          reason: 'quiet_hours_deferred',
        }),
      })
    );
    expect(r.deferred).toBe(1);

    const dbAbandon = makeDb({ deferredRows: rows, lead });
    r = await processDeferredRecoveriesWithDeps(
      deps({
        dbImpl: dbAbandon,
        sendMessage: async () => ({ kind: 'blocked', reason: 'suppressed' }),
      })
    );
    expect(
      dbAbandon.calls.some(
        (c) =>
          c.op === 'update' &&
          (c.args[0] as { status?: string })?.status === SMS_STATUS.abandonedDone
      )
    ).toBe(true);
    expect(
      dbAbandon.calls.some((c) => c.op === 'eq' && c.args[0] === COL.id && c.args[1] === '1')
    ).toBe(true);

    // skipped also abandons
    r = await processDeferredRecoveriesWithDeps(
      deps({
        dbImpl: makeDb({ deferredRows: rows, lead }),
        sendMessage: async () => ({ kind: 'skipped', reason: 'x' }),
      })
    );
    expect(r.sent).toBe(0);

    r = await processDeferredRecoveriesWithDeps(
      deps({
        dbImpl: makeDb({ deferredRows: rows, lead }),
        sendMessage: async () => ({
          kind: 'needs_review',
          sid: 's',
          reason: 'r',
        }),
      })
    );
    expect(r.deferred).toBe(1);

    r = await processDeferredRecoveriesWithDeps(
      deps({
        dbImpl: makeDb({ deferredRows: rows, lead }),
        sendMessage: async () => ({
          kind: 'ambiguous',
          sid: 's',
          reason: 'r',
        }),
      })
    );
    expect(r.deferred).toBe(1);

    // empty body → buildRecoveryBody
    const emptyBodyRows = [{ ...rows[0], body: '' }];
    const send = vi.fn(async () => ({
      kind: 'sent' as const,
      sid: 's',
      messageId: 'm',
      providerStatus: 'queued',
      keySupportedAtSend: true,
    }));
    await processDeferredRecoveriesWithDeps(
      deps({
        dbImpl: makeDb({ deferredRows: emptyBodyRows, lead }),
        sendMessage: send,
      })
    );
    expect(String((send.mock.calls[0] as unknown as [Record<string, unknown>])[0].body)).toContain(
      'plumbing'
    );

    // throw → errors++
    const log = makeLogger();
    r = await processDeferredRecoveriesWithDeps(
      deps({
        logImpl: log,
        dbImpl: makeDb({ deferredRows: rows, lead }),
        sendMessage: async () => {
          throw new Error('relay down');
        },
      })
    );
    expect(r.errors).toBe(1);
    expect(log.calls.some((c) => c.args[0] === 'deferred_row_failed')).toBe(true);
  });

  it('missing business increments errors and does not send', async () => {
    const send = vi.fn();
    const log = { calls: [] as Array<{ level: string; args: unknown[] }> };
    const logger = {
      log: (...args: unknown[]) => log.calls.push({ level: 'log', args }),
      warn: (...args: unknown[]) => log.calls.push({ level: 'warn', args }),
      error: (...args: unknown[]) => log.calls.push({ level: 'error', args }),
    };
    const r = await processDeferredRecoveriesWithDeps(
      deps({
        sendMessage: send,
        log: logger,
        dbImpl: makeDb({
          deferredRows: [
            {
              id: '1',
              lead_id: 'L',
              message_sid: 'x',
              body: 'b',
              next_retry_at: 't',
            },
          ],
          lead: { id: 'L', businesses: null },
        }),
      })
    );
    expect(r.errors).toBe(1);
    expect(send).not.toHaveBeenCalled();
    // Must take the explicit !business branch (not the catch) — kills empty-block mutants.
    expect(log.calls.some((c) => c.args[0] === 'deferred_row_failed')).toBe(
      false
    );
  });

  it('null lead increments errors and does not send', async () => {
    const send = vi.fn();
    const log = { calls: [] as Array<{ level: string; args: unknown[] }> };
    const logger = {
      log: (...args: unknown[]) => log.calls.push({ level: 'log', args }),
      warn: (...args: unknown[]) => log.calls.push({ level: 'warn', args }),
      error: (...args: unknown[]) => log.calls.push({ level: 'error', args }),
    };
    const r = await processDeferredRecoveriesWithDeps(
      deps({
        sendMessage: send,
        log: logger,
        dbImpl: makeDb({
          deferredRows: [
            {
              id: '1',
              lead_id: 'L',
              message_sid: 'x',
              body: 'b',
              next_retry_at: 't',
            },
          ],
          lead: null,
        }),
      })
    );
    expect(r.errors).toBe(1);
    expect(send).not.toHaveBeenCalled();
    // Explicit !lead continue — not catch — kills empty-block / force-false mutants.
    expect(log.calls.some((c) => c.args[0] === 'deferred_row_failed')).toBe(
      false
    );
  });

  it('ignore (never_sent) leaves counters unchanged and does not abandon', async () => {
    const lead = {
      id: 'L',
      caller_phone: '+12135550100',
      businesses: business,
    };
    const db = makeDb({
      deferredRows: [
        {
          id: '1',
          lead_id: 'L',
          message_sid: 'x',
          body: 'b',
          next_retry_at: 't',
        },
      ],
      lead,
    });
    const log = { calls: [] as Array<{ level: string; args: unknown[] }> };
    const logger = {
      log: (...args: unknown[]) => log.calls.push({ level: 'log', args }),
      warn: (...args: unknown[]) => log.calls.push({ level: 'warn', args }),
      error: (...args: unknown[]) => log.calls.push({ level: 'error', args }),
    };
    const r = await processDeferredRecoveriesWithDeps(
      deps({
        dbImpl: db,
        log: logger,
        sendMessage: async () =>
          ({ kind: 'never_sent', sid: 's', requeued: true }) as SendOutcome,
      })
    );
    expect(r).toEqual({ sent: 0, deferred: 0, errors: 0 });
    expect(
      db.calls.some(
        (c) =>
          c.op === 'update' &&
          (c.args[0] as { status?: string })?.status === SMS_STATUS.abandonedDone
      )
    ).toBe(false);
    expect(
      db.calls.some(
        (c) =>
          c.op === 'update' &&
          (c.args[0] as { reconcile_attempts?: number })?.reconcile_attempts ===
            1
      )
    ).toBe(true);
    expect(log.calls.some((c) => c.args[0] === 'deferred_ignored')).toBe(true);
  });

  it('ignore path caps retries then abandons', async () => {
    const lead = {
      id: 'L',
      caller_phone: '+12135550100',
      businesses: business,
    };
    const db = makeDb({
      deferredRows: [
        {
          id: '1',
          lead_id: 'L',
          message_sid: 'x',
          body: 'hi',
          next_retry_at: 't',
          reconcile_attempts: 4,
        },
      ],
      lead,
    });
    const log = makeLogger();
    await processDeferredRecoveriesWithDeps(
      deps({
        dbImpl: db,
        logImpl: log,
        sendMessage: async () =>
          ({ kind: 'never_sent', sid: 's', requeued: true }) as SendOutcome,
      })
    );
    expect(
      db.calls.some(
        (c) =>
          c.op === 'update' &&
          (c.args[0] as { status?: string })?.status ===
            SMS_STATUS.abandonedDone
      )
    ).toBe(true);
    expect(log.calls.some((c) => c.args[0] === 'deferred_ignore_capped')).toBe(
      true
    );
  });

  it('re_defer persists exact leadId/body/nextSendAt (not empty payload)', async () => {
    const lead = {
      id: 'L',
      caller_phone: '+12135550100',
      businesses: business,
    };
    const db = makeDb({
      deferredRows: [
        {
          id: '1',
          lead_id: 'L',
          message_sid: 'x',
          body: 'hi-body',
          next_retry_at: 't',
        },
      ],
      lead,
      existing: null,
    });
    await processDeferredRecoveriesWithDeps(
      deps({
        dbImpl: db,
        sendMessage: async () => ({
          kind: 'blocked',
          reason: 'quiet_hours_deferred',
          nextSendAt: '2026-06-01T12:00:00.000Z',
        }),
      })
    );
    const inserts = db.calls.filter((c) => c.op === 'insert');
    expect(inserts.length).toBeGreaterThan(0);
    expect(inserts[0].args[0]).toMatchObject({
      lead_id: 'L',
      body: 'hi-body',
      next_retry_at: '2026-06-01T12:00:00.000Z',
      status: SMS_STATUS.deferred,
    });
  });
});

describe('sendFollowUpSMSWithDeps (QC r6 P2 suppression restore)', () => {
  it('skips when suppressed / lookup failed / opted out and logs events', async () => {
    const send = vi.fn();
    const log = makeLogger();
    await sendFollowUpSMSWithDeps(
      deps({
        logImpl: log,
        isPhoneSuppressed: async () => true,
        sendMessage: send,
      }),
      'L',
      business as never,
      '+12135550100'
    );
    expect(send).not.toHaveBeenCalled();
    expect(log.calls.some((c) => c.args[0] === 'followup_suppressed')).toBe(true);

    const log2 = makeLogger();
    await sendFollowUpSMSWithDeps(
      deps({
        logImpl: log2,
        isPhoneSuppressed: async () => {
          throw new SuppressionLookupError('x');
        },
        sendMessage: send,
      }),
      'L',
      business as never,
      '+12135550100'
    );
    expect(send).not.toHaveBeenCalled();
    expect(
      log2.calls.some((c) => c.args[0] === 'followup_suppression_lookup_failed')
    ).toBe(true);

    const log3 = makeLogger();
    await sendFollowUpSMSWithDeps(
      deps({
        logImpl: log3,
        dbImpl: makeDb({ lead: { opted_out: true } }),
        sendMessage: send,
      }),
      'L',
      business as never,
      '+12135550100'
    );
    expect(send).not.toHaveBeenCalled();
    expect(log3.calls.some((c) => c.args[0] === 'followup_opted_out')).toBe(true);
  });

  it('sends and inserts when clear; non-sent skips insert', async () => {
    const db = makeDb({ lead: { opted_out: false } });
    const send = vi.fn(async () => ({
      kind: 'sent' as const,
      sid: 's',
      messageId: 'm',
      providerStatus: 'queued',
      keySupportedAtSend: true,
    }));
    await sendFollowUpSMSWithDeps(
      deps({ dbImpl: db, sendMessage: send }),
      'L',
      business as never,
      '+12135550100',
      'Custom follow'
    );
    expect(send).toHaveBeenCalled();
    const [sentReq] = send.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(sentReq).toMatchObject({
      kind: KIND_MANUAL,
      skipQuietHours: true,
      to: '+12135550100',
    });
    const insert = db.calls.find((c) => c.op === 'insert');
    expect(insert?.args[0]).toEqual({
      lead_id: 'L',
      direction: DIRECTION_OUTBOUND,
      body: expect.stringContaining('Custom follow'),
      message_sid: 's',
      status: 'queued',
    });
    expect(db.calls).toContainEqual({
      table: TABLE.leads,
      op: 'eq',
      args: [COL.id, 'L'],
    });

    // blocked → no insert (kills outcome.kind === 'sent' → true)
    const db2 = makeDb({ lead: { opted_out: false } });
    await sendFollowUpSMSWithDeps(
      deps({
        dbImpl: db2,
        sendMessage: async () => ({ kind: 'blocked', reason: 'suppressed' }),
      }),
      'L',
      business as never,
      '+12135550100'
    );
    expect(db2.calls.some((c) => c.op === 'insert')).toBe(false);

    // default body when no customMessage
    const db3 = makeDb({ lead: { opted_out: false } });
    const send3 = vi.fn(async () => ({
      kind: 'sent' as const,
      sid: 's',
      messageId: 'm',
      providerStatus: 'queued',
      keySupportedAtSend: true,
    }));
    await sendFollowUpSMSWithDeps(
      deps({ dbImpl: db3, sendMessage: send3 }),
      'L',
      business as never,
      '+12135550100'
    );
    const followReq = (send3.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(String(followReq.body)).toContain('Acme Plumbing');
    expect(String(followReq.body)).toContain('following up');
  });

  it('rethrows non-suppression errors', async () => {
    await expect(
      sendFollowUpSMSWithDeps(
        deps({
          isPhoneSuppressed: async () => {
            throw new Error('network');
          },
        }),
        'L',
        business as never,
        '+12135550100'
      )
    ).rejects.toThrow('network');
  });

  it('null lead row still sends (opted_out optional chain)', async () => {
    const send = vi.fn(async () => ({
      kind: 'sent' as const,
      sid: 's',
      messageId: 'm',
      providerStatus: 'queued',
      keySupportedAtSend: true,
    }));
    await sendFollowUpSMSWithDeps(
      deps({
        dbImpl: makeDb({ lead: null }),
        sendMessage: send,
      }),
      'L',
      business as never,
      '+12135550100',
      'hi'
    );
    expect(send).toHaveBeenCalled();
  });
});
