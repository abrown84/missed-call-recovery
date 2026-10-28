#!/usr/bin/env node
/**
 * Print migration 003 STOP backfill IN lists + confusable translate pairs
 * from src/services/opt-out-sql.ts (via tsx). Paste into 003 or pipe to review.
 */
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const probe = `
import {
  buildOptOutBackfillInLists,
  buildOptOutConfusableTranslate,
  buildOptOutBackfillSqlNormalizer,
} from './src/services/opt-out-sql.ts';
const lists = buildOptOutBackfillInLists();
const conf = buildOptOutConfusableTranslate();
process.stdout.write(JSON.stringify({
  exact: lists.exact,
  compact: lists.compact,
  confusableFrom: conf.from,
  confusableTo: conf.to,
  normalizerPreview: buildOptOutBackfillSqlNormalizer(),
}, null, 2));
process.stdout.write('\\n');
`;

const r = spawnSync('npx', ['tsx', '-e', probe], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024,
});
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(r.status ?? 1);
}
process.stdout.write(r.stdout);
