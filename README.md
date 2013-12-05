MERKI 
=====
### The Medication Extraction and Reconciliation Knowledge Instrument

Original paper: 
[Extracting Structured Medication Event Information from Discharge
Summaries](http://www.ncbi.nlm.nih.gov/pmc/articles/PMC2655993/)
Sigfried Gold, Noémie Elhadad, Xinxin Zhu, James J. Cimino, and George Hripcsak

Demo site: [http://projects.dbmi.columbia.edu/merki/](http://projects.dbmi.columbia.edu/merki/)

[Citations](http://scholar.google.com/scholar?cites=12861617034331125757&as_sdt=20000005&sciodt=0,21&hl=en)
where you may find more effective parsers built more recently. If you
learn of any that are also open source, let me know!

[Distinguished paper award](http://www.amia.org/amia-awards/annual-conference-awards)

### MERKI Parser, Public Version, Documentation

Files:
    ParseMeds.pm            parser code module
    drugParseRules.yaml     parser rules.  can be edited if you understand regular expressions.
    druglist.tsv            list of drug names, CUIs and TTY for ingredients and brand names from RxNorm
    gpl.txt                 GPL3 license text
    parseFromPerl.pl        example of how to call the parser from a Perl script
    parseFromShell.pl       command line version.  run like:
                                echo "...tylenol 250mg po daily..." | perl parseFromShell.pl

MERKI was a sprawling, ambitious application I worked on during my time
as a student of Biomedical Informatics at Columbia University.  It's
purpose was to extract medication information from structured and
free-text patient data, standardize and condense it, and produce a
complete and concise listing of all medications mentioned in each
patient's electronic medical record.  The larger project was never
finished.  The current files are a portable subset that allow the
parsing of narrative clinical text for the extraction of structured
medication information.

The following two lines from parseFromShell.pl show how to use the
parser:

    my $drugs = $parser->twoLevelParse($input, 
        ['drug', 'possibleDrug', 'context'], 
        ['dose', 'route', 'freq', 'prn', 'date']);	
    print $parser->drugsToXML($drugs);

$parser->twoLevelParser goes over its input twice: once to extract
drugs, possible drugs, and contexts; and a second time to find, within
each drug or possible drug, the dose, route, frequence, prn and dates.
twoLevelParser returns a Perl data structure which can then be passed
to $parser->drugsToXML or $parser->drugsToHTMLTable in order to turn
it into something more directly usable.  Here is an example (taken from
bits of random clinical text, and not meant to be clinically plausible):

    unixshell$ echo "Discharge medications: Procardia XL 60 mg p.o. prn for severe wheezing, ferros sulfate 300 mg p.o. b.i.d., Cipro 250 mg p.o. q12hQ" | perl parseFromShell.pl
    <drugs>
        <drug>
            <drugName>Procardia XL</drugName>
            <dose>60 mg</dose>
            <route>p.o.</route>
            <prn>prn for severe wheezing</prn>
            <startChar>23</startChar>
            <endChar>69</endChar>
            <textLength>47</textLength>
            <when>after discharge</when>
            <context>Discharge meds</context>
            <surroundingText>discharge medications: [Procardia XL 60 mg p.o. prn for severe wheezing], ferros sulfate 300 mg p.o. b</surroundingText>
        </drug>
        <possibleDrug>
            <drugName>ferros sulfate </drugName>
            <dose>300 mg</dose>
            <route>p.o.</route>
            <freq>b.i.d.</freq>
            <startChar>72</startChar>
            <endChar>104</endChar>
            <textLength>33</textLength>
            <when>after discharge</when>
            <context>Discharge meds</context>
            <surroundingText>p.o. prn for severe wheezing, [ferros sulfate 300 mg p.o. b.i.d.], D1DDD 250 mg p.o. q12hq</surroundingText>
        </possibleDrug>
        <drug>
            <drugName>Cipro</drugName>
            <dose>250 mg</dose>
            <route>p.o.</route>
            <freq>q12</freq>
            <startChar>107</startChar>
            <endChar>127</endChar>
            <textLength>21</textLength>
            <when>after discharge</when>
            <context>Discharge meds</context>
            <surroundingText>s sulfate 300 mg p.o. b.i.d., [Cipro 250 mg p.o. q12]hq</surroundingText>
        </drug>
    </drugs>

To understand how the parser decides what counts as a drug, a possible
drug, a context, a dose, route, etc., look at these tokens in
drugParseRules.yaml.  The parser itself (ParseMeds.pm) treats context
tokens differently than drugs and possible drugs.  Any context token
found becomes  the context attribute of all drugs and possible drugs
following it, until another context is found.

Notice that "ferros sulfate" ("ferrous sulfate" misspelled) appears as
a possible drug rather than as a drug.  Since it is misspelled, it is
not found in the drug lexicon, but it is still identified as a possible
drug because it appears before a dose, route, and frequency.  (Look at
the definition of possibleDrug in drugParseRules.yaml.)

This application is far from perfect, and if you do find it worth using,
there is a good chance you will want to modify it for your own uses.

Changing the drug lexicon should be fairly straightforward.  You can
add, delete, or change entries as you like, or use an entirely different
lexicon.  If you change the format of the lexicon, you may need to
change aspects of the parser that load and look up drugs.

You may want to change the parsing rules to catch drug phrases that the
current set of rules won't catch, or, alternatively, to make the rules
more conservative to prevent false positives.  You'll need to understand
the basics of the YAML format (or just follow the example of the current
drugParseRules.yaml file), and, more importantly, you'll need to
understand Perl regular expressions and the special way that the parsing
rules are processed.  I'll explain how the parsing rules are processed
now.

Tokens are divided into terminals and non-terminals.  Tokens of either
sort are transformed by the parser into single Perl regular expressions.
The difference is that non-terminals can include terminals and other
non-terminals in their definition.  You'll also notice that the way they
are written is slightly different, but that is just to make them more
readable.  Also, terminals can include literal text, but non-terminals
cannot (because they try to interpret literal text as a reference to
another token.)

Terminals are made up of a name followed by a list of expressions or
pieces of literal text.  Take, for instance, the terminal cond:

    cond:   [ud, ut dict, prm-breakthrough, '(were|was) held', discontinued, "dc'd"]

This will be converted into the (approximately) following regular expression:

    /(ud|ut dict|prn-breakthrough|(were|was) held|discontinued|dc\'d)/

Actually, two other options will be added to the list of strings it will
match: "u\.d\." and "ut dict\."  This is because the convenience rule
dotsAfterLtrOk includes "ud" and the convenience rule dotsAtEndOk
includes "ut dict".

The terminal cond is used in the non-terminal prn:

    - name: prn
      patterns:
        - 'asNeeded\s*qualifier'
        - '(cond|asNeeded)'

This translates into "prn" or "as needed" (that's how "asNeeded" is
defined) followed by a qualifier (something like "for severe pain"), OR
something that matches the cond token, OR something that matches the
asNeeded token.  Generally you will see the parsing rules composed
such that more specific, longer expressions appear before less specific,
shorter expressions.  This is because the first expression matched will
be kept and subsequent expressions will not be tried.

Finally, you may also want to modify the parsing code itself, but that
code is not documented and may be hard to understand.

If you do make changes, or even if you use the code at all, I would very
much appreciate hearing from you.  I may be able to offer assistance,
and I may be able to make your improvements available to others.

Contact [Sigfried Gold](http://sigfried.org) with questions.
