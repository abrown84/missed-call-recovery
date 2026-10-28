/**
 * SQL fragments for migration 003 STOP backfill — keep in sync with
 * opt-out-data.ts + opt-out.ts normalizers (QC r8/r9 P1-3).
 *
 * Used by `npm run check:opt-out-sql` / generate-opt-out-sql.mjs.
 */
import {
  confusableTranslatePairs,
  optOutBackfillCompactList,
  optOutBackfillExactList,
  sqlQuotedList,
} from './opt-out-data';

/** Confusable translate() from/to strings (order matches CONFUSABLES). */
export function buildOptOutConfusableTranslate(): {
  from: string;
  to: string;
} {
  return confusableTranslatePairs();
}

/**
 * SQL expression that finishes normalization after NFKC, then folds lookalikes.
 * Mirrors TS normalizeOptOutText (QC r9): NFKC → strip → edge fixpoint →
 * whitespace collapse → upper → translate(CONFUSABLES).
 *
 * `inputSql` is a raw text expression (will be NFKC'd here).
 */
export function buildOptOutBackfillSqlNormalizer(
  inputSql = 'normalize(btrim(m.body), NFKC)'
): string {
  const { from, to } = buildOptOutConfusableTranslate();
  const fromLit = from.replace(/'/g, "''");
  const toLit = to.replace(/'/g, "''");
  // QC r9 P0: in PG escape strings, `\s` is a literal `s`. Use `\\s`.
  const edge =
    String.raw`E'^[\\s?!.,…''"\`“”‘’]+|[\\s?!.,…''"\`“”‘’]+$'`;
  const finished = `upper(
    btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      ${inputSql},
                      E'[\\u200B-\\u200D\\uFEFF\\u2060\\u180E\\u00AD\\u034F\\u061C\\u115F\\u1160\\u17B4\\u17B5\\u3164\\uFFA0]',
                      '',
                      'g'
                    ),
                    E'[\\U0001F300-\\U0001FAFF\\u2600-\\u27BF]',
                    '',
                    'g'
                  ),
                  E'\\u00A0',
                  ' ',
                  'g'
                ),
                E'[\\r\\n]+',
                ' ',
                'g'
              ),
              ${edge},
              '',
              'g'
            ),
            ${edge},
            '',
            'g'
          ),
          ${edge},
          '',
          'g'
        ),
        E'\\s+',
        ' ',
        'g'
      )
    )
  )`;
  // Re-NFKC after upper, then fold (same order as opt_out_normalize_body / TS).
  return `translate(normalize(${finished}, NFKC), '${fromLit}', '${toLit}')`;
}

/** Compact form: strip non-alnum (parity with compactOptOutText). */
export function buildOptOutCompactSql(normalizedSql: string): string {
  return `regexp_replace(${normalizedSql}, '[^A-Z0-9]', '', 'g')`;
}

/** Exact + compact IN-list strings for embedding in migrations. */
export function buildOptOutBackfillInLists(): {
  exact: string;
  compact: string;
} {
  return {
    exact: sqlQuotedList(optOutBackfillExactList()),
    compact: sqlQuotedList(optOutBackfillCompactList()),
  };
}
