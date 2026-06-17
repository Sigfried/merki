/*
 * Fidelity test: the TS port must reproduce the live Perl output for each
 * fixture in port/fixtures/ (caseN.input.txt -> caseN.xml).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';
import { Parser, parseToXML } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', 'fixtures');
const druglistTsv = readFileSync(join(here, '..', '..', 'druglist.tsv'), 'utf8');

const cases = readdirSync(fixturesDir)
  .filter((f) => f.endsWith('.input.txt'))
  .map((f) => f.replace('.input.txt', ''))
  .sort();

describe('MERKI parser fidelity vs live Perl output', () => {
  let parser: Parser;
  beforeAll(() => {
    parser = new Parser(druglistTsv);
  });

  for (const name of cases) {
    it(`${name} matches Perl XML`, () => {
      const input = readFileSync(join(fixturesDir, `${name}.input.txt`), 'utf8');
      const expected = readFileSync(join(fixturesDir, `${name}.xml`), 'utf8');
      const actual = parseToXML(parser, input);
      // normalize trailing whitespace/newlines on both sides
      expect(actual.trimEnd()).toBe(expected.trimEnd());
    });
  }
});
