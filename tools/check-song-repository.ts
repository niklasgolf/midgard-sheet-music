/**
 * Checks the Song repository contract and the one-time Part C install.
 * The memory repository stands in for IndexedDB. This file does not open a database.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parseMidi } from '../src/midi/parse-midi.ts'
import {
  installSongBInterpretations,
  installSustainedReading,
  installSustainedReadings,
  planGraceNote,
  planSustainedReading,
  planWrittenDuration,
  SONG_B_BAR11_CSHARP,
  SONG_B_BAR11_E,
  SONG_B_BAR15_A4_GRACE,
  SONG_B_BAR15_A4_SIXTEENTH,
  SONG_B_BAR5_D4,
  SONG_B_ID,
  SONG_B_READINGS,
} from '../src/song/install-sustained-reading.ts'
import type { SongRepository } from '../src/song/song-repository.ts'
import { applySongSettings } from '../src/song/song-settings.ts'
import { isSong, SONG_SCHEMA_VERSION, type Song, type SustainedNoteReading } from '../src/song/song.ts'

function fail(message: string): never {
  throw new Error(message)
}

const midi = parseMidi(new Uint8Array(readFileSync('midi-files/chopin-prelude-op-28-no-7-in-a-major-b.mid')))
const songAMidi = parseMidi(new Uint8Array(readFileSync('midi-files/chopin-prelude-op-28-no-7-in-a-major.mid')))

function songFor(id: string, notes: Song['originalMidi'], interpretation: Song['musicalInterpretation']): Song {
  return {
    id,
    schemaVersion: SONG_SCHEMA_VERSION,
    metadata: { title: 'Prelude', composer: 'Frédéric Chopin', sourceFilename: `${id}.mid` },
    originalMidi: notes,
    musicalInterpretation: interpretation,
  }
}

const settings = {
  timeSignature: { numerator: 3, denominator: 4 },
  pickup: { present: true, duration: 'quarter' as const },
  ticksPerWrittenQuarter: 384,
  keySignature: { tonic: 'A', mode: 'major' as const },
}

const original = songFor(SONG_B_ID, midi, { ...settings })
const midiBefore = JSON.stringify(original.originalMidi)

const installed = planSustainedReading(original, SONG_B_BAR5_D4)
if (installed.action !== 'install') fail(`The missing spelling should be installed, got ${installed.action}.`)
const partC = installed.song.musicalInterpretation
if (partC.timeSignature?.numerator !== 3 || partC.ticksPerWrittenQuarter !== 384) {
  fail('Installing the spelling changed the saved settings.')
}
if (partC.keySignature?.tonic !== 'A' || partC.pickup?.present !== true) fail('Installing the spelling dropped Part C.')
if (partC.sustainedNotes?.length !== 1) fail('The spelling was not stored once.')
if (installed.song.originalMidi !== original.originalMidi) fail('The install copied or replaced the MIDI object.')
if (JSON.stringify(installed.song.originalMidi) !== midiBefore) fail('The install changed the MIDI text.')
if (installed.song.metadata.sourceFilename !== original.metadata.sourceFilename) fail('Part A changed.')
if (!isSong(installed.song)) fail('The Song with the spelling is not a valid Song document.')
const afterSettings = applySongSettings(installed.song, {
  title: installed.song.metadata.title,
  composer: installed.song.metadata.composer,
  timeSignature: settings.timeSignature,
  keySignature: settings.keySignature,
  pickup: settings.pickup,
  ticksPerWrittenQuarter: settings.ticksPerWrittenQuarter,
})
if (afterSettings.musicalInterpretation.sustainedNotes?.length !== 1) {
  fail('Saving Song Settings removed the written spelling.')
}
if (afterSettings.originalMidi !== installed.song.originalMidi) fail('Song Settings replaced the MIDI object.')

const again = planSustainedReading(installed.song, SONG_B_BAR5_D4)
if (again.action !== 'unchanged') fail('A second plan should not write the same spelling again.')

const otherNote: SustainedNoteReading = {
  track: 2,
  midi: 69,
  startTick: 1,
  endTick: 2,
  written: ['quarter', 'quarter'],
}
const withOther = songFor(SONG_B_ID, midi, { ...settings, sustainedNotes: [otherNote] })
const beside = planSustainedReading(withOther, SONG_B_BAR5_D4)
if (beside.action !== 'install') fail('A spelling for a different MIDI event should stay in place.')
if (beside.song.musicalInterpretation.sustainedNotes?.length !== 2) fail('The existing spelling was dropped.')
if (beside.song.musicalInterpretation.sustainedNotes?.[0] !== otherNote) fail('The existing spelling object was replaced.')

const conflicted = songFor(SONG_B_ID, midi, {
  ...settings,
  sustainedNotes: [{ ...SONG_B_BAR5_D4, written: ['half', 'half'] }],
})
const conflict = planSustainedReading(conflicted, SONG_B_BAR5_D4)
if (conflict.action !== 'conflict') fail('A different spelling for the same MIDI event was not reported.')
if (conflicted.musicalInterpretation.sustainedNotes?.[0]?.written.join(',') !== 'half,half') {
  fail('The conflicting spelling was changed.')
}

const songA = songFor('chopin-prelude-op-28-no-7', songAMidi, { ...settings, ticksPerWrittenQuarter: 666.67 })
const wrongSong = planSustainedReading(songA, SONG_B_BAR5_D4)
if (wrongSong.action !== 'midi-mismatch') fail('Song A was given Song B’s spelling.')
if (songA.musicalInterpretation.sustainedNotes !== undefined) fail('The mismatch plan edited Song A.')

function memoryRepository(initial: Song | undefined): { repository: SongRepository; saved: Song[] } {
  let current = initial
  const saved: Song[] = []
  const repository: SongRepository = {
    async getSong(id) {
      return current?.id === id ? current : undefined
    },
    async listSongs() {
      return current ? [current] : []
    },
    async addSong(song) {
      if (current?.id === song.id) throw new Error('Already stored.')
      current = song
    },
    async saveSong(song) {
      if (current?.id !== song.id) throw new Error('Missing Song.')
      saved.push(song)
      current = song
    },
  }
  return { repository, saved }
}

const first = memoryRepository(original)
const created = await installSustainedReading(first.repository, SONG_B_ID, SONG_B_BAR5_D4)
if (created.status !== 'installed' || first.saved.length !== 1) fail('The first install should save once.')
const repeated = await installSustainedReading(first.repository, SONG_B_ID, SONG_B_BAR5_D4)
if (repeated.status !== 'unchanged' || first.saved.length !== 1) fail('Repeating the install saved the Song again.')

const blocked = memoryRepository(conflicted)
const kept = await installSustainedReading(blocked.repository, SONG_B_ID, SONG_B_BAR5_D4)
if (kept.status !== 'conflict' || blocked.saved.length !== 0) fail('A conflict was saved over the existing spelling.')

const missing = memoryRepository(undefined)
const absent = await installSustainedReading(missing.repository, SONG_B_ID, SONG_B_BAR5_D4)
if (absent.status !== 'absent' || missing.saved.length !== 0) fail('A missing Song was created by the spelling install.')

const explicitTies = planSustainedReading(installed.song, { ...SONG_B_BAR5_D4, ties: [true, true] })
if (explicitTies.action !== 'unchanged') fail('Explicit all-tied flags were treated as a new spelling of the D4.')
const storedFlags = songFor(SONG_B_ID, midi, {
  ...settings,
  sustainedNotes: [{ ...SONG_B_BAR5_D4, ties: [true, true] }],
})
if (planSustainedReading(storedFlags, SONG_B_BAR5_D4).action !== 'unchanged') {
  fail('A stored all-tied D4 no longer matches the reading that omits tie flags.')
}
const repeatedAttack = planSustainedReading(installed.song, { ...SONG_B_BAR5_D4, ties: [true, false] })
if (repeatedAttack.action !== 'conflict') fail('A different tie pattern was allowed to replace the D4 spelling.')

const shortList = songFor(SONG_B_ID, midi, {
  ...settings,
  sustainedNotes: [{ ...SONG_B_BAR11_CSHARP, ties: [true] }],
})
if (isSong(shortList)) fail('A tie list shorter than the written notes was accepted.')
const bar11Song = songFor(SONG_B_ID, midi, {
  ...settings,
  sustainedNotes: [SONG_B_BAR5_D4, SONG_B_BAR11_CSHARP, SONG_B_BAR11_E],
})
if (!isSong(bar11Song)) fail('Song B with selective ties is not a valid Song document.')
const keptTies = applySongSettings(bar11Song, {
  title: bar11Song.metadata.title,
  composer: bar11Song.metadata.composer,
  timeSignature: settings.timeSignature,
  keySignature: settings.keySignature,
  pickup: settings.pickup,
  ticksPerWrittenQuarter: settings.ticksPerWrittenQuarter,
})
if (keptTies.musicalInterpretation.sustainedNotes?.[1]?.ties?.join(',') !== 'true,false') {
  fail('Saving Song Settings removed a selective tie.')
}

const fresh = memoryRepository(original)
const batch = await installSustainedReadings(fresh.repository, SONG_B_ID, SONG_B_READINGS)
if (batch.status !== 'installed' || fresh.saved.length !== 1) fail('The three Song B readings should be saved once.')
if (batch.song.musicalInterpretation.sustainedNotes?.length !== 3) fail('Song B did not receive both Bar 11 readings.')
if (batch.song.musicalInterpretation.ticksPerWrittenQuarter !== 384) fail('The batch install changed Song Settings.')
if (batch.song.originalMidi !== original.originalMidi) fail('The batch install replaced the MIDI object.')
if (JSON.stringify(batch.song.originalMidi.notes) !== JSON.stringify(original.originalMidi.notes)) {
  fail('The batch install changed a MIDI note.')
}
const batchAgain = await installSustainedReadings(fresh.repository, SONG_B_ID, SONG_B_READINGS)
if (batchAgain.status !== 'unchanged' || fresh.saved.length !== 1) fail('A second batch install wrote the Song again.')

const seeded = memoryRepository(installed.song)
const bar5Reading = installed.song.musicalInterpretation.sustainedNotes?.[0]
const appended = await installSustainedReadings(seeded.repository, SONG_B_ID, SONG_B_READINGS)
if (appended.status !== 'installed' || seeded.saved.length !== 1) fail('Adding Bar 11 should save once beside the stored D4.')
const appendedNotes = appended.song.musicalInterpretation.sustainedNotes
if (appendedNotes?.[0] !== bar5Reading) fail('The stored Bar 5 reading was replaced.')
if (appendedNotes?.length !== 3) fail('Bar 11 was not added beside the D4.')
const appendedAgain = await installSustainedReadings(seeded.repository, SONG_B_ID, SONG_B_READINGS)
if (appendedAgain.status !== 'unchanged' || seeded.saved.length !== 1) fail('Bar 11 was written a second time.')

const heldSharp = songFor(SONG_B_ID, midi, {
  ...settings,
  sustainedNotes: [SONG_B_BAR5_D4, { ...SONG_B_BAR11_CSHARP, ties: [true, true] }],
})
const held = memoryRepository(heldSharp)
const partial = await installSustainedReadings(held.repository, SONG_B_ID, SONG_B_READINGS)
if (partial.status !== 'installed' || held.saved.length !== 1) fail('The unmatched E5 reading should still be saved.')
if (partial.messages.length !== 1) fail('The conflicting C♯5 spelling was overwritten without a message.')
const heldNotes = partial.song.musicalInterpretation.sustainedNotes
if (heldNotes?.[1]?.ties?.join(',') !== 'true,true') fail('The conflicting C♯5 tie flags were replaced.')
if (heldNotes?.[2]?.midi !== 76) fail('The E5 reading was not stored after the C♯5 conflict.')
const partialAgain = await installSustainedReadings(held.repository, SONG_B_ID, SONG_B_READINGS)
if (partialAgain.status !== 'conflict' || held.saved.length !== 1) fail('The conflicting C♯5 spelling was written on a later startup.')

const invalid = planSustainedReading(original, { ...SONG_B_BAR11_CSHARP, ties: [true] })
if (invalid.action !== 'conflict') fail('A tie list of the wrong length was planned for installation.')

const withTies = songFor(SONG_B_ID, midi, {
  ...settings,
  sustainedNotes: [SONG_B_BAR5_D4, SONG_B_BAR11_CSHARP, SONG_B_BAR11_E],
})
const part = memoryRepository(withTies)
const bar15 = await installSongBInterpretations(part.repository)
if (bar15.status !== 'installed' || part.saved.length !== 1) fail('Bar 15 should be saved once beside the existing ties.')
if (bar15.song.musicalInterpretation.sustainedNotes?.length !== 3) fail('Installing Bar 15 changed the sustained notes.')
if (bar15.song.musicalInterpretation.sustainedNotes?.[0] !== withTies.musicalInterpretation.sustainedNotes?.[0]) {
  fail('The stored Bar 5 reading was replaced.')
}
if (bar15.song.musicalInterpretation.writtenDurations?.length !== 1) fail('The sixteenth override was not stored.')
if (bar15.song.musicalInterpretation.graceNotes?.length !== 1) fail('The grace note was not stored.')
if (bar15.song.originalMidi !== withTies.originalMidi) fail('The Bar 15 install replaced the MIDI object.')
if (JSON.stringify(bar15.song.originalMidi.notes) !== JSON.stringify(withTies.originalMidi.notes)) {
  fail('The Bar 15 install changed a MIDI note.')
}
const bar15Again = await installSongBInterpretations(part.repository)
if (bar15Again.status !== 'unchanged' || part.saved.length !== 1) fail('Bar 15 was written a second time.')

const keptSettings = applySongSettings(bar15.song, {
  title: bar15.song.metadata.title,
  composer: bar15.song.metadata.composer,
  timeSignature: settings.timeSignature,
  keySignature: settings.keySignature,
  pickup: settings.pickup,
  ticksPerWrittenQuarter: settings.ticksPerWrittenQuarter,
})
if (keptSettings.musicalInterpretation.graceNotes?.length !== 1) fail('Song Settings removed the grace note.')
if (keptSettings.musicalInterpretation.writtenDurations?.[0]?.writtenEndTick !== 16896) {
  fail('Song Settings removed the written-duration override.')
}
if (!isSong(bar15.song)) fail('Song B with a grace note is not a valid Song document.')
const brokenGrace = {
  ...bar15.song,
  musicalInterpretation: {
    ...bar15.song.musicalInterpretation,
    graceNotes: [{ ...SONG_B_BAR15_A4_GRACE, slash: 'yes' }],
  },
}
if (isSong(brokenGrace)) fail('A grace note with a non-boolean slash was accepted.')

const wrongDuration = planWrittenDuration(withTies, { ...SONG_B_BAR15_A4_SIXTEENTH, writtenEndTick: 17000 })
if (wrongDuration.action !== 'install') fail('A first written-duration override should be stored.')
const blockedDuration = planWrittenDuration(wrongDuration.song, SONG_B_BAR15_A4_SIXTEENTH)
if (blockedDuration.action !== 'conflict') fail('A conflicting written duration replaced the stored one.')
const wrongGrace = planGraceNote(withTies, { ...SONG_B_BAR15_A4_GRACE, slash: true })
if (wrongGrace.action !== 'install') fail('A first grace note should be stored.')
const blockedGrace = planGraceNote(wrongGrace.song, SONG_B_BAR15_A4_GRACE)
if (blockedGrace.action !== 'conflict') fail('A conflicting grace note replaced the stored one.')
const missingPrincipal = planGraceNote(withTies, {
  ...SONG_B_BAR15_A4_GRACE,
  principal: { track: 2, midi: 69, startTick: 1 },
})
if (missingPrincipal.action !== 'midi-mismatch') fail('A grace note with no principal note was stored.')

const engineRoots = ['src/interpretation', 'src/engraving', 'src/notation']
for (const root of engineRoots) {
  for (const file of typescriptFiles(root)) {
    const source = readFileSync(file, 'utf8')
    if (/indexedDB|song-database|SongRepository|convex|project-readings|chopin-prelude-op28-no7-b/.test(source)) {
      fail(`${file} depends on storage or on Song B.`)
    }
  }
}

const engraving = readFileSync('src/notation/engraving-view.ts', 'utf8')
if (!engraving.includes('song.musicalInterpretation.sustainedNotes')) {
  fail('Engraving no longer reads the spelling from the Song.')
}
if (readFileSync('src/main.ts', 'utf8').includes('song-database')) {
  fail('The application entry imports the IndexedDB module instead of the repository.')
}

console.log('Song repository checks passed.')
console.log('The Bar 5 spelling is installed once, and a conflicting spelling is left alone.')

function typescriptFiles(directory: string): string[] {
  const files: string[] = []
  for (const name of readdirSync(directory)) {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) files.push(...typescriptFiles(path))
    else if (name.endsWith('.ts')) files.push(path)
  }
  return files
}
