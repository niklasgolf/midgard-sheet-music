/**
 * Checks no-pickup planning, the written start tick, one-track staff assignment,
 * and the per-song measure display choice.
 * The memory repository stands in for IndexedDB. This file does not open a database.
 */
import { readFileSync } from 'node:fs'
import { buildMeasureContent } from '../src/interpretation/measure-content.ts'
import { assignPianoStaffs } from '../src/interpretation/staff.ts'
import { parseMidi, type MidiNote } from '../src/midi/parse-midi.ts'
import { displayedMeasures, openingMeasures, writtenMeasures } from '../src/notation/written-measures.ts'
import { parsePositiveInteger } from '../src/song/display-view.ts'
import {
  installSongCFoundation,
  planSongCFoundation,
  SONG_C_ID,
  SONG_C_MEASURE_COUNT,
  SONG_C_MEASURES_PER_ROW,
  SONG_C_ONSET_ALIGNMENT,
  SONG_C_STAFF_SPLIT_PITCH,
  SONG_C_WRITTEN_DURATIONS,
  SONG_C_WRITTEN_START_TICK,
} from '../src/song/install-song-c.ts'
import {
  SONG_B_BAR15_A4_GRACE,
  SONG_B_BAR15_A4_SIXTEENTH,
  SONG_B_ID,
  SONG_B_READINGS,
} from '../src/song/install-sustained-reading.ts'
import type { SongRepository } from '../src/song/song-repository.ts'
import { applySongSettings } from '../src/song/song-settings.ts'
import {
  completeMeasureRequest,
  DEFAULT_COMPLETE_MEASURES,
  DEFAULT_MEASURES_PER_ROW,
  isSong,
  measuresPerRowCount,
  SONG_SCHEMA_VERSION,
  type Song,
} from '../src/song/song.ts'

function fail(message: string): never {
  throw new Error(message)
}

const songAMidi = parseMidi(new Uint8Array(readFileSync('midi-files/chopin-prelude-op-28-no-7-in-a-major.mid')))
const songBMidi = parseMidi(new Uint8Array(readFileSync('midi-files/chopin-prelude-op-28-no-7-in-a-major-b.mid')))
const songCMidi = parseMidi(new Uint8Array(readFileSync('midi-files/eine-kleine-nachtmusik-intermediate.mid')))
const songCBefore = JSON.stringify(songCMidi)

const songAInterpretation: Song['musicalInterpretation'] = {
  timeSignature: { numerator: 3, denominator: 4 },
  pickup: { present: true, duration: 'quarter' },
  ticksPerWrittenQuarter: 666.67,
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
const songCInterpretation: Song['musicalInterpretation'] = {
  timeSignature: { numerator: 4, denominator: 4 },
  pickup: { present: false },
  ticksPerWrittenQuarter: 480,
  writtenStartTick: SONG_C_WRITTEN_START_TICK,
  staffSplitPitch: SONG_C_STAFF_SPLIT_PITCH,
}

function songFor(
  id: string,
  title: string,
  midi: Song['originalMidi'],
  interpretation: Song['musicalInterpretation'],
  display?: Song['display'],
): Song {
  return {
    id,
    schemaVersion: SONG_SCHEMA_VERSION,
    metadata: { title, composer: 'Test', sourceFilename: `${id}.mid` },
    originalMidi: midi,
    musicalInterpretation: interpretation,
    ...(display === undefined ? {} : { display }),
  }
}

const songA = songFor('chopin-prelude-op-28-no-7', 'Prelude', songAMidi, songAInterpretation)
const songB = songFor(SONG_B_ID, 'Prelude B', songBMidi, songBInterpretation)
const songC = songFor(SONG_C_ID, 'Eine kleine Nachtmusik — Intermediate', songCMidi, songCInterpretation, {
  measures: { kind: 'count', count: 6 },
})

if (songA.musicalInterpretation.pickup?.present !== true || songA.musicalInterpretation.pickup.duration !== 'quarter') {
  fail('Song A lost its quarter-note pickup.')
}
if (songB.musicalInterpretation.pickup?.present !== true || songB.musicalInterpretation.pickup.duration !== 'quarter') {
  fail('Song B lost its quarter-note pickup.')
}
if (songC.musicalInterpretation.pickup?.present !== false) fail('Song C has a pickup.')

const songASix = displayedMeasures(songAInterpretation, songAMidi.notes, 6)
if (!songASix.ready) fail(songASix.message)
if (songASix.measures.length !== 7) fail('Song A’s six measures did not include Bar 0.')
const songAPickup = songASix.measures[0]
const songABar1 = songASix.measures[1]
const songABar6 = songASix.measures[6]
if (songAPickup?.index !== 0 || songAPickup.span.startTick !== 0 || songAPickup.span.endTick !== 666.67) {
  fail('Song A’s pickup moved.')
}
if (songABar1?.index !== 1 || songABar1.span.startTick !== 666.67) fail('Song A Bar 1 moved.')
if (songABar6?.index !== 6) fail('Song A did not draw through Bar 6.')

const songBSix = displayedMeasures(songBInterpretation, songBMidi.notes, 6)
if (!songBSix.ready) fail(songBSix.message)
if (songBSix.measures.map((measure) => measure.index).join(',') !== '0,1,2,3,4,5,6') {
  fail('Song B’s six measures are not Bar 0 plus Bars 1–6.')
}
if (songBSix.measures[0]?.span.endTick !== 384 || songBSix.measures[1]?.span.startTick !== 384) {
  fail('Song B’s quarter pickup moved.')
}
if (songBSix.measures[1]?.span.endTick !== 1536) fail('Song B Bar 1 is no longer one 3/4 bar.')

const songBOpening = openingMeasures(songBInterpretation)
if (!songBOpening.ready || songBOpening.pickup.startTick !== 0 || songBOpening.pickup.endTick !== 384) {
  fail('openingMeasures no longer describes Song B’s pickup.')
}
const noPickupOpening = openingMeasures(songCInterpretation)
if (noPickupOpening.ready) fail('openingMeasures treated Song C as a pickup piece.')

const songCSix = displayedMeasures(songCInterpretation, songCMidi.notes, 6)
if (!songCSix.ready) fail(songCSix.message)
if (songCSix.measures.length !== 6) fail(`Song C drew ${songCSix.measures.length} measures.`)
if (songCSix.measures.some((measure) => measure.index === 0)) fail('Song C gained a Bar 0.')
const songCBar1 = songCSix.measures[0]
const songCBar6 = songCSix.measures[5]
if (songCBar1?.index !== 1 || songCBar1.span.startTick !== 2734 || songCBar1.span.endTick !== 4654) {
  fail(`Song C Bar 1 is ${songCBar1?.span.startTick}–${songCBar1?.span.endTick}.`)
}
if (songCBar6?.index !== 6 || songCBar6.span.startTick !== 12334 || songCBar6.span.endTick !== 14254) {
  fail(`Song C Bar 6 is ${songCBar6?.span.startTick}–${songCBar6?.span.endTick}.`)
}

const songCTwelve = displayedMeasures(songCInterpretation, songCMidi.notes, 12)
if (!songCTwelve.ready || songCTwelve.measures.length !== 12 || songCTwelve.measures[11]?.index !== 12) {
  fail('Twelve measures were not planned for Song C.')
}
const songCAll = displayedMeasures(songCInterpretation, songCMidi.notes, 'all')
if (!songCAll.ready) fail(songCAll.message)
if (songCAll.shown !== 47 || songCAll.measures.length !== 47) fail(`All measures planned ${songCAll.ready ? songCAll.shown : 0}.`)
const lastOnset = Math.max(...songCMidi.notes.map((note) => note.startTick))
const lastBar = songCAll.measures[songCAll.measures.length - 1]
if (lastBar === undefined || lastOnset < lastBar.span.startTick || lastOnset >= lastBar.span.endTick) {
  fail('The last Song C note falls outside the final measure.')
}
const songCTooMany = displayedMeasures(songCInterpretation, songCMidi.notes, 100)
if (!songCTooMany.ready || songCTooMany.requested !== 100 || songCTooMany.shown !== 47 || songCTooMany.measures.length !== 47) {
  fail('A count past the end of Song C was not limited to the music.')
}
if (!parsePositiveInteger('4').ok || parsePositiveInteger('0').ok || parsePositiveInteger('1.5').ok || parsePositiveInteger('').ok) {
  fail('Custom measure counts were not limited to positive whole numbers.')
}
const custom = displayedMeasures(songCInterpretation, songCMidi.notes, 4)
if (!custom.ready || custom.measures.length !== 4) fail('A custom count of 4 was not planned.')

const fromZero = writtenMeasures({ ...songCInterpretation, writtenStartTick: undefined }, 1)
if (!fromZero.ready || fromZero.measures[0]?.span.startTick !== 0) fail('A missing written start did not stay at tick 0.')
if (JSON.stringify(songCMidi) !== songCBefore) fail('Planning changed the Song C MIDI object.')

const twoTracks = assignPianoStaffs(songBMidi.notes, { staffSplitPitch: 60 })
if (!twoTracks.ready) fail(twoTracks.message)
const trebleTrack = songBMidi.notes.find((note) => twoTracks.staffForNote(note) === 'treble')?.track
const bassTrack = songBMidi.notes.find((note) => twoTracks.staffForNote(note) === 'bass')?.track
if (trebleTrack === undefined || bassTrack === undefined || trebleTrack === bassTrack) {
  fail('Song B’s two tracks no longer map to two staves.')
}
const lowOnTreble = songBMidi.notes.find((note) => note.track === trebleTrack && note.midi < 60)
if (lowOnTreble !== undefined && twoTracks.staffForNote(lowOnTreble) !== 'treble') {
  fail('A staff split pitch moved a note off Song B’s treble track.')
}

const oneTrack = assignPianoStaffs(songCMidi.notes, { staffSplitPitch: SONG_C_STAFF_SPLIT_PITCH })
if (!oneTrack.ready) fail(oneTrack.message)
const opening = songCMidi.notes.filter((note) => note.startTick === 2734)
if (opening.length !== 5) fail('The Song C opening chord changed.')
const hands = opening.map((note) => `${note.midi}:${oneTrack.staffForNote(note)}`).sort().join(',')
if (hands !== '43:bass,55:bass,62:treble,71:treble,79:treble') fail(`The opening split is ${hands}.`)
if (oneTrack.staffForNote(note(60)) !== 'treble' || oneTrack.staffForNote(note(59)) !== 'bass') {
  fail('The split did not put MIDI 60 on the treble staff and MIDI 59 on the bass staff.')
}
const refused = assignPianoStaffs(songCMidi.notes)
if (refused.ready) fail('One track without a split pitch was drawn.')

const splitContent = buildMeasureContent({
  notes: [note(59, 0), note(60, 0)],
  span: { startTick: 0, endTick: 1920 },
  ticksPerWrittenQuarter: 480,
  staffByTrack: oneTrack.staffByTrack,
  staffForNote: oneTrack.staffForNote,
  measureQuarters: { numerator: 4, denominator: 1 },
})
const splitHands = splitContent.columns.flatMap((column) => column.events.map((event) => `${event.pitches[0]?.midi}:${event.staff}`))
if (splitHands.sort().join(',') !== '59:bass,60:treble') fail(`Measure content placed the split as ${splitHands.join(',')}.`)

const bare = songFor(SONG_C_ID, 'Eine kleine Nachtmusik — Intermediate', songCMidi, {
  timeSignature: { numerator: 4, denominator: 4 },
  pickup: { present: false },
  ticksPerWrittenQuarter: 480,
})
const planned = planSongCFoundation(bare)
if (planned.action !== 'install') fail('A Song C record without a start tick was not given one.')
if (planned.song.musicalInterpretation.writtenStartTick !== 2734) fail('The installed start tick is not 2734.')
if (planned.song.musicalInterpretation.staffSplitPitch !== 60) fail('The installed split pitch is not 60.')
if (planned.song.display?.measures?.kind !== 'count' || planned.song.display.measures.count !== SONG_C_MEASURE_COUNT) {
  fail('Song C was not given a display choice of 6 measures.')
}
if (planned.song.display.measuresPerRow?.kind !== 'fixed' || planned.song.display.measuresPerRow.count !== SONG_C_MEASURES_PER_ROW) {
  fail('Song C was not given two measures per row.')
}
if (planned.song.musicalInterpretation.pickup?.present !== false) fail('The install changed the saved pickup.')
if (planned.song.originalMidi !== songCMidi) fail('The install replaced the MIDI object.')

const again = planSongCFoundation(planned.song)
if (again.action !== 'unchanged') fail('Planning Song C a second time wanted to write again.')

const conflicted = songFor(
  SONG_C_ID,
  'Eine kleine Nachtmusik — Intermediate',
  songCMidi,
  {
    ...songCInterpretation,
    writtenStartTick: 100,
    staffSplitPitch: 40,
    writtenOnsetAlignment: SONG_C_ONSET_ALIGNMENT,
    writtenDurations: SONG_C_WRITTEN_DURATIONS,
  },
  { measures: { kind: 'count', count: 6 }, measuresPerRow: { kind: 'fixed', count: 3 } },
)
const conflict = planSongCFoundation(conflicted)
if (conflict.action !== 'conflict') fail('A different written start was overwritten.')
if (conflicted.musicalInterpretation.writtenStartTick !== 100) fail('The conflicting written start changed.')
if (conflicted.musicalInterpretation.staffSplitPitch !== 40) fail('The conflicting staff split changed.')
if (conflicted.display?.measuresPerRow?.count !== 3) fail('A saved row choice was replaced during a conflict.')

const keptDisplay = songFor(
  SONG_C_ID,
  'Eine kleine Nachtmusik — Intermediate',
  songCMidi,
  { ...songCInterpretation, writtenStartTick: undefined, staffSplitPitch: undefined },
  { measures: { kind: 'all' } },
)
const kept = planSongCFoundation(keptDisplay)
if (kept.action !== 'install' || kept.song.display?.measures?.kind !== 'all') {
  fail('An existing Song C display choice was replaced.')
}
if (kept.song.display?.measuresPerRow?.count !== 2) fail('Song C did not gain two measures per row beside its saved count.')

const songBBefore = JSON.stringify(songB)
const songABefore = JSON.stringify(songA)
if (planSongCFoundation(songA).action !== 'unchanged' || planSongCFoundation(songB).action !== 'unchanged') {
  fail('Song C’s install planned a change to another Song.')
}
if (JSON.stringify(songA) !== songABefore || JSON.stringify(songB) !== songBBefore) fail('Planning touched Song A or Song B.')

function memoryLibrary(initial: readonly Song[]): { repository: SongRepository; saves: Song[] } {
  const records = new Map(initial.map((song) => [song.id, song]))
  const saves: Song[] = []
  return {
    saves,
    repository: {
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
        saves.push(song)
        records.set(song.id, song)
      },
    },
  }
}

const library = memoryLibrary([songA, songB, bare])
const installed = await installSongCFoundation(library.repository)
if (installed.status !== 'installed' || library.saves.length !== 1) fail('Song C was not saved once.')
const reloaded = await library.repository.getSong(SONG_C_ID)
if (!reloaded || !isSong(reloaded)) fail('Song C could not be read back.')
if (reloaded.musicalInterpretation.writtenStartTick !== 2734 || reloaded.musicalInterpretation.staffSplitPitch !== 60) {
  fail('The reloaded Song C lost its new Part C fields.')
}
if (reloaded.display?.measures?.kind !== 'count' || reloaded.display.measures.count !== 6) {
  fail('The reloaded Song C lost its display choice.')
}
if (reloaded.display.measuresPerRow?.count !== 2) fail('The reloaded Song C lost its row choice.')
if (reloaded.originalMidi.notes.length !== 872) fail('The reloaded Song C lost notes.')
if (reloaded.originalMidi.notes.find((note) => note.startTick === 2734) === undefined) {
  fail('The first Song C note moved.')
}
const repeated = await installSongCFoundation(library.repository)
if (repeated.status !== 'unchanged' || library.saves.length !== 1) fail('A second startup wrote Song C again.')
const storedA = await library.repository.getSong(songA.id)
const storedB = await library.repository.getSong(SONG_B_ID)
if (JSON.stringify(storedA) !== songABefore || JSON.stringify(storedB) !== songBBefore) {
  fail('Installing Song C changed Song A or Song B.')
}
if (storedB?.musicalInterpretation.sustainedNotes?.length !== 4) fail('Song B’s sustained readings changed.')
if (storedB.musicalInterpretation.writtenDurations?.length !== 1 || storedB.musicalInterpretation.graceNotes?.length !== 1) {
  fail('Song B’s written duration or grace note changed.')
}

const withChoice = songFor(SONG_C_ID, 'Eine kleine Nachtmusik — Intermediate', songCMidi, songCInterpretation, {
  measures: { kind: 'count', count: 12 },
  measuresPerRow: { kind: 'fixed', count: 2 },
})
const savedSettings = applySongSettings(withChoice, {
  title: withChoice.metadata.title,
  composer: withChoice.metadata.composer,
  timeSignature: songCInterpretation.timeSignature,
  pickup: songCInterpretation.pickup,
  ticksPerWrittenQuarter: 480,
})
if (savedSettings.display?.measures?.kind !== 'count' || savedSettings.display.measures.count !== 12) {
  fail('Saving Song Settings removed the display choice.')
}
if (savedSettings.display.measuresPerRow?.count !== 2) fail('Saving Song Settings removed the row choice.')
if (savedSettings.musicalInterpretation.writtenStartTick !== 2734 || savedSettings.musicalInterpretation.staffSplitPitch !== 60) {
  fail('Saving Song Settings removed the written start or the staff split.')
}
if (savedSettings.originalMidi !== withChoice.originalMidi) fail('Saving Song Settings replaced the MIDI object.')

const otherLibrary = memoryLibrary([
  songFor(songA.id, 'Prelude', songAMidi, songAInterpretation, {
    measures: { kind: 'count', count: 6 },
    measuresPerRow: { kind: 'fixed', count: 3 },
  }),
  songFor(SONG_B_ID, 'Prelude B', songBMidi, songBInterpretation, {
    measures: { kind: 'all' },
    measuresPerRow: { kind: 'fixed', count: 3 },
  }),
  withChoice,
])
const restoredA = (await otherLibrary.repository.getSong(songA.id)) as Song
const restoredB = (await otherLibrary.repository.getSong(SONG_B_ID)) as Song
const restoredC = (await otherLibrary.repository.getSong(SONG_C_ID)) as Song
if (completeMeasureRequest(restoredA) !== 6 || measuresPerRowCount(restoredA) !== 3) {
  fail('Song A’s display choice was not restored.')
}
if (completeMeasureRequest(restoredB) !== 'all' || measuresPerRowCount(restoredB) !== 3) {
  fail('Song B’s display choice was not restored.')
}
if (completeMeasureRequest(restoredC) !== 12 || measuresPerRowCount(restoredC) !== 2) {
  fail('Song C’s display choice was not restored.')
}
if (completeMeasureRequest(songA) !== DEFAULT_COMPLETE_MEASURES) fail('A song with no display choice left the default of 16.')
if (measuresPerRowCount(songA) !== DEFAULT_MEASURES_PER_ROW || measuresPerRowCount(songB) !== 3) {
  fail('Songs A and B did not default to 3 measures per row.')
}
if (measuresPerRowCount(withChoice) !== 2) fail('Song C’s saved row choice was not 2.')
if (isSong({ ...songA, display: { measuresPerRow: { kind: 'fixed', count: 4 } } })) {
  fail('An unsupported row count was accepted.')
}

const databaseSource = readFileSync('src/song/song-database.ts', 'utf8')
if (!databaseSource.includes('export const SONG_DATABASE_VERSION = 1')) fail('The database version changed.')

console.log('Display planning checks passed.')
console.log('Song C Bars 1–6 start at tick 2734. Songs A and B keep their pickups.')

function note(midi: number, startTick = 2734): MidiNote {
  return {
    midi,
    startTick,
    endTick: startTick + 480,
    durationTicks: 480,
    velocity: 80,
    releaseVelocity: 0,
    channel: 1,
    track: 1,
  }
}
