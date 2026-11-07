# midGard Sheet Music — Music Theory and Architecture

This document is the working reference for the musical ideas and software architecture of **midGard Sheet Music**. It is written for someone learning music theory and software design at the same time.

Four kinds of statement appear here, and they are not the same thing:

| Kind | Meaning |
|---|---|
| Implemented | The application does this today |
| Decided | We have chosen this design, whether or not the code exists yet |
| Planned | We intend to build this, and the design is still open to the next investigation |
| Open | We have not chosen an answer |

The application now keeps more than one Song, draws up to seventeen measures, and lays the page out with CSS Grid. Ties across measures are a decided design. They are not drawn yet.

## 1. A Song and a measure are different things

**Song.** The complete musical composition. One Song is one record in IndexedDB. It holds the imported performance, the written interpretation, and the identity of the piece.

**Measure**, also called a bar. An independent graphical unit rendered from part of a Song. It is a small, self-contained piece of sheet music on the page. It is not a second Song, and it is not its own database record.

A Song of 45 measures produces 45 independent graphical measure units. The database still contains one Song.

Those two words stay separate throughout this document. “The Chopin Song” means one whole prelude in IndexedDB. “Bar 0” means the pickup drawn from that Song. “Bar 1” means the first complete measure. The current experiment draws Bar 0 through Bar 16 when the Song’s settings allow it.

Two files of the same prelude are two Songs. They do not share a record, even when the printed pages look alike.

## 2. One Song is one IndexedDB document

**ONE SONG = ONE COMPLETE MUSICAL DOCUMENT IN INDEXEDDB.**

The database is named `midgard-sheet-music`. It has one object store, `songs`. Each record is one complete Song, with three conceptual parts kept side by side:

| Part | Role | Examples |
|---|---|---|
| A — Metadata | Which piece this is, and where it came from | Identity, title, composer, original MIDI filename, PDF filename when the import stored one |
| B — Original MIDI | The parser’s result, preserved as imported | Notes, ticks, tracks, tempo, whatever the parser actually kept |
| C — Musical interpretation | What we later decide the written music means | Time signature, key, pickup, ticks per written quarter, and later the written notes and ties |

All three parts belong to the same record. Measures, notes, tracks, and corrections do not get object stores of their own.

The Song Library reads every record in `songs`. It is not a hardcoded list of titles. Adding another composition creates another Song. That must not require a new TypeScript constant for each title. The program knows how to store a Song. It does not know a private code path for one prelude.

The two Chopin files shipped with this project are imported by `src/song/project-songs.ts` only when their ids are missing. An existing record is not rewritten. A reload does not duplicate it. There is still no general file picker.

Once a Song has been imported, ordinary reading, editing, and rendering use the IndexedDB copy. Choosing a Song in the library does not parse its MIDI file again. The MIDI file on disk remains the external source.

IndexedDB is local to one browser, one site origin, and one browser profile. The origin is the protocol, the hostname, and the port together. Two browsers open on `http://localhost:5173` still keep two separate databases. The store does not follow a person to another computer. It is not a backup. Clearing the browser’s site data removes it. Nothing in this document assumes that a particular browser already contains saved Song Settings.

A Song is a logical document. It is not necessarily a file on disk. A portable export may come later. Its format is not chosen.

## 3. The three parts of a Song

### Part A — Metadata

Metadata identifies the Song. It is not the music.

- Song ID
- Title
- Composer
- Original MIDI filename
- PDF filename, when this import stored one
- Later, other composition-level description, such as a catalog number or a note about the edition

Song Settings can change the title and the composer. That change does not rename the source MIDI filename, and it does not remove a stored PDF filename. The MIDI filename stays the name of the file that was imported.

A Song imported before PDF filenames existed can still find its project PDF through the project catalog. The catalog is a lookup for the files shipped with this application. It is not a second database.

### Part B — Original MIDI

Part B is the complete structured result of our MIDI parser, kept as it was imported.

A Standard MIDI file is a list of performance events. It records that a key went down, which key it was, how strongly it was struck, and when it was released. That is closer to a recording of actions at a keyboard than to a printed score.

One MIDI note is one sounding event:

- a pitch, stored as a MIDI note number
- an onset, the tick when the key went down
- an end tick, when the key was released
- a duration, the difference between those ticks
- the track, channel, and velocities the parser kept

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

Control changes and sequencer-specific meta events are in that last group when the file contains them. The parser records that they were skipped. It does not keep each of those events as its own structured object. Part B cannot later recover bytes the parser never returned.

Part B is not overwritten when someone corrects the notation. A decision about barlines, spelling, a tie, or a written quarter note does not erase the imported ticks.

### Part C — Musical interpretation

Part C is the musical information added or corrected after import. It is editable, and it is saved in the same Song.

A MIDI tick is a count inside the file. A written note value, such as a quarter note, is a decision about what that count means on the page. Both accounts remain: what the file said, and what we later decided.

A written note is not the same object as a MIDI note.

A MIDI note answers: which key, when did it go down, and when did it come up?

A written note answers: how is that sound written in notation? It has a written duration, a place in a measure, and a relationship to the notes around it.

These are not necessarily one-to-one. **One MIDI note may become two, three, or more written notes.** The usual reason is a tie. The original MIDI event stays whole in Part B. The written notes, and the ties between them, belong in Part C.

**Decided.** A tie connects consecutive written notes of the same pitch into one sustained musical sound. The listener hears one continuous tone. The page shows more than one notehead because a single written value does not cross the barline in the way the sound does, or because the sound is written as several values inside one measure.

A slur is a different mark. A slur expresses phrasing or articulation. It may cover notes of different pitches. It does not add their durations together, and it does not turn several written notes into one sounding event. A curve above a melody can be a slur even while a shorter curve between two identical pitches is a tie. Both can appear in the same measure.

The general rule is musical, not a special case for one piece. The Chopin reading in section 14 is the example that showed the rule. It is not an exception encoded for that prelude.

**Implemented in Song Settings:**

| Setting | What is stored |
|---|---|
| Time signature | Numerator and denominator |
| Key signature | Tonic and mode, such as A major. The sharp or flat count is shown on screen and follows from that pair. It is not stored a second time. |
| Pickup, also called an anacrusis | Whether the piece has one |
| Pickup duration | A written value: sixteenth, eighth, quarter, or half note. Not a tick count. |
| Ticks per written quarter | A positive number, which may include a decimal. How many MIDI ticks last as long as one written quarter note. |

The page does not fill these in from the PDF, from PPQ, or from a time-signature event in the MIDI file. Until they are saved for that Song, the fields stay empty or unselected. Song A’s saved settings are never copied onto Song B.

**Not stored yet.** The following belong in Part C, and the tie model among them is decided, but none of them is written into the Song today:

- The split of one MIDI note into several written notes
- Ties between those written notes, including ties that cross one or more barlines
- Measure boundaries, if we decide to save them rather than only derive them
- Voices
- Rests
- Enharmonic spelling
- Other corrections to how an imported note is understood

Song Settings writes the fields it owns and leaves any other interpretation properties in place. A future Music Editor will add the note-level fields. Neither one replaces Part B.

The barlines used by the current SVG are calculated when the page is drawn. They are products of the time signature, the pickup duration, and ticks per written quarter. They are not piece-specific numbers written into the renderer, and they are not a separate database record.

The current picture always begins with a pickup measure. If Song Settings says the piece has no pickup, the measures are not drawn. That is a limit of this experiment, not a claim that music cannot begin on a downbeat.

### PPQ and a written quarter

PPQ means ticks per **MIDI** quarter note. It does not mean ticks per **written** quarter note. A file can use a MIDI quarter that is a different length from the quarter note printed in the score. Tempo is a third fact: how long a MIDI quarter lasts in time. None of the three may be substituted for the others.

In Song A’s file, PPQ is 1000. The only tempo event makes that MIDI quarter last one second. The development reading of the printed music uses a written quarter of about 666.67 MIDI ticks, which is two-thirds of a MIDI quarter. Three written quarters then last about 2000 ticks.

In Song B’s file, PPQ is 384, and the development reading uses a written quarter of 384 ticks. The numbers match. They are still different ideas. The renderer uses the saved written quarter. It does not read PPQ and decide that the printed quarter is the same length.

## 4. The database as it exists today

| Setting | Value |
|---|---|
| Database name | `midgard-sheet-music` |
| Database version | 1 |
| Object store | `songs`, with `id` as the key |
| TypeScript model | `Song` in `src/song/song.ts` |
| Database module | `src/song/song-database.ts` |

No schema migration was required for a second Song or for an optional PDF filename. `Song` has `id`, `schemaVersion` (currently 1), `metadata`, `originalMidi`, and `musicalInterpretation`. `originalMidi` is the parser’s own `MidiFile` type. The parser result is plain data, so IndexedDB structured clone can store it.

On startup, `ensureProjectSongs` looks up two project ids:

| Song | Id | MIDI file | PDF file |
|---|---|---|---|
| Song A | `chopin-prelude-op-28-no-7` | `chopin-prelude-op-28-no-7-in-a-major.mid` | `chopin-prelude-op-28-no-7-in-a-major.pdf` |
| Song B | `chopin-prelude-op28-no7-b` | `chopin-prelude-op-28-no-7-in-a-major-b.mid` | `chopin-prelude-op-28-no-7-in-a-major-b.pdf` |

Song A’s id is the one already used by the first import. It is kept. Song B is a different record. If an id is already stored, that record’s MIDI and settings are left alone. If it is missing, the MIDI is parsed once and the Song is inserted with an empty interpretation. The dropdown is then filled from `listSongs()`, not from this table. A later import will appear there without a change to the menu.

After a refresh, the page selects Song A when that id is present. It does not yet remember which Song was selected last. That memory is planned, not implemented.

Song Settings updates the existing id with `replaceSong`. The write keeps the id, the schema version, the source filename, and the original MIDI. It does not insert a second Song, and it does not change any other Song.

There is still no general file-picker import and no portable Song file.

### How a Song moves

**Import.** The parser reads a Standard MIDI file and returns structured information. It does not invent barlines, ties, or spelling. Today this runs for the two project files, and only when each Song is missing. A general file picker is planned.

**Create.** The application builds one Song. Part A receives the title, composer, source filename, and PDF filename. Part B receives the parsed MIDI. Part C starts empty. The Song is inserted into `songs`. This is implemented for a missing project Song.

**Read.** The library loads the stored Songs. Choosing one loads that record into the PDF, the SVG measures, the storage status, Song Settings, and the text note panel. A reload takes this path and does not parse again. This is implemented.

**Interpret.** Song Settings can change the composition-wide fields of the selected Song and save them. The Music Editor, for individual notes and ties, is not implemented. Measure boundaries are derived for drawing. They are not stored as a list of ticks.

**Render.** The text panel reads stored notes inside a temporary tick window. The SVG experiment reads the same Song and draws seventeen measures when the required settings exist. It does not open the MIDI file, and it does not store the picture.

## 5. Song Settings and the Music Editor

These are two interfaces. They edit the same Song. They do different jobs.

### Song Settings

Song Settings prepares a newly imported composition, and it stays available later. It is implemented. The form always shows the Song selected in the library.

- Song title
- Composer
- Time signature
- Key signature
- Pickup, yes or no
- Pickup duration, when the pickup is yes
- Ticks per written quarter

Save Changes validates the form, writes that Song’s Part A and Part C, reads the Song back, and redraws the page. No restart is required. A reload restores the saved choices for each Song separately. The original MIDI is checked and left unchanged.

### Music Editor

The Music Editor is a future workstation for inspecting and editing individual measures and notes. It is not implemented.

It will be able to work on:

- Written note durations
- Splitting one MIDI note into several written notes
- Rests
- Voices
- Ties, including ties across several measures
- Note corrections
- Enharmonic spelling
- Other musical relationships

Those edits belong in Part C. They must not overwrite Part B.

## 6. Store musical meaning, generate SVG

**STORE MUSICAL MEANING, GENERATE SVG.**

Three responsibilities stay separate. Mixing them is what makes a long MIDI note look like a single written note when the score shows several.

### A. Original MIDI

What was recorded. Part B.

- Pitch
- Onset
- Duration
- End tick
- Track, channel, velocity, and the other MIDI facts the parser kept

This layer is not rewritten to match the printed page.

### B. Musical interpretation

What the sound means in written music. Part C.

- Written durations
- One MIDI note split into two, three, or more written notes
- Voices
- Ties, and the full chain when a sound covers more than two measures
- Which measure each written note belongs to
- Spelling and other corrections

This layer can be edited. It still points back at the original MIDI event. It does not replace that event.

### C. SVG engraving

How the interpretation is drawn.

- Noteheads, stems, flags, beams, dots, and accidentals
- Tie curves, as segments that each belong to one measure
- Staff geometry
- The independent SVG for each measure

The renderer generates this picture. SVG paths and pixel coordinates are not stored as the musical record. If the picture were the authority, a later notation would have to recover the music by measuring someone else’s drawing.

The same note can be described in two ways, and both belong in the Song rather than in the picture.

Musical information answers musical questions:

- Which pitch is played?
- When does the sounding event begin, and when does it end?
- Which written notes express that sound?
- Which other notes sound together with it?
- Which voice, or which hand, does it belong to?
- Which measure contains each written note?
- How is it spelled, when we have made that decision?

Visual information answers drawing questions:

- Which SVG elements are on the page?
- Where are they, in the coordinate system of that measure?
- Which staff line a notehead sits on?
- What shape is a notehead, which way a stem goes, and how far apart the symbols are?
- Which piece of a tie curve belongs inside this measure’s SVG?

IndexedDB stores MIDI information, musical interpretation, and editable notation decisions. It does not store SVG markup, notehead coordinates, staff-line positions, pixel dimensions, or generated paths.

Some decisions sit close to notation and are still musical meaning. Enharmonic spelling is one. C♯ and D♭ can be the same piano key, and the same MIDI note number 61, while remaining different names in a key. Storing “this note is spelled C♯” in Part C records a musical decision. It does not tell the traditional renderer where to put a notehead, and it does not tell the midGard renderer to draw a notehead at all.

## 7. One measure, one div, one SVG

**ONE MEASURE = ONE HTML DIV = ONE COMPLETE SVG.**

This is a fixed requirement for traditional piano notation, and for the future midGard notation as well.

```html
<div class="measure">
  <svg>
    <!-- Both piano staves and all notation for this measure -->
  </svg>
</div>
```

For piano, that one SVG contains the treble staff and the bass staff, and every symbol that belongs to the measure. A label such as “Bar 0”, the tick span, and a warning about unresolved notes may sit in HTML outside the SVG. The measure div itself contains exactly one SVG.

If a Song contains 45 measures, the renderer creates 45 of these divs. The current experiment asks for 17: the pickup plus sixteen complete measures.

The whole composition is not one enormous SVG. The right hand and the left hand are not two SVGs. A measure does not contain several SVGs for several kinds of symbol. A tie that continues for three measures is three segments in three SVGs, not one path drawn across all three.

This is a rule for the picture. It is not a rule for the database. The Song remains one IndexedDB record, however many measure divs the page builds.

**Implemented today.** A MIDI note is selected for a measure when its onset satisfies `startTick <= note.startTick < endTick`, after the span’s edges are rounded to whole ticks. The stored end of the note stays intact. The experiment does not split that note into tied written notes. If the whole duration is not a catalog value, the note stays unresolved. Its notehead is still drawn, in the measure where it begins, and it is not given an invented duration.

**Decided, not implemented.** Interpretation will be allowed to place several written notes, in several measures, for one MIDI event. Each of those written notes is drawn only in its own measure SVG.

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

HTML and CSS belong to the application around those pictures. They arrange the page, the panels, the Song Library, Song Settings, and the measure divs. They do not stand in for noteheads, stems, staff lines, or tie curves.

Inside the SVG, CSS Grid has no role. Note positions come from SVG coordinates and from the engraving rules.

Musical rendering does not use HTML Canvas, rasterized musical symbols, PNG or JPEG noteheads, HTML elements positioned to imitate symbols, or any renderer that requires Canvas. The finished traditional engine does not depend on VexFlow’s Canvas renderer.

The experiment now draws staff lines, a right barline, ledger lines, filled elliptical noteheads, stems, and one augmentation dot when the written duration has a dot. Clefs, beams, flags, rests, accidentals, ties, and music-font glyphs are not drawn yet. An unresolved note uses the same ellipse in Deep Crimson, `#742D38`, without a stem or a dot. That color means the interpretation is unfinished. It does not mean the MIDI note is wrong.

### Glyphs, fonts, and export

Professional music fonts, including SMuFL fonts, are a possible source of clefs, noteheads, rests, and other symbols. How they enter the SVG is still open. Two representations have to stay distinct:

- **SVG text** that asks the browser to draw a glyph from a music font. The SVG is compact. A later viewer needs that font, or an embedded copy of it, or the glyph will not look the same.
- **SVG paths** that contain the outline of the glyph. The picture carries its own shapes. A single measure can be exported as a self-contained SVG without asking another program to supply the font.

Either choice can still be SVG-only on the page. They differ when a measure is saved or copied as a file. The choice is an open question. Any font we use has to be checked for its own license.

## 9. Our own engraving engine

We want traditional engraving of a quality comparable to VexFlow and to the printed score. We are not adopting VexFlow’s architecture as the architecture of this application.

The engine is designed around:

- The IndexedDB Song
- Independent measures
- One SVG per measure
- Our own rendering modules
- Our own placement of measure divs
- Future musical editing

It should stay modular enough to read. A final directory tree is not fixed here.

The current modules interpret a written duration, assign the first note-bearing track to the treble staff and the second to the bass, place chord noteheads, draw stems and augmentation dots, and space note columns from the written rhythm. Unrecognized durations are reported and still given a notehead. None of that is stored back into the Song.

| Area | What it decides | Today |
|---|---|---|
| Staff geometry | Where the five lines of each staff sit inside the measure SVG | Implemented |
| Barline | The right edge of the measure | Implemented |
| Noteheads and ledger lines | Pitch mapped onto staff positions | Implemented, with one filled ellipse for every duration |
| Chord noteheads | Seconds and unisons offset so the heads stay readable | Implemented |
| Stems | Direction and length for a recognized duration that has a stem | Implemented |
| Augmentation dots | One dot, when the written duration has one | Implemented |
| Rhythmic spacing | Horizontal room from the written values in the measure | Implemented |
| Unresolved notes | A crimson notehead at the real onset, with no invented duration | Implemented |
| Clefs, key signatures, time signatures | The symbols at the start of a staff | Not implemented |
| Flags and beams | How short notes are grouped | Not implemented |
| Rests and accidentals | Silence, and the printed spelling | Not implemented |
| Ties and slurs | Connections between notes, including connections that leave the measure | Decided for ties. Not drawn |
| Dynamics, articulations, fingering | Marks that are musical data and also typography | Not implemented |
| Collision avoidance beyond the current chord offsets | How nearby symbols move so they remain readable | Only the current chord rule |
| Musical typography | The consistent look of a finished engraving | In progress |

Staff assignment does not read the words “right hand” or “left hand.” The first track that contains notes becomes the treble staff. The second becomes the bass. A Song with any other number of note-bearing tracks is not drawn. The text preview still labels a hand only when the track name is exactly `Main droite` or `Main gauche`.

## 10. VexFlow is a reference, not the runtime

A local copy of the VexFlow source is kept at `reference/vexflow-master/`. It is research material. It is not imported by the application, and it is not part of the production build.

We read it to learn how professional engraving works:

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

### What VexFlow shows about ties

The useful reference for ties is our own future engraving, not a library call.

`reference/vexflow-master/src/stavetie.ts` defines `StaveTie`. A tie is given two notes, `first_note` and `last_note`, and the pitch indices those notes use. `renderTie` draws a filled curve between the two horizontal positions. `draw` asks each note for its tie anchor.

A tie may be partial. `isPartial` is true when either note is missing. `draw` then uses the stave instead of the missing note: `getTieEndX` when the tie leaves the stave, and `getTieStartX` when the tie enters it. Those two methods live in `stave.ts` and return the stave’s start and end. `note.ts` supplies `getTieRightX` and `getTieLeftX`, the points beside a notehead.

`Factory.StaveTie` can be called with only `from` or only `to`. That is the same idea as a segment that begins or ends at a barline.

`Factory.Curve` is a different object. It is the reference for a slur, a phrasing curve, not for a tie that joins durations.

We keep three ideas apart, as VexFlow’s split between `StaveTie` and `Curve` also suggests:

| Idea | Where it lives for us |
|---|---|
| Musical relationship | Part C: these written notes are tied, or these notes are under one slur |
| Tie geometry | Calculated once for the whole logical tie, then cut into measure segments |
| Partial tie | The segment drawn in one SVG, from a notehead to the barline, or from the barline to a notehead |
| Slur | Phrasing. It does not merge durations |

Our engine will draw its own SVG paths. It will not call VexFlow at runtime.

## 11. Engraving and page layout are separate

Two responsibilities stay apart. CSS Grid belongs to the second one only.

### The SVG engraving engine

The engraving engine receives the musical information for one measure. It produces exactly one SVG containing the complete notation for that measure.

It does not decide where that measure sits on the page, which row it belongs to, or how large the margin around the page is. CSS Grid does not choose the position of a notehead.

### The HTML layout

**Implemented.** The page is a CSS Grid workspace, 3200 pixels wide:

| Column | Width | Contents |
|---|---:|---|
| Left | 1200px | The original PDF, with a 12px margin and no outer panel scrollbar |
| Center | 1200px | The generated measure divs |
| Right | 800px | Song Library, Song Settings, storage facts, and the temporary note list |

The center and the right panel scroll vertically on their own. The workspace itself scrolls horizontally when the window is narrower than 3200 pixels. The three panels keep those widths.

The measure divs are arranged three to a row:

```css
display: grid;
grid-template-columns: repeat(3, minmax(0, 1fr));
```

Each measure div occupies one cell and is centered in that cell. The SVG inside keeps its natural width and height. A narrow measure is not stretched. Grid gaps and padding are page spacing. They are not musical spacing.

Song Library and Song Settings use CSS Grid for their fields and rows. That layout does not interpret the music.

**Not implemented.** A layout manager that plans systems, page breaks, and pagination, as a stage separate from both CSS and engraving, is still ahead. The CSS Grid above places the experiment. It is not that future manager.

A measure can be drawn again without drawing every other measure again. Some edits still force more work. A change to rhythmic spacing, a tie into the next bar, or the width of a system can require the neighbors to be arranged again. The split between engraving and layout makes that choice explicit.

Moving a measure div never changes the Song. The div may sit beside the next measure, far from it, on the next row, or on another page. Its SVG still contains only its own notation.

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

The musical fact stays in Part C. The curves are generated. None of these crossing symbols is drawn today.

### The midGard Split Tie

**Decided. Not implemented.**

Traditional notation may draw a tie as one continuous curve from one notehead to the next. midGard Sheet Music cannot do that, because each measure is its own SVG. A curve is not allowed to leave its SVG and enter the next one.

The visual analogy is a banana. Traditional notation is one whole banana between the two notes. midGard cuts that banana into pieces, with a very small visual gap. Each piece belongs entirely to its own measure. The pieces should still look like parts of one original curve.

The system is not designed for only two measures. One sustained MIDI note may need written notes in three or more measures. When this is built, the interpretation will store the whole chain, and the renderer will generate:

- an outgoing segment in the first measure, from the notehead toward that measure’s barline
- a continuation segment in each intermediate measure
- an incoming segment in the last measure, from that measure’s barline to the notehead

Each of those measures still has exactly one SVG. The composition is never collected into one large SVG in order to draw the tie.

The musical relationship does not depend on the page layout. The measures may be adjacent, separated, on another row, or on another page. Moving them must not break the tie. The two halves do not have to touch.

They do have to share one geometry. The segments are not two unrelated curves that happen to be near each other. The order of work is:

1. Decide the written notes and the tie that connects them.
2. Establish the complete curve, including its direction and its vertical place relative to the staves.
3. Cut that curve into the segment each measure SVG will draw.

Matching requirements for those segments:

- The same stroke width
- Consistent curvature
- Matching vertical positions relative to the staves
- The same curve direction
- Matching endpoint styling
- Geometry taken from the one logical tie

A slur may later need the same independence, because it can also cross a barline. A slur still does not merge durations. Only the tie model above is decided. Hairpins and the other crossing marks remain open.

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

3A uses our own SVG engraving engine, with one SVG per measure. The experiment has started that engine: staves, noteheads, ledger lines, stems, dots, chord placement, rhythmic spacing, and unresolved notes. It has not finished it. Ties, clefs, beams, rests, and accidentals are still absent.

### 3B — midGard Sheet Music

3B is a future notation with its own graphical rules. It is not a restyling of 3A. The same composition might look so different that an experienced pianist would not immediately recognize it. 3B reads the same Song and the same musical interpretation. It must not depend on the traditional engraving engine. It is not required to use five-line staves. Its rules are not defined in this document.

The same Split Tie rule will apply to 3B: one measure, one div, one SVG, and no curve that depends on a neighboring SVG. The musical tie still lives in Part C.

The two systems are like one poem written once in Greek and once in Latin. The meaning can be the same while the letters and the layout are not. They share musical meaning. They do not have to share graphics or layout algorithms.

## 14. The Chopin preludes, our first two Songs

The first repertoire is classical piano. The first two Songs are two files of Frédéric Chopin’s Prelude Op. 28 No. 7 in A major. They are the same composition in the printed score and two different MIDI performances. Each is its own Song.

Song B is the current development reference, because its tick grid matches a written quarter of one PPQ and its Bar 5 tie is the example we are studying. Song A remains in the library for comparison. Its written quarter is not an integer, and its file contains no time signature and no key signature.

The counts below describe those files, and the pictures that appear when the named Part C settings have been saved. A freshly imported Song has an empty interpretation until someone saves settings. This document does not claim that every browser already holds those saved values.

### Song A

File: `midi-files/chopin-prelude-op-28-no-7-in-a-major.mid`.

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

The development reading of Song A is 3/4, a quarter-note pickup, and about 666.67 ticks per written quarter. The file does not contain the key, and the page does not invent one. With that reading the experiment draws 17 measures and leaves 21 MIDI notes unresolved. Those 21 notes are drawn in Deep Crimson. The other 155 are drawn in the ordinary ink. All 176 remain in Part B.

Pitch names in our displays use the scientific convention in which MIDI note 60 is C4. The file stores note numbers. Sharps in the tables below are an A-major reading of those numbers, matching the printed key. The file itself does not spell them.

### Song B

File: `midi-files/chopin-prelude-op-28-no-7-in-a-major-b.mid`.

| Fact | Value |
|---|---|
| MIDI format | 1 |
| Tracks | 3 |
| PPQ | 384 ticks per MIDI quarter note |
| Tempo | One event, at tick 0: 500,000 microseconds per MIDI quarter |
| Paired notes | 168 |
| Time-signature event | 3/4 at tick 0 |
| Key-signature event | 3 sharps, major, at tick 0 |
| Track 1 | `control track`, no notes |
| Track 2 | `rh:` |
| Track 3 | `lh:` |

The file’s time signature and key signature are Part B. They are not copied into Part C. The PDF shows the same 3/4, the same A major, and a quarter-note pickup: E in the treble, a rest in the bass.

The development reading uses a written quarter of 384 ticks, 3/4, A major, and that quarter-note pickup. With those settings saved, the experiment draws the same 17 measures and leaves 5 MIDI notes unresolved. The two PDF files in this project are the same printed edition stored under two names. Each Song still points at its own filename.

### What the printed PDF shows at the opening

The opening of the score shows:

- A major, three sharps
- 3/4 time
- A quarter-note pickup: E in the treble, a rest in the bass
- Then a full bar whose melody begins with a dotted eighth and a sixteenth, over a quarter-note bass note

That printed meter and that printed pickup are interpretation. They belong in Part C after someone saves them. The application does not insert them by itself. Our measure numbers treat the pickup as Bar 0. The printed numbers start at 1 on the first full bar, so printed bar 5 is our Bar 5 and printed bar 6 is our Bar 6.

### Song A’s written quarters and opening bars

With a written quarter of about 666.67 MIDI ticks, a quarter-note pickup and a 3/4 bar fall on these spans. The edges below are the rounded tick labels. The calculation itself keeps the fractional ticks and rounds only when it selects notes or prints a label.

| Measure | Start tick | End tick |
|---|---:|---:|
| Bar 0 — pickup | 0 | 667 |
| Bar 1 | 667 | 2667 |
| Bar 2 | 2667 | 4667 |

These spans are what the saved settings produce. They are not constants inside the renderer. The same rule continues through the 17 drawn measures. Near the end of Song A, some durations leave the catalog. That is why 21 notes stay unresolved. A single calibration does not by itself explain those final durations. That remains an open musical question.

### The old nine-note window

The text panel still shows notes that start at tick 0 up to, but not including, tick 2000. That window is a temporary development view in `src/main.ts`. It is not a saved measure, and it is not one bar. For Song A it mixes the pickup with part of Bar 1. For Song B a full bar is 1152 ticks when the written quarter is 384, so the same window is simply a slice of ticks.

For Song A the notes in that window are:

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

### Song B, Bar 5: one MIDI note, three written notes

**Confirmed interpretation. Not implemented.**

Song B contains one right-hand MIDI note that the current duration catalog cannot name. With a written quarter of 384 ticks, the note is:

| Fact | Value |
|---|---|
| Track | 2 |
| MIDI pitch | 62, D4 |
| Start tick | 5280 |
| End tick | 6912 |
| Duration | 1632 ticks, which is 4.25 written quarters |

Bar 5, in this reading, is ticks 4992–6144. Bar 6 is ticks 6144–7296. The note begins 288 ticks into Bar 5 and is still sounding for the first 768 ticks of Bar 6.

The printed score shows that one sustained D4 as three written notes and two ties:

| Written note | Where | Duration | Ticks |
|---|---|---|---:|
| Sixteenth note | Bar 5, with the upper-voice sixteenth | 1/4 of a quarter | 96 |
| Half note | Bar 5, through the barline | 2 quarters | 768 |
| Half note | Bar 6, beats 1 and 2 | 2 quarters | 768 |

96 + 768 + 768 = 1632. The sum is the original MIDI duration. The end tick is the same tick at which a new D4 quarter begins.

The first tie joins the sixteenth to the half note inside Bar 5. The second tie joins that half note to the half note in Bar 6. Both ties connect D4 to D4. They are not slurs.

Part B keeps the single event from tick 5280 to tick 6912. Part C, when this reading is stored, will keep the three written notes and the two ties. The renderer will then draw a sixteenth and a half note in Bar 5’s SVG, a half note in Bar 6’s SVG, and the Split Tie segments that belong to each SVG. None of that split is performed today. The note is drawn as one unresolved crimson notehead in Bar 5, because 1632 ticks is not a whole, half, quarter, eighth, or sixteenth, with or without one dot.

This example is why the engine needs a general rule. A later piece can have the same shape: one key held across written values and across a barline. The code must not recognize “Chopin, pitch 62, tick 5280” and special-case it.

The other four unresolved notes in this reading are not this tie. Two of them, in Bar 11, last 2.25 quarters and stop on the barline. Two of them, in Bar 15, are very short and together last one sixteenth. How those four should be written is still open. A different A4 in Bar 15 lasts exactly four quarters and crosses into Bar 16. The current catalog accepts that duration as a whole note, so it is not crimson. Whether it should instead be tied written notes is also still open.

## 15. The SVG experiment

Under the heading **Traditional Sheet Music — SVG Experiment**, the page draws seventeen measures when Song Settings has a time signature, a pickup of a written duration, and ticks per written quarter. If any of those is missing, or if the pickup is explicitly absent, the section says so and draws no measures. It does not silently use PPQ.

Each measure is one div and one SVG. The grid places three measures on each row. The SVG keeps the size the engraving calculated.

For the selected Song, a recognized note is drawn with its notehead, its ledger lines, its stem when the duration has one, and its dot when the duration has one. An unresolved note is drawn as a crimson notehead at its real onset. The warning under the measure lists the track, pitch, onset, duration, and the reason. The original MIDI is not changed.

The hand on the staff comes from track order, as section 9 describes. The measures read `originalMidi` and `musicalInterpretation` from the stored Song. Switching Songs redraws the PDF, the measures, and the settings from that Song alone.

The experiment does not yet draw:

- Clef symbols
- Noteheads from a music font
- Flags or beams
- Rests
- Accidentals
- Key or time signatures on the staff
- Ties or slurs
- A written duration invented for a note the catalog refused

None of those should be described as present.

## 16. Where the engraving stands

The first engraving target was a professionally readable Bar 0 and Bar 1. The experiment has since been widened to seventeen measures for whichever Song is selected. That widening did not delete or shorten either Song. Song A’s 176 notes and Song B’s 168 notes remain in IndexedDB.

The engine stays general. Another Song, or a later measure, must be drawable without a new piece of Chopin-specific code. The Bar 5 reading is a musical conclusion about one MIDI event. It is not a renderer constant.

Clefs, beams, rests, accidentals, music-font glyphs, and ties are the remaining engraving work. Ties are the next musical subject, and their architecture is the Split Tie in section 12. They are not the next lines of drawing code until that design has been reviewed.

## 17. What works today, and what does not

Implemented:

- A Vite application in vanilla TypeScript, without a user-interface framework
- A 3200px workspace in CSS Grid: a 1200px PDF, 1200px of measures, and an 800px library and settings panel
- Three measure divs per row, each SVG at its natural size
- The Standard MIDI parser in `src/midi/`
- A terminal command that prints the notes starting in ticks 0–2000
- That same temporary slice on the page, grouped by the stored track names when those names match
- The PDF for the selected Song, in the left panel
- IndexedDB database `midgard-sheet-music`, version 1, with one `songs` store
- Import of Song A and Song B when each id is absent, without rewriting a Song that already exists
- A Song Library dropdown filled from IndexedDB
- A storage status panel whose facts come from the selected Song, including PPQ, tempo, and the file’s time signature as separate facts from the saved written quarter
- Song Settings, saved into that Song only
- Seventeen measure SVGs when the selected Song has a time signature, a pickup duration, and ticks per written quarter
- Staff lines, barline, ledger lines, noteheads, chord offsets, stems, augmentation dots, and rhythmic spacing
- Unresolved notes in Deep Crimson, with the original duration left unchanged
- A local copy of the VexFlow source, kept for study and not used as the renderer

Decided, and not implemented:

- One MIDI note may be stored in Part B and interpreted as several tied written notes in Part C
- The Split Tie: coordinated curve segments, one in each measure SVG, including chains longer than two measures
- The general musical rule that produces those written notes, with no Chopin-only exception

Not implemented:

- Remembering the selected Song across a refresh
- A general MIDI file picker
- The Music Editor
- Stored measure boundaries, ties, voices, rests, and spelling
- Clefs, music-font glyphs, flags, beams, rests, accidentals, and key or time signatures on the staff
- A layout manager for systems, page breaks, and pagination, beyond the current CSS Grid
- Drawing a tie, a slur, or any other symbol that crosses measure SVGs
- The rest of traditional notation, 3A
- midGard notation, 3B
- Playback and a portable Song file

## 18. Architectural principles

1. One Song is one complete musical document in IndexedDB.
2. A measure is a graphical unit rendered from part of a Song, not a separate database record.
3. Every Song contains its own imported MIDI information, and that information is preserved unchanged.
4. Every Song contains its own editable musical interpretation, saved beside the import. One Song’s settings are never the settings of another.
5. Adding another Song must not require song-specific application code.
6. After import, editing and rendering read the Song from IndexedDB. Selecting a stored Song does not parse the MIDI again.
7. A MIDI note is a sounding event. A written note is how that sound is notated. One MIDI note may become several written notes.
8. A tie joins consecutive written notes of the same pitch into one sustained sound. A slur phrases. It does not add durations.
9. Musical meaning is stored. SVG is generated. Pixel coordinates are not the musical record.
10. One measure is one HTML div and one complete SVG, with both piano staves inside it.
11. A cross-measure tie is a musical relationship plus coordinated geometry, then independent curve segments. No SVG path extends into a neighboring SVG.
12. Musical graphics are SVG. The page around them is HTML and CSS Grid. CSS Grid does not place notes.
13. The engraving engine draws one measure. The HTML layout places measure divs.
14. Traditional notation and midGard notation read the same Song and do not define it.
15. VexFlow is a reference. Our Song and our measure SVG come first.
16. MIDI parsing, musical editing, storage, engraving, and layout remain separate responsibilities.
17. The system grows by small steps that can be seen, compared with the score, and kept.

We compare an interpretation with the original PDF before treating it as settled. We do not add a dependency or an abstraction until it has a clear job.

## 19. What comes next

The early investigation of VexFlow, the Song model, and the first SVG has already been carried into the experiment described above. This README is not a numbered build plan.

The next musical step is the tie model in sections 3, 6, and 12, starting from the confirmed D4 in Song B’s Bars 5 and 6. That step has not been implemented. It should not begin until this description has been reviewed.

Each implementation step after that review should be small enough to:

1. Implement it.
2. Inspect the SVG visually.
3. Compare it with the printed PDF.
4. Correct any problems.
5. Commit the completed step.
6. Proceed to the next step.

The rest of either Song stays intact in IndexedDB while that work is done.

## 20. Open questions

These questions are deliberately unanswered. A decision elsewhere in this document is not repeated here as if it were still open.

Music and interpretation:

- How should the general tie rule choose written values when a MIDI duration is not itself a catalog value? The D4 in section 14 shows one confirmed result. The procedure that discovers that result for any Song is not chosen.
- How should the other unresolved notes in these preludes be written, especially where a duration is only a sixteenth away from a half note, or where two very short notes together last one sixteenth?
- How should musical voices be represented when one hand plays more than one line?
- How should rests be inferred when the MIDI file simply has silence?
- Which decisions belong in the shared Song, and which belong only to 3A or only to 3B?
- How should manual corrections survive if the same MIDI file is imported again?
- What will midGard notation look like?

Engraving and layout:

- How should professional music glyphs be integrated?
- Should those glyphs be SVG paths, or SVG text that uses a SMuFL font?
- How can each measure SVG be exported on its own?
- How should a slur, a hairpin, or a system break cross independent measure SVGs? The tie answer is the Split Tie. These other marks are not decided.
- How should a future layout manager align staves from measure to measure, beyond the current three-column grid?
- How should the renderer draw multiple voices in one measure?
- How can one edited measure be rendered again without redrawing the whole Song?
- How should the Music Editor talk to the renderer?

Storage and the life of a Song:

- How should Song IDs be generated for a future import, beyond the two project ids?
- How should the selected Song be remembered after a refresh?
- How should the Song schema be versioned as Part C grows, and how should migrations update Songs saved by an older version?
- How do we preserve imported events that the parser does not yet fully interpret, so a later parser can still see them?
- How should a very large composition be stored and loaded?
- How should an edit be validated before it is saved?
- What should a portable Song export contain?

This README is a living reference. We extend it when a decision becomes settled, when an experiment starts to work, and when a comparison of the MIDI with the PDF teaches us something we did not know. The aim is a working application, and a clear account of how one Song can hold a whole piece of music while the page draws that piece as many independent measures.
