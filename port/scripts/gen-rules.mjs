/*
 * Generate port/src/rules.generated.json from the authoritative
 * drugParseRules.yaml.
 *
 * drugParseRules.yaml is the single source of truth for the grammar.  This
 * script mirrors the rule fields the TS parser consumes into a JSON file that
 * the browser-safe core imports (no runtime YAML dependency).  It is run
 * automatically by the pre-commit hook; you can also run it by hand:
 *
 *     npm run generate
 *
 * Do NOT edit rules.generated.json directly — edit the YAML and regenerate.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const yamlPath = join(repoRoot, 'drugParseRules.yaml');
const outPath = join(here, '..', 'src', 'rules.generated.json');

// Only the fields the parser actually uses.  (drugParseRules.yaml also carries
// `wordBoundaryOptional`, which the comment marks "not implemented yet" and the
// code never reads, so it is intentionally dropped.)
const KEYS = [
  'trumps',
  'nonTerminals',
  'terminals',
  'convenienceRules',
  'drugnameStoplist',
  'nonTerminalsToParse',
];

const raw = parseYaml(readFileSync(yamlPath, 'utf8'));

const missing = KEYS.filter((k) => raw[k] === undefined);
if (missing.length) {
  throw new Error(`drugParseRules.yaml is missing expected key(s): ${missing.join(', ')}`);
}

// A leading "_generated" note instead of a comment, since JSON has no comments.
// The .generated.json filename and this key both flag the file as derived.
const rules = {
  _generated: 'from drugParseRules.yaml by scripts/gen-rules.mjs — DO NOT EDIT; edit the YAML and run `npm run generate`.',
  ...Object.fromEntries(KEYS.map((k) => [k, raw[k]])),
};

// 2-space indent, trailing newline: stable diffs.
writeFileSync(outPath, JSON.stringify(rules, null, 2) + '\n');
console.error(`wrote ${outPath}`);
