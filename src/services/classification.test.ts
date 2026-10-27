import { describe, it, expect } from 'vitest';
import {
  isOptOutMessage,
  scoreUrgencyKeywords,
  extractIssue,
  escapeRegex,
} from './classification';

describe('isOptOutMessage', () => {
  it('detects STOP / unsubscribe language', () => {
    expect(isOptOutMessage('STOP')).toBe(true);
    expect(isOptOutMessage('Please unsubscribe me')).toBe(true);
    expect(isOptOutMessage('wrong number')).toBe(true);
  });

  it('does not flag normal service requests', () => {
    expect(isOptOutMessage('My water heater is leaking')).toBe(false);
  });
});

describe('scoreUrgencyKeywords', () => {
  it('classifies flooding as emergency with keyword weights', () => {
    const result = scoreUrgencyKeywords(
      'Emergency — there is a flood in my basement, need help right now!',
      [{ keyword: 'flood', weight: 10 }]
    );
    expect(result.urgency).toBe('emergency');
    expect(result.matchedKeywords).toContain('flood');
    expect(result.score).toBeGreaterThanOrEqual(15);
  });

  it('classifies urgent language as high without extra keywords', () => {
    const result = scoreUrgencyKeywords('This is urgent — need help ASAP');
    expect(['high', 'emergency']).toContain(result.urgency);
    expect(result.score).toBeGreaterThanOrEqual(8);
  });

  it('classifies quote requests as low', () => {
    const result = scoreUrgencyKeywords('Just wondering about pricing for next week');
    expect(result.urgency).toBe('low');
  });
});

describe('extractIssue', () => {
  it('returns the first sentence when short', () => {
    expect(extractIssue('Pipe burst. Need help now.')).toBe('Pipe burst');
  });

  it('truncates long text', () => {
    const long = 'x'.repeat(150);
    expect(extractIssue(long).endsWith('...')).toBe(true);
    expect(extractIssue(long).length).toBe(103);
  });
});

describe('escapeRegex', () => {
  it('escapes special characters so keywords are literal', () => {
    expect(escapeRegex('no ac')).toBe('no ac');
    expect(escapeRegex('c++')).toBe('c\\+\\+');
    expect(new RegExp(`\\b${escapeRegex('a.b')}\\b`).test('a.b')).toBe(true);
    expect(new RegExp(`\\b${escapeRegex('a.b')}\\b`).test('axb')).toBe(false);
  });
});
