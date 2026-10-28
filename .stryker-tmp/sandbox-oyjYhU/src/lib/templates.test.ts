// @ts-nocheck
import { describe, it, expect } from 'vitest';
import {
  ALL_TEMPLATES,
  OPT_OUT_FOOTER,
  appendOptOutFooter,
  getTemplate,
  smsSegmentCount,
} from './templates';

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

  it('appends STOP footer; originals kept (Alex must approve any rewrite)', () => {
    // QC r5 H: do not silently rewrite customer copy for GSM-7. Segment
    // count may be >1 for emergency templates with emoji + STOP footer.
    for (const key of Object.keys(ALL_TEMPLATES)) {
      const body = getTemplate(key, { business: 'Acme', name: '', issue: '' });
      expect(body).toContain(OPT_OUT_FOOTER);
      expect(smsSegmentCount(body), key).toBeGreaterThanOrEqual(1);
    }
  });

  it('appendOptOutFooter is idempotent', () => {
    const once = appendOptOutFooter('Hello');
    expect(appendOptOutFooter(once)).toBe(once);
  });
});
