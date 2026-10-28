#!/usr/bin/env node
/**
 * Guard: optionalDependencies @rolldown/binding-linux-x64-gnu must match
 * the rolldown version resolved in the lockfile (or package.json).
 * Vite/vitest pull rolldown; a mismatched optional binding breaks CI on linux.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const pinned = pkg.optionalDependencies?.['@rolldown/binding-linux-x64-gnu'];
if (!pinned) {
  console.error(
    'check-rolldown-pin: missing optionalDependencies[@rolldown/binding-linux-x64-gnu]'
  );
  process.exit(1);
}

const require = createRequire(join(root, 'package.json'));
let rolldownVersion = null;
try {
  rolldownVersion = require('rolldown/package.json').version;
} catch {
  // rolldown may be nested; fall back to lockfile scan
}

if (!rolldownVersion && existsSync(join(root, 'package-lock.json'))) {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const entry =
    lock.packages?.['node_modules/rolldown'] ??
    lock.packages?.['node_modules/vite/node_modules/rolldown'];
  rolldownVersion = entry?.version ?? null;
}

if (!rolldownVersion) {
  console.error('check-rolldown-pin: could not resolve rolldown version');
  process.exit(1);
}

const norm = (v) => String(v).replace(/^[~^]/, '');
if (norm(pinned) !== norm(rolldownVersion)) {
  console.error(
    `check-rolldown-pin: mismatch — optional @rolldown/binding-linux-x64-gnu@${pinned} !== rolldown@${rolldownVersion}`
  );
  process.exit(1);
}

console.log(
  `check-rolldown-pin: ok — binding ${pinned} matches rolldown ${rolldownVersion}`
);
