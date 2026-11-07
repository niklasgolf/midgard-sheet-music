# midGard Sheet Music — Music Theory and Architecture

This document is the working reference for the musical ideas and software architecture of **midGard Sheet Music**. It is written for someone learning music theory and software design at the same time.

Four kinds of statement appear here, and they are not the same thing:

| Kind | Meaning |
|---|---|
| Implemented | The application does this today |
| Decided | We have chosen this design, whether or not the code exists yet |
| Planned | We intend to build this, and the design is still open to the next investigation |
| Open | We have not chosen an answer |

The next task is a planning-only investigation of VexFlow and a numbered master development plan. That plan is not written in this file.

## 1. A Song and a measure are different things

**Song.** The complete musical composition. One Song is one record in IndexedDB. It holds the imported performance, the written interpretation, and the identity of the piece.

**Measure**, also called a bar. An independent graphical unit rendered from part of a Song. It is a small, self-contained piece of sheet music on the page. It is not a second Song, and it is not its own database record.

A Song of 45 measures produces 45 independent graphical measure units. The database still contains one Song.

Those two words stay separate throughout this document. “The Chopin Song” means the whole prelude in IndexedDB. “Bar 0” and “Bar 1” mean two graphical measures drawn from the opening of that Song.

## 2. One Song is one IndexedDB document

**ONE SONG = ONE COMPLETE MUSICAL DOCUMENT IN INDEXEDDB.**

The database is named `midgard-sheet-music`. It has one object store, `songs`. Each record is one complete Song, with three conceptual parts kept side by side:

| Part | Role | Examples |
|---|---|---|
| A — Metadata | Which piece this is, and where it came from | Identity, title, composer, original MIDI filename |
| B — Original MIDI | The parser’s result, preserved as imported | Notes, ticks, tracks, tempo, whatever the parser actually kept |
| C — Musical interpretation | What we later decide the written music means | Time signature, key, pickup, ticks per written quarter, and later corrections |

All three parts belong to the same record. Measures, notes, tracks, and corrections do not get object stores of their own.

Adding another composition creates another Song in `songs`. That must not require a new TypeScript constant for each title. The program knows how to store a Song. It does not know a private code path for one prelude.

Once a Song has been imported, ordinary reading, editing, and rendering use the IndexedDB copy. The MIDI file on disk remains the external source. The page does not parse that file again every time it is drawn or a setting is saved.

IndexedDB is local to one browser, one site origin, and one browser profile. The origin is the protocol, the hostname, and the port together. Two browsers open on `http://localhost:5173` still keep two separate databases. The store does not follow a person to another computer. It is not a backup. Clearing the browser’s site data removes it.

A Song is a logical document. It is not necessarily a file on disk. A portable export may come later. Its format is not chosen.

## 3. The three parts of a Song

### Part A — Metadata

Metadata identifies the Song. It is not the music.

- Song ID
- Title
- Composer
- Original MIDI filename
- Later, other composition-level description, such as a catalog number or a note about the edition

Song Settings can change the title and the composer. That change does not rename the source MIDI filename. The filename stays the name of the file that was imported.

### Part B — Original MIDI

Part B is the complete structured result of our MIDI parser, kept as it was imported.

A Standard MIDI file is a list of performance events. It records that a key went down, which key it was, how strongly it was struck, and when it was released. That is closer to a recording of actions at a keyboard than to a printed score.

The parser in `src/midi/` is a general importer. It returns structured MIDI information. It does not know about IndexedDB, about one Chopin prelude, or about how a score should be drawn. We do not change the parser in order to “fix” one piece. The file on disk stays immutable. Editing a Song does not rewrite it.

What our parser actually preserves, and what Part B therefore holds, includes:

- MIDI format
- Track count
- PPQ, the number of ticks per MIDI quarter note, or a report that the file uses SMPTE timing instead
- Track names
- Paired notes: MIDI note number, start tick, end tick, duration, velocity, release velocity, channel, and track
- Tempo events
- Time-signature events, when the file contains them
- Key-signature events, when the file contains them
- Warnings for channel and meta events the parser counted and did not turn into notes

The Chopin file’s control changes and sequencer-specific meta events are in that last group. The parser records that they were skipped. It does not keep each of those events as its own structured object. Part B cannot later recover bytes the parser never returned.

Part B is not overwritten when someone corrects the notation. A decision about barlines, spelling, or a written quarter note does not erase the imported ticks.

### Part C — Musical interpretation

Part C is the musical information added or corrected after import. It is editable, and it is saved in the same Song.

A MIDI tick is a count inside the file. A written note value, such as a quarter note, is a decision about what that count means on the page. Both accounts remain: what the file said, and what we later decided.

**Implemented in Song Settings:**

| Setting | What is stored |
|---|---|
| Time signature | Numerator and denominator |
| Key signature | Tonic and mode, such as A major. The sharp or flat count is shown on screen and follows from that pair. It is not stored a second time. |
| Pickup, also called an anacrusis | Whether the piece has one |
| Pickup duration | A written value: sixteenth, eighth, quarter, or half note. Not a tick count. |
| Ticks per written quarter | A positive number, which may include a decimal. How many MIDI ticks last as long as one written quarter note. |

The page does not fill these in from the PDF or from PPQ. Until they are saved, the fields stay empty or unselected.

**Not stored yet, and intended for Part C later:**

- Measure boundaries, if we decide to save them rather than only derive them
- Written durations of individual notes
- Voices
- Rests
- Ties and other relationships between notes
- Enharmonic spelling
- Other corrections to how an imported note is understood

Song Settings writes the fields it owns and leaves any other interpretation properties in place. A future Music Editor will add the note-level fields. Neither one replaces Part B.

The opening barlines used by the current SVG are calculated when the page is drawn. They are products of the time signature, the pickup duration, and ticks per written quarter. They are not Chopin-specific numbers written into the renderer, and they are not a separate database record.

### PPQ and a written quarter

PPQ means ticks per **MIDI** quarter note. It does not mean ticks per **written** quarter note. A file can use a MIDI quarter that is a different length from the quarter note printed in the score.

In the Chopin file, PPQ is 1000, so one MIDI quarter is 1000 ticks. The only tempo event makes that MIDI quarter last one second. The printed music is in 3/4, and the investigation of the opening showed a written quarter of about 666.67 MIDI ticks, which is two-thirds of a MIDI quarter. Three written quarters then last 2000 ticks. That is why a full 3/4 bar is not `3 × 1000`.

The setting “ticks per written quarter” records that relationship in Part C. The renderer uses the saved number. It does not assume that PPQ and the written quarter are the same.

## 4. The database as it exists today

| Setting | Value |
|---|---|
| Database name | `midgard-sheet-music` |
| Database version | 1 |
| Object store | `songs`, with `id` as the key |
| TypeScript model | `Song` in `src/song/song.ts` |
| Database module | `src/song/song-database.ts` |

`Song` has `id`, `schemaVersion` (currently 1), `metadata`, `originalMidi`, and `musicalInterpretation`. `originalMidi` is the parser’s own `MidiFile` type. The parser result is plain data, so IndexedDB structured clone can store it.

The page asks IndexedDB for `chopin-prelude-op-28-no-7`. If that record is missing, `src/song/import-chopin-song.ts` parses `midi-files/chopin-prelude-op-28-no-7-in-a-major.mid`, builds the Song, and inserts it. If the record is already there, the page loads it and does not write again. A reload does not overwrite or duplicate the Song. The MIDI file is used only for that first insert.

Song Settings updates the existing id with `replaceSong`. The write keeps the id, the schema version, the source filename, and the original MIDI. It does not insert a second Song.

The same store can hold other compositions with the same shape:

| Record | Composition |
|---|---|
| Song 1 | Chopin — Prelude Op. 28 No. 7 |
| Song 2 | Chopin — Prelude Op. 28 No. 4 |
| Song 3 | Beethoven — Für Elise |

There is still no general file-picker import and no portable Song file.

### How a Song moves

**Import.** The parser reads a Standard MIDI file and returns structured information. It does not invent barlines or spelling. Today this runs for the first Chopin file, and only when its Song is missing. A general file picker is planned.

**Create.** The application builds one Song. Part A receives the title, composer, and source filename. Part B receives the parsed MIDI. Part C starts empty. The Song is inserted into `songs`. This is implemented.

**Read.** The page loads that record and uses it for the storage status, Song Settings, the text note panel, and the SVG experiment. A reload takes this path. This is implemented.

**Interpret.** Song Settings can change the composition-wide fields and save them. The Music Editor, for individual notes, is not implemented. Measure boundaries are derived for drawing. They are not stored as a list of ticks.

**Render.** The text panel reads stored notes inside a temporary tick window. The SVG experiment reads the same Song and draws Bar 0 and Bar 1 when the required settings exist. It does not open the MIDI file, and it does not store the picture.

## 5. Song Settings and the Music Editor

These are two interfaces. They edit the same Song. They do different jobs.

### Song Settings

Song Settings prepares a newly imported composition, and it stays available later. It is implemented.

- Song title
- Composer
- Time signature
- Key signature
- Pickup, yes or no
- Pickup duration, when the pickup is yes
- Ticks per written quarter

Save Changes validates the form, writes Part A and Part C, reads the Song back, and redraws the page. No restart is required. A reload restores the saved choices. The original MIDI is checked and left unchanged.

### Music Editor

The Music Editor is a future workstation for inspecting and editing individual measures and notes. It is not implemented.

It will be able to work on:

- Written note durations
- Rests
- Voices
- Ties
- Note corrections
- Enharmonic spelling
- Other musical relationships

Those edits belong in Part C. They must not overwrite Part B.

## 6. Store musical meaning, generate SVG

**STORE MUSICAL MEANING, GENERATE SVG.**

The same note can be described in two ways.

Musical information, stored in the Song, answers musical questions:

- Which pitch is played?
- When does the note begin, and how long does it last?
- Which other notes sound together with it?
- Which voice, or which hand, does it belong to?
- Which measure contains it?
- How is it spelled, when we have made that decision?

Visual information answers drawing questions:

- Which SVG elements are on the page?
- Where are they, in the coordinate system of that measure?
- Which staff line a notehead sits on?
- What shape is a notehead, which way a stem goes, and how far apart the symbols are?

IndexedDB stores MIDI information, musical interpretation, and editable notation decisions. It does not store SVG markup, notehead coordinates, staff-line positions, pixel dimensions, or generated paths. The renderer derives those from the Song and from its own engraving rules.

If the authoritative record were a picture of staves, the midGard renderer would have to recover the music by reading someone else’s drawing. Both notations would be trapped inside traditional staff geometry.

Some decisions sit close to notation and are still musical meaning. Enharmonic spelling is one. C♯ and D♭ can be the same piano key, and the same MIDI note number 61, while remaining different names in a key. Storing “this note is spelled C♯” in Part C records a musical decision. It does not tell the traditional renderer where to put a notehead, and it does not tell the midGard renderer to draw a notehead at all.

## 7. One measure, one div, one SVG

**ONE MEASURE = ONE HTML DIV = ONE COMPLETE SVG.**

This is a fixed requirement for traditional piano notation.

```html
<div class="measure">
  <svg>
    <!-- Both piano staves and all notation for this measure -->
  </svg>
</div>
```

For piano, that one SVG contains the treble staff and the bass staff, and every symbol that belongs to the measure. A label such as “Bar 0” may sit in HTML outside the SVG. The measure div itself contains exactly one SVG.

If a Song contains 45 measures, the renderer creates 45 of these divs.

The whole composition is not one enormous SVG. The right hand and the left hand are not two SVGs. A measure does not contain several SVGs for several kinds of symbol.

This is a rule for the picture. It is not a rule for the database. The Song remains one IndexedDB record, however many measure divs the page builds.

A note is selected for a measure when its onset satisfies `startTick <= note.startTick < endTick`, after the span’s edges are rounded to whole ticks. The stored end of the note stays intact. The current experiment does not draw ties, so a note that rings into the next measure appears in the measure where it begins.

## 8. Musical graphics are SVG

The traditional notation engine uses **SVG exclusively** for musical graphics.

Allowed inside a measure SVG:

- Lines
- Paths
- Ellipses
- Polygons
- Text, where a musical symbol or label is genuinely text
- Groups and transformations
- Vector music glyphs
- Definitions and reusable symbols

HTML and CSS belong to the application around those pictures. They arrange the page, the parchment, Song Settings, and the measure divs. They do not stand in for noteheads, stems, or staff lines.

Musical rendering does not use HTML Canvas, rasterized musical symbols, PNG or JPEG noteheads, HTML elements positioned to imitate symbols, or any renderer that requires Canvas. The finished traditional engine does not depend on VexFlow’s Canvas renderer.

The first experiment already follows the SVG rule in a small way: staff lines, ledger lines, and filled elliptical noteheads are SVG. Clefs, stems, and the rest are not drawn yet.

### Glyphs, fonts, and export

Professional music fonts, including SMuFL fonts, are a possible source of clefs, noteheads, rests, and other symbols. How they enter the SVG is still open. Two representations have to stay distinct:

- **SVG text** that asks the browser to draw a glyph from a music font. The SVG is compact. A later viewer needs that font, or an embedded copy of it, or the glyph will not look the same.
- **SVG paths** that contain the outline of the glyph. The picture carries its own shapes. A single measure can be exported as a self-contained SVG without asking another program to supply the font.

Either choice can still be SVG-only on the page. They differ when a measure is saved or copied as a file. The choice is an open question for the next investigation. Any font we use has to be checked for its own license.

## 9. Our own engraving engine

We want traditional engraving of a quality comparable to VexFlow and to the printed score. We are not adopting VexFlow’s architecture as the architecture of this application.

The engine is designed around:

- The IndexedDB Song
- Independent measures
- One SVG per measure
- Our own rendering modules
- Our own div layout manager
- Future musical editing

It should stay modular enough to read. A final directory tree is not fixed here. That waits until the VexFlow reference has been studied.

These are responsibilities the engine will need. They are capabilities, not a claim that the code exists:

| Area | What it will eventually decide |
|---|---|
| Staff geometry | Where the five lines of each staff sit inside the measure SVG |
| Clefs, key signatures, time signatures | The symbols at the start of a staff, from Part C and from engraving rules |
| Noteheads and ledger lines | Pitch mapped onto staff positions |
| Stems, flags, beams | How a written duration is drawn, once Part C knows that duration |
| Rests, accidentals, augmentation dots | Symbols for silence, spelling, and dotted values |
| Ties and slurs | Connections between notes, including connections that leave the measure |
| Dynamics, articulations, fingering | Marks that are musical data and also typography |
| Rhythmic spacing | How much horizontal room each written value receives |
| Collision avoidance | How nearby symbols move so they remain readable |
| Musical typography | The consistent look of the whole engraving |

The current experiment covers staff lines, simple elliptical noteheads, and ledger lines for Bar 0 and Bar 1. Everything else in the table is ahead of us.

## 10. VexFlow is a reference, not the runtime

A local copy of the VexFlow source is kept at `reference/vexflow-master/`. It is research material. It is not imported by the application, and it is not part of the production build.

We will read it gradually to learn how professional engraving works:

- Engraving algorithms
- Staff geometry
- Music fonts and SMuFL
- Glyph placement
- Note positioning
- Stems and beams
- Rhythmic spacing
- Voices and tick contexts
- Collision avoidance
- How a renderer is divided into parts

An earlier look at the upstream project found an MIT license on the code and separate licenses on the music fonts. Before any code or font is reused, we inspect the license in this local copy and keep the notices and attribution it requires. A font is checked on its own terms. Reuse is allowed only where those licenses allow it.

VexFlow’s internal architecture is a source of ideas. It is not assumed to fit this application. Our Song model and our independent-measure SVG rule take priority. Where VexFlow draws a whole system through one context, including a Canvas context, we still draw one SVG per measure and we do not take the Canvas path.

## 11. Engraving and page layout are separate

Two responsibilities stay apart.

### The SVG engraving engine

The engraving engine receives the musical information for one measure. It produces exactly one SVG containing the complete notation for that measure.

It does not decide where that measure sits on the page, which row it belongs to, or how large the margin around the page is.

### The div layout manager

The layout manager receives measure divs that have already been rendered. It controls:

- Horizontal arrangement
- Spacing between measures
- Rows and systems
- Alignment
- Margins
- Page breaks
- Pagination
- Responsive behavior

The layout manager does not draw notes.

A measure can be drawn again without drawing every other measure again. Some edits still force more work. A change to rhythmic spacing, a tie into the next bar, or the width of a system can require the neighbors, or the whole system, to be arranged again. The split between the two responsibilities makes that choice explicit. It does not pretend that every edit is local.

The page today places Bar 0 and Bar 1 in a centered flex row, with Bar 0 narrower because its musical span is shorter. That row is a small layout for the experiment. It is not yet the layout manager described above.

## 12. Notation that crosses from one SVG into the next

Independent SVGs make some ordinary notation a design problem. The problems are real, and they are solvable. They have to be designed on purpose.

Examples:

- A tie that crosses a barline
- A slur that covers several measures
- A hairpin that grows across a system
- The two staves of a piano system staying aligned from measure to measure
- Rhythmic spacing that still looks even across a row of separate SVGs
- A system break, where a musical line continues on the next row
- A clef or key signature that changes at a barline

A possible later design is a shared planning stage before any SVG is built. That stage would calculate geometry for a system, then decide which part of a crossing symbol belongs to which measure. A tie across a barline could be two coordinated SVG curves, one in each measure, that meet at the shared edge. The musical fact, “these two written notes are tied,” would still live in Part C. The curves would be generated.

This planning stage is not implemented. The current experiment does not draw ties, slurs, or hairpins.

The same musical situation already exists in the data, apart from the picture. A sounding note can start in one measure and still be held in the next. In print that is often a tie. In MIDI it may be one long note, or a note-off followed by a new note-on. Part B keeps the imported interval. Part C will record which written meaning we chose. The renderer will then draw that meaning, including a tie that has to leave one SVG and enter the next.

## 13. Two notation systems read one Song

The application has three layers. The Song is the middle one.

```text
Layer 1   MIDI import          read a file, return structured events
Layer 2   Song and IndexedDB   one document: import plus interpretation
Layer 3   Notation systems     3A traditional, 3B midGard
```

Layer 1 is the parser. Layer 2 is the authoritative musical store. Layer 3 only reads Layer 2. Neither notation system defines the Song.

### 3A — Traditional Sheet Music

3A is conventional Western notation: staves, clefs, noteheads, stems, beams, rests, barlines, and the other familiar symbols. A pianist who knows ordinary notation should be able to read it.

3A uses our own SVG engraving engine, with one SVG per measure. The first experiment has started that engine. It has not finished it.

### 3B — midGard Sheet Music

3B is a future notation with its own graphical rules. It is not a restyling of 3A. The same composition might look so different that an experienced pianist would not immediately recognize it. 3B reads the same Song and the same musical interpretation. It must not depend on the traditional engraving engine. It is not required to use five-line staves. Its rules are not defined in this document.

The two systems are like one poem written once in Greek and once in Latin. The meaning can be the same while the letters and the layout are not. They share musical meaning. They do not have to share graphics or layout algorithms.

## 14. The Chopin prelude, our first Song

The first repertoire is classical piano. The first Song is Frédéric Chopin’s Prelude Op. 28 No. 7 in A major. A MIDI performance and a PDF of the printed score let us compare a keyboard recording with what a musician reads.

### What the MIDI file contains

These facts are in the file, and after the first visit they are Part B of the stored Song:

| Fact | Value |
|---|---|
| MIDI format | 1 |
| Tracks | 3 |
| PPQ | 1000 ticks per MIDI quarter note |
| Tempo | One event, at tick 0: 1,000,000 microseconds per MIDI quarter |
| Paired notes | 176 |
| Time-signature event | none |
| Key-signature event | none |
| Track 1 | `chopin-prelude-7`, the conductor track, no notes |
| Track 2 | `Main droite`, the right hand |
| Track 3 | `Main gauche`, the left hand |

Pitch names in our displays use the scientific convention in which MIDI note 60 is C4. The file stores note numbers. Sharps in the tables below are an A-major reading of those numbers, matching the printed key. The file itself does not spell them.

### What the printed PDF shows

The PDF is the score, not the MIDI file. Its opening shows:

- A major, three sharps
- 3/4 time
- A quarter-note pickup: E in the treble, a rest in the bass
- Then a full bar whose melody begins with a dotted eighth and a sixteenth, over a quarter-note bass note

That printed meter and that printed pickup are interpretation. They belong in Part C after someone saves them. The application does not insert them by itself.

### Written quarters and the opening bars

The timing investigation compared the PDF rhythms with the parsed ticks. With a written quarter of about 666.67 MIDI ticks, a quarter-note pickup and a 3/4 bar fall on these spans. The edges below are the rounded tick labels. The calculation itself keeps the fractional ticks and rounds only when it selects notes or prints a label.

| Measure | Start tick | End tick |
|---|---:|---:|
| Bar 0 — pickup | 0 | 667 |
| Bar 1 | 667 | 2667 |
| Bar 2 | 2667 | 4667 |

These spans are what the saved settings produce when the time signature is 3/4, the pickup is a quarter note, and ticks per written quarter is 666.67. They are not constants inside the renderer. Bar 2 follows the same rule and is not drawn yet.

The same spacing continues through most of the prelude. Near the end, the ticks leave that grid. A single calibration does not by itself describe those final bars. That remains an open musical question.

### The old nine-note window

The text panel still shows notes that start at tick 0 up to, but not including, tick 2000. That window is a temporary development view in `src/main.ts`. It is not a saved measure. It mixes the pickup with part of Bar 1, and it stops before the chord at tick 2000, which belongs to Bar 1.

| MIDI | Pitch | Start | End | Track |
|---|---|---:|---:|---:|
| 64 | E4 | 0 | 667 | 2 |
| 73 | C♯5 | 667 | 1167 | 2 |
| 40 | E2 | 667 | 1333 | 3 |
| 74 | D5 | 1167 | 1333 | 2 |
| 62 | D4 | 1333 | 1999 | 2 |
| 68 | G♯4 | 1333 | 1999 | 2 |
| 71 | B4 | 1333 | 1999 | 2 |
| 52 | E3 | 1333 | 1999 | 3 |
| 64 | E4 | 1333 | 1999 | 3 |

Notes that start on the same tick sound together. At tick 1333 the right hand starts D4, G♯4, and B4, and the left hand starts E3 and E4. The text panel writes those groups as `[D4 G#4 B4]` and `[E3 E4]`. At tick 667, C♯5 and E2 start together in different hands. They are simultaneous. They are not one single-hand chord. Each of these notes has velocity 70.

The parser was right to report E4 from tick 0 to tick 667. The early mistake was to call the window that starts at tick 0 the first full measure. The pickup is an interpretation in Part C. The imported ticks stay in Part B.

## 15. The first SVG experiment

Under the heading **Traditional Sheet Music — SVG Experiment**, the page draws two measures when Song Settings has a time signature, a pickup duration, and ticks per written quarter. If any of those is missing, the section says so. It does not silently use PPQ.

With the Chopin calibration saved, the pictures are:

**Bar 0, the pickup.** Both staves. One MIDI note, E4, on the treble staff. The bass staff has no note from the file.

**Bar 1, the first complete measure.** Both staves. Thirteen MIDI note events: C♯5 at 667, D5 at 1167, the right-hand chord D4 G♯4 B4 at 1333 and again at 2000, the left-hand E2 at 667, and the left-hand E3 E4 at 1333 and again at 2000.

The measures read `originalMidi` and `musicalInterpretation` from the stored Song. They sit side by side, Bar 0 on the left and narrower, Bar 1 on the right. Each has its own HTML container and exactly one SVG. The SVG uses staff lines, ledger lines, and filled elliptical noteheads. Right-hand pitches use treble positions. Left-hand pitches use bass positions. The hand comes from the stored track name. On a narrow screen the two measures stack.

The experiment does not yet draw:

- Clef symbols
- Noteheads from a music font
- Stems, flags, or beams
- Rests
- Accidentals
- Ties
- Professional horizontal spacing

None of those should be described as present.

## 16. The first professional target

Before engraving the whole prelude, Bar 0 and Bar 1 are the complete two-measure example. The goal is for those two measures to look like professionally engraved piano notation, comparable to VexFlow and to the printed PDF.

That goal does not delete or shorten the Song. All 176 notes remain in IndexedDB. The renderer selects the first two measures for this experiment. The engine stays general: another Song, or a later measure of this one, must be drawable without a new piece of Chopin-specific code.

The numbered steps that get from the current ellipses to that engraving will be proposed in the next investigation. They are not listed here.

## 17. What works today, and what does not

Implemented:

- A Vite application in vanilla TypeScript, without a user-interface framework
- A centered parchment page, with a deep blue background on both sides
- The Standard MIDI parser in `src/midi/`
- A terminal command that prints the notes starting in ticks 0–2000
- That same temporary slice on the parchment page, grouped by the stored track names
- The original Chopin PDF, shown below the experiment for comparison
- IndexedDB database `midgard-sheet-music`, version 1, with one `songs` store
- Import of the Chopin prelude as Song `chopin-prelude-op-28-no-7` when that id is absent, and loading it on later visits without parsing or overwriting it
- A storage status panel whose facts come from the stored Song
- Song Settings, saved into that Song
- An experimental SVG of Bar 0 and Bar 1, one SVG per measure, drawn from the stored Song
- A local copy of the VexFlow source, kept for study and not used as the renderer

Not implemented:

- A general MIDI file picker
- The Music Editor
- Stored measure boundaries, ties, voices, rests, and spelling
- Clefs, music-font glyphs, stems, beams, rests, accidentals, and professional spacing
- The div layout manager as a separate stage from engraving
- A shared plan for ties, slurs, and other symbols that cross measure SVGs
- The rest of traditional notation, 3A
- midGard notation, 3B
- Playback and a portable Song file

## 18. Architectural principles

1. One Song is one complete musical document in IndexedDB.
2. A measure is a graphical unit rendered from part of a Song, not a separate database record.
3. Every Song contains its own imported MIDI information, and that information is preserved unchanged.
4. Every Song contains its own editable musical interpretation, saved beside the import.
5. Adding another Song must not require song-specific application code.
6. After import, editing and rendering read the Song from IndexedDB.
7. Musical meaning is stored. SVG is generated.
8. One measure is one HTML div and one complete SVG, with both piano staves inside it.
9. Musical graphics are SVG. The page around them may be HTML and CSS.
10. The engraving engine draws one measure. The layout manager places measure divs.
11. Traditional notation and midGard notation read the same Song and do not define it.
12. VexFlow is a reference. Our Song and our measure SVG come first.
13. MIDI parsing, musical editing, storage, engraving, and layout remain separate responsibilities.
14. The system grows by small steps that can be seen, compared with the score, and kept.

We compare an interpretation with the original PDF before treating it as settled. We do not add a dependency or an abstraction until it has a clear job.

## 19. The next investigation

The next task is planning only. It will inspect:

- The current application architecture
- The existing SVG renderer
- The IndexedDB Song model
- The VexFlow reference source
- Relevant music-font resources
- The original Chopin PDF

It will then propose a detailed, numbered development plan. This README does not contain that plan.

Each implementation step in the future plan should be small enough to:

1. Implement it.
2. Inspect the SVG visually.
3. Compare it with the printed PDF.
4. Correct any problems.
5. Commit the completed step.
6. Proceed to the next step.

The first target of that work is the professional engraving of Bar 0 and Bar 1, with the rest of the Song left intact in IndexedDB.

## 20. Open questions

These questions are deliberately unanswered. The master-plan investigation should take them up. It does not have to close them all before the first engraving step.

Music and interpretation:

- How should MIDI timing become written durations where the performance leaves the tick grid, especially in the final bars of this prelude?
- How should a note that crosses a barline be stored: as one sounding event, as two tied written notes, or as both?
- How should musical voices be represented when one hand plays more than one line?
- How should rests be inferred when the MIDI file simply has silence?
- Which decisions belong in the shared Song, and which belong only to 3A or only to 3B?
- How should manual corrections survive if the same MIDI file is imported again?
- What will midGard notation look like?

Engraving and layout:

- How should professional music glyphs be integrated?
- Should those glyphs be SVG paths, or SVG text that uses a SMuFL font?
- How can each measure SVG be exported on its own?
- How should ties and slurs cross the boundary between two SVGs?
- How should the div layout manager align staves from measure to measure?
- How should measure widths be calculated?
- How should rhythmic spacing work inside a measure and across a system?
- How should the renderer draw multiple voices?
- How can one edited measure be rendered again without redrawing the whole Song?
- How should the Music Editor talk to the renderer?

Storage and the life of a Song:

- How should Song IDs be generated?
- How should the Song schema be versioned as Part C grows, and how should migrations update Songs saved by an older version?
- How do we preserve imported events that the parser does not yet fully interpret, so a later parser can still see them?
- How should a very large composition be stored and loaded?
- How should an edit be validated before it is saved?
- What should a portable Song export contain?

This README is a living reference. We extend it when a decision becomes settled, when an experiment starts to work, and when a comparison of the MIDI with the PDF teaches us something we did not know. The aim is a working application, and a clear account of how one Song can hold a whole piece of music while the page draws that piece as many independent measures.
