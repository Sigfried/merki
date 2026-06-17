/*
 * MERKI medication parser — grammar rules.
 *
 * Copyright 2007 Sigfried Gold.  Part of MERKI, GPL-3.0-or-later.
 * See ../../LICENSE.
 *
 * The grammar lives in drugParseRules.yaml (the single source of truth).
 * `npm run generate` (run automatically by the pre-commit hook) mirrors it into
 * rules.generated.json, which this module imports — so the browser-safe core
 * has no runtime YAML dependency.  Do NOT edit rules.generated.json by hand;
 * edit the YAML and regenerate.
 *
 * The expansion logic that turns these rules into real regexes lives in
 * patterns.ts (a port of makeTerminalPatterns / makeNonTerminalPatterns /
 * applyConvenienceRules from ParseMeds.pm).
 */

import generated from './rules.generated.json' with { type: 'json' };

/** A trumper token type removes any trumpee token it overlaps. */
export interface Trump {
  trumper: string;
  trumpee: string;
}

/** A named nonTerminal whose patterns reference other (non)terminals by name. */
export interface NonTerminal {
  name: string;
  patterns: string[];
}

export interface Rules {
  trumps: Trump[];
  nonTerminals: NonTerminal[];
  /** terminalName -> list of literal/regex alternatives */
  terminals: Record<string, string[]>;
  convenienceRules: Record<string, string[]>;
  drugnameStoplist: string[];
  /** the "start rules": only these go to output */
  nonTerminalsToParse: string[];
}

// rules.generated.json carries a leading `_generated` provenance string plus
// the rule fields; pick off just the typed rule fields.
const { trumps, nonTerminals, terminals, convenienceRules, drugnameStoplist, nonTerminalsToParse } =
  generated as unknown as Rules & { _generated?: string };

export const rules: Rules = {
  trumps,
  nonTerminals,
  terminals,
  convenienceRules,
  drugnameStoplist,
  nonTerminalsToParse,
};

/**
 * splitDelim — split on word boundaries, between a number and something else,
 * and before non-word chars.  Used to wrap every terminal pattern.
 * (ParseMeds.pm: $self->{splitDelim})
 */
export const SPLIT_DELIM = '(\\b|(?=\\d)|(?<=\\d)|(?=\\W)|$)';
