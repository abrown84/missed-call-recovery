import { describe, expect, it } from 'vitest';
import { redactPhonesInText } from './dry-run';

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
});
