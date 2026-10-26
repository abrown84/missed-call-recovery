import { describe, it, expect } from 'vitest';
import { getTemplate } from './templates';

describe('getTemplate', () => {
  it('personalizes known templates', () => {
    const body = getTemplate('emergency_initial', {
      business: 'Acme Plumbing',
      name: '',
      issue: '',
    });
    expect(body).toContain('Acme Plumbing');
    expect(body).not.toContain('{business}');
  });

  it('falls back safely for unknown keys', () => {
    const body = getTemplate('does_not_exist', {
      business: 'Acme',
      name: '',
      issue: '',
    });
    expect(typeof body).toBe('string');
    expect(body.length).toBeGreaterThan(0);
  });
});
