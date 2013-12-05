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

my $parser = ParseMeds->new();   #  it should know where to find stuff

my $input = '';
while(<>) {
    $input .= $_;
}

my $drugs = $parser->twoLevelParse($input, ['drug', 'possibleDrug', 'context'], ['dose', 'route', 'freq', 'prn', 'date']);	
print $parser->drugsToXML($drugs);
