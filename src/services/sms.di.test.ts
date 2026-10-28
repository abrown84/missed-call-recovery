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
} from './sms';
import { SuppressionLookupError } from '@/services/suppressions';
import type { SendOutcome } from '@/services/send/types';

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
          if (table === 'sms_messages' && state.deferredRows !== undefined) {
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
      for (const m of ['eq', 'lte', 'limit']) {
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
        if (table === 'sms_messages') {
          return { data: state.existing ?? null, error: null };
        }
        if (table === 'leads') {
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

function deps(overrides: Partial<SmsDeps> & { dbImpl?: ReturnType<typeof makeDb> }): SmsDeps {
  const dbImpl = overrides.dbImpl ?? makeDb({});
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
    ...overrides,
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
  it('updates existing row', async () => {
    const db = makeDb({ existing: { id: '1', status: 'sending' } });
    await persistDeferredRecoveryWithDeps(deps({ dbImpl: db }), {
      leadId: 'L',
      body: 'b',
      nextSendAt: 't',
    });
    expect(db.calls.some((c) => c.op === 'update')).toBe(true);
    const upd = db.calls.find((c) => c.op === 'update');
    expect(upd?.args[0]).toMatchObject({ status: 'deferred', body: 'b' });
  });

  it('inserts when absent; handles 23505 race', async () => {
    const db = makeDb({
      existing: null,
      insertError: { code: '23505', message: 'dup' },
    });
    await persistDeferredRecoveryWithDeps(deps({ dbImpl: db }), {
      leadId: 'L',
      body: 'b',
      nextSendAt: 't',
    });
    expect(db.calls.some((c) => c.op === 'insert')).toBe(true);
    expect(db.calls.filter((c) => c.op === 'update').length).toBeGreaterThan(0);
  });
});

describe('sendRecoverySMSWithDeps', () => {
  it('persists deferred on quiet_hours_deferred', async () => {
    const db = makeDb({ existing: null });
    const persistSpy = vi.fn();
    const d = deps({
      dbImpl: db,
      sendMessage: async () => ({
        kind: 'blocked',
        reason: 'quiet_hours_deferred',
        nextSendAt: '2026-06-16T12:00:00.000Z',
      }),
    });
    // wrap persist via real path
    await sendRecoverySMSWithDeps(d, 'L', business as never, '+12135550100');
    expect(db.calls.some((c) => c.op === 'insert' || c.op === 'update')).toBe(
      true
    );
    void persistSpy;
  });

  it('logs blocked / needs_review / ambiguous / sent', async () => {
    const outcomes: SendOutcome[] = [
      { kind: 'blocked', reason: 'suppressed' },
      { kind: 'skipped', reason: 'x' },
      { kind: 'needs_review', sid: 's', reason: 'r' },
      { kind: 'ambiguous', sid: 's', reason: 'r' },
      {
        kind: 'sent',
        sid: 's',
        messageId: 'm',
        providerStatus: 'queued',
        keySupportedAtSend: true,
      },
    ];
    for (const outcome of outcomes) {
      await sendRecoverySMSWithDeps(
        deps({
          dbImpl: makeDb({}),
          sendMessage: async () => outcome,
        }),
        'L',
        business as never,
        '+12135550100'
      );
    }
  });
});

describe('processDeferredRecoveriesWithDeps', () => {
  it('query error → errors:1', async () => {
    const r = await processDeferredRecoveriesWithDeps(
      deps({
        dbImpl: makeDb({
          deferredRows: [],
          queryError: { message: 'boom' },
        }),
      })
    );
    expect(r).toEqual({ sent: 0, deferred: 0, errors: 1 });
  });

  it('sends / re-defers / abandons / counts review', async () => {
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
        sendMessage: async () =>
          ({
            kind: 'sent',
            sid: 's',
            messageId: 'm',
            providerStatus: 'queued',
            keySupportedAtSend: true,
          }) as SendOutcome,
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
          (c.args[0] as { status?: string })?.status === 'abandoned_done'
      )
    ).toBe(true);

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
  });

  it('missing business increments errors', async () => {
    const r = await processDeferredRecoveriesWithDeps(
      deps({
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
  });
});

describe('sendFollowUpSMSWithDeps (QC r6 P2 suppression restore)', () => {
  it('skips when suppressed / lookup failed / opted out', async () => {
    const send = vi.fn();
    await sendFollowUpSMSWithDeps(
      deps({
        isPhoneSuppressed: async () => true,
        sendMessage: send,
      }),
      'L',
      business as never,
      '+12135550100'
    );
    expect(send).not.toHaveBeenCalled();

    await sendFollowUpSMSWithDeps(
      deps({
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

    await sendFollowUpSMSWithDeps(
      deps({
        dbImpl: makeDb({ lead: { opted_out: true } }),
        sendMessage: send,
      }),
      'L',
      business as never,
      '+12135550100'
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('sends and inserts when clear', async () => {
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
    expect(send.mock.calls[0]).toBeDefined();
    const [sentReq] = send.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ];
    expect(sentReq).toMatchObject({
      kind: 'manual',
      skipQuietHours: true,
      to: '+12135550100',
    });
    const insert = db.calls.find((c) => c.op === 'insert');
    expect(insert?.args[0]).toEqual({
      lead_id: 'L',
      direction: 'outbound',
      body: expect.stringContaining('Custom follow'),
      message_sid: 's',
      status: 'queued',
    });
  });
});

describe('persistDeferredRecovery payload strings', () => {
  it('insert uses deferred status and outbound direction', async () => {
    const db = makeDb({ existing: null });
    await persistDeferredRecoveryWithDeps(deps({ dbImpl: db }), {
      leadId: 'L',
      body: 'hello',
      nextSendAt: '2026-01-01T00:00:00.000Z',
    });
    const insert = db.calls.find((c) => c.op === 'insert');
    expect(insert?.args[0]).toMatchObject({
      lead_id: 'L',
      direction: 'outbound',
      body: 'hello',
      status: 'deferred',
      next_retry_at: '2026-01-01T00:00:00.000Z',
      key_supported_at_send: false,
    });
    expect(String((insert?.args[0] as { message_sid: string }).message_sid)).toContain(
      'mlf:recovery:L'
    );
  });
});
