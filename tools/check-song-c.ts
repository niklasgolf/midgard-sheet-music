/**
 * Checks the Song C import: the original MIDI, an empty interpretation,
 * and a library that can hold it beside Songs A and B.
 * The memory repository stands in for IndexedDB. This file does not open a database.
 * It does not import project-songs.ts, because that module loads MIDI through Vite.
 */
import { readFileSync } from 'node:fs'
import { parseMidi } from '../src/midi/parse-midi.ts'
import type { SongRepository } from '../src/song/song-repository.ts'
import {
  SONG_B_BAR15_A4_GRACE,
  SONG_B_BAR15_A4_SIXTEENTH,
  SONG_B_ID,
  SONG_B_READINGS,
} from '../src/song/install-sustained-reading.ts'
import { isSong, SONG_SCHEMA_VERSION, type Song } from '../src/song/song.ts'

const SONG_A_ID = 'chopin-prelude-op-28-no-7'
const SONG_C_ID = 'eine-kleine-nachtmusik-intermediate'

function fail(message: string): never {
  throw new Error(message)
}

const songAMidi = parseMidi(new Uint8Array(readFileSync('midi-files/chopin-prelude-op-28-no-7-in-a-major.mid')))
const songBMidi = parseMidi(new Uint8Array(readFileSync('midi-files/chopin-prelude-op-28-no-7-in-a-major-b.mid')))
const songCMidi = parseMidi(new Uint8Array(readFileSync('midi-files/eine-kleine-nachtmusik-intermediate.mid')))

if (songCMidi.format !== 1) fail(`Song C format is ${songCMidi.format}.`)
if (songCMidi.ppq !== 480) fail(`Song C PPQ is ${songCMidi.ppq}.`)
if (songCMidi.trackCount !== 1 || songCMidi.tracks.length !== 1) fail('Song C does not have one MIDI track.')
if (songCMidi.notes.length !== 872) fail(`Song C has ${songCMidi.notes.length} notes.`)
const tracks = new Set(songCMidi.notes.map((note) => note.track))
if (tracks.size !== 1 || !tracks.has(1)) fail('Song C notes are not all on track 1.')
if (songCMidi.timeSignatures.length !== 1) fail('Song C does not have one time-signature event.')
const meter = songCMidi.timeSignatures[0]
if (meter?.tick !== 0 || meter.numerator !== 4 || meter.denominator !== 4) {
  fail('Song C time-signature metadata is not 4/4 at tick 0.')
}
if (songCMidi.tempos.length !== 1) fail('Song C does not have one tempo event.')
const tempo = songCMidi.tempos[0]
if (tempo?.tick !== 0 || tempo.microsecondsPerQuarter !== 500_000) {
  fail('Song C tempo metadata is not 120 BPM at tick 0.')
}
if (songCMidi.keySignatures.length !== 0) fail('Song C MIDI contains a key signature. G major is not file metadata.')
const firstOnset = Math.min(...songCMidi.notes.map((note) => note.startTick))
const lastRelease = Math.max(...songCMidi.notes.map((note) => note.endTick))
if (firstOnset !== 2734) fail(`The first Song C note starts at tick ${firstOnset}.`)
if (lastRelease !== 91944) fail(`The last Song C note ends at tick ${lastRelease}.`)
if (songAMidi.notes.length !== 176) fail(`Song A has ${songAMidi.notes.length} notes.`)
if (songBMidi.notes.length !== 168) fail(`Song B has ${songBMidi.notes.length} notes.`)
if (SONG_SCHEMA_VERSION !== 1) fail('Importing Song C changed the Song schema version.')
const databaseSource = readFileSync('src/song/song-database.ts', 'utf8')
if (!databaseSource.includes('export const SONG_DATABASE_VERSION = 1')) {
  fail('Importing Song C changed the IndexedDB version.')
}

const projectSongs = readFileSync('src/song/project-songs.ts', 'utf8')
for (const expected of [
  "export const EINE_KLEINE_SONG_ID = 'eine-kleine-nachtmusik-intermediate'",
  'id: EINE_KLEINE_SONG_ID',
  "title: 'Eine kleine Nachtmusik — Intermediate'",
  "composer: 'Wolfgang Amadeus Mozart'",
  "sourceFilename: 'eine-kleine-nachtmusik-intermediate.mid'",
  "pdfFilename: 'eine-kleine-nachtmusik-intermediate.pdf'",
  'if (existing) continue',
  'musicalInterpretation: {}',
]) {
  if (!projectSongs.includes(expected)) fail(`project-songs.ts no longer contains: ${expected}`)
}
if (/ticksPerWrittenQuarter|pickup|timeSignature|keySignature/.test(projectSongs)) {
  fail('The project importer now writes Part C settings.')
}

const songBInterpretation: Song['musicalInterpretation'] = {
  timeSignature: { numerator: 3, denominator: 4 },
  keySignature: { tonic: 'A', mode: 'major' },
  pickup: { present: true, duration: 'quarter' },
  ticksPerWrittenQuarter: 384,
  sustainedNotes: [...SONG_B_READINGS],
  writtenDurations: [SONG_B_BAR15_A4_SIXTEENTH],
  graceNotes: [SONG_B_BAR15_A4_GRACE],
}

function projectSong(
  id: string,
  title: string,
  composer: string,
  sourceFilename: string,
  midi: Song['originalMidi'],
  interpretation: Song['musicalInterpretation'],
): Song {
  return {
    id,
    schemaVersion: SONG_SCHEMA_VERSION,
    metadata: { title, composer, sourceFilename },
    originalMidi: midi,
    musicalInterpretation: interpretation,
  }
}

const songA = projectSong(
  SONG_A_ID,
  'Prelude Op. 28 No. 7 in A major',
  'Frédéric Chopin',
  'chopin-prelude-op-28-no-7-in-a-major.mid',
  songAMidi,
  { ticksPerWrittenQuarter: 666.67 },
)
const songB = projectSong(
  SONG_B_ID,
  'Prelude Op. 28 No. 7 in A major (B)',
  'Frédéric Chopin',
  'chopin-prelude-op-28-no-7-in-a-major-b.mid',
  songBMidi,
  songBInterpretation,
)
const songC: Song = {
  id: SONG_C_ID,
  schemaVersion: SONG_SCHEMA_VERSION,
  metadata: {
    title: 'Eine kleine Nachtmusik — Intermediate',
    composer: 'Wolfgang Amadeus Mozart',
    sourceFilename: 'eine-kleine-nachtmusik-intermediate.mid',
    pdfFilename: 'eine-kleine-nachtmusik-intermediate.pdf',
  },
  originalMidi: songCMidi,
  musicalInterpretation: {},
}
if (!isSong(songC)) fail('Song C is not a valid Song document.')
if (Object.keys(songC.musicalInterpretation).length !== 0) fail('Song C was imported with Part C settings.')

function memoryLibrary(initial: readonly Song[]): SongRepository {
  const records = new Map(initial.map((song) => [song.id, song]))
  return {
    async getSong(id) {
      return records.get(id)
    },
    async listSongs() {
      return [...records.values()]
    },
    async addSong(song) {
      if (records.has(song.id)) throw new Error(`Already stored: ${song.id}`)
      records.set(song.id, song)
    },
    async saveSong(song) {
      if (!records.has(song.id)) throw new Error(`Missing Song: ${song.id}`)
      records.set(song.id, song)
    },
  }
}

/** The same rule as ensureProjectSongs: insert only when the id is absent. */
async function importIfAbsent(repository: SongRepository, song: Song): Promise<boolean> {
  const existing = await repository.getSong(song.id)
  if (existing) return false
  await repository.addSong(song)
  const stored = await repository.getSong(song.id)
  if (!stored) fail(`${song.id} was saved but could not be read back.`)
  if (JSON.stringify(stored.originalMidi) !== JSON.stringify(song.originalMidi)) {
    fail(`${song.id} was not stored with its original MIDI.`)
  }
  return true
}

const beforeA = JSON.stringify(songA)
const beforeB = JSON.stringify(songB)
const library = memoryLibrary([songA, songB])
if (!(await importIfAbsent(library, songC))) fail('The first Song C import did not store the song.')
const storedC = await library.getSong(SONG_C_ID)
if (!storedC) fail('Song C could not be retrieved.')
if (storedC.originalMidi.notes.length !== 872) fail('The stored Song C lost notes.')
if (storedC.originalMidi !== songCMidi) fail('The stored Song C replaced the parsed MIDI object.')
if (storedC.originalMidi.notes[0]?.startTick === undefined) fail('Song C stored no notes.')
const listed = await library.listSongs()
const listedIds = listed.map((song) => song.id)
if (listedIds.join(',') !== `${SONG_A_ID},${SONG_B_ID},${SONG_C_ID}`) {
  fail(`The library is ${listedIds.join(', ')}.`)
}
if (listed.filter((song) => song.id === SONG_C_ID).length !== 1) fail('Song C appears more than once.')
if (await importIfAbsent(library, songC)) fail('A second import stored Song C again.')
const afterSecond = await library.listSongs()
if (afterSecond.length !== 3) fail('A second import changed the library size.')
if (afterSecond.filter((song) => song.id === SONG_C_ID).length !== 1) fail('A second import duplicated Song C.')
const keptC = await library.getSong(SONG_C_ID)
if (keptC !== storedC) fail('A second import replaced the stored Song C.')
if (JSON.stringify(await library.getSong(SONG_A_ID)) !== beforeA) fail('Importing Song C changed Song A.')
if (JSON.stringify(await library.getSong(SONG_B_ID)) !== beforeB) fail('Importing Song C changed Song B.')

let rejected = false
try {
  await library.addSong(songC)
} catch {
  rejected = true
}
if (!rejected) fail('addSong accepted an id that was already stored.')
if ((await library.getSong(SONG_C_ID)) !== storedC) fail('A rejected addSong replaced Song C.')

const sentinel: Song = {
  ...songC,
  metadata: { ...songC.metadata, title: 'Already stored' },
  originalMidi: songAMidi,
  musicalInterpretation: { ticksPerWrittenQuarter: 1 },
}
const occupied = memoryLibrary([songA, songB, sentinel])
const sentinelBefore = JSON.stringify(await occupied.getSong(SONG_C_ID))
if (await importIfAbsent(occupied, songC)) fail('An existing Song C record was overwritten.')
if (JSON.stringify(await occupied.getSong(SONG_C_ID)) !== sentinelBefore) {
  fail('The existing Song C record changed.')
}
if (JSON.stringify(await occupied.getSong(SONG_A_ID)) !== beforeA) fail('The occupied library changed Song A.')
if (JSON.stringify(await occupied.getSong(SONG_B_ID)) !== beforeB) fail('The occupied library changed Song B.')

console.log('Song C import checks passed.')
console.log('872 notes, PPQ 480, and an empty interpretation. Songs A and B stayed in place.')
