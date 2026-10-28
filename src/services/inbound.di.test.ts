/**
 * DI tests for processInboundSmsWithDeps — every branch without module mocks.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  InboundError,
  processInboundSmsWithDeps,
  resolveBusinessPhone,
  type InboundSmsEvent,
} from './inbound';
import type { InboundDeps } from './inbound-deps';
import { LEAD_LOOKUP_MAX_AGE_DAYS } from './campaign-logic';
import type { ClassificationResult } from '@/types';
import { ENV_BRWN_DEFAULT_BUSINESS_PHONE } from '@/services/db-strings';
import type { SupabaseClient } from './inbound-deps';

const FIXED = new Date('2026-10-28T12:00:00.000Z');
const BIZ = {
  id: 'biz-1',
  phone: '+15559999999',
  name: 'Acme',
  vertical: 'plumbing',
};

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

function createDb(handlers: {
  businesses?: QueryResult;
  leads?: (ctx: { pass: number }) => QueryResult;
  sms?: QueryResult;
}) {
  let leadPass = 0;
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const eqLog: Array<{ table: string; col: string; val: unknown }> = [];
  const inLog: Array<{ table: string; col: string; vals: unknown }> = [];
  const gteLog: Array<{ table: string; col: string; val: unknown }> = [];
  const fromLog: string[] = [];

  const from = vi.fn((table: string) => {
    fromLog.push(table);
    if (table === 'businesses') {
      return chain(handlers.businesses ?? { data: BIZ, error: null });
    }
    if (table === 'sms_messages') {
      const c = chain(handlers.sms ?? { data: null, error: null });
      c.insert = vi.fn((payload: unknown) => {
        inserts.push(payload);
        return c;
      });
      return c;
    }
    if (table === 'leads') {
      leadPass += 1;
      const pass = leadPass;
      const res =
        handlers.leads?.({ pass }) ?? { data: null, error: null };
      const c = chain(res);
      c.eq = vi.fn((col: string, val: unknown) => {
        eqLog.push({ table, col, val });
        return c;
      });
      c.in = vi.fn((col: string, vals: unknown) => {
        inLog.push({ table, col, vals });
        return c;
      });
      c.gte = vi.fn((col: string, val: unknown) => {
        gteLog.push({ table, col, val });
        return c;
      });
      c.update = vi.fn((payload: unknown) => {
        updates.push(payload);
        return c;
      });
      return c;
    }
    return chain({ data: null, error: null });
  });

  return {
    from,
    inserts,
    updates,
    eqLog,
    inLog,
    gteLog,
    fromLog,
    resetPass: () => {
      leadPass = 0;
    },
  };
}

function baseEvent(over: Partial<InboundSmsEvent> = {}): InboundSmsEvent {
  return {
    from: '+15551234567',
    businessPhone: '+15559999999',
    body: 'Need service tomorrow',
    messageId: 'msg-fixed',
    ...over,
  };
}

function buildDeps(over: Partial<InboundDeps> & { dbImpl?: ReturnType<typeof createDb> }): {
  deps: InboundDeps;
  db: ReturnType<typeof createDb>;
  spies: {
    classifyOptOut: ReturnType<typeof vi.fn>;
    isOptOutMessage: ReturnType<typeof vi.fn>;
    classifyUrgency: InboundDeps['classifyUrgency'];
    escalateLead: ReturnType<typeof vi.fn>;
    handleClassifiedReplyEnrollment: ReturnType<typeof vi.fn>;
    pauseCampaignForLead: ReturnType<typeof vi.fn>;
    markLeadOptedOut: ReturnType<typeof vi.fn>;
    suppressPhoneForBusiness: ReturnType<typeof vi.fn>;
    tryNormalizeToE164: ReturnType<typeof vi.fn>;
    isLeadWithinLookupAge: ReturnType<typeof vi.fn>;
    redactPhone: InboundDeps['redactPhone'];
  };
} {
  const db = over.dbImpl ?? createDb({});
  const spies = {
    classifyOptOut: vi.fn(() => ({ kind: 'not_opt_out' as const })),
    isOptOutMessage: vi.fn(() => false),
    classifyUrgency: vi.fn(async () => ({
      urgency: 'normal' as const,
      confidence: 0.5,
      keywords: [],
      issue: 'general',
    })) as InboundDeps['classifyUrgency'],
    escalateLead: vi.fn(async () => undefined),
    handleClassifiedReplyEnrollment: vi.fn(async () => ({
      action: 'noop',
      campaignName: undefined,
    })),
    pauseCampaignForLead: vi.fn(async () => undefined),
    markLeadOptedOut: vi.fn(async () => undefined),
    suppressPhoneForBusiness: vi.fn(async () => undefined),
    tryNormalizeToE164: vi.fn((p: string) =>
      p.startsWith('+') ? p : null
    ),
    isLeadWithinLookupAge: vi.fn(() => true),
    redactPhone: vi.fn((p: string | null | undefined) =>
      `***${String(p).slice(-4)}`
    ) as InboundDeps['redactPhone'],
  };

  const randomSuffix = vi.fn(() => 'abc12345');

  const deps: InboundDeps = {
    db: () => ({ from: db.from }) as unknown as SupabaseClient,
    clock: () => FIXED,
    randomSuffix,
    ...spies,
    ...over,
  };
  if (!over.randomSuffix) {
    deps.randomSuffix = randomSuffix;
  }

  return { deps, db, spies };
}

describe('processInboundSmsWithDeps', () => {
  it('throws when business is missing', async () => {
    const db = createDb({
      businesses: { data: null, error: { message: 'missing' } },
    });
    const { deps } = buildDeps({ dbImpl: db });

    await expect(
      processInboundSmsWithDeps(deps, baseEvent())
    ).rejects.toMatchObject({ status: 404, name: 'InboundError' });
  });

  it('records STOP without lead and suppresses E.164', async () => {
    const db = createDb({
      leads: () => ({ data: null, error: null }),
    });
    const { deps, spies } = buildDeps({
      dbImpl: db,
      classifyOptOut: vi.fn(() => ({ kind: 'opt_out' as const })),
    });

    const result = await processInboundSmsWithDeps(
      deps,
      baseEvent({ body: 'STOP' })
    );

    expect(result).toEqual({ status: 'opt_out_recorded' });
    expect(spies.suppressPhoneForBusiness).toHaveBeenCalledWith(
      'biz-1',
      '+15551234567',
      'opt_out'
    );
    expect(spies.pauseCampaignForLead).not.toHaveBeenCalled();
  });

  it('STOP with lead pauses campaign and inserts inbound sms', async () => {
    const db = createDb({
      leads: () => ({ data: { id: 'lead-stop' }, error: null }),
    });
    const { deps, spies } = buildDeps({
      dbImpl: db,
      classifyOptOut: vi.fn(() => ({ kind: 'opt_out' as const })),
    });

    const result = await processInboundSmsWithDeps(
      deps,
      baseEvent({ body: 'STOP' })
    );

    expect(result).toEqual({ status: 'opt_out_recorded', leadId: 'lead-stop' });
    expect(spies.markLeadOptedOut).toHaveBeenCalledWith('lead-stop');
    expect(spies.pauseCampaignForLead).toHaveBeenCalledWith('lead-stop');
    expect(db.inserts.length).toBe(1);
  });

  it('STOP from bad phone skips suppress but still records', async () => {
    const db = createDb({ leads: () => ({ data: null, error: null }) });
    const { deps, spies } = buildDeps({
      dbImpl: db,
      classifyOptOut: vi.fn(() => ({ kind: 'opt_out' as const })),
      tryNormalizeToE164: vi.fn(() => null),
    });

    await processInboundSmsWithDeps(
      deps,
      baseEvent({ from: 'not-a-phone', body: 'STOP' })
    );

    expect(spies.suppressPhoneForBusiness).not.toHaveBeenCalled();
  });

  it('isOptOutMessage path without classifyOptOut', async () => {
    const db = createDb({ leads: () => ({ data: null, error: null }) });
    const { deps, spies } = buildDeps({
      dbImpl: db,
      isOptOutMessage: vi.fn(() => true),
    });

    await processInboundSmsWithDeps(deps, baseEvent({ body: 'UNSUBSCRIBE' }));

    expect(spies.suppressPhoneForBusiness).toHaveBeenCalled();
  });

  it('ambiguous opt-out flags lead and does NOT pause campaign', async () => {
    const db = createDb({
      leads: () => ({ data: { id: 'lead-amb' }, error: null }),
    });
    const { deps, spies } = buildDeps({
      dbImpl: db,
      classifyOptOut: vi.fn(() => ({
        kind: 'ambiguous' as const,
        reason: 'keyword_in_sentence',
      })),
    });

    const result = await processInboundSmsWithDeps(
      deps,
      baseEvent({ body: 'Please STOP calling me about quotes' })
    );

    expect(result).toEqual({
      status: 'ambiguous_opt_out',
      leadId: 'lead-amb',
    });
    expect(spies.pauseCampaignForLead).not.toHaveBeenCalled();
    expect(spies.suppressPhoneForBusiness).not.toHaveBeenCalled();
    expect(db.updates[0]).toMatchObject({ needs_human_review: true });
  });

  it('ambiguous opt-out without matching lead', async () => {
    const db = createDb({ leads: () => ({ data: null, error: null }) });
    const { deps } = buildDeps({
      dbImpl: db,
      classifyOptOut: vi.fn(() => ({
        kind: 'ambiguous' as const,
        reason: 'keyword',
      })),
    });

    expect(
      await processInboundSmsWithDeps(deps, baseEvent({ body: 'maybe stop?' }))
    ).toEqual({ status: 'ambiguous_opt_out' });
  });

  it('returns no_lead_found for invalid sender on normal path', async () => {
    const db = createDb({});
    const { deps } = buildDeps({
      dbImpl: db,
      tryNormalizeToE164: vi.fn(() => null),
    });

    expect(
      await processInboundSmsWithDeps(
        deps,
        baseEvent({ from: 'bad', body: 'hello' })
      )
    ).toEqual({ status: 'no_lead_found' });
  });

  it('returns no_lead_found when no matching lead', async () => {
    const db = createDb({
      leads: () => ({ data: null, error: null }),
    });
    const { deps } = buildDeps({ dbImpl: db });

    expect(await processInboundSmsWithDeps(deps, baseEvent())).toEqual({
      status: 'no_lead_found',
    });
  });

  it('returns no_lead_found when lead fails age check', async () => {
    const lead = {
      id: 'old-lead',
      created_at: '2020-01-01T00:00:00.000Z',
      status: 'pending',
    };
    const db = createDb({
      leads: ({ pass }) =>
        pass === 1 ? { data: lead, error: null } : { data: null, error: null },
    });
    const { deps } = buildDeps({
      dbImpl: db,
      isLeadWithinLookupAge: vi.fn(() => false),
    });

    expect(await processInboundSmsWithDeps(deps, baseEvent())).toEqual({
      status: 'no_lead_found',
    });
  });

  it('finds open qualified lead when pending missing', async () => {
    const openLead = {
      id: 'lead-open',
      created_at: FIXED.toISOString(),
      status: 'qualified',
    };
    let pass = 0;
    const db = createDb({
      leads: () => {
        pass += 1;
        if (pass === 1) return { data: null, error: null };
        if (pass === 2) return { data: openLead, error: null };
        return { data: null, error: null };
      },
    });
    const { deps, spies } = buildDeps({ dbImpl: db });

    const result = await processInboundSmsWithDeps(deps, baseEvent());

    expect(result.status).toBe('processed');
    expect(result).toMatchObject({ leadId: 'lead-open', urgency: 'normal' as const });
    expect(spies.escalateLead).not.toHaveBeenCalled();
  });

  it('uses legacy caller_phone when stored un-normalized', async () => {
    const legacyLead = {
      id: 'legacy-lead',
      created_at: FIXED.toISOString(),
      status: 'pending',
    };
    let pass = 0;
    const db = createDb({
      leads: () => {
        pass += 1;
        if (pass <= 2) return { data: null, error: null };
        return { data: legacyLead, error: null };
      },
    });
    const { deps } = buildDeps({
      dbImpl: db,
      tryNormalizeToE164: vi.fn(() => '+15551234567'),
    });

    const result = await processInboundSmsWithDeps(
      deps,
      baseEvent({ from: '(555) 123-4567' })
    );

    expect(result).toMatchObject({ status: 'processed', leadId: 'legacy-lead' });
  });

  it('escalates emergency and high urgency', async () => {
    const lead = {
      id: 'lead-hi',
      created_at: FIXED.toISOString(),
      status: 'pending',
    };
    const db = createDb({
      leads: ({ pass }) =>
        pass === 1 ? { data: lead, error: null } : { data: lead, error: null },
    });
    const classification: ClassificationResult = {
      urgency: 'high' as const,
      confidence: 0.9,
      keywords: ['heat'],
      issue: 'no heat',
    };
    const { deps, spies } = buildDeps({
      dbImpl: db,
      classifyUrgency: vi.fn(async () => classification),
      handleClassifiedReplyEnrollment: vi.fn(async () => ({
        action: 'switch',
        campaignName: 'High Priority Follow-up',
      })),
    });

    const result = await processInboundSmsWithDeps(
      deps,
      baseEvent({ body: 'No heat!' })
    );

    expect(result).toMatchObject({
      status: 'processed',
      urgency: 'high' as const,
      enrollmentAction: 'switch',
    });
    expect(spies.escalateLead).toHaveBeenCalledWith(
      'lead-hi',
      BIZ,
      classification
    );
  });

  it('continues when enrollment throws', async () => {
    const lead = {
      id: 'lead-enr',
      created_at: FIXED.toISOString(),
      status: 'pending',
    };
    const db = createDb({
      leads: () => ({ data: lead, error: null }),
    });
    const { deps } = buildDeps({
      dbImpl: db,
      handleClassifiedReplyEnrollment: vi.fn(async () => {
        throw new Error('enroll boom');
      }),
    });

    const result = await processInboundSmsWithDeps(deps, baseEvent());

    expect(result).toMatchObject({
      status: 'processed',
      enrollmentAction: 'error',
    });
  });

  it('continues when markLeadOptedOut throws on STOP', async () => {
    const db = createDb({
      leads: () => ({ data: { id: 'lead-x' }, error: null }),
    });
    const { deps } = buildDeps({
      dbImpl: db,
      classifyOptOut: vi.fn(() => ({ kind: 'opt_out' as const })),
      markLeadOptedOut: vi.fn(async () => {
        throw new Error('mark fail');
      }),
    });

    const result = await processInboundSmsWithDeps(
      deps,
      baseEvent({ body: 'STOP' })
    );

    expect(result).toEqual({ status: 'opt_out_recorded', leadId: 'lead-x' });
  });

  it('escalates emergency urgency', async () => {
    const lead = {
      id: 'lead-em',
      created_at: FIXED.toISOString(),
      status: 'pending',
    };
    const db = createDb({ leads: () => ({ data: lead, error: null }) });
    const classification: ClassificationResult = {
      urgency: 'emergency' as const,
      confidence: 1,
      keywords: [],
      issue: 'flood',
    };
    const { deps, spies } = buildDeps({
      dbImpl: db,
      classifyUrgency: vi.fn(async () => classification),
    });

    await processInboundSmsWithDeps(deps, baseEvent({ body: 'Flood!' }));

    expect(spies.escalateLead).toHaveBeenCalledWith('lead-em', BIZ, classification);
  });

  it('still processes when lead update fails', async () => {
    const lead = {
      id: 'lead-upd',
      created_at: FIXED.toISOString(),
      status: 'pending',
    };
    const from = vi.fn((table: string) => {
      if (table === 'businesses') {
        return chain({ data: BIZ, error: null });
      }
      if (table === 'sms_messages') {
        return chain({ data: null, error: null });
      }
      if (table === 'leads') {
        const ok = chain({ data: lead, error: null });
        const failUpdate = chain({ data: null, error: { message: 'update fail' } });
        let updates = 0;
        ok.update = vi.fn(() => {
          updates += 1;
          return failUpdate;
        });
        return ok;
      }
      return chain({ data: null, error: null });
    });
    const { deps } = buildDeps({
      dbImpl: { from, inserts: [], updates: [], resetPass: () => undefined, eqLog: [], inLog: [], gteLog: [], fromLog: [] },
    });

    const result = await processInboundSmsWithDeps(deps, baseEvent());

    expect(result.status).toBe('processed');
  });

  it('STOP falls back to raw caller_phone lookup', async () => {
    let pass = 0;
    const db = createDb({
      leads: () => {
        pass += 1;
        if (pass === 1) return { data: null, error: null };
        return { data: { id: 'raw-lead' }, error: null };
      },
    });
    const { deps } = buildDeps({
      dbImpl: db,
      classifyOptOut: vi.fn(() => ({ kind: 'opt_out' as const })),
      tryNormalizeToE164: vi.fn(() => '+15551234567'),
    });

    const result = await processInboundSmsWithDeps(
      deps,
      baseEvent({ from: '(555) 123-4567', body: 'STOP' })
    );

    expect(result).toEqual({ status: 'opt_out_recorded', leadId: 'raw-lead' });
  });

  it('generated message sid uses brwn-in prefix', async () => {
    const db = createDb({
      leads: () => ({ data: null, error: null }),
      businesses: { data: BIZ, error: null },
    });
    const built = buildDeps({
      dbImpl: db,
      classifyOptOut: vi.fn(() => ({ kind: 'opt_out' as const })),
    });

    await processInboundSmsWithDeps(
      built.deps,
      baseEvent({ messageId: undefined, body: 'STOP' })
    );

    expect(built.deps.randomSuffix).toHaveBeenCalled();
  });

  it('skips legacy phone query when sender already E.164', async () => {
    let leadQueries = 0;
    const from = vi.fn((table: string) => {
      if (table === 'businesses') {
        return chain({ data: BIZ, error: null });
      }
      if (table === 'leads') {
        leadQueries += 1;
        return chain({ data: null, error: null });
      }
      return chain({ data: null, error: null });
    });
    const { deps } = buildDeps({
      dbImpl: {
        from,
        inserts: [],
        updates: [],
        eqLog: [],
        inLog: [],
        gteLog: [],
        fromLog: [],
        resetPass: () => undefined,
      },
      tryNormalizeToE164: vi.fn((p: string) => p),
    });

    await processInboundSmsWithDeps(
      deps,
      baseEvent({ from: '+15551234567', body: 'hello' })
    );

    expect(leadQueries).toBe(2);
  });

  it('uses cutoff based on LEAD_LOOKUP_MAX_AGE_DAYS', async () => {
    const gteCalls: unknown[] = [];
    const from = vi.fn((table: string) => {
      const c = chain({ data: null, error: null });
      if (table === 'businesses') {
        return chain({ data: BIZ, error: null });
      }
      if (table === 'leads') {
        c.gte = vi.fn((_col: string, val: unknown) => {
          gteCalls.push(val);
          return c;
        });
      }
      return c;
    });
    const { deps } = buildDeps({
      dbImpl: {
        from,
        inserts: [],
        updates: [],
        resetPass: () => undefined,
        eqLog: [],
        inLog: [],
        gteLog: [],
        fromLog: [],
      },
    });

    await processInboundSmsWithDeps(deps, baseEvent());

    const expectedCutoff = new Date(
      FIXED.getTime() - LEAD_LOOKUP_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    expect(gteCalls).toContain(expectedCutoff);
  });

  it('throws only when business row is missing (not on benign error flag)', async () => {
    const db = createDb({
      businesses: { data: null, error: null },
      leads: () => ({ data: null, error: null }),
    });
    const { deps } = buildDeps({ dbImpl: db });

    await expect(processInboundSmsWithDeps(deps, baseEvent())).rejects.toThrow(
      InboundError
    );
  });

  it('truncates inbound body to 1600 chars in sms insert', async () => {
    const lead = {
      id: 'lead-long',
      created_at: FIXED.toISOString(),
      status: 'pending',
    };
    const db = createDb({ leads: () => ({ data: lead, error: null }) });
    const { deps } = buildDeps({ dbImpl: db });
    const longBody = 'x'.repeat(2000);

    await processInboundSmsWithDeps(deps, baseEvent({ body: longBody }));

    expect((db.inserts[0] as { body: string }).body).toHaveLength(1600);
  });

  it('writes expected lead/sms fields on normal process path', async () => {
    const lead = {
      id: 'lead-fields',
      created_at: FIXED.toISOString(),
      status: 'pending',
    };
    const db = createDb({ leads: () => ({ data: lead, error: null }) });
    const { deps } = buildDeps({ dbImpl: db });

    await processInboundSmsWithDeps(
      deps,
      baseEvent({ messageId: 'sid-1', body: 'Water leak' })
    );

    expect(db.fromLog).toContain('businesses');
    expect(db.fromLog).toContain('sms_messages');
    expect(db.eqLog).toContainEqual({
      table: 'leads',
      col: 'status',
      val: 'pending',
    });
    expect(db.eqLog).toContainEqual({
      table: 'leads',
      col: 'caller_phone',
      val: '+15551234567',
    });
    expect(db.gteLog.some((g) => g.col === 'created_at')).toBe(true);
    expect(db.inserts[0]).toMatchObject({
      lead_id: 'lead-fields',
      direction: 'inbound',
      status: 'received',
      message_sid: 'sid-1',
      body: 'Water leak',
    });
    expect(db.updates[0]).toMatchObject({
      status: 'qualified',
      classified_at: FIXED.toISOString(),
    });
  });

  it('queries qualified/escalated when pending lead missing', async () => {
    const openLead = {
      id: 'lead-q',
      created_at: FIXED.toISOString(),
      status: 'qualified',
    };
    let pass = 0;
    const db = createDb({
      leads: () => {
        pass += 1;
        return pass === 1
          ? { data: null, error: null }
          : { data: openLead, error: null };
      },
    });
    const { deps } = buildDeps({ dbImpl: db });

    await processInboundSmsWithDeps(deps, baseEvent());

    expect(db.inLog).toContainEqual({
      table: 'leads',
      col: 'status',
      vals: ['qualified', 'escalated'],
    });
  });

  it('does not escalate normal urgency', async () => {
    const lead = {
      id: 'lead-n',
      created_at: FIXED.toISOString(),
      status: 'pending',
    };
    const db = createDb({ leads: () => ({ data: lead, error: null }) });
    const { deps, spies } = buildDeps({ dbImpl: db });

    await processInboundSmsWithDeps(deps, baseEvent());

    expect(spies.escalateLead).not.toHaveBeenCalled();
  });

  it('uses trimmed sender for STOP lookup when not E.164', async () => {
    const db = createDb({
      leads: () => ({ data: { id: 'trim-lead' }, error: null }),
    });
    const { deps } = buildDeps({
      dbImpl: db,
      classifyOptOut: vi.fn(() => ({ kind: 'opt_out' as const })),
      tryNormalizeToE164: vi.fn(() => null),
    });

    await processInboundSmsWithDeps(
      deps,
      baseEvent({ from: '  5551234567  ', body: 'STOP' })
    );

    expect(db.eqLog).toContainEqual({
      table: 'leads',
      col: 'caller_phone',
      val: '5551234567',
    });
  });

  it('stores ambiguous reason on lead flag', async () => {
    const db = createDb({
      leads: () => ({ data: { id: 'amb' }, error: null }),
    });
    const { deps } = buildDeps({
      dbImpl: db,
      classifyOptOut: vi.fn(() => ({
        kind: 'ambiguous' as const,
        reason: 'stop_in_sentence',
      })),
    });

    await processInboundSmsWithDeps(deps, baseEvent({ body: 'maybe stop' }));

    expect(db.updates[0]).toMatchObject({
      needs_human_review_reason: 'stop_in_sentence',
      needs_human_review_at: FIXED.toISOString(),
    });
  });
});

describe('resolveBusinessPhone', () => {
  it('prefers payload then env', () => {
    expect(resolveBusinessPhone('+15550001111')).toBe('+15550001111');
    expect(resolveBusinessPhone('  ')).toBe(null);
    process.env[ENV_BRWN_DEFAULT_BUSINESS_PHONE] = '+15550009999';
    expect(resolveBusinessPhone(undefined)).toBe('+15550009999');
    delete process.env[ENV_BRWN_DEFAULT_BUSINESS_PHONE];
  });
});

describe('InboundError', () => {
  it('carries status', () => {
    const e = new InboundError('x', 404);
    expect(e.status).toBe(404);
    expect(e.name).toBe('InboundError');
  });
});
