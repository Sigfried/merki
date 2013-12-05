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
package ParseMeds;
use strict;
use YAML::Syck;
use Data::Dumper;
use XML::Writer;
use Carp;
#use Parse::RecDescent;
my $SHORTEST_DRUG_NAME = 3;
my $RESOURCE_DIR = '.';
sub new {
    my $class = shift;
    my %args = @_;
    my $self = bless {%args}, $class;
	$self->{drugSearchMethod} = 'hashBased'; # treeBased, binarySearchBased, or hashBased, binary not working right
    $self->initializeParser();
    return $self;
}
sub twoLevelParse { # takes text, parses out drug info, and then also parses out dose, freq, etc, as a second level of data structs within the drug
    my $self = shift;
    my $text = shift;
    my $topLevel = shift;       # arrayref of tokens to parse (drug, possibleDrug, context)
    my $secondLevel = shift;    # arrayref of subtokens to parse (dose, freq, route, prn)

    my $drugs = $self->parse($text, $topLevel);
    $drugs = $self->removeTrumpedTokens($drugs);
    $drugs = $self->attachContextClues( $drugs );

    #print STDERR scalar(@$drugs), ": ",Dumper($drugs) if scalar @$drugs;
    for my $drug (@$drugs) {
        my $parts = $self->parse($drug->{text}, $secondLevel);
        $parts = $self->removePartialParts($parts);
        map { $drug->{ $_->{type} } = $_->{text} } @$parts;
        $drug->{parts} = $parts if defined $parts and @$parts;
        if( $drug->{type} eq 'possibleDrug' ) {
            $drug->{drugName} = $drug->{text};
            #                                       NEXT LINE IS WRONG, doesn't account for treated with
            $drug->{drugName} = substr($drug->{text},0,$drug->{parts}[0]{start}) if defined $drug->{parts};		# drug name is text up to first part
            #$drug->{drugName} = '?? ' . $drug->{drugName} . ' ??';
        }
        $drug->{context} = $self->normalizeContext( $drug->{context} );
        $self->guessDates($drug);
    }
    $drugs = $self->drugFilter($drugs);
    return $drugs;
}
sub drugsToXML {
    my $self = shift;
    my $drugs = shift;
    my $out = '';
    my $W = new XML::Writer(OUTPUT=>\$out, DATA_MODE=>1, DATA_INDENT=>4, NEWLINES=>0 );
    $W->startTag("drugs");
    for my $drug (@$drugs) {
        my $type = $drug->{type};
        $W->startTag($type,
#            drugName => $drug->{drugName},
#            route => $drug->{route},
#            context => $drug->{context},
#            startChar => $drug->{start},
#            endChar => $drug->{end},
#            textLength => $drug->{length},
#            when => $drug->{when},
#            surroundingText => "$drug->{precedingText}\[$drug->{text}]$drug->{followingText}",
        );
        #$W->startTag("text"); $W->characters( $drug->{text}); $W->endTag("text");
        if( defined $drug->{drugName} ) { $W->startTag("drugName"); $W->characters( $drug->{drugName} ); $W->endTag("drugName"); }
        if( defined $drug->{dose} ) { $W->startTag("dose"); $W->characters( $drug->{dose} ); $W->endTag("dose"); }
        if( defined $drug->{route} ) { $W->startTag("route"); $W->characters( $drug->{route} ); $W->endTag("route"); }
        if( defined $drug->{freq} ) { $W->startTag("freq"); $W->characters( $drug->{freq} ); $W->endTag("freq"); }
        if( defined $drug->{prn} ) { $W->startTag("prn"); $W->characters( $drug->{prn} ); $W->endTag("prn"); }
        if( defined $drug->{date} ) { $W->startTag("date"); $W->characters( $drug->{date} ); $W->endTag("date"); }
        if( defined $drug->{start} ) { $W->startTag("startChar"); $W->characters( $drug->{start} ); $W->endTag("startChar"); }
        if( defined $drug->{end} ) { $W->startTag("endChar"); $W->characters( $drug->{end} ); $W->endTag("endChar"); }
        if( defined $drug->{length} ) { $W->startTag("textLength"); $W->characters( $drug->{length} ); $W->endTag("textLength"); }
        if( defined $drug->{when} ) { $W->startTag("when"); $W->characters( $drug->{when} ); $W->endTag("when"); }
        if( defined $drug->{context} ) { $W->startTag("context"); $W->characters( $drug->{context} ); $W->endTag("context"); }
        $W->startTag("surroundingText"); $W->characters( "$drug->{precedingText}\[$drug->{text}]$drug->{followingText}" ); $W->endTag("surroundingText");
        delete $drug->{type};
        delete $drug->{when};
        delete $drug->{context};
        delete $drug->{drugName};
        delete $drug->{route};
        delete $drug->{dose};
        delete $drug->{freq};
        delete $drug->{prn};
        delete $drug->{date};
        delete $drug->{context};
        delete $drug->{precedingText};
        delete $drug->{text};
        delete $drug->{followingText};
        delete $drug->{start};
        delete $drug->{end};
        delete $drug->{length};
#        $W->startTag("leftOverData");
#        $W->characters( Dumper($drug) );
#        $W->endTag("leftOverData");
        $W->endTag($type);
    }
#        $W->startTag("event", 
#                        start=>$startDate, 
#                        end=>$endDate,
#                        isDuration=>"true",
#                        color=>"#0A0",
#                        title=>$drug,
#                        icon=>sprintf("../../api/images/%s-circle.png", $status =~ /^\s*active\s*/i ? 'green' : 'red'),
#                        'link'=>"http://mor.nlm.nih.gov/download/rxnav", );
        #$orderString .= Dumper($o);
#        $W->characters($orderString);
#        $W->endTag("event");
    $W->endTag("drugs");
    $W->end();
    return $out;
}
sub normalizeContext {
	my $self = shift;
	my $ctx = shift;
	my $context;
	if( $ctx =~ /lab/i ) {
		$context = 'lab results';
	}elsif( $ctx =~ /in (the )?(e(r|d)|emergency)/i ) {
		$context = 'Emergency room';
	}elsif( $ctx =~ /(history|hpi|cc|pmh)/i ) {
		$context = 'History';
	}elsif( $ctx =~ /at home/i ) {
		$context = 'At home';
	}elsif( $ctx =~ /DISCHARGE MEDICATIONS/i ) {
		$context = 'Discharge meds';
	}elsif( $ctx =~ /(discontinued|dc)/i ) {
		$context = "DC'd";
	}elsif( $ctx =~ /titrate/i ) {
		$context = 'Titrate off';
	}elsif( $ctx =~ /(hold|held)/i ) {
		$context = 'Held';
	}elsif( $ctx =~ /standing/i ) {
		$context = 'Standing';
	}elsif( $ctx =~ /HOSPITAL COURSE/i ) {
		$context = 'Hosp Course';
	}else{
		$context = $ctx;       # put this back after evaluation!!!
        #$context = 'Hosp Course';
        #$context = 'Unknown';
	}
	return $context;
}
sub guessDates {
	my $self = shift;
	my $drug = shift;
	my $ctx = lc $drug->{context};
    my $when;
	my ($beforeAdmit,$duringHospStay,$afterDischarge);
	if( $ctx =~ m/(out|at home)/ ) {
        $when = 'before admission';
	}elsif( $ctx =~ m/history/ ) {
        $when = 'before admission';
	}elsif( $ctx =~ m/(hospital course|medications|emergency|hc|hosp course)/ ) {
        $when = 'during hospital stay';
	}elsif( $ctx =~ m/(discharge)/ ) {
        $when = 'after discharge';
	}else{
        $when = 'unknown';
	}
	$drug->{when} = $when;
}

sub initializeParser {
    my $self = shift;
    my $rules = LoadFile("$RESOURCE_DIR/drugParseRules.yaml");
    $self->{terminals} = $rules->{terminals};
    $self->{nonTerminals} = $rules->{nonTerminals};
    $self->{nonTerminalsToParse} = $rules->{nonTerminalsToParse};
    $self->{convenienceRules} = $rules->{convenienceRules};
    $self->{trumps} = $rules->{trumps};
    # stop list is names that appear in drugnames that are never (?) usefully parsed as drug names
    $self->{drugnameStoplist} = $rules->{drugnameStoplist};
    $self->{splitDelim} = '(\b|(?=\d)|(?<=\d)|(?=\W)|$)';   # split on word boundaries, between number and something else and non-word chars, I THINK
    $self->applyConvenienceRules();
    $self->makeTerminalPatterns();
    $self->makeNonTerminalPatterns();
	#print Dumper($self);
	#exit;
    #$joinDelim = '';        # luckily I don't think I'm using this anymore, so adding whiteSpace to splitDelim is ok
#    $self->{splitDelim} = '\s+'; # maybe we'll want to split on word boundaries or something else someday
    $self->getDruglist();
}
sub makeTerminalPatterns {
    my $self = shift;
    my $terminals = $self->{terminals};
    my $patterns = $self->{patterns} = {};
    my $sd = $self->{splitDelim};
    for my $terminalName ( keys %$terminals ) {
        my $terminalPatterns = $terminals->{$terminalName};
        my $pattern = sprintf '%s(%s)%s', $sd, join('|', @$terminalPatterns), $sd;
        #my $pattern = sprintf '\b(%s)\b', join '|', @$terminalPatterns;
        #my $pattern = sprintf '(?<=\s)?\b(%s)\b(?=\s*)', join '|', @$terminalPatterns;
        $patterns->{$terminalName} = qr/$pattern/;
    }
    #delete $self->{terminals};          # don't need these anymore
    #delete $self->{convenienceRules};
}
sub makeNonTerminalPatterns {
    my $self = shift;
    $self->{DEBUG} = 1;
    my $nonTerminals = $self->{nonTerminals};
    my @processingOrder;
    my %reverseNonTerminalHash;
    my @nonTerminalPatterns;
    for my $nt ( @$nonTerminals ) {
        my $name = $nt->{name};
        my $patterns = $nt->{patterns};
        my @expandedPatterns;
        for my $pattern (@$patterns) {
			# any alpha chars we find in a pattern should be part of the name of another pattern, EXCEPT
			#	chars following \ ! or =, which are parts of regexes.  get rid of these temporarily
			#	and for every other alpha string, replace it with the pattern it refers to
            my @escs; while( $pattern =~ s/((\\|!|=)[a-zA-Z])/====/ ) { push @escs, $1 }
            #print "$pattern\n" if @escs;
            if( $self->{DEBUG} ) {
                while( $pattern =~ m/([a-zA-Z]+)/g ) {
                    confess "could not find pattern for term [$1]\n" unless defined $self->{patterns}{$1};
                }
            }
            # hold on to escape sequences (\s, \d) so they don't get matched
            $pattern =~ s/([a-zA-Z]+)/((?=\\s*)$self->{patterns}{$1}(?=\\s*))/g;
            if( @escs ) {
				$escs[0] = $self->{splitDelim} if $escs[0] eq '\b';		# \b just doesn't work right for this app
                while( $pattern =~ s/====/$escs[0]/ ) { shift @escs }
                #print "$pattern\n\n\n";
            }
            push @expandedPatterns, $pattern;
        }
        my $combinedPatterns = sprintf '(%s)', join '|', @expandedPatterns;
        $self->{patterns}->{$name} = qr/$combinedPatterns/;
    }
    #print Dumper($self);
    #exit;
    delete $self->{nonTerminals};          # don't need these anymore
}
{
    my $index = 0;
    #my $allowableChrs = 'abcdefghijklmnopqrstuvwxyzABCEFGHIJKLMNOPQRSTUVWXYZ01923456789_'; # no D, because that's the padding char
    # was going to do something fancy to make IDs as short as possible (in case drugnames are short)
    # forget that for now
    sub makeDrugId {
        my $drugname = shift;
        my $id = sprintf 'D%d%s', $index, 'D' x (length($drugname) - 1 - length($index));
        confess "id isn't same length as drugname: [$drugname: $id]" unless length($drugname) == length($id);
        $index++;
        return $id;
    }
	sub resetDrugId {
		$index = 0;
	}
}
sub tagDrugNames {				# finds drugnames in text, creates a drug object (?)
								# replaces occurrence with drugId which is a key into
								# the drugsMatched hash and is also the same length as
								# the drugname (so that subsequent offsets will be correct)
    my $self = shift;
    my $text = shift;            # lower case already
    my %drugsMatched;
    while( $text =~ m/\b\w/g ) {
        my $start = $-[0];
        #my $start = @-[0];
        my $drug = $self->drugLookup(substr($text,$start));
        next unless defined $drug;
#        next if substr($text,$start+length($drug->{drugName})-1,2) =~ /\w\w/;    # matched drug where the word in the text continues
                                                                        # e.g., matched "disc" (?) for text of "discharge"
        #print STDERR "got drug [$drug->{drugName}]\n";
        #print "two chars: ",substr($text,$start+length($drug->{drugName})-1,2),"\n";
        my $length = length $drug->{drugName};
        my $end = $start + $length - 1;
        my $drugId = makeDrugId($drug->{drugName});
        $drugsMatched{$drugId} =     { type=> 'drug',
                                       drugName=> $drug->{drugName},
                                       start=> $start,
                                       end=> $end,
                             };
        substr($text, $start, $length) = $drugId;
    }
	return (\%drugsMatched, $text);
}
sub matchPattern {		# breaking this out for profiling purposes
    my $self = shift;
	my $text = shift;
	my $pattern = shift;
	my @matched;
	while( $text =~ m/($pattern)/g ) {    # this won't find overlapping occurrences
		my $matchedText = $1;
		my $matchStart = $-[0];
		my $matchEnd = $+[0] - 1;
		$matchStart += length($1) if $matchedText =~ s/^(\s+)//;	# get rid of leading whitespace, change start accordingly
		$matchEnd -= length($1) if $matchedText =~ s/(\s+)$//;
		push @matched, { text=>$matchedText,
                         start=>$matchStart,
                         end=>$matchEnd, 
                         length=> $matchEnd - $matchStart + 1, 
                         precedingText=>substr($text,max(0,$matchStart-30),min(30,$matchStart)),
                         followingText=>substr($text,$matchEnd+1,30),
                       };
	}
	return \@matched;
}
sub strip {
	return undef unless defined $_[0];
	$_[0] =~ s/^\s*(.*?)\s*$/$1/;
	return $_[0];
}
sub parse {
    my $self = shift;
    my $text = shift;
	my $nonTerminalsToParse = shift;
    $nonTerminalsToParse = $self->{nonTerminalsToParse} unless defined $nonTerminalsToParse;
    my $lctext = lc $text;            # lower case
    my $strippedlctext = strip($lctext);
    my $strippedtext = strip($text);
    #print "parsing: [$text]\n";
	my $drugsMatched;
	resetDrugId();
	($drugsMatched, $strippedlctext) = $self->tagDrugNames($strippedlctext);
    # tag drug names
    my @nonTerminalsMatched;
    #print "drugs matched: ", Dumper($drugsMatched);
    # parse with drug rules
    for my $nonTerm ( @$nonTerminalsToParse ) {
        my $pattern = $self->{patterns}{$nonTerm};
		my $matches = $self->matchPattern($strippedlctext,$pattern);
		for my $m (@$matches) {
            # put drugname back in matched text			# what about non-drug matches?  what is this doing?
            $m->{type}=$nonTerm;

			$m->{text} =~ s/(D\d+D+)/$drugsMatched->{$1}->{drugName}/;	# had /g on here, but there should only be on drugname
			$m->{drugName} = substr($strippedtext, $drugsMatched->{$1}{start}, $drugsMatched->{$1}{end} - $drugsMatched->{$1}{start} + 1) if defined $1 && $m->{type} eq 'drug';
#			$m->{drugName} = $drugsMatched->{$1}->{drugName} if defined $1 && $m->{type} eq 'drug';

			$m->{text} = substr($text, $m->{start}, $m->{end} - $m->{start} + 1);
			push @nonTerminalsMatched, $m;
		}
    }
    for my $tok (@nonTerminalsMatched) {
        $tok->{untrimmedText} = $tok->{text};
        $tok->{text} = strip($tok->{text});
        delete $tok->{untrimmedText} if $tok->{untrimmedText} eq $tok->{text};
    }
	return $self->tokenSort(\@nonTerminalsMatched);
}
sub attachContextClues {
	my $self = shift;
	my $tokens = shift;
	my $outsideContextClue = shift || '';

	$tokens = $self->tokenSort($tokens);
	my @clueIndexes;
    my $context = $outsideContextClue;
	for( my $i = 0; $i < scalar @$tokens; $i++ ) {
		if( $tokens->[$i]->{type} eq 'context' ) {
            $context = $outsideContextClue;
            my $clue = $tokens->[$i]->{text};
            $context = '' if strip(uc($context)) eq strip(uc($clue));
            $context .= length($context) ? '; ' : '';
            $context .= $clue;
            $context = 'lab results' if $context =~ /\blab(oratory)?/;      # little dicey
            push @clueIndexes, $i;
            next;
        }
        $tokens->[$i]->{context} = $context;
	}
	for my $i (reverse @clueIndexes) {  # remove contextClues from the token list, we're done with them
		splice @$tokens, $i, 1;
	}
	return $tokens;
}
sub removePartialParts {
	my $self = shift;
	my $parts = shift;
	for my $p (@$parts) {
		for my $tp (@$parts) {
			next if $p eq $tp;
			$p->{subsumed} = 1 if $p->{start} >= $tp->{start} && $p->{end} <= $tp->{end};
				# arbitrarily gets rid of one if they are identical
		}
	}
	return [ grep { not exists $_->{subsumed} } @$parts ];
}
sub drugFilter {
	my $self = shift;
	my $drugs = shift;
	for my $d (@$drugs) {
        #print STDERR "checking $d->{text}\n";
		# "or" is a route (right eye?), but it creates a lot of false positive possibleDrugs
		#print STDERR "SPURIOUS: ".Dumper($d) if $d->{type} eq 'possibleDrug' && defined $d->{route} && $d->{route} eq 'or' && not ((defined($d->{freq}) && length($d->{freq})) or (defined($d->{prn} && length($d->{prn}))));
		$d->{spurious} = 1 if $d->{type} eq 'possibleDrug' && defined $d->{route} && $d->{route} eq 'or' && not ((defined($d->{freq}) && length($d->{freq})) or (defined($d->{prn} && length($d->{prn}))));
		$d->{spurious} = 1 if $d->{context} eq 'lab results';
		$d->{spurious} = 1 if $d->{followingText} =~ /\s*panel/;        # probably a lab
		$d->{spurious} = 1 if $d->{followingText} =~ /\s*deficiency/;   
		$d->{spurious} = 1 if $d->{drugName} =~ /^iron$/i && $d->{followingText} =~ /\s*of/;    # found one like this, it's a lab test result
	}
	$drugs = [ grep { not $_->{spurious} } @$drugs ];
	return $drugs;
}
sub removeTrumpedTokens {
	my $self = shift;
	my $toks = shift;
    # remove trumped tokens, if there's an overlap at any point, remove trumpee
    my $trumps = $self->{trumps};
    my @trumped;
    for my $t (@$trumps) {
        my $trumper = $t->{trumper};
        my $trumpee = $t->{trumpee};
        #print "$trumper trumping $trumpee\n";
        TRUMPEE: for (my $i = 0; $i < @$toks; $i++) {
            my $testForTrumpee = $toks->[$i];
            if( $testForTrumpee->{type} eq $trumpee ) {
                for my $testForTrumper (@$toks) {
                    if( $testForTrumper->{type} eq $trumper ) {
                        #printf "does [%d-%d, %s, %s] trump tok %d: [%d-%d, %s, %s]?  ", $testForTrumper->{start}, $testForTrumper->{end}, $testForTrumper->{type}, $testForTrumper->{text},
                        #    $i, $testForTrumpee->{start}, $testForTrumpee->{end}, $testForTrumpee->{type}, $testForTrumpee->{text};
                        if( 
                            ( $testForTrumpee->{start} >= $testForTrumper->{start}  &&
                              $testForTrumpee->{start} <= $testForTrumper->{end} )  or
                            ( $testForTrumpee->{end}   >= $testForTrumper->{start}  &&
                              $testForTrumpee->{end}   <= $testForTrumper->{end} )
                           ) {
                            #print "yes \n";
                            push @trumped, $i;
                            next TRUMPEE;
                        } else {
                            #print "no \n";
                        }
                    }
                }
            }
        }
    }
    #print "TRUMPED:  ",Dumper(\@trumped);
    #print Dumper($toks);
    #print "got ", scalar(@$toks), " coming in, ";
    map { splice @$toks, $_, 1 } reverse @trumped;  # have to do it in reverse order so don't clobber wrong indexes
    #print scalar(@$toks), " going out\n";
    #print Dumper($toks);
    return $toks;
}
sub tokenSort {
	my $self = shift;
	my $tokens = shift;
	return [ sort { $a->{start} <=> $b->{start} } @$tokens ];
}
sub getDruglist {
    my $self = shift;
	return $self->getDruglist_treeBased(@_) if $self->{drugSearchMethod} eq 'treeBased';
	return $self->getDruglist_hashBased(@_) if $self->{drugSearchMethod} eq 'hashBased';
	return $self->getDruglist_binarySearchBased(@_) if $self->{drugSearchMethod} eq 'binarySearchBased';
}
sub drugLookup {
    my $self = shift;
	return $self->drugLookup_treeBased(@_) if $self->{drugSearchMethod} eq 'treeBased';
	return $self->drugLookup_hashBased(@_) if $self->{drugSearchMethod} eq 'hashBased';
	return $self->drugLookup_binarySearchBased(@_) if $self->{drugSearchMethod} eq 'binarySearchBased';
}
sub getDruglist_hashBased {
    my $self = shift;
    my $stoplist = $self->{drugnameStoplist};
    my $fname = "$RESOURCE_DIR/druglist.tsv";
    open( I, "<$fname" ) or die "can't open $fname for reading";
	my $firstLine = <I>;
	chomp $firstLine;
	my @fieldNames = split /\t/, $firstLine;
    my %drugdata;
    #my $sd = $self->{splitDelim};
    my $sd = qr/\b/;
    while(<I>) {
        chomp;
        #s/\s*\(obs.*$//;    # throw away "(obsolete)" label on drug names (sometimes cut off)
		my @fields = split /\t/;
		my %drug;
		map { $drug{$fieldNames[$_]} = $fields[$_] } ( 0..$#fields );
		$drug{drugName} = lc $drug{drugName};
        my ($firstWord) = split /$sd/, $drug{drugName};
		#print "adding [$drug{drugName}] with firstword [$firstWord]\n";
        push @{$drugdata{$firstWord}}, \%drug;
    }
    map { delete $drugdata{$_} } @$stoplist;
    $self->{druglist} = \%drugdata;
}
sub drugLookup_hashBased {
    my $self = shift;
    my $text = shift;
    my $druglist = $self->{druglist};
    #my $sd = $self->{splitDelim};
    my $sd = qr/\b/;
    my @words = split /$sd/, $text;
    my @matchedDrugs = ();
	$text =~ m/^(.+?)$sd/;
	confess "how can text [$text] be missing a right word boundary after the first word?" unless defined $1;
	my $token = $1;
	#printf "first word of %s is %s\n", substr($text,0,30), $token;
	if( exists $druglist->{$token} ) {
		for my $drug ( sort {length $b->{drugName} <=> length $a->{drugName} } @{$druglist->{$token}} ) {
			return $drug if $text =~ m/^$drug->{drugName}$sd/;
        }
    }
	return undef;
}
sub getDruglist_treeBased {
    my $self = shift;
    my $stoplist = $self->{drugnameStoplist};
    my $fname = "$RESOURCE_DIR/druglist.tsv";
    open( I, "<$fname" ) or die "can't open $fname for reading";
	my $firstLine = <I>;
	chomp $firstLine;
	my @fieldNames = split /\t/, $firstLine;
    my %drugdata;
    #my $test = 0;
    while(<I>) {
        #next unless $test++ > 200 && $test < 220;
        #s/\s*\(obs.*$//;    # throw away "(obsolete)" label on drug names (sometimes cut off)
        chomp;
		my @fields = split /\t/;
		my %drug;
		map { $drug{$fieldNames[$_]} = $fields[$_] } ( 0..$#fields );
		$drug{drugName} = lc $drug{drugName};
		$drugdata{$drug{drugName}} = \%drug;
    }
    map { delete $drugdata{$_} } @$stoplist;
    my $drugtree;
    my $hashAssignments;
    for my $name (keys %drugdata) {
        #$name =~ s/'/\\'/g;
        my $ref = join('->', map{ sprintf '{q|%s|}', substr($name,$_,1) } ( 0 .. length($name)-1 ) );
        #my $ref = join('->', map{ sprintf '{q|%s|}', substr($name,0,$_) } ( 1 .. length($name)-1 ) );
        my $e = '$drugtree->'.$ref.'->{drug} = $drugdata{ q|' . $name . "| };\n";
        #$hashAssignments .= $e;        # much slower
        #print "evaling [$e]\n";
        eval $e;
    }
    print STDERR "evaled hashAssignments\n";
    print $@ if $@;
    $self->{drugtree} = $drugtree;
}
sub drugLookup_treeBased {
    my $self = shift;
    my $text = shift;
    my $drugtree = $self->{druglist};
    my @chars = split //, $text;
    my $lastMatch;
    my $ptr = $drugtree;
    for( my $i = 0; $i < @chars; $i++ ) {
        last unless exists $ptr->{ $chars[$i] };
        $ptr = $ptr->{ $chars[$i] };
        $lastMatch = $ptr->{drug} if 
			exists $ptr->{drug} &&
			not substr($text, $i, 2) =~ m/\w\w/;
			# no match without a word boundary
    }
    return $lastMatch;
}
sub getDruglist_binarySearchBased {
    my $self = shift;
    my $stoplist = $self->{drugnameStoplist};
    my $fname = "$RESOURCE_DIR/druglist.tsv";
    open( I, "<$fname" ) or die "can't open $fname for reading";
	my $firstLine = <I>;
	chomp $firstLine;
	my @fieldNames = split /\t/, $firstLine;
    my %drugdata;
    my @drugnames;
    #my $test = 0;
    while(<I>) {
        #next unless $test++ > 200 && $test < 220;
        chomp;
        #s/\s*\(obs.*$//;    # throw away "(obsolete)" label on drug names (sometimes cut off)
        #$drugs{$_} = { cui=>'where\'s the cui?', drugName=>$_ };
        #push @drugs, $_;
		my @fields = split /\t/;
		my %drug;
		map { $drug{$fieldNames[$_]} = $fields[$_] } ( 0..$#fields );
		$drug{drugName} = lc $drug{drugName};
		push @drugnames, $drug{drugName};
		$drugdata{$drug{drugName}} = \%drug;
		#last if $test++ > 5;
    }
    #map { delete $drugdata{$_} } @$stoplist;			# need to put this back in somehow!
    # delete from @drugs too!!!!!!
    $self->{drugdata} = \%drugdata;
													# file should be sorted already (but it's not)
    $self->{drugnames} = [sort @drugnames];
	#print Dumper(\@drugnames);
	#exit;
}
sub drugLookup_binarySearchBased {
    my $self = shift;
    my $text = shift;
    my $drugnames = $self->{drugnames};
    my $start = 0;
    my $end = $#$drugnames;
    my $check;
	#printf STDERR "drugLookup on [%s] [%s]\n", substr($text,$start,40), $drugnames->[$#$drugnames];
    return undef if $text lt $drugnames->[0];
    return undef if $text gt $drugnames->[$#$drugnames];
    while( $start < $end ) {
        $check = $start + int(($end - $start) / 2);
        last if $check == $start || $check == $end;
        if(     $text le $drugnames->[$check] ) {
            $end = $check;
            next;
        }elsif( $text ge $drugnames->[$check] ) {
            $start = $check;
            next;
        }
        last;
    }
    printf "binary ended at %6d [%20s] for [%30s]\n", $check, substr($drugnames->[$check],0,20), substr($text,0,30);
    my $matchingChars = matchingCharCount($text, $drugnames->[$check]);
    return undef unless $matchingChars >= $SHORTEST_DRUG_NAME;
    my ($backwards, $forwards) = ($check, $check);
    my %possible;
    $possible{$drugnames->[$check]}++ if substr($text, 0, length( $drugnames->[$check] )) eq $drugnames->[$check];
    print "added check $drugnames->[$check]\n" if  substr($text, 0, length( $drugnames->[$check] )) eq $drugnames->[$check];
    while( 
           --$backwards >= 0 &&
           matchingCharCount($text, $drugnames->[$backwards]) >= max(0,$matchingChars) || 
           substr($text, 0, length( $drugnames->[$backwards] )) eq $drugnames->[$backwards] ) {
        $possible{$drugnames->[$backwards]}++ if substr($text, 0, length( $drugnames->[$backwards] )) eq $drugnames->[$backwards];
        #printf '%s and %s have %d matching chars, current matchcnt is %d%s', substr($text,0,10),$drugnames->[$backwards], matchingCharCount($text, $drugnames->[$backwards]), $matchingChars, "\n";
        print "added back $drugnames->[$backwards]\n" if  substr($text, 0, length( $drugnames->[$backwards] )) eq $drugnames->[$backwards];
        $matchingChars = max($matchingChars,matchingCharCount($text, $drugnames->[$backwards]));
    }
    print STDERR "WENT TOO FAR backwards!\n" if $backwards < 1;
    while( 
            $forwards <= $#$drugnames - 1 &&
            matchingCharCount($text, $drugnames->[++$forwards]) >= max(0,$matchingChars) || 
            substr($text, 0, length( $drugnames->[$forwards] )) eq $drugnames->[$forwards] ) {
        $possible{$drugnames->[$forwards]}++ if substr($text, 0, length( $drugnames->[$forwards] )) eq $drugnames->[$forwards];
        print "added forw $drugnames->[$forwards] ($forwards)\n" if  substr($text, 0, length( $drugnames->[$forwards] )) eq $drugnames->[$forwards];
        $matchingChars = min($matchingChars,matchingCharCount($text, $drugnames->[$forwards]));
    }
    print STDERR "WENT TOO FAR forwards!\n" if $forwards >= $#$drugnames - 2;
    if( scalar( keys %possible ) == 0 ) {
        return undef;
    }elsif( scalar( keys %possible ) == 1 ) {
        my @k = keys %possible;
        return $self->{drugdata}{$k[0]};
    }else{
		# return the longest
        my @k = sort {length($a) <=> length($b)} keys %possible;
        return $self->{drugdata}{$k[$#k]};
        #confess "found more than one possible drug matches for [$text]:", Dumper(\%possible);
    }
}
sub matchingCharCount {
    my ($a, $b) = @_;
    my $cnt = 0;
	return undef unless defined $a && defined $b;
    while( substr($a, $cnt, 1) eq substr($b, $cnt, 1) ) {
        $cnt++;
		last if $cnt > length $a || $cnt > length $b;
    }
    return $cnt;
}
sub applyConvenienceRules {
    my $self = shift;
    my $terminals = $self->{terminals};
    my $convenienceRules = $self->{convenienceRules};
	my %expansions;
	for my $ruleName ( keys %$convenienceRules ) {
		my $thingsToExpand = $convenienceRules->{$ruleName};
		for my $original (@$thingsToExpand) {
			my $expanded = $original;
			if( $ruleName eq 'dotsAfterLtrOk' ) {
				$expanded =~ s/(.)/$1\\./g;
			}elsif( $ruleName eq 'dotsAtEndOk' ) {
				$expanded =~ s/$/\\./;
			}elsif( $ruleName eq 'canBePlural' ) {
				$expanded =~ s/$/s/;
			}elsif( $ruleName eq 'plurDotAtEnd' ) {
				$expanded =~ s/$/s\\./;
			}else{
				confess "don't know how to handle convenience rule $ruleName";
			}
			push @{ $expansions{$original} }, $expanded;
		}
	}
    for my $terminalName ( keys %$terminals ) {
        my $terminal = $terminals->{$terminalName};
		my @newExpressions;
        for my $expression (@$terminal) {
			push @newExpressions, @{ $expansions{$expression} } if defined $expansions{$expression};
        }
		push @$terminal, @newExpressions;
    }
}
sub getDrugsFromText {
    my $self = shift;
    my $text = shift;
    my $includeAttributes = shift;  # to include report section and time and stuff
    my $tokens = $self->parse($text);
    return @$tokens;
}
sub min { $_[0] < $_[1] ? $_[0] : $_[1] }
sub max { $_[0] > $_[1] ? $_[0] : $_[1] }
1;
