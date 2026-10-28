/**
 * Staging evidence (b): enrollLeadInCampaign must refuse urgency=null.
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
}));

vi.mock('@/services/suppressions', () => ({
  isPhoneSuppressed: vi.fn(async () => false),
  SuppressionLookupError: class extends Error {},
}));

import { enrollLeadInCampaign } from './campaigns';

function chain(result: { data: unknown; error: unknown }) {
  const obj: Record<string, any> = {};
  const self = () => obj;
  for (const m of ['select', 'insert', 'update', 'eq', 'single', 'maybeSingle', 'order']) {
    obj[m] = vi.fn(self);
  }
  obj.single = vi.fn(async () => result);
  obj.maybeSingle = vi.fn(async () => result);
  obj.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return obj;
}

describe('enrollLeadInCampaign urgency gate (staging b)', () => {
  beforeEach(() => mockFrom.mockReset());

  it('refuses enrollment when lead.urgency is null', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'leads') {
        return chain({
          data: {
            id: 'L1',
            urgency: null,
            opted_out: false,
            businesses: { id: 'B' },
          },
          error: null,
        });
      }
      return chain({ data: null, error: null });
    });

    const result = await enrollLeadInCampaign('L1');
    expect(result).toEqual({ enrolled: false, reason: 'urgency_unset' });
  });

  it('processMissedCall must not enroll before urgency is set', async () => {
    // Contract check: missed-call module no longer imports enrollLeadInCampaign.
    const src = await import('fs').then((fs) =>
      fs.readFileSync(
        new URL('./missed-call.ts', import.meta.url),
        'utf8'
      )
    );
    expect(src).not.toMatch(/enrollLeadInCampaign\s*\(/);
  });
});
