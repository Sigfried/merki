/*
 * Generate a differential-test corpus for the MERKI parser.
 *
 * Emits one clinical-text line per case to stdout.  Each line embeds real drug
 * names (present in druglist.tsv) inside realistic discharge-summary phrasing,
 * exercising the grammar's pattern space: dose forms, routes, frequencies, prn
 * + qualifiers, dose ranges, dates/date ranges, allergy lists, context clues,
 * and negative cases (non-drugs, drugs-not-in-list).
 *
 * Usage:  node generate.mjs > cases.txt
 * The harness (run.mjs) then feeds each line through both the live Perl and the
 * TS port and diffs the XML.
 */

// Real drug names confirmed present in druglist.tsv.
const DRUGS = [
  'tylenol', 'aspirin', 'ibuprofen', 'metformin', 'lisinopril', 'atorvastatin',
  'amlodipine', 'omeprazole', 'gabapentin', 'losartan', 'albuterol',
  'prednisone', 'azithromycin', 'amoxicillin', 'warfarin', 'furosemide',
  'insulin', 'heparin', 'morphine', 'oxycodone', 'hydrocodone', 'simvastatin',
  'metoprolol', 'digoxin', 'lasix', 'coreg', 'cipro',
];

const DOSES = ['250 mg', '500 mg', '40 mg', '0.25 mg', '5 mg', '100 mcg', '81 mg', '12.5 mg', '1 g'];
const COUNT_DOSES = ['2 puffs', 'one tablet', '2 tablets', '1 cap', '3 drops'];
const ROUTES = ['p.o.', 'po', 'iv', 'sl', 'sc', 'topical', 'pr', 'im', 'inhaled', 'transdermal'];
const FREQS = ['daily', 'b.i.d.', 'bid', 't.i.d.', 'q.d.', 'qhs', 'q4h', 'q6h', 'q12h', 'twice a day', 'once daily', 'every day', 'every 8 hours'];
const PRNS = ['p.r.n.', 'prn', 'prn pain', 'prn for severe pain', 'as needed', 'prn wheezing'];
const DATES = ['03/15/2024', '12/01/23', '1/5/2024'];

// Deterministic pseudo-random (seeded) so the corpus is reproducible.
let seed = 1234567;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const lines = [];
const add = (s) => lines.push(s);

// 1. drug + dose + route + freq  (the canonical case)
for (let i = 0; i < 14; i++) {
  add(`${pick(DRUGS)} ${pick(DOSES)} ${pick(ROUTES)} ${pick(FREQS)}`);
}

// 2. drug + dose + route + prn
for (let i = 0; i < 8; i++) {
  add(`${pick(DRUGS)} ${pick(DOSES)} ${pick(ROUTES)} ${pick(PRNS)}`);
}

// 3. countable-form doses (puffs, tablets, drops)
for (let i = 0; i < 6; i++) {
  add(`${pick(DRUGS)} ${pick(COUNT_DOSES)} ${pick(ROUTES)} ${pick(FREQS)}`);
}

// 4. multi-drug comma lists (like a med list)
for (let i = 0; i < 6; i++) {
  const n = 2 + Math.floor(rnd() * 3);
  const parts = [];
  for (let j = 0; j < n; j++) parts.push(`${pick(DRUGS)} ${pick(DOSES)} ${pick(ROUTES)} ${pick(FREQS)}`);
  add(parts.join(', '));
}

// 5. dose ranges & freq ranges
add('percocet one to two tablets p.o. q4-6h p.r.n.');
add('morphine 2 to 4 mg iv q2-4h prn pain');
add('insulin 5 to 10 units sc before meals');

// 6. context clues
add('Discharge medications: lisinopril 10 mg po daily, metformin 500 mg po bid');
add('Home meds: aspirin 81 mg po daily, atorvastatin 40 mg po qhs');
add('Allergies: penicillin, sulfa, codeine, tylenol');
add('Allergies: aspirin, ibuprofen, morphine');
add('Medications on admission: warfarin 5 mg po daily, digoxin 0.25 mg po daily');
add('lisinopril 10 mg po daily on hold for low blood pressure');
add('metoprolol 25 mg po bid, discontinued on 03/15/2024');

// 7. dates / started-on (the case that exposed the \b bug)
add('lisinopril 10mg po daily started on 03/15/2024');
add('warfarin 5 mg po daily restarted on 12/01/23');
add('heparin gtt started 1/5/2024');

// 8. negative / tricky cases (non-drugs, labs, no-dose)
add('Patient with cholesterol 220 and glucose 105.');
add('zzzfakedrug 100 mg po daily and madeupicillin 50 mg iv');
add('peanut butter and jelly, not a drug here');
add('iron studies and sodium panel were within normal limits');
add('the patient was treated with antibiotics and discharged home');

// 9. not-in-list / misspelled drug names.  These can't match the `drug` rule
//    (no druglist hit) but should surface as `possibleDrug` when surrounded by
//    dose/route/freq/prn evidence -- the lightly-tested branch.
const MISSPELLED = [
  'metaprolol', 'lisinapril', 'azithromiacin', 'atorvastatatin', 'gabbapentin',
  'hydrochlorothiazyde', 'amoxicilin', 'omeprazol', 'levofloxacine',
];
for (const m of MISSPELLED) {
  add(`${m} ${pick(DOSES)} ${pick(ROUTES)} ${pick(FREQS)}`);
}
// misspelled with prn evidence
add('metaprolol 25 mg po prn');
add('amoxicilin 875 mg po q12h prn');
// "treated with <not-in-list>" -> possibleDrug via treatedWith
add('the patient was treated with levofloxacine for the pneumonia');
add('on a regimen of hydrochlorothiazyde and lisinapril');
// not-in-list with NO evidence -> should yield nothing (no drug, no possibleDrug)
add('the gabbapentin was mentioned in passing');
// mixed: one real, one misspelled, in a list
add('lisinopril 10 mg po daily, metaprolol 25 mg po bid');

// 10. real-ish sentences with surrounding prose
add('On admission the patient was taking lisinopril 10 mg p.o. daily and metformin 500 mg p.o. b.i.d.');
add('She was started on azithromycin 250 mg p.o. for five days for the infection.');
add('Continue aspirin 81 mg p.o. daily and atorvastatin 40 mg p.o. q.h.s. at home.');
add('Pain controlled with oxycodone 5 mg p.o. q4h prn and tylenol 650 mg p.o. q6h prn.');
add('Held metoprolol due to bradycardia; resume when heart rate improves.');

process.stdout.write(lines.join('\n') + '\n');
