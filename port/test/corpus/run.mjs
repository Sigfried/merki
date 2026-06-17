/*
 * Differential harness: feed each corpus line through BOTH the live Perl
 * (ParseMeds.pm via parseFromShell.pl) and the TS port, and diff the XML.
 *
 * Requires a working Perl with the MERKI CPAN deps (YAML::Syck, XML::Writer).
 * This is a dev/CI tool, not part of the published library; the committed
 * fixtures in port/fixtures/ are the portable regression test.
 *
 * Usage:  node generate.mjs > cases.txt && node run.mjs cases.txt
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Parser, parseToXML } from '../../src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const tsv = readFileSync(join(repoRoot, 'druglist.tsv'), 'utf8');
const parser = new Parser(tsv);

const casesFile = process.argv[2] ?? join(here, 'cases.txt');
const lines = readFileSync(casesFile, 'utf8').split('\n').filter((l) => l.length);

const perlXml = (text) =>
  execFileSync('perl', ['-I.', 'parseFromShell.pl'], {
    cwd: repoRoot,
    input: text,
    encoding: 'utf8',
  }).trimEnd();

let pass = 0;
const fails = [];
lines.forEach((line, i) => {
  const expected = perlXml(line);
  const actual = parseToXML(parser, line).trimEnd();
  if (actual === expected) pass++;
  else fails.push({ i, line, expected, actual });
});

console.log(`\n${pass}/${lines.length} cases match live Perl\n`);
for (const f of fails) {
  console.log(`✗ case ${f.i}: ${f.line}`);
  const e = f.expected.split('\n');
  const a = f.actual.split('\n');
  const max = Math.max(e.length, a.length);
  for (let k = 0; k < max; k++) {
    if (e[k] !== a[k]) {
      console.log(`    L${k} perl: ${e[k] ?? '(none)'}`);
      console.log(`    L${k} ts  : ${a[k] ?? '(none)'}`);
    }
  }
  console.log();
}

process.exit(fails.length ? 1 : 0);
