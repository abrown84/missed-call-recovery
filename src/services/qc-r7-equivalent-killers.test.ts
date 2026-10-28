/**
 * QC r7 EQUIVALENT.md corrections: tests that kill former "equivalent"
 * disables (#8 resolveRecovery wrapper, #10 default sleep).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveRecoveryOutcome } from '@/services/send';
import { defaultCampaignDeps } from '@/services/campaign-deps';
import { SMS_STATUS, TABLE } from '@/services/db-strings';
import { recoveryMessageSid } from '@/services/sms-sid';

describe('EQUIVALENT #8 resolveRecoveryOutcome default wrapper', () => {
  it('delegates to WithDeps and returns classified status', async () => {
    const sid = recoveryMessageSid('Lwrap');
    const supabase = {
      from: (table: string) => {
        expect(table).toBe(TABLE.smsMessages);
        const api: Record<string, unknown> = {};
        api.select = () => api;
        api.eq = () => api;
        api.maybeSingle = async () => ({
          data: { status: SMS_STATUS.delivered },
          error: null,
        });
        return api;
      },
    };
    const status = await resolveRecoveryOutcome(supabase as never, 'Lwrap');
    expect(status).toBe('resolved_sent');
    void sid;
  });
});

describe('EQUIVALENT #10 defaultCampaignDeps sleep', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sleep resolves after the requested delay', async () => {
    vi.useFakeTimers();
    const deps = defaultCampaignDeps();
    let done = false;
    const p = deps.sleep(250).then(() => {
      done = true;
    });
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(249);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(done).toBe(true);
  });
});
