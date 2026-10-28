/**
 * DI tests against sendMessageWithDeps / reconcileOneWithDeps — every gate and
 * relay branch, with recorded DB ops so StringLiteral select mutants die.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  sendMessageWithDeps,
  reconcileOneWithDeps,
  reconcileAmbiguousSmsWithDeps,
  resolveRecoveryOutcomeWithDeps,
  type SendDeps,
} from './index';
import { SuppressionLookupError } from '@/services/suppressions';
import { markRelayKeySupportConfirmed, resetRelayKeySupportConfirmed } from '@/services/sms-sid';
import {
  COL,
  KIND_CAMPAIGN,
  KIND_RECOVERY,
  RECONCILE_PULL_STATUSES,
  SEND_REASON,
  SMS_STATUS,
  TABLE,
} from '@/services/db-strings';

type Row = Record<string, unknown>;

function makeDb(state: {
  leads?: Row | null;
  smsBySid?: Map<string, Row>;
  insertError?: { code: string; message: string } | null;
  smsList?: Row[];
}) {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = [];
  const smsBySid = state.smsBySid ?? new Map();

  function table(name: string) {
    const ctx: {
      filters: Record<string, unknown>;
      op: string;
      payload?: unknown;
      selectCols?: string;
    } = { filters: {}, op: 'select' };

    const api: Record<string, unknown> = {};
    const chain = () => api;

    const asList = (): Record<string, unknown> => {
      const list: Record<string, unknown> = { ...api };
      list.then = (
        resolve: (v: unknown) => unknown,
        reject?: (e: unknown) => unknown
      ) => {
        if (name === 'sms_messages' && state.smsList) {
          return Promise.resolve({
            data: state.smsList,
            error: null,
          }).then(resolve, reject);
        }
        return Promise.resolve({ data: null, error: null }).then(
          resolve,
          reject
        );
      };
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
        list[m] = api[m];
      }
      return list;
    };

    for (const m of [
      'eq',
      'lte',
      'lt',
      'is',
      'or',
      'in',
      'order',
      'limit',
    ]) {
      api[m] = (...args: unknown[]) => {
        calls.push({ table: name, op: m, args });
        if (m === 'eq' && args[0] === COL.messageSid) {
          ctx.filters.message_sid = args[1];
        }
        if (m === 'eq' && args[0] === COL.id) {
          ctx.filters.id = args[1];
        }
        if (m === 'in') ctx.filters.in = args;
        return asList();
      };
    }

    api.select = (cols?: string) => {
      ctx.selectCols = cols;
      calls.push({ table: name, op: 'select', args: [cols] });
      ctx.op = 'select';
      return asList();
    };

    api.insert = (payload: unknown) => {
      calls.push({ table: name, op: 'insert', args: [payload] });
      return {
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve({
            data: null,
            error: state.insertError ?? null,
          }).then(resolve, reject),
      };
    };

    api.update = (payload: unknown) => {
      calls.push({ table: name, op: 'update', args: [payload] });
      ctx.payload = payload;
      return api;
    };

    api.maybeSingle = async () => {
      calls.push({ table: name, op: 'maybeSingle', args: [] });
      if (name === 'leads') {
        return { data: state.leads ?? null, error: null };
      }
      if (name === 'sms_messages') {
        const sid = ctx.filters.message_sid as string | undefined;
        return {
          data: sid ? smsBySid.get(sid) ?? null : null,
          error: null,
        };
      }
      return { data: null, error: null };
    };

    api.single = api.maybeSingle;
    return api;
  }

  return {
    from: (name: string) => table(name),
    calls,
  };
}

function baseDeps(overrides: Partial<SendDeps> & { dbImpl?: ReturnType<typeof makeDb> }): SendDeps {
  const dbImpl = overrides.dbImpl ?? makeDb({});
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
        lookupByIdempotencyKey: vi.fn(async () => ({
          outcome: 'sent' as const,
          status: 'delivered',
          found: true,
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

describe('sendMessageWithDeps', () => {
  beforeEach(() => {
    resetRelayKeySupportConfirmed();
    markRelayKeySupportConfirmed();
  });

  it('blocks when sends disabled', async () => {
    const deps = baseDeps({ sendsEnabled: () => false });
    expect(
      await sendMessageWithDeps(deps, {
        kind: 'recovery',
        leadId: 'L',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
      })
    ).toEqual({ kind: 'blocked', reason: 'sends_disabled' });
  });

  it('blocks invalid phone', async () => {
    const deps = baseDeps({});
    const o = await sendMessageWithDeps(deps, {
      kind: 'recovery',
      leadId: 'L',
      businessId: 'B',
      to: 'not-a-phone',
      body: 'hi',
    });
    expect(o.kind).toBe('blocked');
    if (o.kind === 'blocked') expect(o.reason).toBe('invalid_phone');
  });

  it('suppressed / lookup_failed_closed / opted_out', async () => {
    const db = makeDb({ leads: { opted_out: false } });
    let deps = baseDeps({
      dbImpl: db,
      isPhoneSuppressed: async () => true,
    });
    expect(
      (
        await sendMessageWithDeps(deps, {
          kind: 'recovery',
          leadId: 'L',
          businessId: 'B',
          to: '+12135550100',
          body: 'hi',
        })
      ).kind
    ).toBe('blocked');

    deps = baseDeps({
      dbImpl: makeDb({ leads: { opted_out: false } }),
      isPhoneSuppressed: async () => {
        throw new SuppressionLookupError('x');
      },
    });
    const closed = await sendMessageWithDeps(deps, {
      kind: 'recovery',
      leadId: 'L',
      businessId: 'B',
      to: '+12135550100',
      body: 'hi',
    });
    expect(closed).toMatchObject({
      kind: 'blocked',
      reason: 'suppressed',
      detail: 'lookup_failed_closed',
    });

    deps = baseDeps({
      dbImpl: makeDb({ leads: { opted_out: true } }),
    });
    expect(
      await sendMessageWithDeps(deps, {
        kind: 'campaign',
        leadId: 'L',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
        stepNumber: 2,
      })
    ).toEqual({ kind: 'blocked', reason: 'opted_out' });
  });

  it('recovery gate pending / resolved_sent / skip', async () => {
    const sid = 'mlf:recovery:L';
    const dbPending = makeDb({
      leads: { opted_out: false },
      smsBySid: new Map([[sid, { status: 'sending' }]]),
    });
    expect(
      await sendMessageWithDeps(baseDeps({ dbImpl: dbPending }), {
        kind: 'campaign',
        leadId: 'L',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
        stepNumber: 1,
      })
    ).toEqual({ kind: 'blocked', reason: 'recovery_pending' });

    const dbSent = makeDb({
      leads: { opted_out: false },
      smsBySid: new Map([[sid, { status: 'delivered' }]]),
    });
    expect(
      await sendMessageWithDeps(baseDeps({ dbImpl: dbSent }), {
        kind: 'campaign',
        leadId: 'L',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
        stepNumber: 1,
      })
    ).toMatchObject({
      kind: 'skipped',
      reason: 'recovery_already_sent_skip_step_1',
    });

    // skipRecoveryGate bypasses
    const send = vi.fn(async () => ({
      id: 'm',
      status: 'queued',
      keyEchoed: true,
    }));
    const o = await sendMessageWithDeps(
      baseDeps({
        dbImpl: dbPending,
        adapter: () =>
          ({
            name: 'm',
            sendMessage: send,
            checkLookupSupport: async () => ({ supported: true }),
          }) as never,
      }),
      {
        kind: 'campaign',
        leadId: 'L',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
        stepNumber: 1,
        skipRecoveryGate: true,
        enrollmentId: 'E',
        campaignId: 'C',
      }
    );
    expect(o.kind).toBe('sent');
  });

  it('quiet hours deferred / unresolved', async () => {
    const next = new Date('2026-06-16T12:00:00.000Z');
    let deps = baseDeps({
      dbImpl: makeDb({ leads: { opted_out: false } }),
      quietHours: () => ({
        allowed: false,
        nextSendAt: next,
        zones: ['America/New_York'],
        endHour: 21,
      }),
    });
    expect(
      await sendMessageWithDeps(deps, {
        kind: 'recovery',
        leadId: 'L',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
      })
    ).toEqual({
      kind: 'blocked',
      reason: 'quiet_hours_deferred',
      nextSendAt: next.toISOString(),
    });

    deps = baseDeps({
      dbImpl: makeDb({ leads: { opted_out: false } }),
      quietHours: () => ({
        allowed: false,
        unresolved: true,
        reason: 'unmapped',
        zones: [],
      }),
    });
    expect(
      await sendMessageWithDeps(deps, {
        kind: 'recovery',
        leadId: 'L',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
      })
    ).toMatchObject({ kind: 'blocked', reason: 'quiet_hours_unresolved' });
  });

  it('duplicate sid: confirm / needs_review / claim_deferred / in_flight', async () => {
    const cases: Array<[string, string]> = [
      ['delivered', 'sent'],
      ['failed', 'needs_review'],
      ['sending', 'blocked'],
    ];
    for (const [status, kind] of cases) {
      const sid = 'mlf:recovery:Ldup';
      const db = makeDb({
        leads: { opted_out: false },
        insertError: { code: '23505', message: 'dup' },
        smsBySid: new Map([[sid, { status }]]),
      });
      const o = await sendMessageWithDeps(baseDeps({ dbImpl: db }), {
        kind: 'recovery',
        leadId: 'Ldup',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
        idempotencyKey: sid,
      });
      expect(o.kind, status).toBe(kind);
    }

    const sid = 'mlf:recovery:Ldef';
    const send = vi.fn(async () => ({
      id: 'm',
      status: 'queued',
      keyEchoed: true,
    }));
    const db = makeDb({
      leads: { opted_out: false },
      insertError: { code: '23505', message: 'dup' },
      smsBySid: new Map([[sid, { status: 'deferred' }]]),
    });
    const o = await sendMessageWithDeps(
      baseDeps({
        dbImpl: db,
        adapter: () => ({ name: 'm', sendMessage: send }) as never,
      }),
      {
        kind: 'recovery',
        leadId: 'Ldef',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
        idempotencyKey: sid,
      }
    );
    expect(o.kind).toBe('sent');
    expect(send).toHaveBeenCalled();
  });

  it('relay ok / conflict / maintenance / failed / throw', async () => {
    const mk = async (
      result: unknown | Error,
      kind: 'recovery' | 'campaign' = 'recovery'
    ) => {
      const db = makeDb({ leads: { opted_out: false } });
      const send =
        result instanceof Error
          ? vi.fn(async () => {
              throw result;
            })
          : vi.fn(async () => result);
      return {
        outcome: await sendMessageWithDeps(
          baseDeps({
            dbImpl: db,
            adapter: () => ({ name: 'm', sendMessage: send }) as never,
          }),
          {
            kind,
            leadId: 'L',
            businessId: 'B',
            to: '+12135550100',
            body: 'hi',
            skipQuietHours: true,
            skipRecoveryGate: true,
            enrollmentId: 'E',
            campaignId: 'C',
            stepNumber: 2,
          }
        ),
        db,
      };
    };
    expect((await mk({ id: 'm', status: 'queued', keyEchoed: true })).outcome.kind).toBe(
      'sent'
    );
    expect((await mk({ id: 'm', conflict: true })).outcome.kind).toBe('needs_review');
    expect(
      (await mk({ id: 'm', ambiguous: true, status: 'maintenance' })).outcome.kind
    ).toBe('ambiguous');
    expect((await mk({ id: 'm', ambiguous: true })).outcome.kind).toBe('ambiguous');
    expect((await mk({ id: 'm', status: 'failed' })).outcome.kind).toBe('needs_review');
    expect((await mk(new Error('boom'))).outcome.kind).toBe('ambiguous');

    // Campaign kind must also update sms row on needs_review / ambiguous / sent
    // but must NOT write leads.sms_outbound_sid (recovery-only).
    for (const result of [
      { id: 'm', status: 'queued', keyEchoed: true },
      { id: 'm', conflict: true },
      { id: 'm', ambiguous: true },
    ] as const) {
      const { outcome, db } = await mk(result, 'campaign');
      expect(['sent', 'needs_review', 'ambiguous']).toContain(outcome.kind);
      expect(
        db.calls.some(
          (c) =>
            c.table === TABLE.smsMessages &&
            c.op === 'update' &&
            c.args[0] &&
            typeof c.args[0] === 'object'
        )
      ).toBe(true);
      expect(
        db.calls.some(
          (c) =>
            c.table === TABLE.leads &&
            c.op === 'update' &&
            (c.args[0] as { sms_outbound_sid?: string })?.sms_outbound_sid
        )
      ).toBe(false);
    }
  });

  it('manual/escalation skips customer gates and still sends', async () => {
    const send = vi.fn(async () => ({
      id: 'm',
      status: 'queued',
      keyEchoed: true,
    }));
    const o = await sendMessageWithDeps(
      baseDeps({
        dbImpl: makeDb({}),
        adapter: () => ({ name: 'm', sendMessage: send }) as never,
        isPhoneSuppressed: async () => true,
      }),
      {
        kind: 'manual',
        leadId: 'L',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
      }
    );
    expect(o.kind).toBe('sent');
  });

  it('select uses opted_out, timezone, sms_outbound_sid', async () => {
    const db = makeDb({ leads: { opted_out: false, timezone: 'America/Chicago' } });
    const send = vi.fn(async () => ({
      id: 'm',
      status: 'queued',
      keyEchoed: true,
    }));
    await sendMessageWithDeps(
      baseDeps({
        dbImpl: db,
        adapter: () => ({ name: 'm', sendMessage: send }) as never,
      }),
      {
        kind: 'recovery',
        leadId: 'L',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
      }
    );
    const sel = db.calls.find(
      (c) => c.table === 'leads' && c.op === 'select'
    );
    expect(sel?.args[0]).toBe('opted_out, timezone, sms_outbound_sid');
    const insert = db.calls.find(
      (c) => c.table === 'sms_messages' && c.op === 'insert'
    );
    expect(insert?.args[0]).toMatchObject({
      lead_id: 'L',
      direction: 'outbound',
      body: 'hi',
      status: 'sending',
      key_supported_at_send: false,
    });
    const upd = db.calls.find(
      (c) =>
        c.table === 'sms_messages' &&
        c.op === 'update' &&
        (c.args[0] as { status?: string })?.status === 'queued'
    );
    expect(upd?.args[0]).toMatchObject({
      status: 'queued',
      key_supported_at_send: true,
    });
  });
});

describe('reconcileOneWithDeps', () => {
  it('resolved / never_sent / needs_review / park / disabled / no lookup', async () => {
    const row = {
      id: '1',
      lead_id: 'L',
      message_sid: 'mlf:campaign:E:C:step:1',
      status: 'unknown',
      reconcile_attempts: 0,
      key_supported_at_send: true,
    };

    let deps = baseDeps({
      dbImpl: makeDb({}),
      adapter: () =>
        ({
          name: 'm',
          lookupByIdempotencyKey: async () => ({
            outcome: 'sent',
            status: 'delivered',
            found: true,
          }),
        }) as never,
    });
    expect((await reconcileOneWithDeps(deps, row)).kind).toBe('resolved');

    deps = baseDeps({
      dbImpl: makeDb({}),
      adapter: () =>
        ({
          name: 'm',
          lookupByIdempotencyKey: async () => ({
            outcome: 'never_sent',
            found: false,
          }),
        }) as never,
    });
    expect((await reconcileOneWithDeps(deps, row)).kind).toBe('never_sent');

    deps = baseDeps({
      dbImpl: makeDb({}),
      adapter: () =>
        ({
          name: 'm',
          lookupByIdempotencyKey: async () => ({
            outcome: 'failed',
            status: 'failed',
            found: true,
          }),
        }) as never,
    });
    expect((await reconcileOneWithDeps(deps, row)).kind).toBe('needs_review');

    deps = baseDeps({
      dbImpl: makeDb({}),
      adapter: () =>
        ({
          name: 'm',
          lookupByIdempotencyKey: async () => {
            throw new Error('x');
          },
        }) as never,
    });
    expect((await reconcileOneWithDeps(deps, row)).kind).toBe('ambiguous');

    deps = baseDeps({ sendsEnabled: () => false });
    expect((await reconcileOneWithDeps(deps, row)).kind).toBe('blocked');

    deps = baseDeps({
      adapter: () => ({ name: 'm' }) as never,
    });
    expect((await reconcileOneWithDeps(deps, row)).kind).toBe('needs_review');
  });
});

describe('resolveRecoveryOutcomeWithDeps', () => {
  it('absent when no sid', async () => {
    const db = makeDb({ leads: { sms_outbound_sid: null } });
    expect(
      await resolveRecoveryOutcomeWithDeps(
        baseDeps({ dbImpl: db }),
        db as never,
        'L'
      )
    ).toBe('absent');
  });
});

describe('reconcileAmbiguousSmsWithDeps', () => {
  it('counts unknown/sending and alerts', async () => {
    const db = makeDb({
      smsList: [
        {
          id: '1',
          lead_id: 'L',
          message_sid: 'mlf:campaign:E:C:step:1',
          status: 'unknown',
          reconcile_attempts: 0,
          key_supported_at_send: true,
        },
        {
          id: '2',
          lead_id: 'L',
          message_sid: 'mlf:recovery:L',
          status: 'sending',
          reconcile_attempts: 0,
          key_supported_at_send: true,
        },
      ],
    });
    const r = await reconcileAmbiguousSmsWithDeps(
      baseDeps({
        dbImpl: db,
        adapter: () =>
          ({
            name: 'm',
            lookupByIdempotencyKey: async () => ({
              outcome: 'sent',
              status: 'delivered',
              found: true,
            }),
            checkLookupSupport: async () => ({ supported: true }),
          }) as never,
      })
    );
    expect(r.unknownCount).toBe(1);
    expect(r.stuckSendingCount).toBe(1);
    expect(r.confirmed).toBe(2);
    // alert only when threshold met or needsReview > 0; both resolved → no alert
    expect(r.needsReview).toBe(0);
    expect(r.alert).toBe(false);
  });

  it('tallies never_sent / needs_review / ambiguous independently (+ recovery clear)', async () => {
    const outcomes = ['never_sent', 'unknown', 'failed'] as const;
    let i = 0;
    const db = makeDb({
      smsList: [
        {
          id: '1',
          lead_id: 'L1',
          message_sid: 'mlf:recovery:L1',
          status: 'unknown',
          reconcile_attempts: 0,
          key_supported_at_send: true,
        },
        {
          id: '2',
          lead_id: 'L2',
          message_sid: 'mlf:campaign:E:C:step:1',
          status: 'sending',
          reconcile_attempts: 0,
          key_supported_at_send: false,
        },
        {
          id: '3',
          lead_id: 'L3',
          message_sid: 'mlf:campaign:E:C:step:2',
          status: 'unknown',
          reconcile_attempts: 0,
          key_supported_at_send: true,
        },
      ],
    });
    const r = await reconcileAmbiguousSmsWithDeps(
      baseDeps({
        dbImpl: db,
        adapter: () =>
          ({
            name: 'm',
            lookupByIdempotencyKey: async () => {
              const outcome = outcomes[i++ % outcomes.length];
              if (outcome === 'never_sent') {
                return { outcome: 'never_sent', found: false };
              }
              if (outcome === 'failed') {
                return { outcome: 'failed', status: 'failed', found: true };
              }
              return { outcome: 'unknown', found: true };
            },
            checkLookupSupport: async () => ({ supported: true }),
          }) as never,
      })
    );
    expect(r.unknownCount).toBe(2);
    expect(r.stuckSendingCount).toBe(1);
    expect(r.requeued).toBe(1);
    expect(r.needsReview + r.parked).toBeGreaterThanOrEqual(1);
    // needsReview > 0 forces alert even below unknown threshold
    if (r.needsReview > 0) expect(r.alert).toBe(true);
    // recovery never_sent clears outbound sid
    expect(
      db.calls.some(
        (c) =>
          c.table === TABLE.leads &&
          c.op === 'update' &&
          (c.args[0] as { sms_outbound_sid?: unknown })?.sms_outbound_sid ===
            null
      )
    ).toBe(true);
  });

  it('alert when unknown+sending reaches threshold (exactly >= 5)', async () => {
    const smsList = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      lead_id: 'L',
      message_sid: `mlf:campaign:E:C:step:${i}`,
      status: i % 2 === 0 ? 'unknown' : 'sending',
      reconcile_attempts: 0,
      key_supported_at_send: true,
    }));
    const r = await reconcileAmbiguousSmsWithDeps(
      baseDeps({
        dbImpl: makeDb({ smsList }),
        adapter: () =>
          ({
            name: 'm',
            lookupByIdempotencyKey: async () => ({
              outcome: 'sent',
              status: 'delivered',
              found: true,
            }),
          }) as never,
      })
    );
    expect(r.unknownCount + r.stuckSendingCount).toBe(5);
    expect(r.alert).toBe(true);
  });
});

describe('send I/O column/kind constants (survivor killers)', () => {
  beforeEach(() => {
    resetRelayKeySupportConfirmed();
    markRelayKeySupportConfirmed();
  });

  it('invalid phone reason uses SEND_REASON constant', async () => {
    const o = await sendMessageWithDeps(baseDeps({}), {
      kind: KIND_RECOVERY,
      leadId: 'L',
      businessId: 'B',
      to: 'nope',
      body: 'hi',
    });
    expect(o).toMatchObject({
      kind: 'blocked',
      reason: SEND_REASON.invalidPhone,
    });
  });

  it('recovery path eq uses COL.id / COL.messageSid', async () => {
    const db = makeDb({ leads: { opted_out: false } });
    const send = vi.fn(async () => ({
      id: 'm',
      status: 'queued',
      keyEchoed: true,
    }));
    await sendMessageWithDeps(
      baseDeps({
        dbImpl: db,
        adapter: () =>
          ({
            name: 'm',
            sendMessage: send,
            checkLookupSupport: async () => ({ supported: true }),
          }) as never,
      }),
      {
        kind: KIND_RECOVERY,
        leadId: 'L',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
        skipQuietHours: true,
      }
    );
    expect(
      db.calls.some(
        (c) => c.op === 'eq' && c.args[0] === COL.id && c.args[1] === 'L'
      )
    ).toBe(true);
    expect(
      db.calls.some(
        (c) =>
          c.table === TABLE.smsMessages &&
          c.op === 'eq' &&
          c.args[0] === COL.messageSid
      )
    ).toBe(true);
  });

  it('campaign confirm updates sms + skips lead outbound sid', async () => {
    const db = makeDb({ leads: { opted_out: false } });
    const send = vi.fn(async () => ({
      id: 'm',
      status: 'queued',
      keyEchoed: true,
    }));
    const o = await sendMessageWithDeps(
      baseDeps({
        dbImpl: db,
        adapter: () =>
          ({
            name: 'm',
            sendMessage: send,
            checkLookupSupport: async () => ({ supported: true }),
          }) as never,
      }),
      {
        kind: KIND_CAMPAIGN,
        leadId: 'L',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
        skipQuietHours: true,
        skipRecoveryGate: true,
        enrollmentId: 'E',
        campaignId: 'C',
        stepNumber: 2,
      }
    );
    expect(o.kind).toBe('sent');
    // campaign must NOT write sms_outbound_sid on leads
    expect(
      db.calls.some(
        (c) =>
          c.table === TABLE.leads &&
          c.op === 'update' &&
          (c.args[0] as { sms_outbound_sid?: string })?.sms_outbound_sid
      )
    ).toBe(false);
  });

  it('reconcileAmbiguousSms pulls RECONCILE_PULL_STATUSES via COL.status', async () => {
    const db = makeDb({ smsList: [] });
    await reconcileAmbiguousSmsWithDeps(
      baseDeps({
        dbImpl: db,
        adapter: () =>
          ({
            name: 'm',
            sendMessage: vi.fn(),
            lookupByIdempotencyKey: vi.fn(),
            checkLookupSupport: async () => ({ supported: true }),
          }) as never,
      })
    );
    expect(
      db.calls.some(
        (c) =>
          c.op === 'in' &&
          c.args[0] === COL.status &&
          JSON.stringify(c.args[1]) ===
            JSON.stringify([...RECONCILE_PULL_STATUSES])
      )
    ).toBe(true);
  });

  it('duplicate_in_flight reason constant + needs_review path', async () => {
    const sid = 'mlf:recovery:L';
    const db = makeDb({
      leads: { opted_out: false },
      insertError: { code: '23505', message: 'dup' },
      smsBySid: new Map([[sid, { status: 'sending' }]]),
    });
    const o = await sendMessageWithDeps(
      baseDeps({ dbImpl: db }),
      {
        kind: KIND_RECOVERY,
        leadId: 'L',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
        skipQuietHours: true,
        idempotencyKey: sid,
      }
    );
    expect(o).toMatchObject({
      kind: 'blocked',
      reason: SEND_REASON.duplicateInFlight,
    });
  });
});

describe('send/index gate + dispatch survivor killers', () => {
  beforeEach(() => {
    resetRelayKeySupportConfirmed();
    markRelayKeySupportConfirmed();
  });

  it('manual never runs customer-facing gates (kind guard)', async () => {
    const suppressed = vi.fn(async () => true);
    const o = await sendMessageWithDeps(
      baseDeps({
        dbImpl: makeDb({ leads: { opted_out: true } }),
        isPhoneSuppressed: suppressed,
      }),
      {
        kind: 'manual',
        leadId: 'L',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
      }
    );
    expect(o.kind).toBe('sent');
    expect(suppressed).not.toHaveBeenCalled();
  });

  it('recovery runs gates: suppressed=false stays false (not forced true)', async () => {
    const o = await sendMessageWithDeps(
      baseDeps({
        dbImpl: makeDb({ leads: { opted_out: false } }),
        isPhoneSuppressed: async () => false,
      }),
      {
        kind: KIND_RECOVERY,
        leadId: 'L',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
        skipQuietHours: true,
      }
    );
    expect(o.kind).toBe('sent');
  });

  it('campaign step 1 recovery gate vs step 2 / skipRecoveryGate', async () => {
    const sid = 'mlf:recovery:L';
    const dbPending = makeDb({
      leads: { opted_out: false },
      smsBySid: new Map([[sid, { status: 'sending' }]]),
    });
    // step 1 → blocked pending
    expect(
      (
        await sendMessageWithDeps(baseDeps({ dbImpl: dbPending }), {
          kind: KIND_CAMPAIGN,
          leadId: 'L',
          businessId: 'B',
          to: '+12135550100',
          body: 'hi',
          stepNumber: 1,
          enrollmentId: 'E',
          campaignId: 'C',
          skipQuietHours: true,
        })
      ).kind
    ).toBe('blocked');

    // step 2 → no recovery gate
    expect(
      (
        await sendMessageWithDeps(baseDeps({ dbImpl: dbPending }), {
          kind: KIND_CAMPAIGN,
          leadId: 'L',
          businessId: 'B',
          to: '+12135550100',
          body: 'hi',
          stepNumber: 2,
          enrollmentId: 'E',
          campaignId: 'C',
          skipQuietHours: true,
        })
      ).kind
    ).toBe('sent');

    // recovery kind never hits campaign step gate
    expect(
      (
        await sendMessageWithDeps(
          baseDeps({
            dbImpl: makeDb({ leads: { opted_out: false } }),
          }),
          {
            kind: KIND_RECOVERY,
            leadId: 'L',
            businessId: 'B',
            to: '+12135550100',
            body: 'hi',
            skipQuietHours: true,
          }
        )
      ).kind
    ).toBe('sent');
  });

  it('skipQuietHours true skips quietHours call', async () => {
    const quiet = vi.fn(() => ({
      allowed: false,
      nextSendAt: new Date('2099-01-01T00:00:00Z'),
      zones: ['America/New_York'],
      endHour: 21,
    }));
    const o = await sendMessageWithDeps(
      baseDeps({
        dbImpl: makeDb({ leads: { opted_out: false } }),
        quietHours: quiet,
      }),
      {
        kind: KIND_RECOVERY,
        leadId: 'L',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
        skipQuietHours: true,
      }
    );
    expect(o.kind).toBe('sent');
    expect(quiet).not.toHaveBeenCalled();
  });

  it('leadTimezone preference over lead row timezone', async () => {
    const quiet = vi.fn(() => ({
      allowed: true,
      zones: ['America/Chicago'],
      endHour: 21,
    }));
    await sendMessageWithDeps(
      baseDeps({
        dbImpl: makeDb({
          leads: { opted_out: false, timezone: 'America/New_York' },
        }),
        quietHours: quiet,
      }),
      {
        kind: KIND_RECOVERY,
        leadId: 'L',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
        leadTimezone: 'America/Chicago',
        skipQuietHours: false,
      }
    );
    expect(quiet).toHaveBeenCalled();
    const arg = quiet.mock.calls[0]?.[1] as { leadTimezone?: string };
    expect(arg.leadTimezone).toBe('America/Chicago');
  });

  it('caps probe only when not already confirmed', async () => {
    const ensure = vi.fn(async () => true);
    const check = vi.fn(async () => ({ supported: true }));
    await sendMessageWithDeps(
      baseDeps({
        dbImpl: makeDb({ leads: { opted_out: false } }),
        capsConfirmed: () => true,
        ensureCaps: ensure,
        adapter: () =>
          ({
            name: 'm',
            sendMessage: async () => ({
              id: 'm',
              status: 'queued',
              keyEchoed: true,
            }),
            checkLookupSupport: check,
          }) as never,
      }),
      {
        kind: KIND_RECOVERY,
        leadId: 'L',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
        skipQuietHours: true,
      }
    );
    expect(ensure).not.toHaveBeenCalled();

    await sendMessageWithDeps(
      baseDeps({
        dbImpl: makeDb({ leads: { opted_out: false } }),
        capsConfirmed: () => false,
        ensureCaps: ensure,
        adapter: () =>
          ({
            name: 'm',
            sendMessage: async () => ({
              id: 'm',
              status: 'queued',
              keyEchoed: true,
            }),
            checkLookupSupport: check,
          }) as never,
      }),
      {
        kind: KIND_RECOVERY,
        leadId: 'L',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
        skipQuietHours: true,
      }
    );
    expect(ensure).toHaveBeenCalled();
  });

  it('recovery sent writes sms_outbound_sid; auto defaults true', async () => {
    const db = makeDb({ leads: { opted_out: false } });
    const send = vi.fn(async (req: { auto?: boolean }) => {
      expect(req.auto).toBe(true);
      return { id: 'mid-1', status: 'queued', keyEchoed: true };
    });
    const o = await sendMessageWithDeps(
      baseDeps({
        dbImpl: db,
        adapter: () =>
          ({
            name: 'm',
            sendMessage: send,
            checkLookupSupport: async () => ({ supported: true }),
          }) as never,
      }),
      {
        kind: KIND_RECOVERY,
        leadId: 'L',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
        skipQuietHours: true,
      }
    );
    expect(o.kind).toBe('sent');
    if (o.kind === 'sent') {
      expect(o.messageId).toBe('mid-1');
    }
    expect(
      db.calls.some(
        (c) =>
          c.table === TABLE.leads &&
          c.op === 'update' &&
          (c.args[0] as { sms_outbound_sid?: string })?.sms_outbound_sid
      )
    ).toBe(true);
  });

  it('auto:false is forwarded to adapter', async () => {
    const send = vi.fn(async (req: { auto?: boolean }) => {
      expect(req.auto).toBe(false);
      return { id: 'm', status: 'queued', keyEchoed: true };
    });
    await sendMessageWithDeps(
      baseDeps({
        dbImpl: makeDb({ leads: { opted_out: false } }),
        adapter: () =>
          ({
            name: 'm',
            sendMessage: send,
            checkLookupSupport: async () => ({ supported: true }),
          }) as never,
      }),
      {
        kind: KIND_RECOVERY,
        leadId: 'L',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
        skipQuietHours: true,
        auto: false,
      }
    );
    expect(send).toHaveBeenCalled();
  });

  it('invalid phone detail is non-empty', async () => {
    const o = await sendMessageWithDeps(baseDeps({}), {
      kind: KIND_RECOVERY,
      leadId: 'L',
      businessId: 'B',
      to: 'nope',
      body: 'hi',
    });
    expect(o).toMatchObject({ kind: 'blocked', reason: SEND_REASON.invalidPhone });
    if (o.kind === 'blocked') {
      expect(o.detail && o.detail.length).toBeGreaterThan(0);
    }
  });

  it('insertError non-unique throws with message', async () => {
    const db = makeDb({
      leads: { opted_out: false },
      insertError: { code: '42P01', message: 'relation missing' },
    });
    await expect(
      sendMessageWithDeps(baseDeps({ dbImpl: db }), {
        kind: KIND_RECOVERY,
        leadId: 'L',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
        skipQuietHours: true,
      })
    ).rejects.toThrow(/relation missing/);
  });

  it('campaign needs_review updates sms only (not lead outbound)', async () => {
    const db = makeDb({ leads: { opted_out: false } });
    const o = await sendMessageWithDeps(
      baseDeps({
        dbImpl: db,
        adapter: () =>
          ({
            name: 'm',
            sendMessage: async () => {
              throw new Error('relay boom');
            },
            checkLookupSupport: async () => ({ supported: true }),
          }) as never,
        // Force caps so transition can park/review from error signal
        capsConfirmed: () => true,
      }),
      {
        kind: KIND_CAMPAIGN,
        leadId: 'L',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
        skipQuietHours: true,
        skipRecoveryGate: true,
        enrollmentId: 'E',
        campaignId: 'C',
        stepNumber: 2,
      }
    );
    expect(['needs_review', 'ambiguous']).toContain(o.kind);
    expect(
      db.calls.some(
        (c) =>
          c.table === TABLE.leads &&
          c.op === 'update' &&
          (c.args[0] as { sms_outbound_sid?: string })?.sms_outbound_sid
      )
    ).toBe(false);
  });

  it('resolveRecovery follows lead.sms_outbound_sid when recovery sid absent', async () => {
    const smsBySid = new Map([
      ['alt-sid', { status: 'delivered' }],
    ]);
    const db = makeDb({
      leads: { sms_outbound_sid: 'alt-sid' },
      smsBySid,
    });
    // recoveryMessageSid(L) won't be in map → falls through to lead sid
    const outcome = await resolveRecoveryOutcomeWithDeps(
      baseDeps({ dbImpl: db }),
      db as never,
      'L'
    );
    expect(outcome).toBe('resolved_sent');
  });

  it('manual kind skips sms_messages insert (kind guard)', async () => {
    const db = makeDb({});
    const send = vi.fn(async () => ({
      id: 'm',
      status: 'queued',
      keyEchoed: true,
    }));
    await sendMessageWithDeps(
      baseDeps({
        dbImpl: db,
        adapter: () =>
          ({
            name: 'm',
            sendMessage: send,
            checkLookupSupport: async () => ({ supported: true }),
          }) as never,
      }),
      {
        kind: 'manual' as never,
        leadId: 'L',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
      }
    );
    expect(
      db.calls.some((c) => c.table === TABLE.smsMessages && c.op === 'insert')
    ).toBe(false);
    expect(send).toHaveBeenCalled();
  });
});

describe('send/index payload + hook survivor killers (r12)', () => {
  beforeEach(() => {
    resetRelayKeySupportConfirmed();
    markRelayKeySupportConfirmed();
  });

  it('duplicate confirm_existing returns keySupportedAtSend false', async () => {
    const sid = 'mlf:recovery:Ldup2';
    const db = makeDb({
      leads: { opted_out: false },
      insertError: { code: '23505', message: 'dup' },
      smsBySid: new Map([[sid, { status: 'delivered' }]]),
    });
    const o = await sendMessageWithDeps(baseDeps({ dbImpl: db }), {
      kind: KIND_RECOVERY,
      leadId: 'Ldup2',
      businessId: 'B',
      to: '+12135550100',
      body: 'hi',
      idempotencyKey: sid,
      skipQuietHours: true,
    });
    expect(o).toMatchObject({
      kind: 'sent',
      keySupportedAtSend: false,
      providerStatus: 'delivered',
    });
  });

  it('claim_deferred writes smsClaimDeferredPayload before relay', async () => {
    const sid = 'mlf:recovery:Ldef2';
    const send = vi.fn(async () => ({
      id: 'm',
      status: 'queued',
      keyEchoed: true,
    }));
    const db = makeDb({
      leads: { opted_out: false },
      insertError: { code: '23505', message: 'dup' },
      smsBySid: new Map([[sid, { status: 'deferred' }]]),
    });
    await sendMessageWithDeps(
      baseDeps({
        dbImpl: db,
        adapter: () => ({ name: 'm', sendMessage: send }) as never,
      }),
      {
        kind: KIND_RECOVERY,
        leadId: 'Ldef2',
        businessId: 'B',
        to: '+12135550100',
        body: 'body-x',
        idempotencyKey: sid,
        skipQuietHours: true,
      }
    );
    const upd = db.calls.find(
      (c) =>
        c.table === TABLE.smsMessages &&
        c.op === 'update' &&
        (c.args[0] as { body?: string })?.body === 'body-x'
    );
    expect(upd?.args[0]).toMatchObject({
      status: SMS_STATUS.sending,
      body: 'body-x',
      next_retry_at: null,
    });
    expect(send).toHaveBeenCalled();
  });

  it('suppression non-SuppressionLookupError rethrows', async () => {
    await expect(
      sendMessageWithDeps(
        baseDeps({
          dbImpl: makeDb({ leads: { opted_out: false } }),
          isPhoneSuppressed: async () => {
            throw new Error('network');
          },
        }),
        {
          kind: KIND_RECOVERY,
          leadId: 'L',
          businessId: 'B',
          to: '+12135550100',
          body: 'hi',
          skipQuietHours: true,
        }
      )
    ).rejects.toThrow('network');
  });

  it('manual sent does not update sms_messages', async () => {
    const db = makeDb({});
    const o = await sendMessageWithDeps(
      baseDeps({
        dbImpl: db,
        adapter: () =>
          ({
            name: 'm',
            sendMessage: async () => ({
              id: 'm',
              status: 'queued',
              keyEchoed: true,
            }),
          }) as never,
      }),
      {
        kind: 'manual',
        leadId: 'L',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
      }
    );
    expect(o.kind).toBe('sent');
    expect(
      db.calls.some((c) => c.table === TABLE.smsMessages && c.op === 'update')
    ).toBe(false);
  });

  it('recovery confirm writes lead outbound sid; campaign does not', async () => {
    const mk = async (kind: 'recovery' | 'campaign') => {
      const db = makeDb({ leads: { opted_out: false } });
      await sendMessageWithDeps(
        baseDeps({
          dbImpl: db,
          adapter: () =>
            ({
              name: 'm',
              sendMessage: async () => ({
                id: 'm',
                status: 'queued',
                keyEchoed: true,
              }),
            }) as never,
        }),
        {
          kind,
          leadId: 'L',
          businessId: 'B',
          to: '+12135550100',
          body: 'hi',
          skipQuietHours: true,
          skipRecoveryGate: true,
          enrollmentId: 'E',
          campaignId: 'C',
          stepNumber: 2,
        }
      );
      return db;
    };
    const rec = await mk('recovery');
    expect(
      rec.calls.some(
        (c) =>
          c.table === TABLE.leads &&
          c.op === 'update' &&
          (c.args[0] as { sms_outbound_sid?: string }).sms_outbound_sid
      )
    ).toBe(true);
    const camp = await mk('campaign');
    expect(
      camp.calls.some(
        (c) =>
          c.table === TABLE.leads &&
          c.op === 'update' &&
          (c.args[0] as { sms_outbound_sid?: string }).sms_outbound_sid
      )
    ).toBe(false);
  });

  it('relay throw parks sms with attempts + next_retry_at', async () => {
    const db = makeDb({ leads: { opted_out: false } });
    const o = await sendMessageWithDeps(
      baseDeps({
        dbImpl: db,
        adapter: () =>
          ({
            name: 'm',
            sendMessage: async () => {
              throw new Error('boom');
            },
          }) as never,
      }),
      {
        kind: KIND_RECOVERY,
        leadId: 'L',
        businessId: 'B',
        to: '+12135550100',
        body: 'hi',
        skipQuietHours: true,
      }
    );
    expect(o.kind).toBe('ambiguous');
    const park = db.calls.find(
      (c) =>
        c.table === TABLE.smsMessages &&
        c.op === 'update' &&
        (c.args[0] as { status?: string }).status === SMS_STATUS.unknown
    );
    expect(park?.args[0]).toMatchObject({
      status: SMS_STATUS.unknown,
      reconcile_attempts: expect.any(Number),
      next_retry_at: expect.any(String),
    });
  });

  it('unexpected_decision from transitionSend → needs_review', async () => {
    const machine = await import('./machine');
    const spy = vi
      .spyOn(machine, 'transitionSend')
      .mockReturnValue({ action: 'totally_unknown' } as never);
    try {
      const db = makeDb({ leads: { opted_out: false } });
      const o = await sendMessageWithDeps(
        baseDeps({
          dbImpl: db,
          adapter: () =>
            ({
              name: 'm',
              sendMessage: async () => ({
                id: 'm',
                status: 'queued',
                keyEchoed: true,
              }),
            }) as never,
        }),
        {
          kind: KIND_RECOVERY,
          leadId: 'L',
          businessId: 'B',
          to: '+12135550100',
          body: 'hi',
          skipQuietHours: true,
        }
      );
      expect(o).toMatchObject({
        kind: 'needs_review',
        reason: 'unexpected_decision',
      });
      expect(
        db.calls.some(
          (c) =>
            c.table === TABLE.smsMessages &&
            c.op === 'update' &&
            (c.args[0] as { status?: string }).status === SMS_STATUS.unknown
        )
      ).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('reconcileOne never_sent / needs_review / park payloads', async () => {
    const row = {
      id: '1',
      lead_id: 'L',
      message_sid: 'mlf:recovery:L',
      status: 'unknown',
      reconcile_attempts: null as number | null,
      key_supported_at_send: true,
    };

    const dbNs = makeDb({});
    const ns = await reconcileOneWithDeps(
      baseDeps({
        dbImpl: dbNs,
        adapter: () =>
          ({
            name: 'm',
            lookupByIdempotencyKey: async () => ({
              outcome: 'never_sent',
              found: false,
            }),
          }) as never,
      }),
      row
    );
    expect(ns).toMatchObject({ kind: 'never_sent', requeued: true });
    expect(
      dbNs.calls.some(
        (c) =>
          c.op === 'update' &&
          (c.args[0] as { status?: string }).status ===
            SMS_STATUS.abandonedRetry &&
          String((c.args[0] as { message_sid?: string }).message_sid).includes(
            ':abandoned:'
          )
      )
    ).toBe(true);

    const dbNr = makeDb({});
    const nr = await reconcileOneWithDeps(
      baseDeps({
        dbImpl: dbNr,
        adapter: () =>
          ({
            name: 'm',
            lookupByIdempotencyKey: async () => ({
              outcome: 'failed',
              status: 'failed',
              found: true,
            }),
          }) as never,
      }),
      { ...row, reconcile_attempts: 0 }
    );
    expect(nr.kind).toBe('needs_review');
    expect(
      dbNr.calls.some(
        (c) =>
          c.op === 'update' &&
          (c.args[0] as { status?: string; next_retry_at?: unknown })
            .status === SMS_STATUS.needsReview &&
          (c.args[0] as { next_retry_at?: unknown }).next_retry_at === null
      )
    ).toBe(true);

    const dbPark = makeDb({});
    const park = await reconcileOneWithDeps(
      baseDeps({
        dbImpl: dbPark,
        adapter: () =>
          ({
            name: 'm',
            lookupByIdempotencyKey: async () => ({
              outcome: 'unknown',
              found: true,
            }),
          }) as never,
      }),
      { ...row, reconcile_attempts: null }
    );
    expect(park.kind).toBe('ambiguous');
    expect(
      dbPark.calls.some(
        (c) =>
          c.op === 'update' &&
          (c.args[0] as { reconcile_attempts?: number }).reconcile_attempts ===
            1 &&
          typeof (c.args[0] as { next_retry_at?: string }).next_retry_at ===
            'string'
      )
    ).toBe(true);
  });

  it('lookup without outcome uses classifyRelayLookupResponse', async () => {
    const db = makeDb({});
    const o = await reconcileOneWithDeps(
      baseDeps({
        dbImpl: db,
        adapter: () =>
          ({
            name: 'm',
            lookupByIdempotencyKey: async () => ({
              found: true,
              status: 'delivered',
            }),
          }) as never,
      }),
      {
        id: '1',
        lead_id: 'L',
        message_sid: 'mlf:campaign:E:C:step:1',
        status: 'unknown',
        reconcile_attempts: 0,
        key_supported_at_send: true,
      }
    );
    // classify of found+delivered → sent → resolved
    expect(o.kind).toBe('resolved');
  });

  it('reconcile unexpected_decision from transitionSend', async () => {
    const machine = await import('./machine');
    const spy = vi
      .spyOn(machine, 'transitionSend')
      .mockReturnValue({ action: 'totally_unknown' } as never);
    try {
      const o = await reconcileOneWithDeps(
        baseDeps({
          adapter: () =>
            ({
              name: 'm',
              lookupByIdempotencyKey: async () => ({
                outcome: 'sent',
                status: 'delivered',
                found: true,
              }),
            }) as never,
        }),
        {
          id: '1',
          lead_id: 'L',
          message_sid: 'mlf:campaign:E:C:step:1',
          status: 'unknown',
          reconcile_attempts: 0,
          key_supported_at_send: true,
        }
      );
      expect(o).toMatchObject({
        kind: 'needs_review',
        reason: 'unexpected_decision',
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('warnLookupUnsupported called iff checkLookupSupport present', async () => {
    const warn = vi.fn(async () => ({ supported: true }));
    await reconcileAmbiguousSmsWithDeps(
      baseDeps({
        dbImpl: makeDb({ smsList: [] }),
        warnLookupUnsupported: warn,
        adapter: () =>
          ({
            name: 'm',
            lookupByIdempotencyKey: async () => ({
              outcome: 'sent',
              found: true,
            }),
            checkLookupSupport: async () => ({ supported: true }),
          }) as never,
      })
    );
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockClear();
    await reconcileAmbiguousSmsWithDeps(
      baseDeps({
        dbImpl: makeDb({ smsList: [] }),
        warnLookupUnsupported: warn,
        adapter: () =>
          ({
            name: 'm',
            lookupByIdempotencyKey: async () => ({
              outcome: 'sent',
              found: true,
            }),
          }) as never,
      })
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('stuck cutoff uses now − STUCK_SENDING_MS and ascending order', async () => {
    const db = makeDb({ smsList: [] });
    const clock = new Date('2026-06-15T15:00:00.000Z');
    await reconcileAmbiguousSmsWithDeps(
      baseDeps({
        dbImpl: db,
        clock: () => clock,
        adapter: () =>
          ({
            name: 'm',
            lookupByIdempotencyKey: async () => ({
              outcome: 'sent',
              found: true,
            }),
          }) as never,
      })
    );
    const { STUCK_SENDING_MS } = await import('@/services/campaign-logic');
    const orCall = db.calls.find((c) => c.op === 'or');
    expect(orCall).toBeTruthy();
    const filter = String(orCall?.args[0] ?? '');
    const expectedCutoff = new Date(
      clock.getTime() - STUCK_SENDING_MS
    ).toISOString();
    expect(filter).toContain(expectedCutoff);
    expect(filter).not.toContain(
      new Date(clock.getTime() + STUCK_SENDING_MS).toISOString()
    );
    const order = db.calls.find((c) => c.op === 'order');
    expect(order?.args[0]).toBe(COL.sentAt);
    expect(order?.args[1]).toMatchObject({ ascending: true });
  });

  it('null smsList rows does not throw; never_sent clears recovery only', async () => {
    const dbNull = makeDb({});
    // force then() to return null data
    const orig = dbNull.from;
    dbNull.from = ((name: string) => {
      const t = orig(name);
      if (name === TABLE.smsMessages) {
        const api = t as Record<string, unknown>;
        const chain: Record<string, unknown> = {};
        for (const m of [
          'select',
          'in',
          'or',
          'order',
          'limit',
          'eq',
          'update',
        ]) {
          chain[m] = (...args: unknown[]) => {
            dbNull.calls.push({ table: name, op: m, args });
            return chain;
          };
        }
        chain.then = (
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown
        ) =>
          Promise.resolve({ data: null, error: null }).then(resolve, reject);
        return chain;
      }
      return t;
    }) as typeof dbNull.from;

    const r = await reconcileAmbiguousSmsWithDeps(
      baseDeps({
        dbImpl: dbNull,
        adapter: () =>
          ({
            name: 'm',
            lookupByIdempotencyKey: async () => ({
              outcome: 'sent',
              found: true,
            }),
          }) as never,
      })
    );
    expect(r.confirmed).toBe(0);

    const dbRec = makeDb({
      smsList: [
        {
          id: '1',
          lead_id: 'L1',
          message_sid: 'mlf:recovery:L1',
          status: 'unknown',
          reconcile_attempts: 0,
          key_supported_at_send: true,
        },
        {
          id: '2',
          lead_id: 'L2',
          message_sid: 'mlf:campaign:E:C:step:1',
          status: 'unknown',
          reconcile_attempts: 0,
          key_supported_at_send: true,
        },
      ],
    });
    let i = 0;
    await reconcileAmbiguousSmsWithDeps(
      baseDeps({
        dbImpl: dbRec,
        adapter: () =>
          ({
            name: 'm',
            lookupByIdempotencyKey: async () => {
              i += 1;
              return { outcome: 'never_sent', found: false };
            },
          }) as never,
      })
    );
    const leadClears = dbRec.calls.filter(
      (c) =>
        c.table === TABLE.leads &&
        c.op === 'update' &&
        (c.args[0] as { sms_outbound_sid?: unknown }).sms_outbound_sid === null
    );
    expect(leadClears).toHaveLength(1);
  });

  it('resolveRecovery absent when lead has no sms_outbound_sid key', async () => {
    const db = makeDb({ leads: {} });
    expect(
      await resolveRecoveryOutcomeWithDeps(
        baseDeps({ dbImpl: db }),
        db as never,
        'L'
      )
    ).toBe('absent');
  });
});
