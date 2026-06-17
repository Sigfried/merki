/*
 * MERKI medication parser — public API.
 *
 * Copyright 2007 Sigfried Gold.  Part of MERKI, GPL-3.0-or-later.
 *
 * Browser-safe entry point.  Construct a Parser with the contents of
 * druglist.tsv (fetch it as a static asset), then parse clinical text:
 *
 *   import { Parser, drugsToXML } from 'merki-parser';
 *   const tsv = await (await fetch('/druglist.tsv')).text();
 *   const parser = new Parser(tsv);
 *   const drugs = parser.twoLevelParse(text,
 *     ['drug', 'possibleDrug', 'context'], ['dose', 'route', 'freq', 'prn', 'date']);
 *   const xml = drugsToXML(drugs);
 */

export { Parser, type Token } from './parseMeds.js';
export { drugsToXML } from './toXml.js';
export { rules, type Rules } from './rules.js';
export { buildPatterns } from './patterns.js';
export { buildDrugList, drugLookup, type DrugList, type DrugEntry } from './druglist.js';

import { Parser } from './parseMeds.js';
import { drugsToXML } from './toXml.js';

/** Default top/second-level token sets used by the original demo. */
export const TOP_LEVEL = ['drug', 'possibleDrug', 'context'];
export const SECOND_LEVEL = ['dose', 'route', 'freq', 'prn', 'date'];

/**
 * Convenience: parse text with the default token sets and return the XML the
 * original Perl `parseFromShell.pl` produced.
 */
export function parseToXML(parser: Parser, text: string): string {
  return drugsToXML(parser.twoLevelParse(text, TOP_LEVEL, SECOND_LEVEL));
}
