import { describe, expect, it, vi } from 'vitest';
import { DryRunAdapter, redactPhonesInText } from './dry-run';

describe('dry-run phone redaction (QC r6 P2)', () => {
  it('US numbers keep only last 4', () => {
    expect(redactPhonesInText('call +12125550100 now')).toMatch(/\*\*\*-\*\*\*-0100/);
    expect(redactPhonesInText('call +12125550100 now')).not.toMatch(/212/);
  });

  it('international numbers keep only last 4 (no 6-digit leak)', () => {
    const out = redactPhonesInText('UK +442071234567 office');
    expect(out).toMatch(/\*\*\*-\*\*\*-4567/);
    expect(out).not.toMatch(/234567/);
    expect(out).not.toMatch(/207/);
  });

  it('strips extension before redacting', () => {
    const out = redactPhonesInText('212 555 0101 ext 5');
    expect(out).toMatch(/\*\*\*-\*\*\*-0101/);
    expect(out).not.toMatch(/1015/);
  });

  it('DryRunAdapter logs use redactPhonesInText and redactPhone (kills #51/#52)', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const adapter = new DryRunAdapter();
    await adapter.sendMessage({
      to: '+442071234567',
      body: 'Call back +442071234567 please',
    });
    const line = String(log.mock.calls[0]?.[0] ?? '');
    expect(line).toContain('***-***-4567');
    expect(line).not.toContain('442071234567');
    expect(line).not.toContain('+442071234567');
    // Source must call the helpers (mut.py string revert)
    const src = await import('fs').then((fs) =>
      fs.readFileSync(new URL('./dry-run.ts', import.meta.url), 'utf8')
    );
    expect(src).toContain('redactPhonesInText(input.body)');
    expect(src).toContain('redactPhone(input.to)');
    log.mockRestore();
  });
});
