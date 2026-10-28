// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { safeRedirectPath } from './safe-redirect';

describe('safeRedirectPath', () => {
  it('allows same-origin relative paths', () => {
    expect(safeRedirectPath('/leads')).toBe('/leads');
    expect(safeRedirectPath('/settings?tab=sms')).toBe('/settings?tab=sms');
  });

  it('rejects open redirects', () => {
    expect(safeRedirectPath('https://evil.com')).toBe('/');
    expect(safeRedirectPath('//evil.com')).toBe('/');
    expect(safeRedirectPath('\\evil.com')).toBe('/');
    expect(safeRedirectPath('/\nevil')).toBe('/');
  });

  it('uses custom fallback', () => {
    expect(safeRedirectPath(null, '/login')).toBe('/login');
    expect(safeRedirectPath('https://x', '/dashboard')).toBe('/dashboard');
  });
});
