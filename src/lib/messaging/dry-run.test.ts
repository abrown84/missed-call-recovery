import { describe, expect, it } from 'vitest';
import { DryRunAdapter } from './dry-run';
import { getMessagingAdapter, resetMessagingAdapterCache } from './index';

describe('DryRunAdapter', () => {
  it('records sends without calling the network', async () => {
    const adapter = new DryRunAdapter();
    const result = await adapter.sendMessage({
      to: '+15551234567',
      body: 'test follow-up',
      auto: true,
    });
    expect(result.status).toBe('queued');
    expect(result.id).toMatch(/^dry-run-/);
    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0].to).toBe('+15551234567');
  });

  it('is selected when MESSAGING_PROVIDER=dry-run', () => {
    resetMessagingAdapterCache();
    process.env.MESSAGING_PROVIDER = 'dry-run';
    const adapter = getMessagingAdapter();
    expect(adapter.name).toBe('dry-run');
    delete process.env.MESSAGING_PROVIDER;
    resetMessagingAdapterCache();
  });
});
