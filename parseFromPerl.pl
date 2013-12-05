#!/usr/bin/perl -w
=copyright
    Copyright 2007 Sigfried Gold
    This file is part of MERKI.  MERKI is free software: you can redistribute it and/or modify it 
    under the terms of the GNU General Public License as published by the Free Software Foundation, 
    either version 3 of the License, or (at your option) any later version.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; 
    without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  
    See the GNU General Public License for more details.

    You should have received a copy of the GNU General Public License along with this program.  
    If not, see <http://www.gnu.org/licenses/>.
=cut
use strict;
use ParseMeds;
use YAML::Syck;
use Data::Dumper;
# Fake data (from fake WebCIS patients and further de-identified)
my $text = q(
- "The patient was discharged on the fourth hospital day in good condition. The patient was discharged on azithromycin 250 mg p.o. for two days, prednisone 40 mg p.o. for one day, continued on Flovent 110 mcg 2 puffs b.i.d. with a spacer and albuterol meter dose inhaler 2 q. i.d. p.r.n."
- "She was started on IV diuretics. Her other meds were continued and her weight improved. The patient diuresed approximately 2-3 pounds. Her diuretics were adjusted. Dr. W the attending of record felt that the patient should follow a low salt diet and have closer followup and then consideration of a heart transplant evaluation. Her discharge medicines include: Lasix 80 mg p.o. twice a day, Inspra 25 a day, Amiodarone 200 a day, Digoxin 0.25 a day, Coreg 6.25 twice a day, Altace 2.5 a day with a weight of 153. Conclusion of dictation summary on patient who was admitted with decompensated heart failure."
- "Procardia XL 60 mg p.o. q.d., ferrous sulfate 300 mg p.o. b.i.d., Cipro 250 mg p.o. q12h, Colace 100 mg p.o. t.i.d., Nephro-Vite one tablet p.o. q.d. and Epogen 10,000 units three times a week by Dialysis Team, nitrazine ointment to feet b.i.d., Senokot two tablets p.o. q h.s., Celexa 10 mg p.o. q.d., Zofran 4 mg p.o. q8h p.r.n. for nausea and vomiting, Reglan 10 mg p.o. q3h p.r.n. for nausea and vomiting, Percocet one to two tablets p.o. q4-6h p.r.n., Tylenol 650 mg p.o. q4h p.r.n., _________ to bilateral heel p.r.n., and Glucotrol 2.5 mg p.o. q a.m."
- "blah blah Allergies: tylenol, azithromycin, aspirin, peanut butter, viagra"
- "Discharge medications: Procardia XL 60 mg p.o. q.d., ferrous sulfate 300 mg p.o. b.i.d., Cipro 250 mg p.o. q12h"
);
my $dsums = Load($text);
my $parser = ParseMeds->new(); 

for my $dsum (@$dsums) {
    my $drugs = $parser->twoLevelParse($dsum, ['drug', 'possibleDrug', 'context'], ['dose', 'route', 'freq', 'prn', 'date']);	
    print "==  Extracting drugs  ============================================\n";
    print $dsum, "\n";
    print "------------------------------\n";
    print $parser->drugsToXML($drugs);
    print "\n\n";
}
