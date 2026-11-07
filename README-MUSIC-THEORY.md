# midGard Sheet Music — Music Theory and Architecture

This document is the working reference for the musical ideas and software architecture of **midGard Sheet Music**. It is written for someone learning music theory and software design at the same time.

The application is still early. Sections that describe future work are plans, not finished features.

## 1. Project vision

midGard Sheet Music is a TypeScript application for reading, interpreting, editing, storing, and displaying music.

The first repertoire is classical piano. The first example is Chopin's Prelude Op. 28 No. 7 in A major. We already have a MIDI performance of that prelude and a PDF of the printed score. Those two files let us compare what a computer recorded with what a musician reads on the page.

The long-term goal is to support two different ways of writing the same music down.

### 3A — Traditional Sheet Music

This is the notation used in most classical scores. It uses five-line staves, clefs, noteheads, stems, beams, rests, barlines, and the other familiar symbols. A pianist who knows ordinary notation should be able to read a 3A rendering of the Chopin prelude.

### 3B — midGard Sheet Music

This will be a different notation system, designed later for this project. It is not a small restyling of traditional notation. The same piece might look so different that an experienced pianist would not immediately recognize it.

A useful comparison is one poem written once in Greek and once in Latin. The meaning can be the same while the letters, words, and visual layout are not. Traditional notation and midGard notation are two writings of one musical meaning.

The rules of midGard notation are not defined yet. This document does not invent them.

## 2. The three-layer architecture

The application is divided into three layers. Each layer has a different job. A change in one layer should not force the others to change their job.

```text
Layer 1   Original MIDI source          immutable performance events
Layer 2   Musical information           editable interpretation
Layer 3   Visual representations        3A traditional, 3B midGard
```

### Layer 1 — Original MIDI source

A Standard MIDI file is a list of performance events. It records that a key went down, which key it was, how hard it was struck, and when it was released. It is closer to a recording of actions at a keyboard than to a printed score.

Our TypeScript parser in `src/midi/` reads that file. Its job is only to read. It stays independent of editing and of drawing. We do not change the parser in order to “fix” a musical interpretation.

MIDI files are immutable source material. We read them. We do not rewrite them when a person edits the piece inside the application.

From a file, the parser extracts facts such as:

- MIDI note numbers
- the tick when a note starts
- the tick when a note ends
- velocity, which is how strongly the note was struck
- the MIDI channel
- the track

A MIDI file does not necessarily contain everything a printed score needs. Our Chopin file, for example, has no time-signature event and no key-signature event. It also does not say whether a written note should be spelled C♯ or D♭. Those decisions belong to interpretation, not to the raw file.

### Layer 2 — Musical information and editing

This layer is the heart of the application. It holds our editable understanding of the music, separate from any picture of it.

Persistent storage is planned with IndexedDB, which is a database built into the browser. IndexedDB is not implemented yet.

Layer 2 can hold information such as:

- the identity of a composition and its metadata, such as title and composer
- notes and pitches
- when each note begins and how long it lasts
- measures and the boundaries between them
- time signatures
- key signatures
- pickup measures
- voices and which hand plays a note
- rests
- musical durations, such as quarter note or eighth note, after we interpret the raw timing
- ties and other relationships between notes
- enharmonic spelling, such as C♯ rather than D♭

**Raw MIDI timing and edited interpretation are different things.**

MIDI timing is a count of ticks. In our Chopin file, 1000 ticks are one MIDI quarter note. A note from tick 0 to tick 667 is a fact about that performance file.

A musical interpretation says what that fact means in the score: which bar it belongs to, whether it is a quarter note, whether it is tied into the next bar, and how it should be spelled. A person may correct that interpretation. The original MIDI facts remain available after those corrections, so we can always see what the file said and what we later decided.

### Layer 3 — Visual representations

Layer 3 draws the music. It contains two independent renderers.

**3A, the traditional notation renderer,** will produce conventional sheet music, eventually as SVG. SVG is a way to draw precise shapes in the browser.

**3B, the midGard notation renderer,** will produce the future alternative notation. It may also use SVG, but its drawing rules will be its own. It will not be required to use five-line staves.

Both renderers read the same musical information from Layer 2. Neither renderer defines what the music *is*. Layer 2 does not depend on either renderer. We can change how a note is drawn without changing the stored fact that the note exists.

## 3. Musical information versus visual information

The same note can be described in two ways.

Musical information answers musical questions:

- Which pitch is played?
- When does the note begin?
- How long does it last?
- Which other notes sound together with it?
- Which voice, or which hand, does it belong to?
- Which measure contains it?

Visual information answers drawing questions:

- Which SVG paths and elements are on the page?
- Where are they, in pixels or other drawing coordinates?
- What colors and fonts are used?
- Where do staff lines sit?
- What shape is a notehead?
- Does a stem go up or down?
- How much space is there between symbols?

Our principle is: **store musical meaning, not SVG markup.**

The authoritative record of a piece is not a saved picture of staves. If we stored only SVG, a different notation system would have to reverse-engineer the music from someone else's drawing. Both 3A and 3B would be trapped inside traditional staff geometry.

Traditional staff positions, stem directions, and pixel spacing do not belong in the shared musical model. Those are choices a particular renderer makes.

Some decisions sit close to notation but are still musical meaning. Enharmonic spelling is one of them. C♯ and D♭ can be the same piano key, and the same MIDI note number 61, while remaining different names in a key. Storing “this note is spelled C♯” records a musical decision. It does not tell 3A where to draw the notehead, and it does not tell 3B to draw a notehead at all.

## 4. MIDI timing and musical measures

A MIDI tick is a unit of time inside a file. A measure, also called a bar, is a grouping in written music. The file does not automatically know where the bars are.

Our Chopin MIDI file has these stored facts:

| Fact | Value |
|---|---|
| MIDI format | 1 |
| Tracks | 3 |
| Resolution | 1000 ticks per quarter note (PPQ) |
| Paired notes | 176 |
| Time-signature event | none |
| Track 2 name | Main droite (right hand) |
| Track 3 name | Main gauche (left hand) |

Track 1 carries the file name and the tempo. It has no notes.

The first browser display treated ticks 0 through 2000 as measure 1. That window was a supplied guess: three beats of about 667 ticks each, because 667 + 666 + 667 = 2000, and the file itself never states a time signature. Comparing that guess with the original PDF showed a **pickup measure**, also called an **anacrusis**. A pickup is a short group of notes that comes before the first full bar. In this reading, the opening E4 is that pickup, not beat 1 of a full bar.

The working interpretation, still provisional, is:

| Measure | Start tick | End tick | Description |
|---|---:|---:|---|
| Bar 0 | 0 | 667 | Pickup containing E4 |
| Bar 1 | 667 | 2667 | First full measure, provisional |
| Bar 2 | 2667 | 4667 | Following measure, provisional |

These boundaries must be checked again against the reference PDF. They are an interpretation, not a field stored in the MIDI file. Later bars in the file also drift away from a perfectly even tick grid, because the performance timing is written into the timestamps. A single fixed bar length may not describe the whole file without further musical judgment.

The MIDI parser was not wrong. It reported the events that are in the file, including an E4 from tick 0 to tick 667. The mistake was in deciding that tick 0 was the start of the first full measure.

A separate post-processing step solves this cleanly. The parser continues to say what the file contains. A later step, in Layer 2, places those events into pickup and full measures. If we learn that a boundary should move, we change the interpretation. We do not teach the parser a special case for one Chopin prelude.

Notes that cross a barline need special care. A note might start in one measure and still be sounding in the next. In print, that is often a tie: two written notes that sound as one held note. In MIDI, it may be one long note-on, or a note-off in one tick and a new note-on on the next tick. The raw interval and the written tie are not the same fact. The interpretation layer has to record which meaning we chose.

## 5. Our first Chopin MIDI example

The first extraction used the window from tick 0 up to, but not including, tick 2000. Nine notes begin in that window. Every one of them has velocity 70. Pitch names here use the scientific convention in which MIDI note 60 is C4. Sharps are a spelling choice for an A-major reading. The file stores only the note numbers.

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

Notes that start on the same tick sound together. They form a chord in the performance, even before we decide how a score should print them.

At tick 1333 the right hand, track 2, starts D4, G♯4, and B4 together. The left hand, track 3, starts E3 and E4 together. In the current page those groups are written `[D4 G#4 B4]` and `[E3 E4]`.

At tick 667, C♯5 and E2 also start together, but they belong to different tracks. They sound at the same time. They are not one single-hand chord.

These nine rows are raw MIDI events. They are not yet a fully corrected transcription of the printed score. The PDF remains the reference for that correction. In particular, the E4 at tick 0 is now understood as pickup material, so this table mixes the pickup with part of the following music. It is a useful first slice of the file, not the finished bar structure.

## 6. IndexedDB and persistence

We plan to use IndexedDB so that work done in the browser can still be there after the page is closed.

IndexedDB fits this project because we expect to need:

- persistent editing across browser sessions
- structured storage for compositions and musical events
- a place to save manual corrections
- a separation between imported source data and the edited interpretation
- more than one notation view of the same stored music
- later editor features that change Layer 2 without redrawing from scratch every time

IndexedDB storage is local to one browser, one site origin, and one browser profile. It does not automatically follow a person to another computer or another browser. It is not a backup. Clearing site data can remove it.

A future export and import of an editable project file is desirable, so a composition can be copied, archived, and opened again somewhere else. That file format is not chosen yet.

The database schema is not chosen yet either. Naming tables and fields before the musical model is clearer would freeze early guesses.

## 7. One measure per independent container

The planned picture on the page is built from separate measure boxes.

- Each measure has its own HTML container.
- Each measure can eventually contain one complete SVG.
- For piano, that SVG includes both the right-hand and the left-hand notation for that measure.
- Several containers can sit close together so the page reads as one continuous sheet.

This is a decision about rendering. It is not a rule forced onto the musical data. Layer 2 can describe a whole piece as notes, measures, and relationships. Layer 3 decides to draw one measure per box.

3A and 3B may lay the page out differently. One of them might use a traditional system of two staves. The other might not. Both can still read the same Layer 2 measure. The current text panel for the Chopin notes is an early container of this kind: one measure region on the page, not yet an engraving.

## 8. Current implementation status

Already working:

- a Vite application written in vanilla TypeScript, without a user-interface framework
- a centered parchment page inspired by the CivWiki layout
- a deep blue background visible on both sides of the parchment
- a MIDI parser in `src/midi/`
- a terminal command that prints the first MIDI slice of the Chopin file
- a browser display of the nine notes that start in ticks 0–2000
- grouping of those notes into right hand and left hand by the track names Main droite and Main gauche
- chords shown for notes that start on the same tick
- the original Chopin PDF embedded below those results, for comparison
- a local copy of the VexFlow source, kept as reference material and not used as the application's renderer

Not implemented:

- IndexedDB persistence
- an editable musical model in Layer 2
- a corrected pickup and measure structure in that model
- SVG music engraving
- the traditional notation renderer, 3A
- the midGard notation renderer, 3B
- MIDI playback
- editing of notes, bars, or spellings

## 9. Architectural principles

1. **Preserve original source data.** The MIDI file and the facts read from it remain available after editing.
2. **Keep MIDI parsing independent from editing.** The parser does not absorb one piece's barlines or spelling choices.
3. **Keep musical information independent from graphical rendering.** Layer 2 does not import 3A or 3B.
4. **Store musical meaning rather than SVG markup.** A saved score is not a pile of drawing elements.
5. **Support traditional and midGard notation equally.** Neither renderer is the definition of the music.
6. **Do not assume that all notation uses five-line staves.** Staff geometry stays inside the traditional renderer.
7. **Keep the system modular and understandable.** A reader should be able to point at a layer and say what it is allowed to know.
8. **Implement one small, verifiable milestone at a time.** Each step should be checkable against the file or the PDF.
9. **Compare our musical interpretation with the original PDF.** The printed prelude is the reference for what the written piece does.
10. **Avoid unnecessary dependencies and complexity.** New libraries and new abstractions need a clear job.

## 10. Future development

The planned sequence is:

1. Document the architecture and musical concepts. This file is that step.
2. Introduce a minimal musical information model for Layer 2.
3. Add IndexedDB persistence for that model.
4. Correct the pickup and the measure boundaries, using the PDF as the check.
5. Build simple editing controls for the musical information, not for SVG.
6. Verify the corrected notes and measures against the PDF.
7. Begin traditional SVG notation experiments, renderer 3A.
8. Later, define the midGard notation rules, then implement renderer 3B.
9. Eventually support complete compositions, editing, playback, and export.

These are plans. None of steps 2 through 9 is a completed feature.

## 11. Open questions

These questions are deliberately unanswered.

- How should MIDI timing be converted into symbolic rhythm, such as quarter notes and eighth notes, especially where the performance does not land on a perfect grid?
- How should a pickup measure be represented in Layer 2?
- How should a note that crosses a barline be stored: as one sounding event, as two tied written notes, or as both?
- How should musical voices be represented when one hand plays more than one line?
- How should rests be inferred when the MIDI file simply has silence?
- Which musical decisions belong in the shared Layer 2 data, and which belong only to 3A or only to 3B?
- How should manual corrections be preserved if the same MIDI file is imported again?
- What will the midGard notation system look like?

## 12. Living document

This README is meant to grow with the project. We will add music-theory explanations, examples from the Chopin prelude, architectural decisions, and discoveries from comparing MIDI with the PDF.

The aim is a working application and a clear account of how musical information can be stored on its own, without being tied to one picture of that music. When 3B is eventually designed, this document should be able to explain it beside 3A without rewriting the meaning of Layer 2.
