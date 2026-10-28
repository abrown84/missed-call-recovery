/**
 * End-to-end ambiguous path: real classifyOptOut + DI inbound handler.
 * "Stop texting me, I already hired someone" must pause + notify + classify.
 */
import { describe, expect, it, vi } from 'vitest';
import { processInboundSmsWithDeps, type InboundSmsEvent } from './inbound';
import type { InboundDeps } from './inbound-deps';
import { classifyOptOut } from './opt-out';
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

describe('inbound ambiguous e2e (real classifyOptOut)', () => {
  it('hired-someone reply pauses campaign and notifies owner', async () => {
    const body = 'Stop texting me, I already hired someone';
    expect(classifyOptOut(body).kind).toBe('ambiguous');

    const updates: unknown[] = [];
    const from = vi.fn((table: string) => {
      if (table === 'businesses') {
        return chain({ data: BIZ, error: null });
      }
      if (table === 'leads') {
        const c = chain({
          data: {
            id: 'lead-hired',
            created_at: FIXED.toISOString(),
            status: 'pending',
          },
          error: null,
        });
        c.update = vi.fn((payload: unknown) => {
          updates.push(payload);
          return c;
        });
        return c;
      }
      return chain({ data: null, error: null });
    });

    const pauseCampaignForLead = vi.fn(async () => undefined);
    const notifyPossibleOptOut = vi.fn(async () => true);
    const classifyUrgency = vi.fn(async () => ({
      urgency: 'low' as const,
      confidence: 0.7,
      keywords: ['hired'],
      issue: 'already_hired',
    }));
    const handleClassifiedReplyEnrollment = vi.fn(async () => ({
      action: 'noop',
      campaignName: undefined,
    }));

    const deps = {
      db: () => ({ from }) as unknown as SupabaseClient,
      clock: () => FIXED,
      randomSuffix: () => 'e2e00001',
      classifyOptOut,
      isOptOutMessage: () => false,
      classifyUrgency,
      escalateLead: vi.fn(async () => undefined),
      notifyPossibleOptOut,
      handleClassifiedReplyEnrollment,
      pauseCampaignForLead,
      markLeadOptedOut: vi.fn(async () => undefined),
      suppressPhoneForBusiness: vi.fn(async () => undefined),
      tryNormalizeToE164: (p: string) => (p.startsWith('+') ? p : null),
      isLeadWithinLookupAge: () => true,
      leadHasActiveEnrollment: async () => false,
      redactPhone: (p: string | null | undefined) => `***${String(p).slice(-4)}`,
    } as unknown as InboundDeps;

    const event: InboundSmsEvent = {
      from: '+15551234567',
      businessPhone: '+15559999999',
      body,
      messageId: 'msg-e2e-hired',
    };

    const result = await processInboundSmsWithDeps(deps, event);

    expect(result).toMatchObject({
      status: 'ambiguous_opt_out',
      leadId: 'lead-hired',
      campaignPaused: true,
      ownerNotified: true,
      urgency: 'low',
    });
    expect(pauseCampaignForLead).toHaveBeenCalledWith('lead-hired');
    expect(notifyPossibleOptOut).toHaveBeenCalled();
    expect(classifyUrgency).toHaveBeenCalledWith(body, 'plumbing');
    // Must not re-enroll / continue campaign texts after ambiguous.
    expect(handleClassifiedReplyEnrollment).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ needs_human_review: true });
  });

  it('stop-by appointment reply pauses but still escalates high urgency', async () => {
    const body = 'Can you stop by at 3?';
    expect(classifyOptOut(body).kind).toBe('ambiguous');

    const from = vi.fn((table: string) => {
      if (table === 'businesses') {
        return chain({ data: BIZ, error: null });
      }
      if (table === 'leads') {
        const c = chain({
          data: {
            id: 'lead-appt',
            created_at: FIXED.toISOString(),
            status: 'pending',
          },
          error: null,
        });
        c.update = vi.fn(() => c);
        return c;
      }
      return chain({ data: null, error: null });
    });

    const escalateLead = vi.fn(async () => undefined);
    const pauseCampaignForLead = vi.fn(async () => undefined);
    const notifyPossibleOptOut = vi.fn(async () => true);

    const deps = {
      db: () => ({ from }) as unknown as SupabaseClient,
      clock: () => FIXED,
      randomSuffix: () => 'e2e00002',
      classifyOptOut,
      isOptOutMessage: () => false,
      classifyUrgency: vi.fn(async () => ({
        urgency: 'high' as const,
        confidence: 0.85,
        keywords: ['stop by'],
        issue: 'appointment',
      })),
      escalateLead,
      notifyPossibleOptOut,
      handleClassifiedReplyEnrollment: vi.fn(async () => ({
        action: 'noop',
        campaignName: undefined,
      })),
      pauseCampaignForLead,
      markLeadOptedOut: vi.fn(async () => undefined),
      suppressPhoneForBusiness: vi.fn(async () => undefined),
      tryNormalizeToE164: (p: string) => (p.startsWith('+') ? p : null),
      isLeadWithinLookupAge: () => true,
      leadHasActiveEnrollment: async () => false,
      redactPhone: (p: string | null | undefined) => `***${String(p).slice(-4)}`,
    } as unknown as InboundDeps;

    const result = await processInboundSmsWithDeps(deps, {
      from: '+15551234567',
      businessPhone: '+15559999999',
      body,
      messageId: 'msg-e2e-stopby',
    });

    expect(result).toMatchObject({
      status: 'ambiguous_opt_out',
      urgency: 'high',
      campaignPaused: true,
      ownerNotified: true,
    });
    expect(pauseCampaignForLead).toHaveBeenCalled();
    expect(escalateLead).toHaveBeenCalled();
    expect(notifyPossibleOptOut).toHaveBeenCalled();
  });
});
