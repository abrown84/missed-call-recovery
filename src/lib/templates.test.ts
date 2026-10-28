import { describe, it, expect } from 'vitest';
import { OPT_OUT_FOOTER, appendOptOutFooter, getTemplate } from './templates';

describe('getTemplate', () => {
  it('personalizes known templates and appends STOP footer (FCC 26-67)', () => {
    const body = getTemplate('emergency_initial', {
      business: 'Acme Plumbing',
      name: '',
      issue: '',
    });
    expect(body).toContain('Acme Plumbing');
    expect(body).not.toContain('{business}');
    expect(body).toContain(OPT_OUT_FOOTER);
  });

  it('falls back safely for unknown keys with STOP footer', () => {
    const body = getTemplate('does_not_exist', {
      business: 'Acme',
      name: '',
      issue: '',
    });
    expect(typeof body).toBe('string');
    expect(body).toContain(OPT_OUT_FOOTER);
  });

  it('appendOptOutFooter is idempotent', () => {
    const once = appendOptOutFooter('Hello');
    expect(appendOptOutFooter(once)).toBe(once);
  });
});
