/**
 * Checks the omitted-note reading and the two étude Bar 1 omissions.
 * The memory repository stands in for IndexedDB. This file does not open a database.
 * It does not import project-songs.ts, because that module loads MIDI through Vite.
 */
import { readFileSync } from 'node:fs'
import { buildMeasureContent } from '../src/interpretation/measure-content.ts'
import { fraction } from '../src/interpretation/duration.ts'
import { assignPianoStaffs } from '../src/interpretation/staff.ts'
import { parseMidi } from '../src/midi/parse-midi.ts'
import {
  ETUDE_OMITTED_NOTES,
  ETUDE_SONG_ID,
  installEtudeOmissions,
  planEtudeOmissions,
} from '../src/song/install-etude.ts'
import type { SongRepository } from '../src/song/song-repository.ts'
import { applySongSettings } from '../src/song/song-settings.ts'
import { isSong, SONG_SCHEMA_VERSION, type Song } from '../src/song/song.ts'

function fail(message: string): never {
  throw new Error(message)
}

const midi = parseMidi(new Uint8Array(readFileSync('midi-files/etude-op10-no3-e-major-tristesse-chopin.mid')))
if (midi.notes.length !== 1926) fail(`The étude MIDI has ${midi.notes.length} notes.`)

const view = readFileSync('src/notation/engraving-view.ts', 'utf8')
if (!view.includes('omittedNotes: song.musicalInterpretation.omittedNotes')) {
  fail('The score does not read omitted notes from Part C.')
}
const call = view.slice(view.indexOf('buildMeasureContent({'), view.indexOf('const frame ='))
if (call.includes("system === 'midgard'") || call.includes("system === 'classical'")) {
  fail('Omitted notes are chosen by one sheet system.')
}

function matches(reading: { track: number; midi: number; startTick: number; endTick: number }) {
  return midi.notes.filter(
    (note) =>
      note.track === reading.track &&
      note.midi === reading.midi &&
      note.startTick === reading.startTick &&
      note.endTick === reading.endTick,
  )
}

if (ETUDE_OMITTED_NOTES.length !== 2) fail('The étude omission list is not two events.')
for (const reading of ETUDE_OMITTED_NOTES) {
  const found = matches(reading)
  if (found.length !== 1 || found[0]?.durationTicks !== 0) {
    fail(`Omission ${reading.midi} at ${reading.startTick} is not one zero-duration event.`)
  }
}
const soundingE2 = matches({ track: 2, midi: 40, startTick: 240, endTick: 695 })
const soundingB1 = matches({ track: 2, midi: 35, startTick: 720, endTick: 1175 })
if (soundingE2.length !== 1 || soundingE2[0]?.durationTicks !== 455) fail('The sounding E2 changed.')
if (soundingB1.length !== 1 || soundingB1[0]?.durationTicks !== 455) fail('The sounding B1 changed.')

const bare: Song = {
  id: ETUDE_SONG_ID,
  schemaVersion: SONG_SCHEMA_VERSION,
  metadata: {
    title: 'Étude Op. 10 No. 3 in E major (Tristesse)',
    composer: 'Frédéric Chopin',
    sourceFilename: 'etude.mid',
  },
  originalMidi: midi,
  musicalInterpretation: {
    timeSignature: { numerator: 2, denominator: 4 },
    keySignature: { tonic: 'E', mode: 'major' },
    pickup: { present: true, duration: 'eighth' },
    ticksPerWrittenQuarter: 480,
  },
  display: {
    measures: { kind: 'count', count: 5 },
    measuresPerRow: { kind: 'fixed', count: 3 },
    midgardMeasureWidth: 400,
  },
}
if (!isSong(bare)) fail('An étude without omissions is no longer a Song.')
const rejected: Song = {
  ...bare,
  musicalInterpretation: {
    ...bare.musicalInterpretation,
    omittedNotes: [{ track: 2, midi: 40, startTick: 240, endTick: 239 }],
  },
}
if (isSong(rejected)) fail('An omission that ends before it starts was accepted.')

const staves = assignPianoStaffs(midi.notes, bare.musicalInterpretation)
if (!staves.ready) fail(staves.message)
const span = { startTick: 240, endTick: 1200 }

function bar1(omitted: boolean) {
  return buildMeasureContent({
    notes: midi.notes,
    span,
    ticksPerWrittenQuarter: 480,
    staffByTrack: staves.staffByTrack,
    staffForNote: staves.staffForNote,
    measureQuarters: fraction(2, 1),
    omittedNotes: omitted ? ETUDE_OMITTED_NOTES : [],
  })
}

const before = bar1(false)
const after = bar1(true)
if (before.unresolved.length !== 11) fail(`Bar 1 started with ${before.unresolved.length} unresolved notes.`)
if (after.unresolved.length !== 9) fail(`Bar 1 has ${after.unresolved.length} unresolved notes after the omissions.`)

const identity = (note: { track: number; midi: number; startTick: number; durationTicks: number }) =>
  `${note.track}:${note.midi}:${note.startTick}:${note.durationTicks}`
const removed = before.unresolved.filter((note) => !after.unresolved.some((kept) => identity(kept) === identity(note)))
if (removed.map(identity).join(',') !== '2:40:240:0,2:35:720:0') {
  fail(`The omissions removed ${removed.map(identity).join(', ')}.`)
}
for (const note of after.unresolved) {
  const prior = before.unresolved.find((item) => identity(item) === identity(note))
  if (prior === undefined || prior.reason !== note.reason) fail('An unresolved note changed its reason.')
}
if (!after.unresolved.some((note) => note.midi === 40 && note.durationTicks === 455)) fail('The sounding E2 left the score.')
if (!after.unresolved.some((note) => note.midi === 35 && note.durationTicks === 455)) fail('The sounding B1 left the score.')

const drawn = (content: ReturnType<typeof bar1>) =>
  [
    ...content.columns.flatMap((column) => column.events.flatMap((event) => event.pitches)),
    ...content.provisional.flatMap((column) => column.events.flatMap((event) => event.pitches)),
    ...content.graceNotes,
  ].map(identity)
if (drawn(after).some((item) => item === '2:40:240:0' || item === '2:35:720:0')) {
  fail('An omitted event is still drawn.')
}
const keptDrawn = drawn(before).filter((item) => item !== '2:40:240:0' && item !== '2:35:720:0')
if (keptDrawn.join(',') !== drawn(after).join(',')) fail('A note other than the two omissions changed.')
if (after.ties.length !== before.ties.length || after.graceNotes.length !== before.graceNotes.length) {
  fail('Ties or grace notes changed.')
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

const prelude: Song = {
  id: 'chopin-prelude-op-28-no-7',
  schemaVersion: SONG_SCHEMA_VERSION,
  metadata: { title: 'Prelude', composer: 'Frédéric Chopin', sourceFilename: 'prelude.mid' },
  originalMidi: midi,
  musicalInterpretation: {},
}
const songB: Song = {
  id: 'chopin-prelude-op28-no7-b',
  schemaVersion: SONG_SCHEMA_VERSION,
  metadata: { title: 'Prelude B', composer: 'Frédéric Chopin', sourceFilename: 'prelude-b.mid' },
  originalMidi: midi,
  musicalInterpretation: {
    timeSignature: { numerator: 3, denominator: 4 },
    ticksPerWrittenQuarter: 384,
    sustainedNotes: [],
    writtenDurations: [],
    graceNotes: [],
  },
}
const mozart: Song = {
  id: 'eine-kleine-nachtmusik-intermediate',
  schemaVersion: SONG_SCHEMA_VERSION,
  metadata: { title: 'Mozart', composer: 'Wolfgang Amadeus Mozart', sourceFilename: 'mozart.mid' },
  originalMidi: midi,
  musicalInterpretation: {
    timeSignature: { numerator: 4, denominator: 4 },
    ticksPerWrittenQuarter: 480,
    writtenStartTick: 2734,
    staffSplitPitch: 60,
  },
  display: { measures: { kind: 'count', count: 6 }, measuresPerRow: { kind: 'fixed', count: 2 } },
}
const beforeOthers = [prelude, songB, mozart].map((song) => JSON.stringify(song))
const library = memoryLibrary([bare, prelude, songB, mozart])
const installed = await installEtudeOmissions(library)
if (installed.status !== 'installed' || library.saves.length !== 1) fail('The omissions were not saved once.')
const stored = await library.getSong(ETUDE_SONG_ID)
if (!stored || !isSong(stored)) fail('The étude could not be read back.')
if (stored.originalMidi.notes.length !== 1926) fail('The stored MIDI lost notes.')
if (JSON.stringify(stored.originalMidi) !== JSON.stringify(midi)) fail('The stored MIDI differs from the file.')
if (stored.musicalInterpretation.omittedNotes?.length !== 2) fail('The two omissions were not stored.')
if (stored.musicalInterpretation.ticksPerWrittenQuarter !== 480) fail('The written quarter changed.')
if (stored.display?.midgardMeasureWidth !== 400) fail('The midGard width changed.')
if (stored.musicalInterpretation.sustainedNotes !== undefined) fail('A spelling was invented.')
const repeated = await installEtudeOmissions(library)
if (repeated.status !== 'unchanged' || library.saves.length !== 1) fail('A second startup wrote the omissions again.')
const others = await Promise.all([prelude.id, songB.id, mozart.id].map((id) => library.getSong(id)))
if (others.map((song) => JSON.stringify(song)).join('\n') !== beforeOthers.join('\n')) {
  fail('The omission install changed another Song.')
}
if (planEtudeOmissions(prelude).action !== 'unchanged') fail('The omission plan wanted to change the prelude.')

const kept = applySongSettings(stored, {
  title: stored.metadata.title,
  composer: stored.metadata.composer,
  timeSignature: stored.musicalInterpretation.timeSignature,
  keySignature: stored.musicalInterpretation.keySignature,
  pickup: stored.musicalInterpretation.pickup,
  ticksPerWrittenQuarter: 480,
})
if (kept.musicalInterpretation.omittedNotes?.length !== 2) fail('Song Settings removed the omissions.')
if (kept.originalMidi !== stored.originalMidi) fail('Song Settings replaced the MIDI object.')

console.log('Omitted-note checks passed.')
console.log('Bar 1 leaves out two zero-duration events. Nine notes stay unresolved.')
