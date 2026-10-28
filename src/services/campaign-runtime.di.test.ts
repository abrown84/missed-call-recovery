/**
 * DI tests for campaign-runtime: db/clock/gateway injected; assert exact
 * side-effects for each send dispatch path.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignDeps } from './campaign-deps';
import {
  sendCampaignSMSWithDeps,
  claimDueEnrollmentWithDeps,
  pauseCampaignForLeadWithDeps,
} from './campaign-runtime';
import type { SendOutcome } from './send/types';
import { SuppressionLookupError } from './suppressions';

const FIXED = new Date('2026-06-15T12:00:00.000Z');

function enrollmentRow() {
  return {
    id: 'enr-1',
    claim_token: 'tok',
    current_step: 1,
    lead_id: 'L',
    campaign_id: 'C',
    status: 'active',
    leads: {
      id: 'L',
      caller_phone: '+12135550100',
      opted_out: false,
      issue: 'flood',
      timezone: 'America/Los_Angeles',
      businesses: {
        id: 'B',
        name: 'Acme Plumbing',
        timezone: 'America/Los_Angeles',
      },
    },
    campaigns: { id: 'C', name: 'Standard' },
  };
}

describe('campaign-runtime DI send path', () => {
  let updates: Array<{ table: string; payload: unknown }>;
  let sendMessage: ReturnType<typeof vi.fn>;
  let deps: CampaignDeps;

  beforeEach(() => {
    updates = [];
    sendMessage = vi.fn();
    const steps = [
      { step_number: 1, delay_minutes: 0, template_key: 'step1' },
      { step_number: 2, delay_minutes: 10, template_key: 'step2' },
    ];

    deps = {
      db: () =>
        ({
          from: (table: string) => {
            const b: any = {
              select: vi.fn(function (this: any) {
                return this;
              }),
              eq: vi.fn(function (this: any) {
                return this;
              }),
              order: vi.fn(function (this: any) {
                return this;
              }),
              lte: vi.fn(function (this: any) {
                return this;
              }),
              lt: vi.fn(function (this: any) {
                return this;
              }),
              is: vi.fn(function (this: any) {
                return this;
              }),
              or: vi.fn(function (this: any) {
                return this;
              }),
              in: vi.fn(function (this: any) {
                return this;
              }),
              limit: vi.fn(function (this: any) {
                return this;
              }),
              update: vi.fn((payload: unknown) => {
                updates.push({ table, payload });
                const u: any = {
                  eq: vi.fn(function (this: any) {
                    return this;
                  }),
                  select: vi.fn(() => u),
                  maybeSingle: vi.fn(async () => ({
                    data: { id: 'e' },
                    error: null,
                  })),
                  then: (resolve: any, reject?: any) =>
                    Promise.resolve({
                      data: [{ id: 'e', claim_token: 'tok' }],
                      error: null,
                    }).then(resolve, reject),
                };
                return u;
              }),
              single: vi.fn(async () => ({
                data: table === 'campaign_enrollments' ? enrollmentRow() : null,
                error: null,
              })),
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              then: (resolve: any, reject?: any) => {
                if (table === 'campaign_steps') {
                  return Promise.resolve({ data: steps, error: null }).then(
                    resolve,
                    reject
                  );
                }
                return Promise.resolve({ data: null, error: null }).then(
                  resolve,
                  reject
                );
              },
            };
            b.select = vi.fn(() => b);
            return b;
          },
        }) as any,
      clock: () => FIXED,
      adapter: () => ({ name: 'mock' }) as any,
      sendMessage: sendMessage as any,
      sendRecoverySMS: vi.fn() as any,
      processDeferredRecoveries: vi.fn(async () => ({
        sent: 0,
        deferred: 0,
        errors: 0,
      })) as any,
      isPhoneSuppressed: vi.fn(async () => false),
      SuppressionLookupError,
      getTemplate: (_key, vars) =>
        `Hi from ${vars.business} about ${vars.issue}`,
      uuid: () => 'uuid-fixed',
      sleep: vi.fn(async () => undefined),
    };
  });

  async function run(outcome: SendOutcome) {
    sendMessage.mockResolvedValue(outcome);
    return sendCampaignSMSWithDeps(deps, 'enr-1', 'tok');
  }

  it('sent → advanceEnrollment update (current_step/status payload)', async () => {
    await expect(run({
      kind: 'sent',
      sid: 's',
      messageId: 'm',
      providerStatus: 'queued',
      keySupportedAtSend: true,
    })).resolves.toBe(true);
    expect(
      updates.some(
        (u) =>
          u.table === 'campaign_enrollments' &&
          u.payload &&
          typeof u.payload === 'object' &&
          ('current_step' in (u.payload as object) ||
            'status' in (u.payload as object))
      )
    ).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'campaign',
        leadId: 'L',
        businessId: 'B',
        body: expect.stringContaining('Acme Plumbing'),
      })
    );
    expect(sendMessage.mock.calls[0][0].body).toContain('flood');
  });

  it('quiet_hours_deferred → release with nextSendAt', async () => {
    await expect(
      run({
        kind: 'blocked',
        reason: 'quiet_hours_deferred',
        nextSendAt: '2026-01-01T00:00:00.000Z',
      })
    ).resolves.toBe(true);
    expect(
      updates.some(
        (u) =>
          (u.payload as { next_send_at?: string })?.next_send_at ===
          '2026-01-01T00:00:00.000Z'
      )
    ).toBe(true);
  });

  it('quiet_hours_unresolved → lead review + release', async () => {
    await expect(
      run({ kind: 'blocked', reason: 'quiet_hours_unresolved' })
    ).resolves.toBe(false);
    expect(
      updates.some(
        (u) =>
          u.table === 'leads' &&
          (u.payload as { needs_human_review?: boolean })
            ?.needs_human_review === true
      )
    ).toBe(true);
  });

  it('ambiguous → park release (next_send_at set)', async () => {
    await expect(
      run({
        kind: 'ambiguous',
        status: 'unknown',
        nextRetryAt: '2099-01-01T00:00:00.000Z',
      })
    ).resolves.toBe(false);
    expect(
      updates.some(
        (u) =>
          u.table === 'campaign_enrollments' &&
          Boolean((u.payload as { next_send_at?: string })?.next_send_at)
      )
    ).toBe(true);
  });

  it('opted_out outcome → pause enrollment', async () => {
    await expect(run({ kind: 'blocked', reason: 'opted_out' })).resolves.toBe(
      true
    );
    expect(
      updates.some(
        (u) => (u.payload as { status?: string })?.status === 'paused'
      )
    ).toBe(true);
  });

  it('needs_review → terminal needs_review status (not advance)', async () => {
    await expect(
      run({ kind: 'needs_review', reason: 'duplicate_failed', sid: 's' })
    ).resolves.toBe(false);
    expect(
      updates.some(
        (u) =>
          (u.payload as { status?: string })?.status === 'needs_review'
      )
    ).toBe(true);
    expect(
      updates.every(
        (u) => !('current_step' in ((u.payload as object) || {}))
      )
    ).toBe(true);
  });

  it('never_sent → noop_release clears claim', async () => {
    await expect(run({ kind: 'never_sent', sid: 's' })).resolves.toBe(false);
    expect(
      updates.some(
        (u) =>
          u.table === 'campaign_enrollments' &&
          (u.payload as { claim_token?: unknown })?.claim_token === null
      )
    ).toBe(true);
  });

  it('template uses business name + issue (not empty literals)', async () => {
    await run({
      kind: 'sent',
      sid: 's',
      messageId: 'm',
      providerStatus: 'queued',
      keySupportedAtSend: true,
    });
    const body = sendMessage.mock.calls[0][0].body as string;
    expect(body).toContain('Acme Plumbing');
    expect(body).toContain('flood');
    expect(body.length).toBeGreaterThan(0);
  });

  it('clock injected into pause payload nowIso', async () => {
    await pauseCampaignForLeadWithDeps(deps, 'L');
    expect(updates[0]?.payload).toMatchObject({
      status: 'paused',
      paused_at: FIXED.toISOString(),
    });
  });

  it('claimDueEnrollment uses deps.uuid + clock', async () => {
    // rebuild db so update() returns a full chain including lte/is/select
    deps.db = () =>
      ({
        from: (table: string) => {
          const b: any = {};
          const self = () => b;
          for (const m of [
            'select',
            'update',
            'eq',
            'lte',
            'lt',
            'is',
            'or',
            'order',
            'limit',
          ]) {
            b[m] = vi.fn(self);
          }
          b.update = vi.fn((payload: unknown) => {
            updates.push({ table, payload });
            return b;
          });
          b.then = (resolve: any, reject?: any) =>
            Promise.resolve({
              data: [{ id: 'enr-1', claim_token: 'uuid-fixed' }],
              error: null,
            }).then(resolve, reject);
          return b;
        },
      }) as any;
    const token = await claimDueEnrollmentWithDeps(deps, 'enr-1');
    expect(token).toBe('uuid-fixed');
    expect(
      updates.some(
        (u) =>
          (u.payload as { claim_token?: string })?.claim_token === 'uuid-fixed'
      )
    ).toBe(true);
  });

  it('suppression lookup failure → release_fail (no send)', async () => {
    deps.isPhoneSuppressed = vi.fn(async () => {
      throw new SuppressionLookupError('down');
    });
    await expect(
      sendCampaignSMSWithDeps(deps, 'enr-1', 'tok')
    ).resolves.toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(
      updates.some(
        (u) =>
          (u.payload as { claim_token?: unknown })?.claim_token === null
      )
    ).toBe(true);
  });
});
