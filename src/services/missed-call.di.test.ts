/**
 * DI tests for processMissedCallWithDeps — every branch without module mocks.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  MissedCallError,
  processMissedCallWithDeps,
  type MissedCallEvent,
} from './missed-call';
import type { MissedCallDeps } from './missed-call-deps';
import type { SupabaseClient } from './missed-call-deps';
import type { EnrollmentResult } from './campaign-runtime';

const FIXED = new Date('2026-10-28T12:00:00.000Z');
const BIZ = {
  id: 'biz-1',
  phone: '+15559999999',
  name: 'Acme',
  vertical: 'plumbing',
  settings: {},
};

type QueryResult = { data: unknown; error: unknown };

function chain(result: QueryResult) {
  const obj: Record<string, unknown> = {};
  const self = () => obj;
  for (const m of ['select', 'insert', 'eq']) {
    obj[m] = vi.fn(self);
  }
  obj.single = vi.fn(async () => result);
  obj.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return obj;
}

class FakeSuppressionLookupError extends Error {}

function baseEvent(over: Partial<MissedCallEvent> = {}): MissedCallEvent {
  return {
    callerPhone: '+15551234567',
    businessPhone: '+15559999999',
    callId: 'call-1',
    ...over,
  };
}

function buildDeps(config: {
  business?: QueryResult;
  missedCallInsert?: QueryResult;
  missedCallLookup?: QueryResult;
  leadLookup?: QueryResult;
  leadInsert?: QueryResult;
  suppressed?: boolean;
  suppressThrows?: Error;
  sendRecoveryThrows?: boolean;
  enrollThrows?: boolean;
}) {
  const sendRecoverySMS = vi.fn(async () => undefined);
  const enrollLeadInCampaign = vi.fn(
    async (): Promise<EnrollmentResult> => ({ enrolled: true, campaignId: 'c', campaignName: 'Standard Follow-up', currentStep: 2, nextSendAt: FIXED.toISOString(), skippedInitial: true })
  );
  const isPhoneSuppressed = vi.fn(async () => config.suppressed ?? false);

  if (config.suppressThrows) {
    isPhoneSuppressed.mockRejectedValue(config.suppressThrows);
  }
  if (config.sendRecoveryThrows) {
    sendRecoverySMS.mockRejectedValue(new Error('sms fail'));
  }
  if (config.enrollThrows) {
    enrollLeadInCampaign.mockRejectedValue(new Error('enroll fail'));
  }

  const from = vi.fn((table: string) => {
    if (table === 'businesses') {
      return chain(config.business ?? { data: BIZ, error: null });
    }
    if (table === 'missed_calls') {
      if (config.missedCallInsert) {
        const c = chain(config.missedCallInsert);
        c.insert = vi.fn(() => c);
        return c;
      }
      return chain(config.missedCallLookup ?? { data: null, error: null });
    }
    if (table === 'leads') {
      if (config.leadInsert) {
        const c = chain(config.leadInsert);
        c.insert = vi.fn(() => c);
        return c;
      }
      return chain(config.leadLookup ?? { data: null, error: null });
    }
    return chain({ data: null, error: null });
  });

  const deps: MissedCallDeps = {
    db: () => ({ from }) as unknown as never,
    clock: () => FIXED,
    normalizeToE164: vi.fn((p: string) => p) as MissedCallDeps['normalizeToE164'],
    isPhoneSuppressed,
    SuppressionLookupError: FakeSuppressionLookupError,
    sendRecoverySMS,
    enrollLeadInCampaign: enrollLeadInCampaign as MissedCallDeps['enrollLeadInCampaign'],
    redactPhone: vi.fn((p: string) => `***${String(p).slice(-4)}`) as any,
  };

  return { deps, sendRecoverySMS, enrollLeadInCampaign, isPhoneSuppressed };
}

describe('processMissedCallWithDeps', () => {
  it('throws when business missing', async () => {
    const { deps } = buildDeps({
      business: { data: null, error: { message: 'no' } },
    });
    await expect(processMissedCallWithDeps(deps, baseEvent())).rejects.toMatchObject(
      { status: 404, name: 'MissedCallError' }
    );
  });

  it('reclaims duplicate call_sid 23505', async () => {
    let mcPass = 0;
    const from = vi.fn((table: string) => {
      if (table === 'businesses') {
        return chain({ data: BIZ, error: null });
      }
      if (table === 'missed_calls') {
        mcPass += 1;
        if (mcPass === 1) {
          const c = chain({
            data: null,
            error: { code: '23505', message: 'dup' },
          });
          c.insert = vi.fn(() => c);
          return c;
        }
        return chain({ data: { id: 'mc-existing' }, error: null });
      }
      if (table === 'leads') {
        return chain({ data: { id: 'lead-existing' }, error: null });
      }
      return chain({ data: null, error: null });
    });

    const deps: MissedCallDeps = {
      ...buildDeps({}).deps,
      db: () => ({ from }) as unknown as never,
    };

    const result = await processMissedCallWithDeps(deps, baseEvent());

    expect(result).toEqual({
      missedCallId: 'mc-existing',
      leadId: 'lead-existing',
    });
  });

  it('throws when duplicate call cannot be reclaimed', async () => {
    const { deps } = buildDeps({
      missedCallInsert: {
        data: null,
        error: { code: '23505', message: 'dup' },
      },
      missedCallLookup: { data: null, error: null },
    });

    await expect(processMissedCallWithDeps(deps, baseEvent())).rejects.toMatchObject(
      { status: 500 }
    );
  });

  it('throws on non-duplicate missed call insert failure', async () => {
    const { deps } = buildDeps({
      missedCallInsert: {
        data: null,
        error: { code: 'XX', message: 'fail' },
      },
    });

    await expect(processMissedCallWithDeps(deps, baseEvent())).rejects.toThrow(
      MissedCallError
    );
  });

  it('fail-closed when suppression lookup errors', async () => {
    const { deps, sendRecoverySMS, enrollLeadInCampaign } = buildDeps({
      missedCallInsert: { data: { id: 'mc-1' }, error: null },
      leadInsert: {
        data: { id: 'lead-sup', status: 'spam' },
        error: null,
      },
      suppressThrows: new FakeSuppressionLookupError('db down'),
    });

    const result = await processMissedCallWithDeps(deps, baseEvent());

    expect(result).toEqual({ missedCallId: 'mc-1', leadId: 'lead-sup' });
    expect(sendRecoverySMS).not.toHaveBeenCalled();
    expect(enrollLeadInCampaign).not.toHaveBeenCalled();
  });

  it('rethrows unexpected suppression errors', async () => {
    const { deps } = buildDeps({
      missedCallInsert: { data: { id: 'mc-1' }, error: null },
      suppressThrows: new Error('unexpected'),
    });

    await expect(processMissedCallWithDeps(deps, baseEvent())).rejects.toThrow(
      'unexpected'
    );
  });

  it('skips recovery when suppressed', async () => {
    const { deps, sendRecoverySMS, enrollLeadInCampaign } = buildDeps({
      missedCallInsert: { data: { id: 'mc-2' }, error: null },
      leadInsert: { data: { id: 'lead-2' }, error: null },
      suppressed: true,
    });

    await processMissedCallWithDeps(deps, baseEvent());

    expect(sendRecoverySMS).not.toHaveBeenCalled();
    expect(enrollLeadInCampaign).not.toHaveBeenCalled();
  });

  it('sends recovery and enrolls Standard path', async () => {
    const { deps, sendRecoverySMS, enrollLeadInCampaign } = buildDeps({
      missedCallInsert: { data: { id: 'mc-3' }, error: null },
      leadInsert: { data: { id: 'lead-3' }, error: null },
      suppressed: false,
    });

    const result = await processMissedCallWithDeps(
      deps,
      baseEvent({ ringDurationSeconds: 12 })
    );

    expect(result).toEqual({ missedCallId: 'mc-3', leadId: 'lead-3' });
    expect(sendRecoverySMS).toHaveBeenCalledWith(
      'lead-3',
      BIZ,
      '+15551234567'
    );
    expect(enrollLeadInCampaign).toHaveBeenCalledWith('lead-3');
  });

  it('returns ids when recovery send fails', async () => {
    const { deps } = buildDeps({
      missedCallInsert: { data: { id: 'mc-4' }, error: null },
      leadInsert: { data: { id: 'lead-4' }, error: null },
      sendRecoveryThrows: true,
    });

    expect(await processMissedCallWithDeps(deps, baseEvent())).toEqual({
      missedCallId: 'mc-4',
      leadId: 'lead-4',
    });
  });

  it('returns ids when enrollment fails', async () => {
    const { deps } = buildDeps({
      missedCallInsert: { data: { id: 'mc-5' }, error: null },
      leadInsert: { data: { id: 'lead-5' }, error: null },
      enrollThrows: true,
    });

    expect(await processMissedCallWithDeps(deps, baseEvent())).toEqual({
      missedCallId: 'mc-5',
      leadId: 'lead-5',
    });
  });

  it('throws when lead insert fails', async () => {
    const { deps } = buildDeps({
      missedCallInsert: { data: { id: 'mc-6' }, error: null },
      leadInsert: { data: null, error: { message: 'lead fail' } },
    });

    await expect(processMissedCallWithDeps(deps, baseEvent())).rejects.toMatchObject(
      { status: 500, message: 'Failed to create lead' }
    );
  });

  it('defaults ring duration to zero', async () => {
    const inserts: unknown[] = [];
    const from = vi.fn((table: string) => {
      if (table === 'businesses') {
        return chain({ data: BIZ, error: null });
      }
      if (table === 'missed_calls') {
        const c = chain({ data: { id: 'mc-r' }, error: null });
        c.insert = vi.fn((payload: unknown) => {
          inserts.push(payload);
          return c;
        });
        return c;
      }
      if (table === 'leads') {
        const c = chain({ data: { id: 'lead-r' }, error: null });
        c.insert = vi.fn(() => c);
        return c;
      }
      return chain({ data: null, error: null });
    });
    const base = buildDeps({});
    const deps: MissedCallDeps = {
      ...base.deps,
      db: () => ({ from }) as unknown as never,
    };

    await processMissedCallWithDeps(deps, baseEvent({ ringDurationSeconds: undefined }));

    expect(inserts[0]).toMatchObject({ ring_duration: 0 });
  });
});

describe('MissedCallError', () => {
  it('carries status', () => {
    const e = new MissedCallError('x', 500);
    expect(e.status).toBe(500);
    expect(e.name).toBe('MissedCallError');
  });
});
