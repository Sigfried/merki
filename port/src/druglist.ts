/*
 * MERKI medication parser — drug list (hash-based lookup).
 *
 * Copyright 2007 Sigfried Gold.  Part of MERKI, GPL-3.0-or-later.
 *
 * Port of getDruglist_hashBased / drugLookup_hashBased from ParseMeds.pm.
 * (The tree- and binary-search-based variants are dead code and not ported;
 * `new ParseMeds` defaults to drugSearchMethod = 'hashBased'.)
 *
 * The core takes the druglist.tsv *contents* as a string so it stays free of
 * Node/DOM file APIs — the caller fetches/reads the asset and passes the text.
 */

export interface DrugEntry {
  /** lower-cased drug name (the lookup key body) */
  drugName: string;
  /** any extra columns from the TSV, e.g. cui, tty */
  [field: string]: string;
}

/** first-word -> list of drug entries whose name starts with that word */
export type DrugList = Map<string, DrugEntry[]>;

/** Perl splits drug names / lookup text on \b (word boundary). */
const WORD_BOUNDARY = /\b/;

/**
 * Parse druglist.tsv contents into a first-word hash.  The first line is a
 * header of tab-separated field names (drugName, cui, tty, ...).  Stoplist
 * first-words are removed wholesale, matching the Perl.
 */
export function buildDrugList(tsv: string, stoplist: string[] = []): DrugList {
  const lines = tsv.split('\n');
  const header = lines[0]?.replace(/\r$/, '') ?? '';
  const fieldNames = header.split('\t');

  const druglist: DrugList = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.replace(/\r$/, '');
    if (line === '') continue; // chomp + skip blank trailing line
    const fields = line.split('\t');
    const drug: DrugEntry = { drugName: '' };
    fieldNames.forEach((name, idx) => {
      drug[name] = fields[idx] ?? '';
    });
    drug.drugName = (drug.drugName ?? '').toLowerCase();

    const firstWord = drug.drugName.split(WORD_BOUNDARY)[0] ?? '';
    let bucket = druglist.get(firstWord);
    if (!bucket) druglist.set(firstWord, (bucket = []));
    bucket.push(drug);
  }

  for (const word of stoplist) druglist.delete(word);
  return druglist;
}

/**
 * Look up a drug at the start of `text` (already lower-cased by the caller).
 * Returns the longest drug name in the first-word bucket that prefixes `text`
 * at a word boundary, or undefined.
 *
 * Perl: take first word via m/^(.+?)\b/, then among that bucket (sorted
 * longest-name-first) return the first whose name matches m/^name\b/.
 */
export function drugLookup(druglist: DrugList, text: string): DrugEntry | undefined {
  const tokenMatch = /^(.+?)\b/.exec(text);
  if (!tokenMatch) return undefined; // first word boundary always exists for non-empty word text
  const token = tokenMatch[1]!;

  const bucket = druglist.get(token);
  if (!bucket) return undefined;

  // longest drugName first, so the most specific match wins
  const sorted = [...bucket].sort((a, b) => b.drugName.length - a.drugName.length);
  for (const drug of sorted) {
    // m/^$drugName\b/ — anchored prefix ending on a word boundary
    if (new RegExp('^' + escapeRegExp(drug.drugName) + '\\b').test(text)) {
      return drug;
    }
  }
  return undefined;
}

/** Escape a literal drug name for use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
