/*
 * MERKI medication parser — engine.
 *
 * Copyright 2007 Sigfried Gold.  Part of MERKI, GPL-3.0-or-later.
 *
 * Port of the live parse path of ParseMeds.pm:
 *   twoLevelParse -> parse -> tagDrugNames / matchPattern / tokenSort
 *   + removeTrumpedTokens, attachContextClues, removePartialParts, drugFilter,
 *     normalizeContext, guessDates.
 *
 * No DOM/Node APIs here — construct a Parser with the druglist.tsv contents and
 * call twoLevelParse().  Output formatting lives in toXml.ts.
 */

import { rules, type Rules } from './rules.js';
import { buildPatterns, type PatternMap } from './patterns.js';
import { buildDrugList, drugLookup, type DrugList } from './druglist.js';

/** A parsed token / drug record.  Mirrors the Perl hashref fields. */
export interface Token {
  type: string;
  text: string;
  start: number;
  end: number;
  length: number;
  precedingText: string;
  followingText: string;
  drugName?: string;
  untrimmedText?: string;
  context?: string;
  when?: string;
  // second-level parts attached onto a drug:
  dose?: string;
  route?: string;
  freq?: string;
  prn?: string;
  date?: string;
  parts?: Token[];
  spurious?: boolean;
  subsumed?: boolean;
}

interface MatchedDrug {
  type: 'drug';
  drugName: string;
  start: number;
  end: number;
}

/** strip leading/trailing whitespace (Perl: s/^\s*(.*?)\s*$/$1/). */
function strip(s: string | undefined): string | undefined {
  if (s === undefined) return undefined;
  return s.replace(/^\s*([\s\S]*?)\s*$/, '$1');
}

const min = (a: number, b: number) => (a < b ? a : b);
const max = (a: number, b: number) => (a > b ? a : b);

export class Parser {
  private patterns: PatternMap;
  private druglist: DrugList;
  private rules: Rules;
  private drugIdIndex = 0;

  constructor(druglistTsv: string, r: Rules = rules) {
    this.rules = r;
    this.patterns = buildPatterns(r).source;
    this.druglist = buildDrugList(druglistTsv, r.drugnameStoplist);
  }

  // --- drug id generation (Perl: makeDrugId / resetDrugId) ---------------

  private resetDrugId(): void {
    this.drugIdIndex = 0;
  }

  /**
   * Build a same-length placeholder for a drug name: 'D' + index + enough
   * trailing 'D's to equal the name's length, so char offsets stay correct.
   */
  private makeDrugId(drugName: string): string {
    const index = String(this.drugIdIndex);
    const pad = 'D'.repeat(drugName.length - 1 - index.length);
    const id = 'D' + index + pad;
    if (id.length !== drugName.length) {
      throw new Error(`id isn't same length as drugname: [${drugName}: ${id}]`);
    }
    this.drugIdIndex++;
    return id;
  }

  // --- drug tagging (Perl: tagDrugNames) ---------------------------------

  /**
   * Find drug names in `text` (already lower-cased), replacing each occurrence
   * with a same-length drug id.  Returns the tagged text and a map id->drug.
   */
  private tagDrugNames(text: string): {
    drugsMatched: Record<string, MatchedDrug>;
    text: string;
  } {
    const drugsMatched: Record<string, MatchedDrug> = {};
    const re = /\b\w/g; // each word-start
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const drug = drugLookup(this.druglist, text.slice(start));
      if (!drug) continue; // exec already advanced lastIndex
      const length = drug.drugName.length;
      const end = start + length - 1;
      const drugId = this.makeDrugId(drug.drugName);
      drugsMatched[drugId] = { type: 'drug', drugName: drug.drugName, start, end };
      // splice the same-length id in place of the name so offsets hold, then
      // continue scanning past it.  (Perl mutates in place and re-scans from
      // pos 0, but a tagged id never re-matches as a drug, so a forward scan is
      // equivalent and produces identical ids/offsets.)
      text = text.slice(0, start) + drugId + text.slice(start + length);
      re.lastIndex = end + 1;
    }
    return { drugsMatched, text };
  }

  // --- low-level matcher (Perl: matchPattern) ----------------------------

  /** Run `pattern` globally over `text`, returning matches with offsets. */
  private matchPattern(text: string, pattern: string): Token[] {
    const matched: Token[] = [];
    const re = new RegExp('(' + pattern + ')', 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      let matchedText = m[1]!;
      let matchStart = m.index;
      let matchEnd = m.index + m[1]!.length - 1;

      // trim leading whitespace, shifting start
      const lead = /^(\s+)/.exec(matchedText);
      if (lead) {
        matchStart += lead[1]!.length;
        matchedText = matchedText.slice(lead[1]!.length);
      }
      // trim trailing whitespace, shifting end
      const trail = /(\s+)$/.exec(matchedText);
      if (trail) {
        matchEnd -= trail[1]!.length;
        matchedText = matchedText.slice(0, -trail[1]!.length);
      }

      matched.push({
        type: '',
        text: matchedText,
        start: matchStart,
        end: matchEnd,
        length: matchEnd - matchStart + 1,
        precedingText: text.substr(max(0, matchStart - 30), min(30, matchStart)),
        followingText: text.substr(matchEnd + 1, 30),
      });

      // Perl's m//g won't find overlapping matches; guard against zero-width
      // matches stalling the loop.
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    return matched;
  }

  // --- the main parse (Perl: parse) --------------------------------------

  parse(text: string, nonTerminalsToParse?: string[]): Token[] {
    const ntToParse = nonTerminalsToParse ?? this.rules.nonTerminalsToParse;
    const lctext = text.toLowerCase();
    let strippedlctext = strip(lctext)!;
    const strippedtext = strip(text)!;

    this.resetDrugId();
    const tagged = this.tagDrugNames(strippedlctext);
    const drugsMatched = tagged.drugsMatched;
    strippedlctext = tagged.text;

    const nonTerminalsMatched: Token[] = [];
    for (const nonTerm of ntToParse) {
      const pattern = this.patterns[nonTerm]!;
      const matches = this.matchPattern(strippedlctext, pattern);
      for (const tok of matches) {
        tok.type = nonTerm;

        // put the drug name back into the matched text (only one per match)
        const idMatch = /(D\d+D+)/.exec(tok.text);
        if (idMatch) {
          const id = idMatch[1]!;
          tok.text = tok.text.replace(/(D\d+D+)/, drugsMatched[id]?.drugName ?? id);
          if (tok.type === 'drug' && drugsMatched[id]) {
            const dm = drugsMatched[id]!;
            tok.drugName = strippedtext.substr(dm.start, dm.end - dm.start + 1);
          }
        }

        // recompute text from the original (case-preserving) text by offset
        tok.text = text.substr(tok.start, tok.end - tok.start + 1);
        nonTerminalsMatched.push(tok);
      }
    }

    for (const tok of nonTerminalsMatched) {
      tok.untrimmedText = tok.text;
      tok.text = strip(tok.text)!;
      if (tok.untrimmedText === tok.text) delete tok.untrimmedText;
    }

    return this.tokenSort(nonTerminalsMatched);
  }

  private tokenSort(tokens: Token[]): Token[] {
    return [...tokens].sort((a, b) => a.start - b.start);
  }

  // --- context handling (Perl: attachContextClues) ----------------------

  private attachContextClues(tokens: Token[], outsideContextClue = ''): Token[] {
    tokens = this.tokenSort(tokens);
    const clueIndexes: number[] = [];
    let context = outsideContextClue;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]!;
      if (tok.type === 'context') {
        context = outsideContextClue;
        const clue = tok.text;
        if (strip(context.toUpperCase()) === strip(clue.toUpperCase())) context = '';
        context += context.length ? '; ' : '';
        context += clue;
        if (/\blab(oratory)?/.test(context)) context = 'lab results'; // little dicey
        clueIndexes.push(i);
        continue;
      }
      tok.context = context;
    }
    for (const i of [...clueIndexes].reverse()) tokens.splice(i, 1);
    return tokens;
  }

  // --- second-level cleanup (Perl: removePartialParts) ------------------

  private removePartialParts(parts: Token[]): Token[] {
    for (const p of parts) {
      for (const tp of parts) {
        if (p === tp) continue;
        if (p.start >= tp.start && p.end <= tp.end) p.subsumed = true;
      }
    }
    return parts.filter((p) => !p.subsumed);
  }

  // --- filtering (Perl: drugFilter) -------------------------------------

  private drugFilter(drugs: Token[]): Token[] {
    for (const d of drugs) {
      if (
        d.type === 'possibleDrug' &&
        d.route === 'or' &&
        !((d.freq !== undefined && d.freq.length) || (d.prn !== undefined && d.prn.length))
      ) {
        d.spurious = true;
      }
      if (d.context === 'lab results') d.spurious = true;
      if (/\s*panel/.test(d.followingText)) d.spurious = true;
      if (/\s*deficiency/.test(d.followingText)) d.spurious = true;
      if (/^iron$/i.test(d.drugName ?? '') && /\s*of/.test(d.followingText)) {
        d.spurious = true;
      }
    }
    return drugs.filter((d) => !d.spurious);
  }

  // --- trump resolution (Perl: removeTrumpedTokens) ---------------------

  private removeTrumpedTokens(toks: Token[]): Token[] {
    const trumped = new Set<number>();
    for (const t of this.rules.trumps) {
      const { trumper, trumpee } = t;
      for (let i = 0; i < toks.length; i++) {
        const testForTrumpee = toks[i]!;
        if (testForTrumpee.type !== trumpee) continue;
        for (const testForTrumper of toks) {
          if (testForTrumper.type !== trumper) continue;
          const overlaps =
            (testForTrumpee.start >= testForTrumper.start &&
              testForTrumpee.start <= testForTrumper.end) ||
            (testForTrumpee.end >= testForTrumper.start &&
              testForTrumpee.end <= testForTrumper.end);
          if (overlaps) {
            trumped.add(i);
            break; // next trumpee
          }
        }
      }
    }
    return toks.filter((_, i) => !trumped.has(i));
  }

  // --- context normalization (Perl: normalizeContext) -------------------

  private normalizeContext(ctx: string | undefined): string | undefined {
    if (ctx === undefined) return undefined;
    if (/lab/i.test(ctx)) return 'lab results';
    if (/in (the )?(e(r|d)|emergency)/i.test(ctx)) return 'Emergency room';
    if (/(history|hpi|cc|pmh)/i.test(ctx)) return 'History';
    if (/at home/i.test(ctx)) return 'At home';
    if (/DISCHARGE MEDICATIONS/i.test(ctx)) return 'Discharge meds';
    if (/(discontinued|dc)/i.test(ctx)) return "DC'd";
    if (/titrate/i.test(ctx)) return 'Titrate off';
    if (/(hold|held)/i.test(ctx)) return 'Held';
    if (/standing/i.test(ctx)) return 'Standing';
    if (/HOSPITAL COURSE/i.test(ctx)) return 'Hosp Course';
    return ctx;
  }

  // --- date guessing (Perl: guessDates) ---------------------------------

  private guessDates(drug: Token): void {
    const ctx = (drug.context ?? '').toLowerCase();
    let when: string;
    if (/(out|at home)/.test(ctx)) when = 'before admission';
    else if (/history/.test(ctx)) when = 'before admission';
    else if (/(hospital course|medications|emergency|hc|hosp course)/.test(ctx))
      when = 'during hospital stay';
    else if (/(discharge)/.test(ctx)) when = 'after discharge';
    else when = 'unknown';
    drug.when = when;
  }

  // --- top-level entry (Perl: twoLevelParse) ----------------------------

  twoLevelParse(text: string, topLevel: string[], secondLevel: string[]): Token[] {
    let drugs = this.parse(text, topLevel);
    drugs = this.removeTrumpedTokens(drugs);
    drugs = this.attachContextClues(drugs);

    for (const drug of drugs) {
      let parts = this.parse(drug.text, secondLevel);
      parts = this.removePartialParts(parts);
      for (const p of parts) {
        // p.type is one of the secondLevel names: dose|route|freq|prn|date
        (drug as unknown as Record<string, string>)[p.type] = p.text;
      }
      if (parts.length) drug.parts = parts;

      if (drug.type === 'possibleDrug') {
        drug.drugName = drug.text;
        // drug name is text up to first part
        if (drug.parts) drug.drugName = drug.text.substring(0, drug.parts[0]!.start);
      }
      drug.context = this.normalizeContext(drug.context);
      this.guessDates(drug);
    }

    return this.drugFilter(drugs);
  }
}
