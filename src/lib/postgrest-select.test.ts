import { describe, expect, it } from 'vitest';
import {
  ENROLLMENT_CLAIM_SELECT,
  selectCoversFilterColumns,
} from './postgrest-select';

/**
 * Mimics PostgREST Prefer: return=representation — filters are re-applied
 * against the selected columns. Missing a filter column → Postgres 42703.
 */
describe('PostgREST select vs filter (staging evidence c)', () => {
  it('select id alone FAILS when filter references claim_token/claimed_at', () => {
    const check = selectCoversFilterColumns('id', [
      { column: 'lead_id' },
      { column: 'status' },
      { or: 'claim_token.is.null,claimed_at.lt.2026-01-01T00:00:00.000Z' },
    ]);
    expect(check.ok).toBe(false);
    expect(check.missing).toEqual(
      expect.arrayContaining(['claim_token', 'claimed_at'])
    );
  });

  it('ENROLLMENT_CLAIM_SELECT covers claim-gated switch filters', () => {
    const check = selectCoversFilterColumns(ENROLLMENT_CLAIM_SELECT, [
      { column: 'lead_id' },
      { column: 'status' },
      { or: 'claim_token.is.null,claimed_at.lt.2026-01-01T00:00:00.000Z' },
    ]);
    // lead_id/status not in select — still 42703 risk if filtered in RETURNING
    // path; claim columns specifically must be present (the staging failure).
    expect(check.missing.filter((c) => c === 'claim_token' || c === 'claimed_at')).toEqual(
      []
    );
    expect(ENROLLMENT_CLAIM_SELECT).toContain('claim_token');
    expect(ENROLLMENT_CLAIM_SELECT).toContain('claimed_at');
  });

  it('select * covers everything', () => {
    expect(
      selectCoversFilterColumns('*', [
        { or: 'claim_token.is.null,claimed_at.lt.x' },
      ]).ok
    ).toBe(true);
  });

  it('stale-claim reclaim filters claimed_at — select id alone FAILS', () => {
    const bad = selectCoversFilterColumns('id, claim_token', [
      { column: 'id' },
      { column: 'status' },
      { column: 'claimed_at' },
    ]);
    expect(bad.ok).toBe(false);
    expect(bad.missing).toContain('claimed_at');

    const good = selectCoversFilterColumns(ENROLLMENT_CLAIM_SELECT, [
      { column: 'id' },
      { column: 'status' },
      { column: 'claimed_at' },
    ]);
    expect(good.missing).not.toContain('claimed_at');
    expect(good.missing).not.toContain('claim_token');
  });
});
