/**
 * Checks the Chopin étude import: the complete MIDI, an empty first insert,
 * and a foundation that fills only missing written settings.
 * The memory repository stands in for IndexedDB. This file does not open a database.
 * It does not import project-songs.ts, because that module loads MIDI through Vite.
 */
import { readFileSync } from 'node:fs'
import { displayedMeasures } from '../src/notation/written-measures.ts'
import {
  ETUDE_COMPLETE_MEASURES,
  ETUDE_KEY_SIGNATURE,
  ETUDE_MEASURES_PER_ROW,
  ETUDE_PICKUP,
  ETUDE_SONG_ID,
  ETUDE_TICKS_PER_WRITTEN_QUARTER,
  ETUDE_TIME_SIGNATURE,
  installEtudeFoundation,
  planEtudeFoundation,
} from '../src/song/install-etude.ts'
import type { SongRepository } from '../src/song/song-repository.ts'
import { isSong, SONG_SCHEMA_VERSION, type Song } from '../src/song/song.ts'
import { parseMidi } from '../src/midi/parse-midi.ts'
import { pitchName } from '../src/midi/pitch.ts'

function fail(message: string): never {
  throw new Error(message)
}

const midi = parseMidi(new Uint8Array(readFileSync('midi-files/etude-op10-no3-e-major-tristesse-chopin.mid')))
if (midi.format !== 1) fail(`Étude format is ${midi.format}.`)
if (midi.ppq !== 480) fail(`Étude PPQ is ${midi.ppq}.`)
if (midi.trackCount !== 2) fail(`Étude track count is ${midi.trackCount}.`)
const perTrack = new Map<number, number>()
for (const note of midi.notes) perTrack.set(note.track, (perTrack.get(note.track) ?? 0) + 1)
if (perTrack.get(1) !== 1175 || perTrack.get(2) !== 751) {
  fail(`Étude notes per track are ${[...perTrack.entries()].join(', ')}.`)
}
if (midi.notes.length !== 1926) fail(`Étude has ${midi.notes.length} notes.`)
if (midi.tempos.length !== 85) fail(`Étude has ${midi.tempos.length} tempo events.`)
const openingTempo = midi.tempos[0]
if (openingTempo?.tick !== 0 || openingTempo.microsecondsPerQuarter !== 2_399_998) {
  fail('The first étude tempo is not 2399998 µs at tick 0.')
}
if (midi.timeSignatures.length !== 2) fail(`Étude has ${midi.timeSignatures.length} time signatures.`)
const pickupMeter = midi.timeSignatures[0]
const bodyMeter = midi.timeSignatures[1]
if (pickupMeter?.tick !== 0 || pickupMeter.numerator !== 1 || pickupMeter.denominator !== 8) {
  fail('The étude does not start with 1/8 at tick 0.')
}
if (bodyMeter?.tick !== 240 || bodyMeter.numerator !== 2 || bodyMeter.denominator !== 4) {
  fail('The étude does not change to 2/4 at tick 240.')
}
if (midi.keySignatures.length !== 2) fail(`Étude has ${midi.keySignatures.length} key signatures.`)
if (midi.keySignatures.some((key) => key.tick !== 0 || key.sharps !== 4 || key.mode !== 'major')) {
  fail('An étude key signature is not E major at tick 0.')
}
const pitches = midi.notes.map((note) => note.midi)
const lowest = Math.min(...pitches)
const highest = Math.max(...pitches)
if (lowest !== 33 || pitchName(lowest) !== 'A1') fail(`Lowest étude pitch is ${lowest}.`)
if (highest !== 100 || pitchName(highest) !== 'E7') fail(`Highest étude pitch is ${highest}.`)
const firstOnset = Math.min(...midi.notes.map((note) => note.startTick))
const lastRelease = Math.max(...midi.notes.map((note) => note.endTick))
if (firstOnset !== 0) fail(`The first étude note starts at tick ${firstOnset}.`)
if (lastRelease !== 74111) fail(`The last étude note ends at tick ${lastRelease}.`)
if (SONG_SCHEMA_VERSION !== 1) fail('Importing the étude changed the Song schema version.')
const databaseSource = readFileSync('src/song/song-database.ts', 'utf8')
if (!databaseSource.includes('export const SONG_DATABASE_VERSION = 1')) {
  fail('Importing the étude changed the IndexedDB version.')
}

const projectSongs = readFileSync('src/song/project-songs.ts', 'utf8')
for (const expected of [
  "export const CHOPIN_ETUDE_SONG_ID = 'chopin-etude-op10-no3-tristesse'",
  'id: CHOPIN_ETUDE_SONG_ID',
  "title: 'Étude Op. 10 No. 3 in E major (Tristesse)'",
  "composer: 'Frédéric Chopin'",
  "sourceFilename: 'etude-op10-no3-e-major-tristesse-chopin.mid'",
  "pdfFilename: 'etude-op10-no3-e-major-tristesse-chopin.pdf'",
  'if (existing) continue',
  'musicalInterpretation: {}',
]) {
  if (!projectSongs.includes(expected)) fail(`project-songs.ts no longer contains: ${expected}`)
}
if (/ticksPerWrittenQuarter|pickup|timeSignature|keySignature/.test(projectSongs)) {
  fail('The project importer now writes Part C settings.')
}
const main = readFileSync('src/main.ts', 'utf8')
if (!main.includes('installEtudeFoundation')) fail('Startup does not install the étude foundation.')

const bare: Song = {
  id: ETUDE_SONG_ID,
  schemaVersion: SONG_SCHEMA_VERSION,
  metadata: {
    title: 'Étude Op. 10 No. 3 in E major (Tristesse)',
    composer: 'Frédéric Chopin',
    sourceFilename: 'etude-op10-no3-e-major-tristesse-chopin.mid',
    pdfFilename: 'etude-op10-no3-e-major-tristesse-chopin.pdf',
  },
  originalMidi: midi,
  musicalInterpretation: {},
}
if (!isSong(bare)) fail('The imported étude is not a valid Song document.')
if (Object.keys(bare.musicalInterpretation).length !== 0) fail('The étude was imported with Part C settings.')

const prelude: Song = {
  id: 'chopin-prelude-op28-no7-b',
  schemaVersion: SONG_SCHEMA_VERSION,
  metadata: { title: 'Prelude', composer: 'Frédéric Chopin', sourceFilename: 'prelude.mid' },
  originalMidi: midi,
  musicalInterpretation: {
    timeSignature: { numerator: 3, denominator: 4 },
    pickup: { present: true, duration: 'quarter' },
    ticksPerWrittenQuarter: 384,
    sustainedNotes: [],
  },
  display: { measures: { kind: 'count', count: 16 }, measuresPerRow: { kind: 'fixed', count: 3 } },
}

function memoryLibrary(initial: readonly Song[]): SongRepository & { saves: Song[] } {
  const records = new Map(initial.map((song) => [song.id, structuredClone(song)]))
  const saves: Song[] = []
  return {
    saves,
    async getSong(id) {
      const song = records.get(id)
      return song === undefined ? undefined : structuredClone(song)
    },
    async listSongs() {
      return [...records.values()].map((song) => structuredClone(song))
    },
    async addSong(song) {
      if (records.has(song.id)) throw new Error(`Already stored: ${song.id}`)
      records.set(song.id, structuredClone(song))
    },
    async saveSong(song) {
      if (!records.has(song.id)) throw new Error(`Missing Song: ${song.id}`)
      saves.push(structuredClone(song))
      records.set(song.id, structuredClone(song))
    },
  }
}

const beforePrelude = JSON.stringify(prelude)
const library = memoryLibrary([bare, prelude])
const installed = await installEtudeFoundation(library)
if (installed.status !== 'installed' || library.saves.length !== 1) fail('The étude foundation was not saved once.')
const stored = await library.getSong(ETUDE_SONG_ID)
if (!stored || !isSong(stored)) fail('The étude could not be read back.')
if (stored.originalMidi.notes.length !== 1926) fail('The stored étude lost notes.')
if (stored.originalMidi.notes[0]?.startTick !== 0 || stored.originalMidi.notes.at(-1)?.endTick === undefined) {
  fail('The stored étude did not keep its note times.')
}
if (JSON.stringify(stored.originalMidi) !== JSON.stringify(midi)) fail('The stored étude MIDI differs from the parser result.')
const reading = stored.musicalInterpretation
if (reading.timeSignature?.numerator !== 2 || reading.timeSignature.denominator !== 4) fail('2/4 was not stored.')
if (reading.keySignature?.tonic !== 'E' || reading.keySignature.mode !== 'major') fail('E major was not stored.')
if (reading.pickup?.present !== true || reading.pickup.duration !== 'eighth') fail('The eighth pickup was not stored.')
if (reading.ticksPerWrittenQuarter !== 480) fail('480 ticks per written quarter was not stored.')
if (reading.writtenStartTick !== undefined) fail('The étude stored a written start tick.')
if (reading.sustainedNotes !== undefined || reading.writtenDurations !== undefined || reading.graceNotes !== undefined) {
  fail('The étude install invented spellings.')
}
if (stored.display?.measures?.kind !== 'count' || stored.display.measures.count !== ETUDE_COMPLETE_MEASURES) {
  fail('The étude was not given five complete measures.')
}
if (stored.display.measuresPerRow?.kind !== 'fixed' || stored.display.measuresPerRow.count !== ETUDE_MEASURES_PER_ROW) {
  fail('The étude was not given three measures per row.')
}
if (JSON.stringify(await library.getSong(prelude.id)) !== beforePrelude) fail('Installing the étude changed the prelude.')

const repeated = await installEtudeFoundation(library)
if (repeated.status !== 'unchanged' || library.saves.length !== 1) fail('A second startup wrote the étude again.')

const drawn = displayedMeasures(stored.musicalInterpretation, stored.originalMidi.notes, ETUDE_COMPLETE_MEASURES)
if (!drawn.ready) fail(drawn.ready === false ? drawn.message : 'The étude measures were not ready.')
if (drawn.measures.length !== 6) fail(`The opening drew ${drawn.measures.length} bars.`)
const indexes = drawn.measures.map((measure) => measure.index).join(',')
if (indexes !== '0,1,2,3,4,5') fail(`The opening bars are ${indexes}.`)
const expectedSpans = ['0–240', '240–1200', '1200–2160', '2160–3120', '3120–4080', '4080–5040']
const spans = drawn.measures.map((measure) => `${measure.span.startTick}–${measure.span.endTick}`)
if (spans.join(',') !== expectedSpans.join(',')) fail(`The opening spans are ${spans.join(', ')}.`)
const later = displayedMeasures(stored.musicalInterpretation, stored.originalMidi.notes, 'all')
if (!later.ready || later.available <= 6) fail('Later étude measures are not available from the stored notes.')

const custom: Song = {
  ...bare,
  musicalInterpretation: {
    timeSignature: { numerator: 4, denominator: 4 },
    keySignature: { tonic: 'C', mode: 'major' },
    pickup: { present: false },
    ticksPerWrittenQuarter: 960,
    graceNotes: [],
  },
  display: { measures: { kind: 'count', count: 12 }, measuresPerRow: { kind: 'fixed', count: 2 } },
}
const occupied = memoryLibrary([custom])
const kept = await installEtudeFoundation(occupied)
if (kept.status !== 'conflict' || occupied.saves.length !== 0) fail('A saved étude reading was overwritten.')
const keptSong = await occupied.getSong(ETUDE_SONG_ID)
if (keptSong?.musicalInterpretation.ticksPerWrittenQuarter !== 960) fail('The saved quarter was replaced.')
if (keptSong?.musicalInterpretation.graceNotes?.length !== 0) fail('The saved grace-note list was removed.')
if (keptSong?.display?.measures?.kind !== 'count' || keptSong.display.measures.count !== 12) {
  fail('The saved display count was replaced.')
}

const other = planEtudeFoundation(prelude)
if (other.action !== 'unchanged') fail('The étude plan wanted to change another Song.')
if (ETUDE_TIME_SIGNATURE.numerator !== 2 || ETUDE_KEY_SIGNATURE.tonic !== 'E' || ETUDE_PICKUP.duration !== 'eighth') {
  fail('The étude constants drifted.')
}
if (ETUDE_TICKS_PER_WRITTEN_QUARTER !== 480) fail('The étude quarter constant drifted.')

console.log('Étude import checks passed.')
console.log('1926 notes are stored. The page draws Bars 0–5 from five complete measures plus the pickup.')
