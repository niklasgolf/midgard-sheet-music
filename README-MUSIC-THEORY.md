# midGard Sheet Music — Music Theory and Architecture

This document is the working reference for the musical ideas and software architecture of **midGard Sheet Music**. It is written for someone learning music theory and software design at the same time.

Four kinds of statement appear here, and they are not the same thing:

| Kind | Meaning |
|---|---|
| Implemented | The application does this today |
| Decided | We have chosen this design, whether or not the code exists yet |
| Planned | We intend to build this, and the design is still open to the next investigation |
| Open | We have not chosen an answer |

The application now keeps more than one Song, draws the measures chosen for that Song, and lays the page out with CSS Grid. A Song with no saved choice still draws sixteen complete measures, plus a pickup when the Song has one. Ties across measures are a decided design. They are not drawn yet.

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

Edit Names can change the title and the composer. That change does not rename the source MIDI filename, and it does not remove a stored PDF filename. The MIDI filename stays the name of the file that was imported. The Song id stays the same.

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

**Decided.** A tie connects two consecutive written notes of the same pitch into one sustained musical sound. The listener hears one continuous tone. The page shows more than one notehead because a single written value does not cross the barline in the way the sound does, or because the sound is written as several values inside one measure.

**Implemented.** A spelling may also say which of those junctions are tied. For N written notes there are N − 1 junctions. `true` draws a tie. `false` writes the next note again without a tie: the MIDI sound is still one event, and the page shows a repeated written note. When the junction list is omitted, every junction is tied. The Bar 5 D4 was stored that way, and both of its ties remain. The flags name musical decisions. They do not name pixels.

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

**Implemented as written-note corrections.** A sustained MIDI sound that is written as several notes is stored on the Song as `sustainedNotes`. Each entry names the original event by track, pitch, onset, and ending, and lists the written values in order. An optional `ties` list has one boolean per junction. Omitted, it means every junction is tied. The entry stores those musical facts. It does not store notehead positions, curve coordinates, or SVG paths. Song B’s D4 and the two Bar 11 pitches in section 14 are stored corrections. The Music Editor does not edit this list yet. Song Settings does not show it, and saving Song Settings leaves the list in place.

**Written duration and sounding duration.** A MIDI performance can release a key before the printed note has finished. The sounding duration is the original note-off. The written duration is the value printed on the page. Those two facts stay separate. A `writtenDurations` entry names the original event by track, pitch, onset, and ending, then names one written value and the tick where that written note ends. The sounding interval is not changed, and the entry does not create a tie. The written note joins any other note that has the same written onset and the same written duration. Song B’s sixteenth A4 in Bar 15 is stored this way. It is not a `sustainedNotes` spelling: that list is for one sound written as several notes whose values add up to the MIDI duration.

**Performed onset and written onset.** The performed onset is the MIDI tick where the key went down. The written onset is the rhythmic position printed on the page. `writtenOnsetAlignment` stores how far a performed attack may sit from an equal division of the written quarter before it is moved onto that grid. The original tick stays on the note and is still how that note is named. Measure membership, the rhythmic column, and the horizontal position use the written onset. A note that lands on a barline belongs only to the measure that begins there. A Song that omits the setting keeps every performed onset as its written onset. Moving an onset does not choose a written duration. The two-tick duration rule is unchanged.

**Grace notes.** A grace note is an ornament attached to a principal written note. It is not part of the bar’s beat count, and it does not create a rhythmic column. A `graceNotes` entry keeps the original MIDI event, names the principal note by track, pitch, and onset, and records the ornamental written value together with whether it has a slash and whether a short slur joins it to the principal note. Several grace notes may name the same principal. The short slur is phrasing for that ornament. It is not a duration tie, and it is not stored as one. Song B’s Bar 15 grace note is one unslashed eighth A4 slurred to the A4 that begins at tick 16896.

**Not stored yet.** The following still belong in Part C, but they are not written into the Song today:

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
| Song operations | `SongRepository` in `src/song/song-repository.ts` |
| Current database | `IndexedDBSongRepository` in `src/song/indexeddb-song-repository.ts`, using `src/song/song-database.ts` |

No schema migration was required for a second Song, for a third Song, for an optional PDF filename, for `sustainedNotes`, for a written start tick, for a staff split pitch, or for a display choice stored beside the interpretation. Those fields are optional. The database version stays 1. `Song` has `id`, `schemaVersion` (currently 1), `metadata`, `originalMidi`, and `musicalInterpretation`. `originalMidi` is the parser’s own `MidiFile` type. The parser result is plain data, so IndexedDB structured clone can store it.

### The repository

The application asks a `SongRepository` for Songs. The interface is:

- `getSong(id)` reads one Song, or reports that the id is absent
- `listSongs()` reads the library
- `addSong(song)` inserts a Song and fails if that id is already stored
- `saveSong(song)` replaces an existing Song and fails if the id is absent

Those methods exchange `Song` values. They do not mention IndexedDB records, indexes, or a future Convex document. `IndexedDBSongRepository` is the implementation used now. It calls the existing database functions. It does not open a second database and it does not change the store.

This is dependency inversion. Interpretation and SVG engraving receive a Song, or the interpretation inside it. They do not import the repository, and they do not import IndexedDB. `src/main.ts` is the boundary that chooses `IndexedDBSongRepository` and passes it to the library import and to Song Settings.

Convex is the planned database for the phase after this prototype can render a complete composition. It is not installed, and there is no Convex client or placeholder class. When that phase starts, a Convex repository can implement the same interface. The musical engine should not need to be rewritten to change databases.

On startup, `ensureProjectSongs` looks up three project ids through the repository:

| Song | Id | MIDI file | PDF file |
|---|---|---|---|
| Song A | `chopin-prelude-op-28-no-7` | `chopin-prelude-op-28-no-7-in-a-major.mid` | `chopin-prelude-op-28-no-7-in-a-major.pdf` |
| Song B | `chopin-prelude-op28-no7-b` | `chopin-prelude-op-28-no-7-in-a-major-b.mid` | `chopin-prelude-op-28-no-7-in-a-major-b.pdf` |
| Song C | `eine-kleine-nachtmusik-intermediate` | `eine-kleine-nachtmusik-intermediate.mid` | `eine-kleine-nachtmusik-intermediate.pdf` |

Song A’s id is the one already used by the first import. It is kept. Song B and Song C are different records. If an id is already stored, that record’s MIDI and settings are left alone. If it is missing, the MIDI is parsed once and the Song is inserted with an empty interpretation. The Choose a Song list is then filled from `listSongs()`, not from this table. A later import will appear there without a change to the list.

After the library is loaded, one install looks at Song B only. It carries the confirmed spellings: the Bar 5 D4, the Bar 11 C♯5 and E5, the Bar 15 and 16 A4 halves, the Bar 15 written sixteenth, and the Bar 15 grace note. Each spelling is added only when Part B still contains that exact MIDI event and Part C does not already spell it. A grace note is also checked against the principal note it names. Missing spellings are appended in one save. A second startup finds them and does not write. A Bar 5 reading stored without tie flags still means both junctions are tied, so the install does not rewrite it. If Part C already spells the same event with a different written value, different tie flags, or a different grace-note reading, that stored spelling stays and the install says so. Song A is not part of the install. Parts A and B, and every other Part C field, stay as they were. This is not a schema migration. The database version stays 1.

The right panel has three screens. All keep the title **The midGard Sheet Music Editor**, centered, with the subtitle centered on the next line. Choose a Song lists every record from `listSongs()`. Nothing is selected until the user clicks. Edit Mode replaces that subtitle with the Song’s title and shows Change song, aligned to the right on the next line. The list hides. Beneath that header, Edit Mode places the controls in two rows of three: Measures per row, Measures to display, and Time signature, then Pickup, Ticks per written quarter, and Pickup duration. Key signature and Sheet system share the next row in two equal columns. Sheet system is a placeholder with Classical and midGard. Classical starts selected. Choosing either one only changes the highlight. It is not saved, and it does not change the score. Save Changes sits on the following line, compact and aligned to the right. There is no Musical settings heading and no divider between those rows. Edit Names is the last control in that panel, after Song Storage — IndexedDB. A window narrower than 720 pixels stacks each control on its own line. The right panel stays 800 pixels wide. The PDF and the measure SVGs load from `getSong`. Change song asks `listSongs()` again, clears the open Song, and does not call `saveSong`. Edit Names is a subpage of the right panel for the same Song. The three columns stay in place. The PDF and the measure SVGs stay mounted and visible. Only the right panel changes: it shows the title and composer, and it hides the display controls, the musical settings, and Song Storage. Return restores those controls for the same Song and does not reload the PDF or redraw the score. If the name fields differ from the saved Song, Return asks before leaving and does not save. A refresh still opens Choose a Song.

A refresh always opens Choose a Song. The page does not reopen the Song that was on screen. That choice is temporary editor navigation, held in `EditorView` while the page is open. It is not written into Part C, Song Settings, or IndexedDB. The saved spelling is still in Song B, and drawing reads it only after that Song is chosen again. Edit Mode shows those control rows, then Song Storage — IndexedDB, and Edit Names at the bottom of the panel. Choose a Song hides those sections and clears the PDF and the SVG score. Edit Names hides those sections in the right panel only. The temporary note list has been removed. Edit Names writes only the title and composer. It leaves the Song id, the MIDI filename, the PDF filename, Part B, Part C, and the display choice unchanged.

Song Settings updates the existing id with `saveSong`. The write keeps the id, the schema version, the source filename, the original MIDI, and interpretation fields the form does not edit, including `sustainedNotes`, `writtenDurations`, and `graceNotes`. It does not insert a second Song, and it does not change any other Song.

There is still no general file-picker import and no portable Song file.

### How a Song moves

**Import.** The parser reads a Standard MIDI file and returns structured information. It does not invent barlines, ties, or spelling. Today this runs for the three project files, and only when each Song is missing. A general file picker is planned.

**Create.** The application builds one Song. Part A receives the title, composer, source filename, and PDF filename. Part B receives the parsed MIDI. Part C starts empty. The Song is inserted into `songs`. This is implemented for a missing project Song.

**Read.** The library loads the stored Songs into a vertical list. Choosing one calls `getSong` and loads that record into the PDF and the SVG measures. The musical settings and the storage facts receive the same record. The display choices and musical fields share two three-column rows. Song Storage — IndexedDB follows them, and Edit Names is the last control in the panel. Edit Names is a right-panel subpage for the title and composer. The PDF and the SVG score stay mounted while that subpage is open. A reload returns to Choose a Song and does not parse the MIDI again. This is implemented.

**Interpret.** Song Settings can change the composition-wide fields of the selected Song and save them. A confirmed written spelling can also be stored in Part C, as Song B’s D4 is. The Music Editor, for individual notes and ties, is not implemented. Measure boundaries are derived for drawing. They are not stored as a list of ticks.

**Render.** The SVG experiment reads the same Song and draws the measures chosen in Sheet Music Display. It does not open the MIDI file, and it does not store the picture. The temporary text list of notes has been removed.

## 5. Song Settings and the Music Editor

These are two interfaces. They edit the same Song. They do different jobs.

### Song Settings

Song Settings prepares a newly imported composition, and it stays available in the code. It is implemented. Edit Mode shows the musical fields in the same grid as the display controls. Choosing a Song fills them, and saving them still writes only that Song. Choose a Song hides the form. The title and composer are edited on Edit Names, not in this form.

- Time signature
- Key signature
- Pickup, yes or no
- Pickup duration, when the pickup is yes
- Ticks per written quarter

Sheet system sits beside Key signature. It offers Classical and midGard, and Classical starts selected. The choice stays in the page only. Save Changes does not write it, and it is not part of Part A, Part B, or Part C.

Save Changes on the musical form validates those fields, writes Part C, reads the Song back, and redraws the page. It keeps the title and composer already stored on the Song. Save Changes on Edit Names writes the title and composer in Part A and leaves Part B, Part C, and the display choice as they are. No restart is required. A reload restores the saved choices for each Song separately. The original MIDI is checked and left unchanged. The displayed title is not the Song id.

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

**Implemented today.** A MIDI note is selected for a measure when its onset satisfies `startTick <= note.startTick < endTick`, after the span’s edges are rounded to whole ticks. The stored MIDI event stays intact. When Part C spells that event, each written note is drawn in the measure where that written note begins, and each tied junction is drawn in the SVG that contains it. A duration that is not a catalog value, and that has no stored spelling, stays unresolved. Its notehead is still drawn, in the measure where it begins, and it is not given an invented duration.

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

The experiment now draws staff lines, a right barline, ledger lines, filled elliptical noteheads, stems, one augmentation dot when the written duration has a dot, ties from a stored spelling, beams for eighths and sixteenths that share a beat, and a grace note when Part C stores one. A grace note is a smaller filled notehead, about two-thirds of a normal head, with a shorter stem, the flag that belongs to its ornamental value, a slash only when the reading asks for one, and a short slur when the reading asks for one. Clefs, ordinary flags on unbeamed notes, rests, accidentals, and music-font glyphs are not drawn yet. An unresolved note uses the same ellipse in Deep Crimson, `#742D38`, without a stem or a dot. That color means the interpretation is unfinished. It does not mean the MIDI note is wrong.

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

The current modules interpret a written duration, assign piano staves, place chord noteheads, draw stems and augmentation dots, and space note columns from the written rhythm. Two note-bearing tracks keep their order. One note-bearing track uses a staff split pitch from Part C when that Song has one. Unrecognized durations are reported and still given a notehead. None of that is stored back into the Song.

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
| Flags and beams | How short notes are grouped | Eighths and sixteenths that share a beat are beamed. A grace note still draws its own small flag. Ordinary flags on unbeamed notes are not drawn |
| Rests and accidentals | Silence, and the printed spelling | Not implemented |
| Ties and slurs | Connections between notes, including connections that leave the measure | Ties are drawn. A grace slur stays inside its measure. Phrase slurs are not drawn |
| Dynamics, articulations, fingering | Marks that are musical data and also typography | Not implemented |
| Collision avoidance beyond the current chord offsets | How nearby symbols move so they remain readable | Only the current chord rule |
| Musical typography | The consistent look of a finished engraving | In progress |

Staff assignment does not read the words “right hand” or “left hand.” When two tracks contain notes, the first becomes the treble staff and the second becomes the bass. When one track contains every note, Part C may name a `staffSplitPitch`. MIDI pitches at or above that number are read on the treble staff, and lower pitches on the bass. The track number on each note stays as it was. A Song with any other number of note-bearing tracks is not drawn, and a one-track Song without a split pitch is not drawn. The text preview still labels a hand only when the track name is exactly `Main droite` or `Main gauche`.

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
| Center | 1200px | Two identical experimental midGard staffs, then the generated measure divs |
| Right | 800px | The midGard Sheet Music Editor, centered. Choose a Song, Edit Mode, or Edit Names. In Edit Mode, the first two control rows have three columns |

The center and the right panel scroll vertically on their own. The workspace itself scrolls horizontally when the window is narrower than 3200 pixels. The three panels keep those widths.

The measure divs are arranged three to a row:

```css
display: grid;
grid-template-columns: repeat(3, minmax(0, 1fr));
```

Each measure div occupies one cell and is centered in that cell. The SVG inside keeps its natural width and height. A narrow measure is not stretched. Grid gaps and padding are page spacing. They are not musical spacing.

The song list is ordinary HTML. Its layout does not interpret the music. In Edit Mode the order is the two control rows, then Key signature beside Sheet system, Save Changes, Song Storage — IndexedDB, then Edit Names. Those rows use CSS Grid. Choose a Song hides those sections and clears the PDF and the SVG score. Edit Names replaces only the contents of the right panel with the title and composer. The three columns stay in place, and returning does not reload the PDF or redraw the score.

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

The musical fact stays in Part C. The curves are generated. A tie stored on the Song is drawn as Split Tie segments. A grace-note slur is a different curve: it stays inside the measure that contains the principal note, and it does not join durations. Phrase slurs, hairpins, and the other marks that cross from one SVG into the next are not drawn.

### The midGard Split Tie

**Decided and implemented.**

Traditional notation may draw a tie as one continuous curve from one notehead to the next. midGard Sheet Music cannot do that, because each measure is its own SVG. A curve is not allowed to leave its SVG and enter the next one.

The visual analogy is a banana. Traditional notation is one whole banana between the two notes. midGard cuts that banana into pieces, with a very small visual gap. Each piece belongs entirely to its own measure. The pieces should still look like parts of one original curve.

The system is not designed for only two measures. One sustained MIDI note may need written notes in three or more measures. The interpretation stores the written notes of the whole chain. The renderer generates:

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

A tie that begins and ends inside one measure is one complete curve in that measure’s SVG. It does not become a Split Tie. Bar 11’s two ties are complete curves. Bar 5’s second tie remains a Split Tie, with the outgoing piece in Bar 5 and the incoming piece in Bar 6.

**Selective ties, implemented.** Three written notes have two junctions, and each junction is decided on its own. An omitted list ties every junction. A `false` junction is a repeated written note of the same MIDI sound: another notehead, and no curve between it and the note before it. The written durations still add up to the original MIDI duration.

**Chord-aware tie direction, implemented.** A tied note that stands alone bows away from the middle line: downward below that line, and upward on or above it. The Bar 5 D4 uses that rule, so its curve still bows downward. When two or more tied notes share an onset, the lowest bows downward and the highest bows upward. A note between those outer notes bows toward the side with more room. The curves then sit outside the chord. The stroke width, the bow, and the gap before each notehead stay as they are. VexFlow’s `StaveTie` moves every note of a chord toward the stem. Two curves on that one side of a close dyad would run through the upper notehead, so this engine uses the outer sides instead. The direction is calculated from the tied notes at that onset. It is not a special case for one bar or one pitch.

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

3A uses our own SVG engraving engine, with one SVG per measure. The experiment has started that engine: staves, noteheads, ledger lines, stems, dots, chord placement, rhythmic spacing, unresolved notes, beams, and Split Tie segments for a spelling stored in Part C. It has not finished it. Clefs, rests, and accidentals are still absent.

### 3B — midGard Sheet Music

3B is a future notation with its own graphical rules. It is not a restyling of 3A. The same composition might look so different that an experienced pianist would not immediately recognize it. 3B reads the same Song and the same musical interpretation. It must not depend on the traditional engraving engine. It is not required to use five-line staves. The staff rules are in the next section. The on-screen experiment draws them. It does not yet read a Song.

The same Split Tie rule will apply to 3B: one measure, one div, one SVG, and no curve that depends on a neighboring SVG. The musical tie still lives in Part C.

The two systems are like one poem written once in Greek and once in Latin. The meaning can be the same while the letters and the layout are not. They share musical meaning. They do not have to share graphics or layout algorithms.

## The midGard staff

The midGard staff is a stack of four-line groups. It is not a five-line staff. A group’s four lines, from bottom to top, are F, G, A, and H. H is the German name for B. The letters between those lines are not given a second name in this rule. The experiment’s F3–B3 sit on the four lines of the lower blue group, and F4–B4 sit on the four lines of the upper blue group.

C4 is Middle C on the piano. The temporary experiment labels seven notes on each staff. The left staff reads C3 D3 E3 F3 G3 A3 B3. The right staff reads C4 D4 E4 F4 G4 A4 B4, drawn six staff spaces higher. C4 and its label are green. Those labels are not stored on a Song.

The standard layout has six groups, colored pastel pink, pastel pink, pastel blue, pastel blue, pastel pink, pastel pink. The two central blue groups are the permanent core. They stay. The pink groups around them may be left out when the music uses a smaller range, so a staff may have fewer than six groups. When the music needs more range, further groups are added above or below. Those added groups are green. There is no fixed top line and no fixed bottom line. The staff grows vertically with the music.

The distance between adjacent lines is the classical staff space, 14. A white gap of three staff spaces separates one group from the next inside a colored pair, and the same gap separates the pairs. The experiment draws the standard six groups and does not yet add or remove a group.

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

The page used to list notes that start at tick 0 up to, but not including, tick 2000. That list has been removed. The notes themselves remain in Part B. The window was never a saved measure, and it was never one bar. For Song A it mixes the pickup with part of Bar 1. For Song B a full bar is 1152 ticks when the written quarter is 384, so the same window is simply a slice of ticks.

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

Notes that start on the same tick sound together. At tick 1333 the right hand starts D4, G♯4, and B4, and the left hand starts E3 and E4. At tick 667, C♯5 and E2 start together in different hands. They are simultaneous. They are not one single-hand chord. Each of these notes has velocity 70.

The parser was right to report E4 from tick 0 to tick 667. The early mistake was to call the window that starts at tick 0 the first full measure. The pickup is an interpretation in Part C. The imported ticks stay in Part B.

### Song B, Bar 5: one MIDI note, three written notes

**Confirmed, stored in Part C, and drawn.**

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

Part B keeps the single event from tick 5280 to tick 6912. Part C keeps the three written values, in that order, on `sustainedNotes`. The two ties are the connections between those consecutive values. They are not stored as curves. When the Song also has a time signature, a quarter-note pickup, and 384 ticks per written quarter, the renderer draws a black sixteenth and a black half note in Bar 5, a black half note in Bar 6, and the Split Tie segment that belongs to each SVG.

The startup install described in section 4 copies this spelling into an existing Song B record when the MIDI event is still that note and Part C does not already spell it. Drawing does not consult a hardcoded fallback. If the record is missing the spelling, the D4 stays unresolved. If someone has already stored a different spelling of the same event, that spelling remains and the install does not replace it.

This example is why the engine needs a general rule. A later piece can have the same shape: one key held across written values and across a barline. The renderer does not recognize “Chopin, pitch 62, tick 5280.” It reads whatever spellings are saved on the Song it was given.

### Bar 11, C♯5 and E5: one sound, a repeated written note

Song B has two more sustained sounds that the duration catalog cannot name. Both are on track 2. Both start at tick 12192 and end at tick 13056. Each lasts 864 ticks, which is 2.25 written quarters when a written quarter is 384 ticks. Bar 11, in this reading, is ticks 11904–13056. Both sounds begin 288 ticks into the bar and end on its barline. Part B keeps each of them as one MIDI event. Nothing from either event continues into Bar 12.

The printed score writes each sound as three notes inside Bar 11:

| Written note | Ticks | Start | End | Tie into the next note |
|---|---:|---:|---:|---|
| Sixteenth | 96 | 12192 | 12288 | Yes |
| Quarter | 384 | 12288 | 12672 | No |
| Quarter | 384 | 12672 | 13056 | The sound has ended |

96 + 384 + 384 = 864. The last quarter is a repeated written note of the same held key. The MIDI file does not contain a second note-on there. The short ties stay inside Bar 11, one for C♯5 (MIDI 73) and one for E5 (MIDI 76). They are complete curves in Bar 11’s SVG.

Those two sixteenths form a chord, and their first quarters join the A5 and C♯6 quarters that already begin at tick 12288. The repeated quarters join the same two pitches again at tick 12672. C♯5 is the lower tied note, so its curve bows downward. E5 is the upper tied note, so its curve bows upward.

Part C stores both decisions on `sustainedNotes`, beside the Bar 5 D4:

```typescript
{ track: 2, midi: 73, startTick: 12192, endTick: 13056, written: ['sixteenth', 'quarter', 'quarter'], ties: [true, false] }
{ track: 2, midi: 76, startTick: 12192, endTick: 13056, written: ['sixteenth', 'quarter', 'quarter'], ties: [true, false] }
```

With a 3/4 time signature, a quarter-note pickup, and 384 ticks per written quarter, the renderer draws those six noteheads in black, the two short ties, and no tie between the quarters. The original MIDI events stay 864 ticks long.

### Bar 15, two A4s: a written sixteenth and one grace note

Song B’s Bar 15, in this reading, is ticks 16512–17664. Track 2 plays three A4 events around the second beat. Part B keeps all three:

| MIDI | Start | End | Sounding ticks | What the page writes |
|---|---:|---:|---:|---|
| 69 | 16800 | 16852 | 52 | A normal sixteenth, through tick 16896 |
| 69 | 16852 | 16896 | 44 | One grace note |
| 69 | 16896 | 18432 | 1536 | Two tied half notes, one in Bar 15 and one in Bar 16 |

The first event is the upper note of the sixteenth chord that also contains C♯4 (MIDI 61), which already lasts 96 ticks from 16800. The A4 key is released early so it can be struck again. The written value is still a sixteenth. It shares that chord, it is a normal black notehead with a stem, and it is not tied.

The second event is one grace note. The printed sign is a small filled A4, about two-thirds of a normal notehead, with an upward stem, one eighth-note flag, and no slash. A short slur runs beneath it toward the principal A4. That slur is not a tie. The grace note is drawn immediately to the left of the principal chord, inside Bar 15’s own SVG. It does not add a beat, and it does not create a column at tick 16852. The space it needs is added to the left of the principal column, so that column moves right and the preceding sixteenth stays where it was.

Part C stores the two decisions separately from `sustainedNotes`:

```typescript
{
  track: 2, midi: 69, startTick: 16800, endTick: 16852,
  written: 'sixteenth', writtenEndTick: 16896,
}
{
  track: 2, midi: 69, startTick: 16852, endTick: 16896,
  principal: { track: 2, midi: 69, startTick: 16896 },
  written: 'eighth', slash: false, slur: true,
}
```

The third event is one sustained sound written as two half notes. Part C stores it on `sustainedNotes`, in the same form as the Bar 5 D4:

```typescript
{ track: 2, midi: 69, startTick: 16896, endTick: 18432, written: ['half', 'half'], ties: [true] }
```

768 + 768 = 1536. The first half begins at tick 16896, which is beat 2 of Bar 15, and ends on the barline at 17664. The second half begins at 17664, beat 1 of Bar 16, and ends at 18432. There is one logical tie. Bar 15 draws the outgoing piece toward its own right edge. Bar 16 draws the incoming piece from its own left edge. Both pieces use the existing Split Tie: the same thickness, the same bow, and a downward curve, because A4 sits below the middle line and it is the only note in that tie. Neither curve enters the other measure’s SVG.

The grace note stays attached to the first half, because that written note still begins at tick 16896. Its small head, upward stem, eighth-note flag, and short slur stay in Bar 15. The slur ends to the left of the half note. The outgoing tie leaves from the right. Bar 16 does not gain a grace note.

In Bar 16 the second half joins the C♯5 and A5 halves that already begin at tick 17664. With the bass A3 and E4, that downbeat has five noteheads. The original MIDI event remains one note from 16896 to 18432.

The half notes are still drawn with the engine’s filled notehead. Open half-note heads, and the separate stem directions printed for A4 and the notes above it, are not part of this spelling. The dotted eighth and sixteenth at the start of Bar 15 are beamed. The long phrase slur, hairpins, and fingerings are still absent. Bars 15 and 16 can be compared with the PDF for these A4s. They are not yet a complete engraving of those bars.

### Song C

Song C is an intermediate piano arrangement of Wolfgang Amadeus Mozart’s *Eine kleine Nachtmusik*. The MIDI file is imported whole. The picture can draw its measures. The performed durations are not yet the written rhythm, so many noteheads are still unresolved.

| Fact | Value |
|---|---|
| Id | `eine-kleine-nachtmusik-intermediate` |
| Title | Eine kleine Nachtmusik — Intermediate |
| MIDI file | `midi-files/eine-kleine-nachtmusik-intermediate.mid` |
| PDF file | `pdf-files/eine-kleine-nachtmusik-intermediate.pdf` |
| MIDI format | 1 |
| Tracks | 1, and every note is on that track |
| PPQ | 480 |
| Tempo | One event, at tick 0: 500,000 microseconds per MIDI quarter, which is 120 BPM |
| Paired notes | 872 |
| Time-signature event | 4/4 at tick 0 |
| Key-signature event | none |
| First note onset | Tick 2734 |
| Last note release | Tick 91944 |

The PDF is a piano grand staff in 4/4 with one sharp and no pickup. G major is read from that sharp. The MIDI file does not contain a key signature, and the importer does not write one into Part C. The same is true of the written quarter. PPQ is 480, and a later reading may use 480 ticks per written quarter, but that number is interpretation. The page does not copy it from the file.

The 2734 ticks before the first note are silence at the start of the performance. They are not a pickup. Part B keeps those timestamps. Part C records `writtenStartTick: 2734`, which is the MIDI tick where printed Bar 1 begins. A Song that omits the field still begins at tick 0, which is what Songs A and B do. The planner adds the tick to each measure span. It does not subtract it from the stored notes.

There is no pickup, so the plan begins at Bar 1. Each complete bar is four written quarters. At 480 ticks per written quarter that is 1920 ticks. The first six bars are half-open spans:

| Bar | Start tick | End tick |
|---|---:|---:|
| 1 | 2734 | 4654 |
| 2 | 4654 | 6574 |
| 3 | 6574 | 8494 |
| 4 | 8494 | 10414 |
| 5 | 10414 | 12334 |
| 6 | 12334 | 14254 |

From that origin through the last note onset is 47 complete measures. A Song with a pickup still draws Bar 0 before Bar 1. The number in Sheet Music Display counts complete measures only, so the first six measures of Song A or Song B are Bar 0 plus Bars 1–6.

Both hands live on the one MIDI track. Part C records `staffSplitPitch: 60`. Pitches 60 and above are read on the treble staff, and lower pitches on the bass. This is a provisional split for engraving. It is not a claim that every note sits on the printed staff, and a later per-note staff choice can replace it. Songs A and B have two note-bearing tracks, so their staff assignment stays the track order even if a split pitch is also present.

Edit Mode, in the right-hand panel, chooses how many complete measures to draw: 1, 2, 3, 4, 5, 6, a custom positive whole number, or all measures. It also chooses 2 or 3 measures per row. An invalid custom number is reported and leaves the current score in place. Both choices are stored on the Song’s `display` object, beside Part C, and each Song keeps its own. Changing one leaves the other in place. A Song with no count still draws 16 complete measures, plus Bar 0 when there is a pickup. A Song with no row choice uses 3 per row. Song C’s first saved choice is 6 measures, with 2 per row. A number larger than the piece draws through the last measure that contains a note and says so. The original 872 notes stay in Part B. Later choices could choose the number of measures per row automatically, fit the row to the available width, or match the line breaks of the original PDF. Those modes are not implemented. The row choice stays `{ kind: 'fixed', count: 2 | 3 }` so one of those kinds can be added later.

The theme’s downbeats sit on a 480-tick quarter counted from tick 2734. The attacks between those downbeats are a performance. They land a few ticks early or late of a sixteenth grid, and one chord at tick 4638 falls 16 ticks before the Bar 2 barline even though it is that bar’s downbeat. Songs A and B do not need this correction: their performed attacks already match the written grid closely enough for the two-tick onset rule. Song C stores `writtenOnsetAlignment` with four subdivisions of the quarter and a maximum deviation of 30 ticks. That is a sixteenth grid. An attack within 30 ticks of a grid position is drawn at the grid position. An attack farther away keeps its MIDI onset and stays unresolved. The stored timestamps do not move, and the same tolerance is not applied to Songs A and B.

Measure membership uses that written onset before the note is given a column. The G chord whose keys went down at tick 4638 is drawn only in Bar 2. D5 at tick 4392 and D3 at tick 4423 share the written onset 4414, so they share one rhythmic column, and they remain two notes on two staffs.

The sounding durations stay a separate fact. They are often near an eighth or a quarter and are rarely an exact catalog value. The duration tolerance stays two ticks, so those near misses stay unresolved. Six notes have an explicit written duration because a nearest catalog value would be the wrong one. The G chord at tick 3686 is a printed eighth, including G4, whose key is held for 768 ticks. The B chord at tick 5376 is a printed eighth, including B4 and B5, whose keys are held for 30 ticks. Their sounding lengths are unchanged. The opening quarters and the other eighths in Bars 1 and 2 are still unresolved, because their performed lengths were not given a written reading. Rests, flags, and beams of more than two notes are not drawn yet.

## 15. Beams

A beam groups short written notes. It is not a tie, and it is not stored in Part C. The written durations and the time signature already say which notes belong together. Song B needs no new interpretation for its beams.

Grouping and engraving stay separate. `src/interpretation/beam-group.ts` names the groups. `src/engraving/beam.ts` turns a group of two events into stem extensions and polygon points. The measure SVG draws those points. Neither module stores pixels in the Song.

**Beam level.** An eighth, dotted or not, takes one beam. A sixteenth takes two. A dot does not add a level. A quarter, half, or whole note is not beamed. The level comes from the written duration. Bar 5’s D4 sounds much longer than a sixteenth, and Bar 15’s A4 sounds only 52 ticks, but each is written as a sixteenth, so each takes the second beam.

**Beat.** In 3/4 and 4/4 a group stays inside one quarter. In 6/8 it stays inside a dotted quarter. A shorter beat groups notes in twos, or in threes when the numerator is a multiple of three. The group also stays on one staff and one stem direction. A note at the same onset with a different duration, such as Bar 9’s G♯4 quarter beside the dotted eighth, is a separate event and stays out. Grace notes are not rhythmic events, so they stay out. The caller passes one measure, so a beam cannot cross a barline. A group of one note is discarded.

**Primary beam.** For a group of two, the slope is half the slope between the natural stem tips, and it is never steeper than 0.25. The line then moves outward until both stems can meet it without growing shorter. Upward stems carry the beam above the notes. Downward stems carry it below. The thickness is half a staff space. The shape is a filled four-point polygon. Each stem is lengthened through the existing stem extension until its free end meets the outer edge of that polygon. The notehead does not move, and the column spacing does not change.

**Secondary beam.** Two sixteenths take a second polygon parallel to the first, 1.5 thicknesses closer to the notes. A sixteenth beside an eighth takes only a short beamlet, about one staff space long, on the sixteenth and pointing back toward the eighth. The dotted eighth does not receive that beamlet.

**Chords.** Notes that already share a staff, an onset, and a written duration are one event with one stem. The beam joins those stems. It does not add a stem for each pitch.

**This piece.** Song B’s Bars 1, 3, 5, 7, 9, 11, 13, and 15 each contain one such group: a dotted eighth and a sixteenth on the first beat of the treble staff. Bars 1 and 9 are single notes, stemmed down. Bars 3, 11, and 13 are chords, stemmed down. Bars 5, 7, and 15 are chords, stemmed up. The other measures, including the pickup, have no eighth or sixteenth and stay unbeamed. The rule is the duration and the beat, not the bar number.

Bar 5’s D4 tie and Bar 11’s C♯5 and E5 ties still leave the noteheads. The beam meets the stem. Bar 15’s grace note and its slur stay beside the principal half note, and the A4 Split Tie between Bars 15 and 16 is unchanged.

The drawing currently accepts two events. A longer group is still identified, and it is not yet drawn. Rests, tuplets, beams across a barline, and an explicit voice identity are not part of this step. An unbeamed eighth still has a stem and no flag.

## 16. The SVG experiment

Above the classical score, the heading **midGard Staff — SVG Experiment** introduces two experimental staffs, side by side. Each is its own SVG, drawn by the same function and kept in its own div. A two-column grid separates them by 32 pixels and aligns them at the top. Neither SVG is stretched. The proportions come from `public/midgard-staff.png`, and the vertical unit is the classical staff space of 14. Six zones stack from top to bottom: pastel pink, pastel pink, pastel blue, pastel blue, pastel pink, and pastel pink. Each pair shares a frame. A zone is three colored spaces between four black lines. The white gap inside a frame, and the gap between frames, is three staff spaces. The lines and the left and right edges are 1.25 units thick. Two short ledger lines sit in the gap between the blue zones, and two more sit between the lower blue zone and the pink zone below it, near the left edge. A matching pair is centered on the second test note at those same heights. Each pair divides its gap into three equal spaces. Seven filled noteheads, the same size and color as a classical notehead, keep their horizontal spacing. The first sits in the space immediately below the lowest left ledger line. The second sits centered between its own ledger pair. The third sits one diatonic step below the bottom line of the lower blue zone, and the fourth is centered on that line. The fifth, sixth, and seventh are centered on the three lines above it, so the seventh sits on the top line of the lower blue zone. The left staff labels those notes C3 through B3. The right staff moves every note, and the two ledger pairs that belong to the first two notes, up by six staff spaces, and labels them C4 through B4. C4 and its label are green. The ledger pair between the blue zones stays where it is. A short explanation of the staff sits beside the two SVGs. They are not read from MIDI or Part C. The staff does not follow the Sheet system control. Both copies are shown for the open Song. Choosing another Song leaves those same staffs in place. Choose a Song hides them.

Under the heading **Traditional Sheet Music — SVG Experiment**, the page draws the measures chosen for the selected Song. The choice needs a time signature, a pickup answer, and ticks per written quarter. A pickup answer may be no. The written start tick, when saved, places Bar 1 or the pickup. If a required setting is missing, the section says so and draws no measures. It does not silently use PPQ.

Each measure is one div and one SVG. The grid places the song’s chosen number of measures on each row, 3 when that choice has not been saved, and 2 for Song C’s first saved choice. The SVG keeps the size the engraving calculated. Changing the row does not change the staff, the note spacing, or the viewBox. A measure wider than its cell scrolls inside that cell, so it does not cover the next measure.

For the selected Song, a recognized note is drawn with its notehead, its ledger lines, its stem when the duration has one, and its dot when the duration has one. Eighths and sixteenths that share a beat also receive a beam, inside that measure’s SVG. An unresolved note is drawn as a crimson notehead at its real onset. The warning under the measure lists the track, pitch, onset, duration, and the reason. The original MIDI is not changed.

The hand on the staff comes from track order, or from the staff split pitch when the Song has one track, as section 9 describes. The measures read `originalMidi` and `musicalInterpretation` from the stored Song. Switching Songs redraws the PDF, the measures, the settings, and that Song’s display choice.

The experiment does not yet draw:

- Clef symbols
- Noteheads from a music font
- Ordinary flags on notes that are not beamed
- Rests
- Accidentals
- Key or time signatures on the staff
- Phrase slurs
- A written duration invented for a note the catalog refused and that Part C does not spell

A tie is drawn when Part C spells the MIDI sound as written notes. A grace note is drawn when Part C stores one, including its short slur. The long phrase slur in the Chopin PDF is neither of those marks, and it is not drawn.

## 17. Where the engraving stands

The first engraving target was a professionally readable Bar 0 and Bar 1. A Song with no display choice still draws sixteen complete measures, plus a pickup when it has one. Sheet Music Display can ask for fewer, or for every measure that contains a note. That choice does not delete or shorten a Song. Song A’s 176 notes, Song B’s 168 notes, and Song C’s 872 notes remain in IndexedDB.

The engine stays general. Another Song, or a later measure, must be drawable without a new piece of Chopin-specific drawing code. The Bar 5 reading is a musical conclusion stored on Song B. The renderer does not contain that Song’s id.

Clefs, rests, accidentals, and music-font glyphs remain. Beams are drawn from the written durations. Song B’s Bar 11 spellings, Bar 15 sixteenth and grace note, and the tied A4 halves in Bars 15 and 16 are stored.

## 18. What works today, and what does not

Implemented:

- A Vite application in vanilla TypeScript, without a user-interface framework
- A 3200px workspace in CSS Grid: a 1200px PDF, 1200px of measures, and an 800px library and settings panel
- Three measure divs per row, each SVG at its natural size
- The Standard MIDI parser in `src/midi/`
- A terminal command that prints the notes starting in ticks 0–2000
- The PDF for the selected Song, in the left panel
- IndexedDB database `midgard-sheet-music`, version 1, with one `songs` store
- Import of Song A and Song B when each id is absent, without rewriting a Song that already exists
- Choose a Song, a vertical list filled from IndexedDB, and Edit Mode for the Song the user clicks. A refresh returns to the list. Change song does not write to the database
- A storage status panel whose facts come from the selected Song, including PPQ, tempo, and the file’s time signature as separate facts from the saved written quarter
- Song Settings, saved into that Song only
- Seventeen measure SVGs when the selected Song has a time signature, a pickup duration, and ticks per written quarter
- Staff lines, barline, ledger lines, noteheads, chord offsets, stems, augmentation dots, rhythmic spacing, and beams for eighths and sixteenths that share a beat
- Unresolved notes in Deep Crimson, with the original duration left unchanged
- `SongRepository`, with IndexedDB as its current implementation
- A written spelling of one MIDI sound in Part C, and the Split Tie segments drawn from that spelling
- Song B’s Bar 5 D4 spelling, stored on that Song and restored from IndexedDB
- Selective ties between written notes of one MIDI sound, including a repeated written note where a junction is untied
- Chord-aware tie direction: a lone tie follows the middle line, and simultaneous ties sit on the outer sides of their chord
- Song B’s Bar 11 C♯5 and E5 spellings, each a sixteenth tied to a quarter, then a repeated quarter, stored in Part C
- A written duration that can differ from the MIDI note-off, stored on `writtenDurations`, without creating a tie
- A grace note stored on `graceNotes`: smaller head, short stem, ornamental flag, optional slash, and an optional short slur, placed before its principal note and left out of the beat count
- Song B’s Bar 15 sixteenth A4 and its one unslashed grace-note A4, stored in Part C
- Song B’s principal A4, written as a half note in Bar 15 tied to a half note in Bar 16, using the existing Split Tie
- A local copy of the VexFlow source, kept for study and not used as the renderer

Decided, and not implemented:

- A procedure that discovers a written spelling from MIDI alone, for a duration the catalog cannot name
- The Split Tie geometry applied to slurs and other crossing marks

Not implemented:

- Remembering the selected Song across a refresh
- A general MIDI file picker
- The Music Editor
- Stored measure boundaries, voices, rests, and enharmonic spelling
- Clefs, music-font glyphs, ordinary flags on unbeamed notes, rests, accidentals, and key or time signatures on the staff
- A layout manager for systems, page breaks, and pagination, beyond the current CSS Grid
- Drawing a phrase slur, or any other non-tie symbol that crosses measure SVGs
- Convex, or any database other than IndexedDB
- The rest of traditional notation, 3A
- midGard notation, 3B
- Playback and a portable Song file

## 19. Architectural principles

1. One Song is one complete musical document in IndexedDB.
2. A measure is a graphical unit rendered from part of a Song, not a separate database record.
3. Every Song contains its own imported MIDI information, and that information is preserved unchanged.
4. Every Song contains its own editable musical interpretation, saved beside the import. One Song’s settings are never the settings of another.
5. Adding another Song must not require song-specific engraving code. A correction that belongs to one existing record is data in that Song, installed outside the renderer.
6. After import, editing and rendering read the Song from IndexedDB. Selecting a stored Song does not parse the MIDI again.
7. A MIDI note is a sounding event. A written note is how that sound is notated. One MIDI note may become several written notes.
8. A tie joins two consecutive written notes of the same pitch. A spelling may leave a later junction untied, so the same MIDI sound continues as a repeated written note. A performed release can also be shorter than the written value, and that written value is stored on its own. A grace note ornaments a principal note and is not part of the beat count. A slur phrases. It does not add durations.
9. Musical meaning is stored. SVG is generated. Pixel coordinates are not the musical record.
10. One measure is one HTML div and one complete SVG, with both piano staves inside it.
11. A cross-measure tie is a musical relationship plus coordinated geometry, then independent curve segments. No SVG path extends into a neighboring SVG.
12. Musical graphics are SVG. The page around them is HTML and CSS Grid. CSS Grid does not place notes.
13. The engraving engine draws one measure. The HTML layout places measure divs.
14. Traditional notation and midGard notation read the same Song and do not define it.
15. VexFlow is a reference. Our Song and our measure SVG come first.
16. MIDI parsing, musical editing, storage, engraving, and layout remain separate responsibilities.
17. The music engine does not choose the database. Application code depends on `SongRepository`. IndexedDB is the current implementation. Convex is the intended later one, and it is not part of this prototype.
18. A written-note correction is authoritative only when it is stored in that Song’s Part C.
19. The system grows by small steps that can be seen, compared with the score, and kept.

We compare an interpretation with the original PDF before treating it as settled. We do not add a dependency or an abstraction until it has a clear job.

## 20. What comes next

The early investigation of VexFlow, the Song model, and the first SVG has already been carried into the experiment described above. This README is not a numbered build plan.

Song B’s Bar 5 D4 is stored as three written notes and drawn with a Split Tie. Song B’s Bar 11 C♯5 and E5 are stored as a sixteenth tied to a quarter, followed by a repeated quarter, with the two ties on opposite sides of the chord. Song B’s Bar 15 writes the 52-tick A4 as a sixteenth and the 44-tick A4 as one unslashed grace note. The 1536-tick A4 is stored as two tied half notes, with the Split Tie divided between Bar 15 and Bar 16. Eighths and sixteenths that share a beat are drawn with a beam. Phrase slurs, hairpins, and fingerings are not part of this step. The database remains IndexedDB until a complete composition can be rendered. Convex is the planned replacement, behind `SongRepository`, and it is not part of the current code.

Each implementation step after that review should be small enough to:

1. Implement it.
2. Inspect the SVG visually.
3. Compare it with the printed PDF.
4. Correct any problems.
5. Commit the completed step.
6. Proceed to the next step.

The rest of either Song stays intact in IndexedDB while that work is done.

## 21. Open questions

These questions are deliberately unanswered. A decision elsewhere in this document is not repeated here as if it were still open.

Music and interpretation:

- How should the general tie rule choose written values when a MIDI duration is not itself a catalog value? Section 14 shows two confirmed results: the Bar 5 D4, and the Bar 11 sixteenth, quarter, and repeated quarter. The procedure that discovers a spelling for any Song is not chosen.
- How should the remaining unresolved notes in these preludes be written? Bar 15’s 52-tick A4 is a written sixteenth, its 44-tick A4 is a grace note, and its 1536-tick A4 is two tied half notes. Open half-note heads and the printed stem directions of that chord are not chosen yet.
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

- How should Song IDs be generated for a future import, beyond the three project ids?
- How should the selected Song be remembered after a refresh?
- How should the Song schema be versioned when a future change cannot be expressed as an optional field? Adding `sustainedNotes` did not require a new database version. A change that rewrites existing records still needs a plan.
- How do we preserve imported events that the parser does not yet fully interpret, so a later parser can still see them?
- How should a very large composition be stored and loaded?
- How should an edit be validated before it is saved?
- What should a portable Song export contain?

This README is a living reference. We extend it when a decision becomes settled, when an experiment starts to work, and when a comparison of the MIDI with the PDF teaches us something we did not know. The aim is a working application, and a clear account of how one Song can hold a whole piece of music while the page draws that piece as many independent measures.
