# MERKI parser → TypeScript port (context for a Claude Code session)

## Goal
Port the MERKI medication parser from Perl (`ParseMeds.pm` + `drugParseRules.yaml`
+ `druglist.tsv`) to a **browser-runnable TypeScript module**, so a live demo can
be hosted as a static page on GitHub Pages (no server/CGI). The original demo
(`http://projects.dbmi.columbia.edu/merki/`) was a Perl CGI and is long gone;
GitHub Pages can't run Perl, hence the port.

The TS parser will be consumed by the sigfried.org site (a Hugo/GitHub-Pages
build, repo at `../sigfried.org`) to replace the dead Columbia demo link. Keep the
port a **standalone, dependency-light TS library** with no DOM assumptions in the
core, so the site can import it and wrap a form around it. A minimal demo
page/harness in this repo is welcome but secondary.

## Why this is tractable (already verified)
- The Perl still **runs today** on stock Perl 5.34 (CPAN deps: `YAML::Syck`,
  `XML::Writer`, `Data::Dumper`, `Carp` — all present; `HTML::Template` only
  needed for the CGI table view, not the parse path).
  Smoke test: `echo "tylenol 250mg po daily" | perl -I. parseFromShell.pl`
- The repo copy of `ParseMeds.pm` is already the **cleaned** version (712 lines;
  the old tarball had 1184 with dead `*OLD`/`*OBSOLETE`/`JUNK*` subs).
- The two `eval` calls in the Perl are ONLY in `getDruglist_treeBased` (an unused
  druglist strategy). They build a nested trie via string-eval — in TS that's a
  plain `node[c] ||= {}` loop, **no eval needed**. Default path uses the simpler
  `getDruglist`/`drugLookup`.

## The live code path to port (ignore the rest)
Entry: `twoLevelParse(text, ['drug','possibleDrug','context'], ['dose','route','freq','prn','date'])`
then `drugsToXML(drugs)` / `drugsToHTMLTable(drugs)` for output.

Supporting subs actually on that path (read these, port these):
`new`, `initializeParser`, `makeTerminalPatterns`, `makeNonTerminalPatterns`,
`addPatternForNonTerminal`, `tagDrugNames`, `makeDrugId`/`resetDrugId`, `parse`,
`matchPattern`, `strip`, `attachContextClues`, `removePartialParts`, `drugFilter`,
`removeTrumpedTokens`, `tokenSort`, `getDruglist`, `drugLookup`,
`matchingCharCount`, `applyConvenienceRules`, `normalizeContext`, `guessDates`,
`min`/`max`, `drugsToXML`, `drugsToHTMLTable`.

DO NOT port (dead/unused): anything suffixed `OLD`, `OBSOLETE`, `JUNK`,
`_not_quite_working`, `TooFancy`; the `_treeBased` and `_binarySearchBased` and
`_hashBased` druglist variants (default `getDruglist` is the plain one — confirm
by reading `initializeParser` to see which it calls).

## The grammar (the actual hard part)
`drugParseRules.yaml` is a small regex-grammar: named nonTerminals whose patterns
reference other nonTerminals/terminals by name, expanded into real regexes by
`makeNonTerminalPatterns`/`addPatternForNonTerminal`. This is where Perl→JS regex
differences bite:
- Perl `\s`, `\d`, `\w`, `(?:...)`, alternation, `?`/`*`/`+` mostly map 1:1 to JS.
- Watch for: Perl `/x` whitespace-insensitive mode, possessive quantifiers,
  `\b` semantics, named-capture syntax `(?<name>...)` vs Perl `(?<name>...)`
  (same in modern JS — fine), and any `(?{...})` code-in-regex (grep for it; if
  present it must be rewritten — JS has no equivalent).
- Port the YAML rules as a **TS data structure** (or load the YAML at build time),
  not as code. The expansion logic ports as code.

## Ground truth for fidelity (already generated)
`port/fixtures/` contains 5 cases: `caseN.input.txt` + `caseN.xml`, where the
`.xml` is the **live Perl output** for that input. The port MUST reproduce these
byte-for-byte (modulo whitespace if you normalize both sides). Build a test that
runs the TS parser on each `.input.txt` and diffs against the `.xml`.

Regenerate/extend fixtures from Perl like this (from repo root):
```
printf '%s' "<clinical text>" | perl -I. parseFromShell.pl
```
Add more cases covering: brand vs ingredient names, frequencies (b.i.d., q4h,
q.d., "twice a day"), routes (p.o., IV, topical), PRN, dose ranges, the allergy
list case (drugs with no dose), and drugs not in `druglist.tsv`.

## Suggested shape
```
src/
  rules.ts          # the grammar (ported from drugParseRules.yaml)
  druglist.ts       # loader for druglist.tsv (ship the .tsv as an asset, parse at load)
  parseMeds.ts      # the engine: tokenize → tag drugs → parse grammar → filter → emit
  toXml.ts, toTable.ts
test/
  fidelity.test.ts  # diffs against port/fixtures/*.xml
demo/               # optional: a tiny index.html + form for local preview
```
Match surrounding code idiom; keep the core free of DOM/Node APIs so it runs in
the browser. `druglist.tsv` is ~17k rows — fine to ship and parse client-side
(or prebuild into a trie/JSON at build time if load perf matters).

## When done
- All `port/fixtures` cases pass.
- A short note back to the sigfried.org session (or update this file) on how to
  import the parser + the demo URL/path, so `data/papers.yaml` MERKI entry can
  point at the working demo instead of the dead Columbia link.

## Provenance
GPL-3.0. Original paper: Gold, Elhadad, Zhu, Cimino, Hripcsak — "Extracting
Structured Medication Event Information from Discharge Summaries" (PMC2655993,
AMIA Distinguished Paper). Keep the copyright/license headers.
