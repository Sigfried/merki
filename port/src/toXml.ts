/*
 * MERKI medication parser — XML output.
 *
 * Copyright 2007 Sigfried Gold.  Part of MERKI, GPL-3.0-or-later.
 *
 * Port of drugsToXML from ParseMeds.pm.  Reproduces the XML::Writer output
 * with DATA_MODE=1, DATA_INDENT=4, NEWLINES=0: 4-space indent per nesting
 * level, one element per line, no trailing newline.
 */

import type { Token } from './parseMeds.js';

const INDENT = '    '; // DATA_INDENT => 4

/** XML::Writer character-data escaping: & < > (and we leave quotes alone). */
function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Fields emitted inside each drug, in order.  `tag` is the XML element name;
 * `get` pulls the (possibly undefined) value off the token.  A field is
 * skipped when its value is undefined — except surroundingText, which is
 * always emitted (Perl emits it unconditionally).
 */
const FIELDS: { tag: string; get: (d: Token) => string | number | undefined; always?: boolean }[] = [
  { tag: 'drugName', get: (d) => d.drugName },
  { tag: 'dose', get: (d) => d.dose },
  { tag: 'route', get: (d) => d.route },
  { tag: 'freq', get: (d) => d.freq },
  { tag: 'prn', get: (d) => d.prn },
  { tag: 'date', get: (d) => d.date },
  { tag: 'startChar', get: (d) => d.start },
  { tag: 'endChar', get: (d) => d.end },
  { tag: 'textLength', get: (d) => d.length },
  { tag: 'when', get: (d) => d.when },
  { tag: 'context', get: (d) => d.context },
  {
    tag: 'surroundingText',
    always: true,
    get: (d) => `${d.precedingText}[${d.text}]${d.followingText}`,
  },
];

export function drugsToXML(drugs: Token[]): string {
  // XML::Writer (DATA_MODE) collapses an element with no child elements onto a
  // single line, so an empty drug list renders as "<drugs></drugs>".
  if (drugs.length === 0) return '<drugs></drugs>';

  const lines: string[] = [];
  lines.push('<drugs>');
  for (const drug of drugs) {
    const type = drug.type;
    lines.push(`${INDENT}<${type}>`);
    for (const f of FIELDS) {
      const v = f.get(drug);
      if (v === undefined && !f.always) continue;
      const text = escapeXml(String(v ?? ''));
      lines.push(`${INDENT}${INDENT}<${f.tag}>${text}</${f.tag}>`);
    }
    lines.push(`${INDENT}</${type}>`);
  }
  lines.push('</drugs>');
  return lines.join('\n');
}
