/*
 * Point git at the committed hooks dir (port/scripts/hooks) via core.hooksPath,
 * so the pre-commit rule regenerator is active with no copying.  Run by the
 * `prepare` lifecycle script on `npm install`.  Idempotent; a no-op outside a
 * git work tree (e.g. when installed as a dependency).
 */

import { execFileSync } from 'node:child_process';
import { chmodSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const hooksDir = join(here, 'hooks');

let gitRoot;
try {
  gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).trim();
} catch {
  // not a git checkout (e.g. installed from a tarball) — nothing to do
  process.exit(0);
}

// core.hooksPath is resolved relative to the git top level.
const rel = relative(gitRoot, hooksDir);
try {
  chmodSync(join(hooksDir, 'pre-commit'), 0o755);
  execFileSync('git', ['config', 'core.hooksPath', rel], { cwd: gitRoot });
  console.error(`installed git hooks: core.hooksPath = ${rel}`);
} catch (err) {
  console.error(`could not install git hooks (${err.message}); skipping`);
}
