# midGard Sheet Music — Music Theory and Architecture

This document is the working reference for the musical ideas and software architecture of **midGard Sheet Music**. It is written for someone learning music theory and software design at the same time.

The application is still early. Sections that describe storage, editing, and notation are plans, not finished features.

## 1. One song is one musical document

**ONE SONG = ONE COMPLETE MUSICAL DOCUMENT**

Every composition is one self-contained Song. After it has been imported, that Song is stored in IndexedDB, the database built into the browser. The first database now exists. Editing the musical interpretation does not.

A Song holds four kinds of information together:

1. Metadata about the composition.
2. The complete information extracted from its original MIDI file.
3. Musical interpretations and corrections made after that import.
4. Further musical information added later in the editor.

All of this belongs to the same Song. We do not scatter the original MIDI facts across TypeScript files or hide them in application constants that name one particular piece.

Once a Song has been imported, normal editing and rendering use the copy stored in IndexedDB. The MIDI file on disk remains the external source. We do not need to parse that file again every time the page is drawn or a correction is saved.

The first repertoire is classical piano. The first example is Chopin's Prelude Op. 28 No. 7 in A major. A MIDI performance and a PDF of the printed score already let us compare a keyboard recording with what a musician reads on the page.

## 2. The three parts of a Song

Each Song has three conceptual parts. They live in one document so that import, correction, and display stay attached to the same composition.

### Part A — Metadata

This identifies the Song and describes where it came from. Examples:

- Song ID
- Title
- Composer
- Source MIDI filename
- Other descriptive information, such as a catalog number or a short note about the edition

Metadata is not the music itself. It tells us which piece this document is.

### Part B — Original MIDI information

This is the parsed MIDI data, kept as it was imported.

A Standard MIDI file is a list of performance events. It records that a key went down, which key it was, how strongly it was struck, and when it was released. That is closer to a recording of actions at a keyboard than to a printed score.

Part B can include:

- MIDI format
- PPQ, the number of ticks per quarter note
- Tracks and track names
- Notes, as MIDI note numbers
- Start ticks and end ticks
- Velocities and channels
- Tempo events
- Time-signature events, when the file actually contains them
- Other relevant MIDI events the parser was able to read

This part is not overwritten when someone corrects the music. A later decision about barlines or spelling does not erase the imported ticks.

The TypeScript parser in `src/midi/` is a general-purpose importer. It reads a Standard MIDI file and returns structured MIDI information. It does not know about IndexedDB, about one Chopin prelude, or about how a score should be drawn.

A MIDI file does not always contain everything a printed score needs. Our Chopin file has no time-signature event and no key-signature event. It also does not say whether a written note should be spelled C♯ or D♭. Those decisions are interpretation. They belong in Part C, not in a rewritten copy of Part B.

### Part C — Musical interpretation and editing

This is the musical information added or corrected after import. It is editable, and it is saved with the same Song.

Song Settings, the panel on the parchment page, edits the composition-wide part of this interpretation:

- Time signature, as a numerator and a denominator
- Key signature, as a tonic and a mode such as A major
- Pickup, also called an anacrusis: whether the piece has one, and, when it does, its written duration

The pickup duration is a musical value: sixteenth, eighth, quarter, or half note. It is not a MIDI tick count. The screen shows every conventional major and minor key, with its number of sharps or flats. Those counts are not stored separately. They follow from the tonic and the mode.

Song Settings is not the Music Editor. The Music Editor will be a later workstation for individual measures and notes. These composition-wide fields are stored now. The following are not:

- Measure boundaries
- Note-by-note corrections
- Voices and hand assignments beyond the imported track names
- Rests, ties, and spelling of individual notes

A correction changes the Song's interpretation. It does not change the imported MIDI data sitting beside it in Part B. Saving a new title or composer changes metadata only. The source MIDI filename stays as it was imported. Part C can grow. A later save of Song Settings replaces the fields above and leaves any other interpretation properties in place.

**Raw MIDI timing and written interpretation stay distinct inside the same Song.**

MIDI timing is a count of ticks. In the Chopin file, 1000 ticks are one MIDI quarter note, so a note from tick 0 to tick 667 is a fact about that performance. The interpretation says what that fact means in the written piece: which bar it belongs to, whether it is a quarter note, whether it is tied, and how it is spelled. After a correction, both accounts remain: what the file said, and what we later decided.

## 3. IndexedDB and the songs store

The browser database is implemented.

| Setting | Value |
|---|---|
| Database name | `midgard-sheet-music` |
| Database version | 1 |
| Object store | `songs`, with `id` as the key |
| TypeScript model | `Song` in `src/song/song.ts` |
| Database module | `src/song/song-database.ts` |

`Song` has `id`, `schemaVersion` (currently 1), `metadata`, `originalMidi`, and `musicalInterpretation`. `originalMidi` is the parser's own `MidiFile` type, not a second copy of those fields. The parser result is plain data, so IndexedDB structured clone can store it. `musicalInterpretation` starts empty. Song Settings can then store a time signature, a key signature, and a pickup on that same object. Measure boundaries are still not stored.

The page asks IndexedDB for `chopin-prelude-op-28-no-7`. If that record is missing, `src/song/import-chopin-song.ts` parses `chopin-prelude-op-28-no-7-in-a-major.mid`, builds the Song, and inserts it. If the record is already there, the page loads it and does not write again. A reload therefore does not overwrite or duplicate the Song. The MIDI file is used only for that first insert.

What the page shows is then read from the stored record: title, composer, note count, track count, and the notes inside `originalMidi`. Song Settings fills its fields from that same record. A time signature or key that has not been saved is left unselected. The page does not invent 3/4 or A major from the Chopin PDF. The tick window `[0, 2000)` is only a temporary screen filter in `src/main.ts`. It is not saved as a measure boundary.

The same store can later hold other compositions without a new database design:

Three independent records, all using the same general structure, might be:

| Record | Composition |
|---|---|
| Song 1 | Chopin — Prelude Op. 28 No. 7 |
| Song 2 | Chopin — Prelude Op. 28 No. 4 |
| Song 3 | Beethoven — Für Elise |

Importing another composition creates another Song record. Adding that piece should not require a change to the application source code. The program already knows how to store a Song. It does not need a new TypeScript constant for each title.

A Song is a logical document: one structured object in IndexedDB. It is not necessarily a file on disk. Later we may add a portable export and import format so a Song can be copied, archived, and opened again on another machine. That file format is not chosen yet.

IndexedDB storage is local to one browser, one site origin, and one browser profile. It does not follow a person to another computer by itself. It is not a reliable backup. Clearing the browser's site data can remove it.

The store is one record per Song, with the import and the interpretation kept side by side. Song Settings writes into that record with `replaceSong`. The write replaces the existing id and does not insert another Song. There is still no general file-picker import, no Music Editor, and no portable Song file.

## 4. How a Song moves through the application

The intended workflow has five steps.

**Step 1 — Import MIDI.** The parser reads a Standard MIDI file and returns structured MIDI information. Nothing about barlines or spelling is invented inside the parser. Today this runs only for the first Chopin file, and only when its Song is missing. A general file picker is still planned.

**Step 2 — Create the Song.** The application builds one Song. Part A receives the title, composer, and source filename. Part B receives the parsed MIDI information. Part C is an empty object. The Song is inserted into `songs`. This insert is implemented.

**Step 3 — Read the Song.** The page loads that record back from IndexedDB and uses it for the note panel and the storage status. A reload takes this path and does not parse the file again. This read is implemented.

**Step 4 — Interpret and edit.** Song Settings is implemented. The user can set the title, composer, time signature, key signature, and pickup, then press Save Changes. The page validates the form, writes metadata and Part C, and reads the Song back. Reload restores those choices. The Music Editor, for measures and individual notes, is not implemented. The provisional tick boundaries from the PDF comparison are not stored.

**Step 5 — Render.** A notation system will read the Song and draw it. The current page already reads the stored notes for its text panel. SVG rendering does not exist yet. The renderer must not open the MIDI file and must not own the stored musical facts.

## 5. Three layers, with the Song in the middle

The application still has three layers. The Song is how Layer 2 holds a whole composition.

```text
Layer 1   MIDI import          read a file, return structured events
Layer 2   Song and IndexedDB   one document: import plus interpretation
Layer 3   Notation systems     3A traditional, 3B midGard
```

### Layer 1 — MIDI import

This is the existing parser. Its only responsibility is to read a Standard MIDI file and return structured MIDI information. It stays independent of the database, of musical corrections, and of graphical notation. We do not change the parser in order to "fix" one piece.

The MIDI file itself remains immutable external material. Editing a Song does not rewrite that file.

### Layer 2 — Song and IndexedDB

This is the central musical layer and the authoritative store of musical information the application keeps.

Each Song contains both the preserved MIDI import and the editable interpretation. IndexedDB provides the persistence. After import, this layer is what editing and rendering consult.

### Layer 3 — Notation systems

Two independent renderers read musical information from Layer 2. Neither of them defines the Song.

**3A — Traditional Sheet Music** is conventional notation: staves, clefs, noteheads, stems, beams, rests, barlines, and the other familiar symbols. A pianist who knows ordinary notation should be able to read a 3A rendering. It will eventually be drawn with SVG, a way to describe precise shapes in the browser.

**3B — midGard Sheet Music** will be a different notation system, designed later. It is not a small restyling of 3A. The same composition might look so different that an experienced pianist would not immediately recognize it. 3B may also use SVG, but its drawing rules will be its own. It is not required to use five-line staves.

The two systems are like one poem written once in Greek and once in Latin. The meaning can be the same while the letters and the visual layout are not. Both writings read the same Song. Neither renderer should dictate that Song's fundamental structure.

The rules of midGard notation are not defined yet. This document does not invent them.

## 6. Musical information versus graphics

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
- Where are they, in pixels or other drawing coordinates?
- Which colors and fonts are used?
- Where would staff lines sit, if this renderer uses staves?
- What shape is a notehead, which way does a stem go, and how far apart are the symbols?

**STORE MUSICAL INFORMATION, NOT SVG MARKUP.**

The Song stores musical meaning. It does not store SVG elements, pixel positions, staff coordinates, or graphical paths as its authoritative musical information. If the authoritative record were a picture of staves, the midGard renderer would have to recover the music by reading someone else's drawing. Both notations would be trapped inside traditional staff geometry.

Each notation system transforms the Song into its own picture. 3A and 3B may follow entirely different graphical rules. Staff positions, stem directions, and pixel spacing stay inside the renderer that needs them. They do not enter the shared Song as the definition of the note.

Some decisions sit close to notation and are still musical meaning. Enharmonic spelling is one. C♯ and D♭ can be the same piano key, and the same MIDI note number 61, while remaining different names in a key. Storing "this note is spelled C♯" in Part C records a musical decision. It does not tell 3A where to put a notehead, and it does not tell 3B to draw a notehead at all.

## 7. The Chopin prelude as our first example

The first MIDI file is Chopin's Prelude Op. 28 No. 7 in A major. These facts are in the file:

| Fact | Value |
|---|---|
| MIDI format | 1 |
| Tracks | 3 |
| Resolution | 1000 ticks per quarter note (PPQ) |
| Paired notes | 176 |
| Time-signature event | none |
| Track 2 | Main droite, the right hand |
| Track 3 | Main gauche, the left hand |

Track 1 carries the file name and the tempo. It has no notes. After the first visit, this whole parse is Part B of the stored Song, not a table kept in the page.

A MIDI tick is a unit of time inside the file. A measure, also called a bar, is a grouping in written music. The file does not automatically know where the bars are.

The note panel still filters the stored notes to those that start at tick 0 up to, but not including, tick 2000. That window is a temporary development view, not a record in the Song. It was originally a supplied guess: three beats of about 667 ticks, because 667 + 666 + 667 = 2000. Nine notes begin there. Each has velocity 70. Pitch names use the scientific convention in which MIDI note 60 is C4. The sharps are an A-major spelling. The file stores only the note numbers.

| MIDI | Pitch | Start | End | Track |
|---|---|---:|---:|---:|
| 64 | E4 | 0 | 667 | 2 |
| 73 | C#5 | 667 | 1167 | 2 |
| 40 | E2 | 667 | 1333 | 3 |
| 74 | D5 | 1167 | 1333 | 2 |
| 62 | D4 | 1333 | 1999 | 2 |
| 68 | G#4 | 1333 | 1999 | 2 |
| 71 | B4 | 1333 | 1999 | 2 |
| 52 | E3 | 1333 | 1999 | 3 |
| 64 | E4 | 1333 | 1999 | 3 |

Notes that start on the same tick sound together. At tick 1333 the right hand starts D4, G♯4, and B4 together, and the left hand starts E3 and E4 together. The page writes those groups as `[D4 G#4 B4]` and `[E3 E4]`. At tick 667, C♯5 and E2 also start together, but they belong to different hands. They are simultaneous. They are not one single-hand chord.

Comparing that first window with the original PDF showed a pickup measure, an anacrusis: a short group of notes before the first full bar. In the current reading, the opening E4 is that pickup, not beat 1 of a full bar. The provisional boundaries are:

| Bar | Start tick | End tick | Pickup |
|---|---:|---:|---|
| 0 | 0 | 667 | Yes |
| 1 | 667 | 2667 | No |
| 2 | 2667 | 4667 | No |

These boundaries still have to be checked against the PDF. Later timestamps in the file also leave a perfectly even grid, because the performance timing was written into the ticks. A single bar length may not describe the whole prelude without further musical judgment.

The architectural lesson is the important part. The MIDI parser is correct. It reported the events in the file, including E4 from tick 0 to tick 667. The mistake was the interpretation that tick 0 began the first full measure. That correction belongs in Part C. It is not stored yet. The parser stays unchanged, and reloading the page does not rewrite Part B.

A note can also cross a barline: it starts in one measure and is still sounding in the next. In print that is often a tie, two written notes that sound as one held note. In MIDI it may be one long note, or a note-off followed one tick later by a new note-on. The imported interval and the written tie are different facts. Part B keeps the interval. Part C records which written meaning we chose.

The nine-note table remains a raw slice of the import. It mixes the pickup with part of the following music. It is not yet a corrected transcription of the printed score.

## 8. One measure per SVG container

The planned picture on the page is built from separate measure boxes.

- Each measure has its own HTML container.
- Each container can eventually hold one complete SVG.
- For piano, that SVG includes both the right hand and the left hand for that measure.
- Several containers can sit close together so the page reads as one continuous sheet.

This is a rendering decision. It is not a rule for how the Song is stored. The Song is one IndexedDB record for the whole composition. We do not split it into one database record per measure just because the page draws one box per measure.

3A and 3B may lay those boxes out differently. One may draw two traditional staves. The other may not. Both still read the same Song. The text panel now on the parchment page is an early container of this kind: one region for a slice of the prelude, not yet an engraving.

## 9. What works today, and what does not

Already implemented:

- A Vite application in vanilla TypeScript, without a user-interface framework
- A centered parchment page, with a deep blue background on both sides
- The Standard MIDI parser in `src/midi/`
- Extraction of MIDI notes, including the nine notes that start in ticks 0–2000
- A terminal command that prints that slice
- The same slice on the parchment page, grouped into right hand and left hand by the track names stored in the Song
- Chords shown where notes share a start tick
- The original Chopin PDF, embedded below those results for comparison
- IndexedDB database `midgard-sheet-music`, version 1, with one `songs` object store
- Import of the Chopin prelude as Song `chopin-prelude-op-28-no-7` when that id is absent
- Loading that same record on later visits without parsing or overwriting it
- A storage status panel whose title, id, note count, and track count come from the stored Song
- Song Settings: title, composer, time signature, key signature, and pickup duration, saved into the existing Song
- A local copy of the VexFlow source, kept as reference material and not used as our renderer

Not yet implemented:

- A general MIDI file picker
- The Music Editor for measures and individual notes
- Measure boundaries and other note-level corrections
- A display that uses a corrected measure structure
- The traditional SVG renderer, 3A
- The midGard renderer, 3B

Playback and a general editor are also still ahead of us. None of the items in the second list should be described as present in the application.

## 10. Architectural principles

1. One Song is one complete musical document.
2. Every Song contains its own imported MIDI information.
3. Every Song contains its own editable musical interpretation.
4. Imported MIDI information is preserved unchanged.
5. Musical corrections are saved separately within the same Song.
6. IndexedDB is the persistent storage for Songs.
7. After import, normal editing and rendering read the Song from IndexedDB.
8. Adding another Song must not require modifying application source code.
9. Musical information must remain independent of SVG.
10. Traditional notation and midGard notation read the same Song.
11. MIDI parsing, musical editing, storage, and rendering remain separate responsibilities.
12. The system grows by small, verifiable steps.

Two further habits follow from these rules. We compare an interpretation with the original PDF before treating it as settled. We do not add a dependency or an abstraction until it has a clear job.

## 11. The development sequence from here

SVG notation waits until the Song foundation works. The planned order is:

1. Document the Song architecture. Done in this file, and revised as the store took shape.
2. Define a minimal TypeScript Song interface, without freezing every future field. Done. Part C now has the Song Settings fields, and it can still hold later properties beside them.
3. Implement the IndexedDB `songs` object store. Done.
4. Import the existing Chopin MIDI file and save it as one Song. Done for the first visit only.
5. Verify that the parsed MIDI information is still there after the page is closed and opened again. Done for this first Song: a reload reads the record and does not replace it.
6. Display musical information by reading the Song from IndexedDB. Done for the current text panel. The panel still uses a temporary tick window, which is not part of the stored interpretation.
7. Introduce editable interpretation inside the Song, stored beside the import. Started: Song Settings saves the composition-wide fields. Measure and note editing are still ahead.
8. Correct the pickup and the measure boundaries through that stored interpretation, and check them against the PDF. The pickup can now be recorded as a written note value. Its tick span, and the later barlines, are not saved yet.
9. Develop the Music Editor for measures and notes, not for SVG elements.
10. Implement traditional SVG notation, renderer 3A.
11. Later, define the midGard notation rules, then implement renderer 3B.

Steps 8 through 11 are still plans. Song Settings is the editing that exists today. SVG notation stays behind it.

## 12. Open questions

These questions are deliberately unanswered.

Music and interpretation:

- How should MIDI timing be converted into symbolic rhythm, such as quarter notes and eighth notes, especially where the performance does not land on a perfect grid?
- Song Settings stores whether a pickup exists and which written note value it has. How should that value be aligned with MIDI ticks, and where do the following barlines belong?
- How should a note that crosses a barline be stored: as one sounding event, as two tied written notes, or as both?
- How should musical voices be represented when one hand plays more than one line?
- How should rests be inferred when the MIDI file simply has silence?
- Where does enharmonic spelling live, and which other decisions belong in the shared Song rather than only in 3A or only in 3B?
- How should manual corrections survive if the same MIDI file is imported again?
- What will the midGard notation system look like?

Storage and the life of a Song:

- How should Song IDs be generated?
- How should we version the Song schema as Part C grows?
- How do we preserve imported events that the parser does not yet fully interpret, so a later parser can still see them?
- How should a very large composition be stored and loaded?
- How should an edit be validated before it is saved?
- How should future database migrations update Songs that were saved by an older version?
- What should a portable Song export and import file contain?

This README is a living reference. We will extend it with music-theory explanations, examples from the Chopin prelude, architectural decisions, and discoveries from comparing MIDI with the PDF. The aim is a working application and a clear account of how one Song can hold musical meaning without being tied to one picture of that music.
