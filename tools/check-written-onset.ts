/**
 * Checks written-onset alignment for Song C's performed attacks.
 * The original MIDI ticks stay put. Songs A and B are not given the relaxed grid.
 */
import { readFileSync } from 'node:fs'
import { fractionKey } from '../src/interpretation/duration.ts'
import { buildMeasureContent, type MeasureContent } from '../src/interpretation/measure-content.ts'
import { assignPianoStaffs } from '../src/interpretation/staff.ts'
import { alignWrittenOnset, resolveWrittenOnset } from '../src/interpretation/written-onset.ts'
import { parseMidi } from '../src/midi/parse-midi.ts'
import { displayedMeasures, writtenMeasures } from '../src/notation/written-measures.ts'
import {
  installSongCFoundation,
  planSongCFoundation,
  SONG_C_ID,
  SONG_C_ONSET_ALIGNMENT,
  SONG_C_WRITTEN_DURATIONS,
} from '../src/song/install-song-c.ts'
import {
  SONG_B_BAR15_A4_GRACE,
  SONG_B_BAR15_A4_SIXTEENTH,
  SONG_B_ID,
  SONG_B_READINGS,
} from '../src/song/install-sustained-reading.ts'
import type { SongRepository } from '../src/song/song-repository.ts'
import { applySongSettings } from '../src/song/song-settings.ts'
import { isSong, type MusicalInterpretation, type Song } from '../src/song/song.ts'

function fail(message: string): never {
  throw new Error(message)
}

const songCMidi = parseMidi(new Uint8Array(readFileSync('midi-files/eine-kleine-nachtmusik-intermediate.mid')))
const songAMidi = parseMidi(new Uint8Array(readFileSync('midi-files/chopin-prelude-op-28-no-7-in-a-major.mid')))
const songBMidi = parseMidi(new Uint8Array(readFileSync('midi-files/chopin-prelude-op-28-no-7-in-a-major-b.mid')))
const midiBefore = JSON.stringify(songCMidi)

const alignment = SONG_C_ONSET_ALIGNMENT
const origin = 2734
const quarter = 480

const expected: readonly { original: number; written: number }[] = [
  { original: 2734, written: 2734 },
  { original: 3440, written: 3454 },
  { original: 3686, written: 3694 },
  { original: 4392, written: 4414 },
  { original: 4423, written: 4414 },
  { original: 4638, written: 4654 },
  { original: 4884, written: 4894 },
  { original: 5130, written: 5134 },
  { original: 5376, written: 5374 },
  { original: 5621, written: 5614 },
  { original: 6574, written: 6574 },
]

for (const row of expected) {
  const aligned = alignWrittenOnset(row.original, origin, quarter, alignment)
  if (!aligned.aligned || aligned.writtenOnsetTick !== row.written) {
    fail(`Onset ${row.original} aligned to ${aligned.aligned ? aligned.writtenOnsetTick : aligned.reason}, not ${row.written}.`)
  }
  const still = songCMidi.notes.find((note) => note.startTick === row.original)
  if (still === undefined) fail(`The MIDI file no longer has an attack at tick ${row.original}.`)
}

const tooFar = alignWrittenOnset(origin + 151, origin, quarter, alignment)
if (tooFar.aligned) fail('An attack 31 ticks from the grid was moved.')
const onTheLimit = alignWrittenOnset(origin + 90, origin, quarter, alignment)
if (!onTheLimit.aligned || onTheLimit.writtenOnsetTick !== origin + 120 || onTheLimit.deviationTicks !== 30) {
  fail('An attack 30 ticks from the grid was not accepted.')
}
const uneven = alignWrittenOnset(0, 0, 100, { subdivisionsPerQuarter: 3, maxDeviationTicks: 30 })
if (uneven.aligned) fail('A quarter that does not divide evenly was still aligned.')

const bareInterpretation: MusicalInterpretation = {
  timeSignature: { numerator: 4, denominator: 4 },
  pickup: { present: false },
  ticksPerWrittenQuarter: quarter,
}
if (resolveWrittenOnset(4638, bareInterpretation) !== 4638) {
  fail('A song without an alignment setting moved a performed attack.')
}

const interpretation: MusicalInterpretation = {
  ...bareInterpretation,
  writtenStartTick: origin,
  staffSplitPitch: 60,
  writtenOnsetAlignment: alignment,
  writtenDurations: SONG_C_WRITTEN_DURATIONS,
}

const plan = writtenMeasures(interpretation, 6)
if (!plan.ready) fail(plan.ready ? '' : plan.message)
const spans = plan.measures.map((measure) => `${measure.index}:${measure.span.startTick}-${measure.span.endTick}`)
if (spans.join(' ') !== '1:2734-4654 2:4654-6574 3:6574-8494 4:8494-10414 5:10414-12334 6:12334-14254') {
  fail(`The six measure boundaries changed to ${spans.join(' ')}.`)
}
const shown = displayedMeasures(interpretation, songCMidi.notes, 'all')
if (!shown.ready || shown.available !== 47) fail('Aligned onsets changed how many complete measures the piece contains.')

const staves = assignPianoStaffs(songCMidi.notes, interpretation)
if (!staves.ready) fail('Song C staff assignment was not ready.')

function content(span: { startTick: number; endTick: number }): MeasureContent {
  return buildMeasureContent({
    notes: songCMidi.notes,
    span,
    ticksPerWrittenQuarter: quarter,
    staffByTrack: staves.staffByTrack,
    staffForNote: staves.staffForNote,
    measureQuarters: { numerator: 4, denominator: 1 },
    writtenDurations: interpretation.writtenDurations,
    writtenOnsetTick: (note) => resolveWrittenOnset(note.startTick, interpretation),
  })
}

const bar1 = content(plan.measures[0]!.span)
const bar2 = content(plan.measures[1]!.span)

function placedTicks(measure: MeasureContent): number[] {
  const ticks: number[] = []
  for (const column of measure.columns) {
    for (const event of column.events) {
      for (const pitch of event.pitches) ticks.push(pitch.startTick)
    }
  }
  for (const column of measure.provisional) {
    for (const event of column.events) {
      for (const pitch of event.pitches) ticks.push(pitch.startTick)
    }
  }
  return ticks
}

const earlyChord = placedTicks(bar1).filter((tick) => tick === 4638)
const downbeat = placedTicks(bar2).filter((tick) => tick === 4638)
if (earlyChord.length !== 0 || downbeat.length !== 3) {
  fail(`The G chord at 4638 appears ${earlyChord.length} times in Bar 1 and ${downbeat.length} times in Bar 2.`)
}

const beatThree = bar1.provisional.find((column) => fractionKey(column.onset) === '7/2')
const beatThreePitches = beatThree?.events.flatMap((event) => event.pitches.map((pitch) => `${pitch.midi}:${event.staff}`)) ?? []
if (beatThreePitches.sort().join(',') !== '50:bass,74:treble') {
  fail(`The D notes at 4392 and 4423 did not share beat 3.5: ${beatThreePitches.join(',')}.`)
}
const beatThreeStarts = beatThree?.events.flatMap((event) => event.pitches.map((pitch) => pitch.startTick)).sort()
if (beatThreeStarts?.join(',') !== '4392,4423') fail('The shared written onset dropped an original MIDI identity.')

const gChord = bar1.columns.find((column) => fractionKey(column.onset) === '2/1')
const g4 = gChord?.events.flatMap((event) => event.pitches).find((pitch) => pitch.midi === 67)
if (g4?.sounding?.durationTicks !== 768 || g4.durationTicks !== 240 || g4.startTick !== 3686) {
  fail('G4 at 3686 was not written as an eighth while keeping its 768-tick sound.')
}
const gPartners = gChord?.events.flatMap((event) => event.pitches.map((pitch) => pitch.midi)).sort((a, b) => a - b)
if (gPartners?.join(',') !== '55,67,79') fail(`The beat-2 G chord is ${gPartners?.join(',')}.`)

const bChord = bar2.columns.find((column) => fractionKey(column.onset) === '3/2')
const bPitches = bChord?.events.flatMap((event) => event.pitches) ?? []
const bIdentity = bPitches.map((pitch) => `${pitch.midi}:${pitch.startTick}:${pitch.sounding?.durationTicks ?? pitch.durationTicks}`).sort()
if (bIdentity.join(',') !== '59:5376:245,71:5376:30,83:5376:30') {
  fail(`The Bar 2 B eighths are ${bIdentity.join(',')}.`)
}
if (bPitches.some((pitch) => pitch.durationTicks !== 240)) fail('A 30-tick B was not written as an eighth.')

const owned = songCMidi.notes.filter((note) => {
  const written = resolveWrittenOnset(note.startTick, interpretation)
  return written >= 2734 && written < 6574
})
const drawn = [...placedTicks(bar1), ...placedTicks(bar2)].sort((a, b) => a - b)
const ownedTicks = owned.map((note) => note.startTick).sort((a, b) => a - b)
if (drawn.join(',') !== ownedTicks.join(',')) {
  fail('A note was duplicated or lost across the Bar 1 and Bar 2 boundary.')
}
if (JSON.stringify(songCMidi) !== midiBefore) fail('Alignment changed the parsed MIDI object.')
if (songCMidi.notes.length !== 872 || songAMidi.notes.length !== 176 || songBMidi.notes.length !== 168) {
  fail('A song lost MIDI notes.')
}

function song(id: string, midi: Song['originalMidi'], extra: MusicalInterpretation): Song {
  return {
    id,
    schemaVersion: 1,
    metadata: { title: id, composer: 'Test', sourceFilename: 'test.mid' },
    originalMidi: midi,
    musicalInterpretation: extra,
  }
}

const songC = song(SONG_C_ID, songCMidi, bareInterpretation)
const songA = song('chopin-prelude-op-28-no-7', songAMidi, {
  timeSignature: { numerator: 3, denominator: 4 },
  pickup: { present: true, duration: 'quarter' },
  ticksPerWrittenQuarter: 666.67,
})
const songB = song(SONG_B_ID, songBMidi, {
  timeSignature: { numerator: 3, denominator: 4 },
  pickup: { present: true, duration: 'quarter' },
  ticksPerWrittenQuarter: 384,
  sustainedNotes: SONG_B_READINGS,
  writtenDurations: [SONG_B_BAR15_A4_SIXTEENTH],
  graceNotes: [SONG_B_BAR15_A4_GRACE],
})
const songBBefore = JSON.stringify(songB)
if (planSongCFoundation(songA).action !== 'unchanged' || planSongCFoundation(songB).action !== 'unchanged') {
  fail('Song C alignment was planned onto another Song.')
}
if (JSON.stringify(songB) !== songBBefore) fail('Planning Song C changed Song B.')

const planned = planSongCFoundation(songC)
if (planned.action !== 'install') fail('Song C was not given an onset alignment.')
if (planned.song.musicalInterpretation.writtenOnsetAlignment?.maxDeviationTicks !== 30) {
  fail('The installed deviation is not 30 ticks.')
}
if (planned.song.musicalInterpretation.writtenDurations?.length !== SONG_C_WRITTEN_DURATIONS.length) {
  fail('The written-duration readings were not installed.')
}
if (planned.song.originalMidi !== songCMidi) fail('The install replaced the MIDI object.')
if (planSongCFoundation(planned.song).action !== 'unchanged') fail('A second plan wrote Song C again.')

const records = new Map<string, Song>([[songC.id, songC]])
const saves: Song[] = []
const repository: SongRepository = {
  async getSong(id) {
    return records.get(id)
  },
  async listSongs() {
    return [...records.values()]
  },
  async addSong() {
    throw new Error('not used')
  },
  async saveSong(next) {
    saves.push(next)
    records.set(next.id, next)
  },
}
const installed = await installSongCFoundation(repository)
if (installed.status !== 'installed' || saves.length !== 1) fail('Startup did not save the alignment once.')
const reloaded = await repository.getSong(SONG_C_ID)
if (reloaded?.musicalInterpretation.writtenOnsetAlignment?.subdivisionsPerQuarter !== 4) {
  fail('Reload lost the onset alignment.')
}
if (reloaded.musicalInterpretation.ticksPerWrittenQuarter !== 480 || reloaded.musicalInterpretation.writtenStartTick !== 2734) {
  fail('Reload changed the written quarter or the written start.')
}
if (reloaded.originalMidi.notes.length !== 872) fail('Reload lost Song C notes.')
const again = await installSongCFoundation(repository)
if (again.status !== 'unchanged' || saves.length !== 1) fail('A second startup wrote the alignment again.')

const saved = applySongSettings(reloaded, {
  title: reloaded.metadata.title,
  composer: reloaded.metadata.composer,
  timeSignature: { numerator: 4, denominator: 4 },
  pickup: { present: false },
  ticksPerWrittenQuarter: 480,
})
if (saved.musicalInterpretation.writtenOnsetAlignment?.maxDeviationTicks !== 30) {
  fail('Saving Song Settings removed the onset alignment.')
}
if (saved.musicalInterpretation.writtenDurations?.length !== 6) fail('Saving Song Settings removed the written durations.')
if (saved.originalMidi !== reloaded.originalMidi) fail('Saving Song Settings replaced the MIDI object.')

if (isSong({ ...songA, musicalInterpretation: { ...songA.musicalInterpretation, writtenOnsetAlignment: { subdivisionsPerQuarter: 0, maxDeviationTicks: 30 } } })) {
  fail('A grid with no subdivisions was accepted.')
}

console.log('Written-onset checks passed.')
console.log('Song C attacks snap to the sixteenth grid. The MIDI ticks stay where they were.')
