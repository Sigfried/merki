# MERKI parser — TypeScript port

A browser-runnable TypeScript port of the MERKI medication parser (originally
`ParseMeds.pm` + `drugParseRules.yaml` + `druglist.tsv`). It extracts structured
medication information (drug name, dose, route, frequency, prn, dates) from
free-text clinical notes, and emits the same XML the original Perl produced.

The original demo was a Perl CGI on a Columbia server that is long gone, and
GitHub Pages can't run Perl — hence this port. The core has **no DOM or Node
APIs**, so it runs unchanged in the browser; you supply `druglist.tsv` as a
string (fetch it as a static asset) and call the parser.

GPL-3.0-or-later, like the rest of MERKI. See the repo `LICENSE`.

## Usage

```ts
import { Parser, drugsToXML, parseToXML } from 'merki-parser';

// Fetch the lexicon once (it's ~17k rows; ship it as a static asset).
const tsv = await (await fetch('/druglist.tsv')).text();
const parser = new Parser(tsv);

const text = 'Lasix 80 mg p.o. twice a day, Digoxin 0.25 a day';

// Either drive the two-level parse yourself…
const drugs = parser.twoLevelParse(
  text,
  ['drug', 'possibleDrug', 'context'],   // top level
  ['dose', 'route', 'freq', 'prn', 'date'], // second level
);
const xml = drugsToXML(drugs);

// …or use the convenience wrapper with the original demo's token sets:
const xml2 = parseToXML(parser, text);
```

`twoLevelParse` returns an array of token objects (one per drug / possible
drug); `drugsToXML` renders them in the original Perl's XML format. `drug` vs
`possibleDrug`: a `drug` matched the bundled lexicon (`druglist.tsv`); a
`possibleDrug` did **not** appear in the lexicon (e.g. a misspelling) but was
flanked by enough evidence — a dose + instructions, a prn, or a "treated
with …" phrase — to be worth surfacing.

## What was ported (and what wasn't)

Only the live parse path is ported. The dead druglist strategies
(`*_treeBased`, `*_binarySearchBased`) and the `*OLD` / `*OBSOLETE` / `JUNK*`
subs are not — the default `drugSearchMethod` is `hashBased`, which is the only
one the port implements.

| TS file            | Ports from `ParseMeds.pm` / rules                                  |
| ------------------ | ------------------------------------------------------------------ |
| `src/rules.ts`     | `drugParseRules.yaml` as a TS data structure (no YAML dep)         |
| `src/patterns.ts`  | `applyConvenienceRules`, `makeTerminalPatterns`, `makeNonTerminalPatterns` |
| `src/druglist.ts`  | `getDruglist_hashBased`, `drugLookup_hashBased`                    |
| `src/parseMeds.ts` | `twoLevelParse`, `parse`, `tagDrugNames`, `matchPattern`, the filters |
| `src/toXml.ts`     | `drugsToXML` (XML::Writer DATA_MODE, 4-space indent)              |

The grammar is a small regex grammar: named nonTerminals reference other
(non)terminals by name and are expanded into real regexes. The only Perl-only
regex construct that appears after expansion is the `(?^:…)` flag-reset group,
which is a plain non-capturing group in JS; everything else (lookbehind,
lookahead, `\b \d \w \s`, alternation, quantifiers) maps 1:1 to modern JS.

### A deliberately preserved wart

`makeNonTerminalPatterns` swaps a `\b` token for the looser "split delimiter"
**only for the first escape in each pattern**, leaving later `\b`s literal. This
looks like a bug, and arguably is, but it makes `possibleDrug` appropriately
strict — "fixing" it lets junk like `started on 03/15/2024` match the
`possibleDrugName \b dose \b instructions` alternative. The port reproduces this
behavior exactly so its output matches the reference; see the long comment in
`src/patterns.ts`. Do not "fix" it without regenerating the fixtures.

## Tests

```sh
npm install
npm test        # fidelity: TS output vs committed Perl output (port/fixtures/)
npm run typecheck
```

`test/fidelity.test.ts` runs the parser on each `fixtures/caseN.input.txt` and
diffs against `fixtures/caseN.xml` — the **live Perl output** for that input.
The port reproduces all of them.

### Differential harness (requires Perl)

`test/corpus/` is a larger differential check, used during development to
compare the TS port against live Perl over a generated corpus of ~70 clinical
phrasings (dose forms, routes, frequencies, prn, ranges, dates, context clues,
allergy lists, and not-in-list / misspelled drug names). It needs a working
Perl with the MERKI CPAN deps (`YAML::Syck`, `XML::Writer`), so it is **not**
part of `npm test`; the committed `fixtures/` are the portable regression test.

```sh
cd test/corpus
node generate.mjs > cases.txt
npx tsx run.mjs cases.txt     # parses each line through both Perl and TS, diffs
```

## Regenerating / extending fixtures

Fixtures are the live Perl output for an input. From the repo root:

```sh
printf '%s' "<clinical text>" | perl -I. parseFromShell.pl
```

Save the input to `fixtures/caseN.input.txt` and the output to
`fixtures/caseN.xml`.
