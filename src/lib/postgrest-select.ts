/**
 * PostgREST Prefer: return=representation re-applies the request's filters
 * against the selected columns. If a filter references a column that is not
 * in `.select(...)`, Postgres raises 42703 (undefined_column).
 *
 * Helpers to keep select lists and filters aligned, and to unit-test the rule.
 */

/** Columns referenced by a PostgREST filter expression (simple eq/is/or/lt). */
export function columnsReferencedByFilters(
  filters: Array<{ column: string } | { or: string }>
): string[] {
  const cols = new Set<string>();
  for (const f of filters) {
    if ('column' in f) {
      cols.add(f.column);
      continue;
    }
    // or: "claim_token.is.null,claimed_at.lt.2026-01-01"
    for (const part of f.or.split(',')) {
      const col = part.trim().split('.')[0];
      if (col) cols.add(col);
    }
  }
  return [...cols];
}

/**
 * Mimic PostgREST: every filter column must appear in the select list,
 * otherwise the representation query would 42703.
 */
export function selectCoversFilterColumns(
  selectList: string,
  filters: Array<{ column: string } | { or: string }>
): { ok: boolean; missing: string[] } {
  const selected = new Set(
    selectList
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  // '*' covers everything
  if (selected.has('*')) return { ok: true, missing: [] };
  const needed = columnsReferencedByFilters(filters);
  const missing = needed.filter((c) => !selected.has(c));
  return { ok: missing.length === 0, missing };
}

/** Canonical select for claim-gated enrollment updates. */
export const ENROLLMENT_CLAIM_SELECT = 'id, claim_token, claimed_at';
