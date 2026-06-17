/*
 * Assemble the static GitHub Pages demo under docs/ (repo root).
 *
 * Runs after `tsc` build.  Copies the compiled parser (dist/) to docs/lib/ and
 * the drug lexicon to docs/druglist.tsv, so docs/ is a self-contained static
 * site: docs/index.html imports ./lib/index.js and fetch()es ./druglist.tsv.
 * GitHub Pages serves docs/ from the default branch.
 *
 *     npm run build:demo
 */

import { readdirSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const portDir = join(here, '..');
const repoRoot = join(portDir, '..');
const docsDir = join(repoRoot, 'docs');

const dist = join(portDir, 'dist');
if (!existsSync(dist)) {
  throw new Error('dist/ not found — run `npm run build` first');
}

// Fresh lib/ each time so stale modules don't linger.
const libDir = join(docsDir, 'lib');
rmSync(libDir, { recursive: true, force: true });
mkdirSync(libDir, { recursive: true });

// Only the runtime files: the JS modules and the generated rules JSON they
// import.  Skip .d.ts / .map (not needed to run the demo).
for (const f of readdirSync(dist)) {
  if (f.endsWith('.js') || f.endsWith('.json')) {
    copyFileSync(join(dist, f), join(libDir, f));
  }
}

// Drug lexicon, fetched at runtime by the demo.
copyFileSync(join(repoRoot, 'druglist.tsv'), join(docsDir, 'druglist.tsv'));

console.error(`assembled demo in ${docsDir} (lib/ + druglist.tsv)`);
