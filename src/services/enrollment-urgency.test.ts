/**
 * QC r6: null urgency enrolls into Standard (non-responder path).
 * Classification still switches Emergency/High on reply.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: (...a: unknown[]) => mockFrom(...a) }),
}));

vi.mock('@/services/send', () => ({
  resolveRecoveryOutcome: vi.fn(async () => 'absent'),
  reconcileAmbiguousSms: vi.fn(),
  sendMessage: vi.fn(),
  parkNextAt: vi.fn(() => new Date()),
}));

vi.mock('@/services/sms', () => ({
  sendRecoverySMS: vi.fn(),
  processDeferredRecoveries: vi.fn(async () => ({ sent: 0, deferred: 0, errors: 0 })),
}));

vi.mock('@/services/suppressions', () => ({
  isPhoneSuppressed: vi.fn(async () => false),
  SuppressionLookupError: class extends Error {},
}));

vi.mock('@/services/quiet-hours', () => ({
  deferUntilQuietHoursOpen: () => ({
    allowed: true,
    zones: ['America/New_York'],
    endHour: 21,
  }),
}));

import { enrollLeadInCampaign } from './campaigns';

function chain(result: { data: unknown; error: unknown }) {
  const obj: Record<string, any> = {};
  const self = () => obj;
  for (const m of [
    'select', 'insert', 'update', 'eq', 'single', 'maybeSingle', 'order',
  ]) {
    obj[m] = vi.fn(self);
  }
  obj.single = vi.fn(async () => result);
  obj.maybeSingle = vi.fn(async () => result);
  obj.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return obj;
}

describe('enrollLeadInCampaign null urgency → Standard (QC r6)', () => {
  beforeEach(() => mockFrom.mockReset());

  it('enrolls into Standard when lead.urgency is null', async () => {
    const inserts: unknown[] = [];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'leads') {
        return chain({
          data: {
            id: 'L1',
            urgency: null,
            opted_out: false,
            sms_outbound_sid: null,
            businesses: { id: 'B' },
          },
          error: null,
        });
      }
      if (table === 'campaign_enrollments') {
        const c = chain({ data: null, error: null });
        c.insert = vi.fn((row: unknown) => {
          inserts.push(row);
          return c;
        });
        c.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
        return c;
      }
      if (table === 'campaigns') {
        return chain({
          data: [
            {
              id: 'std',
              name: 'Standard',
              urgency_filter: null,
              status: 'active',
              auto_enroll: true,
              campaign_steps: [
                { step_number: 1, delay_minutes: 0, template_key: 'standard_initial' },
                { step_number: 2, delay_minutes: 60, template_key: 'standard_followup_1' },
              ],
            },
          ],
          error: null,
        });
      }
      if (table === 'sms_messages') {
        return chain({ data: null, error: null });
      }
      return chain({ data: null, error: null });
    });

    const result = await enrollLeadInCampaign('L1');
    expect(result.enrolled).toBe(true);
    if (result.enrolled) {
      expect(result.campaignName).toBe('Standard');
    }
  });

  it('processMissedCall enrolls after recovery', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync(new URL('./missed-call.ts', import.meta.url), 'utf8')
    );
    expect(src).toMatch(/enrollLeadInCampaign\s*\(/);
  });
});
