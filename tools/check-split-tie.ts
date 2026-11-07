/**
 * Checks for one sustained MIDI sound written as tied notes,
 * and for the split-tie geometry that stays inside one measure.
 * This does not read or write IndexedDB.
 */
import { readFileSync } from 'node:fs'
import { noteheadY, pitchStaffStep, TREBLE_BOTTOM_DIATONIC } from '../src/engraving/geometry.ts'
import {
  TIE_BOW,
  TIE_EDGE_INSET,
  TIE_THICKNESS,
  tieAttachmentY,
  tieCurve,
  tieEndpoints,
  tieExtentY,
  tiePath,
  tieSideForStep,
} from '../src/engraving/tie.ts'
import { fractionFromQuarters } from '../src/interpretation/duration.ts'
import { buildMeasureContent, pitchCount, type MeasureContent } from '../src/interpretation/measure-content.ts'
import { sustainedReadingsFor } from '../src/interpretation/project-readings.ts'
import { assignPianoStaffs } from '../src/interpretation/staff.ts'
import { planTies, spellSustainedNote, type WrittenSegment } from '../src/interpretation/sustained-note.ts'
import { parseMidi, type MidiNote } from '../src/midi/parse-midi.ts'
import { openingMeasures, writtenMeasures, type WrittenMeasure } from '../src/notation/written-measures.ts'

const SONG_B_ID = 'chopin-prelude-op28-no7-b'
const QUARTER = 384

function fail(message: string): never {
  throw new Error(message)
}

function sameList(actual: readonly string[], expected: readonly string[], label: string): void {
  const left = [...actual].sort().join(', ')
  const right = [...expected].sort().join(', ')
  if (left !== right) fail(`${label}: expected ${right}, got ${left}`)
}

const songBFile = readFileSync('src/song/project-songs.ts', 'utf8')
if (!songBFile.includes(`'${SONG_B_ID}'`)) fail('Song B id in the reading no longer matches the library.')

const bytes = new Uint8Array(readFileSync('midi-files/chopin-prelude-op-28-no-7-in-a-major-b.mid'))
const midi = parseMidi(bytes)
const before = JSON.stringify(midi.notes)
if (midi.notes.length !== 168) fail(`Song B should still have 168 MIDI notes, found ${midi.notes.length}.`)

const d4 = midi.notes.filter((note) => note.midi === 62 && note.startTick === 5280)
if (d4.length !== 1) fail(`Expected one MIDI D4 at tick 5280, found ${d4.length}.`)
const sounded = d4[0]
if (sounded === undefined || sounded.endTick !== 6912 || sounded.durationTicks !== 1632 || sounded.track !== 2) {
  fail(`The D4 event is ${JSON.stringify(sounded)}.`)
}
if (midi.notes.some((note) => note.midi === 62 && (note.startTick === 5376 || note.startTick === 6144))) {
  fail('The MIDI file already contains a D4 at a written split point.')
}

const readings = sustainedReadingsFor({ id: SONG_B_ID, musicalInterpretation: {} })
if (readings.length !== 1) fail('Song B should have one project reading.')
const reading = readings[0]
if (reading === undefined) fail('The project reading is missing.')
const segments = spellSustainedNote(sounded, reading, QUARTER)
if (segments === undefined) fail('The D4 reading did not spell.')
if (segments.map((segment) => segment.duration.base).join(',') !== 'sixteenth,half,half') {
  fail(`Written spelling is ${segments.map((segment) => segment.duration.base).join(',')}.`)
}
const writtenTicks = segments.map((segment) => segment.durationTicks)
if (writtenTicks.join(',') !== '96,768,768') fail(`Written ticks are ${writtenTicks.join(',')}.`)
if (writtenTicks.reduce((sum, ticks) => sum + ticks, 0) !== 1632) fail('The written durations do not total 1632 ticks.')
if (segments[0]?.startTick !== 5280 || segments[1]?.startTick !== 5376 || segments[2]?.startTick !== 6144) {
  fail('The written onsets are not 5280, 5376, and 6144.')
}
if (segments[2]?.endTick !== 6912) fail('The last written note does not end at tick 6912.')
if (segments.some((segment) => segment.soundingStartTick !== 5280 || segment.soundingEndTick !== 6912)) {
  fail('A written note lost the original sounding interval.')
}

const mismatched = spellSustainedNote(sounded, { ...reading, written: ['half', 'half'] }, QUARTER)
if (mismatched !== undefined) fail('A spelling that does not add up to the MIDI duration was accepted.')
const otherPitch = spellSustainedNote(sounded, { ...reading, midi: 60 }, QUARTER)
if (otherPitch !== undefined) fail('A reading for a different pitch was applied to the D4.')

const stored = sustainedReadingsFor({
  id: SONG_B_ID,
  musicalInterpretation: {
    sustainedNotes: [{ ...reading, written: ['quarter', 'quarter', 'quarter', 'quarter', 'eighth'] }],
  },
})
if (stored.length !== 1 || stored[0]?.written.length !== 5) {
  fail('A stored spelling should replace the project spelling for the same MIDI event.')
}
if (sustainedReadingsFor({ id: 'chopin-prelude-op-28-no-7', musicalInterpretation: {} }).length !== 0) {
  fail('Song A should not receive the Song B reading.')
}

const staves = assignPianoStaffs(midi.notes)
if (!staves.ready) fail(staves.message)
const plan = writtenMeasures(
  {
    timeSignature: { numerator: 3, denominator: 4 },
    pickup: { present: true, duration: 'quarter' },
    ticksPerWrittenQuarter: QUARTER,
  },
  17,
)
if (!plan.ready) fail(plan.message)

function contentFor(measure: WrittenMeasure, useReading: boolean): MeasureContent {
  return buildMeasureContent({
    notes: midi.notes,
    span: measure.span,
    ticksPerWrittenQuarter: QUARTER,
    staffByTrack: staves.staffByTrack,
    measureQuarters: fractionFromQuarters(measure.quarters),
    sustainedNotes: useReading ? readings : [],
  })
}

function unresolvedKeys(content: MeasureContent): string[] {
  return content.unresolved.map((note) => `${note.track}:${note.midi}:${note.startTick}:${note.durationTicks}`)
}

function writtenD4(content: MeasureContent): { start: number; ticks: number; base: string }[] {
  return content.columns.flatMap((column) =>
    column.events.flatMap((event) =>
      event.pitches
        .filter((pitch) => pitch.midi === 62 && pitch.sounding?.startTick === 5280)
        .map((pitch) => ({ start: pitch.startTick, ticks: pitch.durationTicks, base: event.duration.base })),
    ),
  )
}

const bar5 = plan.measures[5]
const bar6 = plan.measures[6]
const bar11 = plan.measures[11]
const bar15 = plan.measures[15]
if (bar5 === undefined || bar6 === undefined || bar11 === undefined || bar15 === undefined) fail('Measures 5, 6, 11, or 15 are missing.')
if (bar5.span.startTick !== 4992 || bar5.span.endTick !== 6144) fail('Bar 5 is not ticks 4992–6144.')
if (bar6.span.startTick !== 6144 || bar6.span.endTick !== 7296) fail('Bar 6 is not ticks 6144–7296.')

const plain5 = contentFor(bar5, false)
const plain6 = contentFor(bar6, false)
const tied5 = contentFor(bar5, true)
const tied6 = contentFor(bar6, true)

sameList(
  unresolvedKeys(plain5).filter((key) => key !== '2:62:5280:1632'),
  unresolvedKeys(tied5),
  'Bar 5 unresolved notes besides the D4',
)
if (unresolvedKeys(plain5).includes('2:62:5280:1632') === false) fail('Bar 5 should be unresolved before the reading.')
if (unresolvedKeys(tied5).some((key) => key.includes(':62:'))) fail('Bar 5 still reports the D4 as unresolved.')
if (pitchCount(tied5) !== pitchCount(plain5) + 2) {
  fail(`Bar 5 should gain two written D4s, ${pitchCount(plain5)} became ${pitchCount(tied5)}.`)
}
const bar5Notes = writtenD4(tied5)
if (bar5Notes.map((note) => `${note.start}:${note.ticks}:${note.base}`).join(',') !== '5280:96:sixteenth,5376:768:half') {
  fail(`Bar 5 written D4s are ${JSON.stringify(bar5Notes)}.`)
}
sameList(
  tied5.ties.map((tie) => tie.role),
  ['complete', 'outgoing'],
  'Bar 5 tie roles',
)

sameList(unresolvedKeys(plain6), unresolvedKeys(tied6), 'Bar 6 unresolved notes')
if (pitchCount(tied6) !== pitchCount(plain6) + 1) {
  fail(`Bar 6 should gain one written D4, ${pitchCount(plain6)} became ${pitchCount(tied6)}.`)
}
const bar6Notes = writtenD4(tied6)
if (bar6Notes.map((note) => `${note.start}:${note.ticks}:${note.base}`).join(',') !== '6144:768:half') {
  fail(`Bar 6 written D4s are ${JSON.stringify(bar6Notes)}.`)
}
sameList(
  tied6.ties.map((tie) => tie.role),
  ['incoming'],
  'Bar 6 tie roles',
)
if (tied5.ties.some((tie) => tie.role === 'continuation') || tied6.ties.some((tie) => tie.role === 'continuation')) {
  fail('Bars 5 and 6 should not need a continuation tie.')
}
const tieIds = [...tied5.ties, ...tied6.ties].map((tie) => tie.id)
if (new Set(tieIds).size !== 2 || tieIds.some((id) => !id.startsWith('tie:2:62:5280:'))) {
  fail(`Tie ids are ${tieIds.join(', ')}.`)
}

for (const index of [11, 15]) {
  const measure = plan.measures[index]
  if (measure === undefined) fail(`Bar ${index} is missing.`)
  const plain = contentFor(measure, false)
  const tied = contentFor(measure, true)
  sameList(unresolvedKeys(plain), unresolvedKeys(tied), `Bar ${index} unresolved notes`)
  if (pitchCount(plain) !== pitchCount(tied)) fail(`Bar ${index} pitch count changed.`)
  if (tied.ties.length !== 0) fail(`Bar ${index} gained a tie.`)
}

const bar11Keys = unresolvedKeys(contentFor(bar11, true))
sameList(bar11Keys.filter((key) => key.endsWith(':864')), ['2:73:12192:864', '2:76:12192:864'], 'Bar 11 crossing notes')
const bar15Keys = unresolvedKeys(contentFor(bar15, true))
sameList(bar15Keys.filter((key) => key.startsWith('2:69:')), ['2:69:16800:52', '2:69:16852:44'], 'Bar 15 short A4s')

let recognizedWhole = false
for (const measure of plan.measures) {
  const content = contentFor(measure, true)
  for (const column of content.columns) {
    for (const event of column.events) {
      if (event.pitches.some((pitch) => pitch.midi === 69 && pitch.startTick === 16896 && pitch.durationTicks === 1536)) {
        recognizedWhole = event.duration.base === 'whole'
      }
    }
  }
}
if (!recognizedWhole) fail('The A4 at tick 16896 should stay a written whole note.')

if (JSON.stringify(midi.notes) !== before) fail('Interpreting the D4 changed the MIDI notes.')
if (midi.notes.length !== 168) fail('A MIDI note was added or removed.')

const chain = segmentsAt([0, 500, 1000], 500)
sameList(planTies(chain, { startTick: 0, endTick: 500 }).map((tie) => tie.role), ['outgoing'], 'First measure of a three-measure tie')
sameList(
  planTies(chain, { startTick: 500, endTick: 1000 }).map((tie) => tie.role),
  ['incoming', 'outgoing'],
  'Middle measure of a three-measure tie',
)
sameList(planTies(chain, { startTick: 1000, endTick: 1500 }).map((tie) => tie.role), ['incoming'], 'Last measure of a three-measure tie')
sameList(
  planTies(segmentsAt([0, 2000], 100), { startTick: 500, endTick: 1000 }).map((tie) => tie.role),
  ['continuation'],
  'A measure crossed by a tie with no written note',
)
if (planTies(segmentsAt([0, 100], 100), { startTick: 500, endTick: 1000 }).length !== 0) {
  fail('A tie that ended before the measure was still drawn.')
}

const step = pitchStaffStep(62, TREBLE_BOTTOM_DIATONIC)
if (step !== -1) fail(`D4 should be one step below the treble staff, got ${step}.`)
const side = tieSideForStep(step)
if (side !== 1) fail('The D4 tie should bow downward, away from an upward stem.')
if (tieSideForStep(4) !== -1) fail('A note on the middle line should bow upward.')
const attachment = tieAttachmentY(noteheadY(78, step), side, 5.5)

const staffLeft = 16
const wideRight = 420
const narrowRight = 260
const outgoing = tieEndpoints({ role: 'outgoing', staffLeft, staffRight: wideRight, noteRadiusX: 8, fromX: 140 })
const incoming = tieEndpoints({ role: 'incoming', staffLeft, staffRight: narrowRight, noteRadiusX: 8, toX: 90 })
const through = tieEndpoints({ role: 'continuation', staffLeft, staffRight: wideRight, noteRadiusX: 8 })
const inside = tieEndpoints({ role: 'complete', staffLeft, staffRight: wideRight, noteRadiusX: 8, fromX: 100, toX: 160 })
if (outgoing === undefined || incoming === undefined || through === undefined || inside === undefined) {
  fail('A tie endpoint could not be calculated.')
}
if (outgoing.endX !== wideRight - TIE_EDGE_INSET) fail('The outgoing tie does not end at this measure’s right edge.')
if (incoming.startX !== staffLeft + TIE_EDGE_INSET) fail('The incoming tie does not start at this measure’s left edge.')
if (through.startX !== staffLeft + TIE_EDGE_INSET || through.endX !== wideRight - TIE_EDGE_INSET) {
  fail('A continuation tie does not run from this measure’s left edge to its right edge.')
}
const moved = tieEndpoints({ role: 'outgoing', staffLeft, staffRight: narrowRight, noteRadiusX: 8, fromX: 140 })
if (moved === undefined || moved.endX !== narrowRight - TIE_EDGE_INSET || moved.startX !== outgoing.startX) {
  fail('Moving a measure did not keep the outgoing tie attached to that measure’s own right edge.')
}

const outCurve = tieCurve({ startX: outgoing.startX, endX: outgoing.endX, startY: attachment, endY: attachment, side })
const inCurve = tieCurve({ startX: incoming.startX, endX: incoming.endX, startY: attachment, endY: attachment, side })
const throughCurve = tieCurve({ startX: through.startX, endX: through.endX, startY: attachment, endY: attachment, side })
for (const curve of [outCurve, inCurve, throughCurve]) {
  if (curve.thickness !== TIE_THICKNESS || curve.bow !== TIE_BOW || curve.side !== side) {
    fail('Split tie pieces do not share thickness, bow, and direction.')
  }
  if (curve.startY !== attachment || curve.endY !== attachment) fail('Split tie endpoints are not at the same staff height.')
  if (curve.outerY !== attachment + TIE_BOW || curve.innerY !== attachment + (TIE_BOW - TIE_THICKNESS)) {
    fail('The tie curve is not bowed downward by the shared amount.')
  }
  const extent = tieExtentY(curve)
  if (extent.min !== attachment || extent.max !== curve.outerY) fail('The tie extent does not cover the bow.')
  if (curve.startX < staffLeft || curve.endX > Math.max(wideRight, narrowRight)) fail('A tie leaves its staff.')
  const numbers = tiePath(curve).match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
  const xs = [numbers[0], numbers[2], numbers[4], numbers[6], numbers[8]]
  if (xs.some((x) => x === undefined || x < curve.startX || x > curve.endX)) {
    fail(`A tie path leaves its own endpoints: ${tiePath(curve)}`)
  }
}
if (inside.startX <= 100 || inside.endX >= 160) fail('A complete tie should stop short of both noteheads.')

checkSongA()
console.log('Split-tie checks passed.')
console.log('Song B D4 5280–6912 is a sixteenth tied to a half tied to a half.')

function segmentsAt(starts: readonly number[], duration: number): WrittenSegment[] {
  return starts.map((startTick, index) => ({
    index,
    midi: 62,
    track: 2,
    soundingStartTick: starts[0] ?? 0,
    soundingEndTick: (starts[starts.length - 1] ?? 0) + duration,
    soundingDurationTicks: duration * starts.length,
    startTick,
    endTick: startTick + duration,
    durationTicks: duration,
    duration: { base: 'quarter', dots: 0, quarters: { numerator: 1, denominator: 1 } },
  }))
}

function checkSongA(): void {
  const songA = parseMidi(new Uint8Array(readFileSync('midi-files/chopin-prelude-op-28-no-7-in-a-major.mid')))
  if (songA.notes.length !== 176) fail(`Song A should still have 176 MIDI notes, found ${songA.notes.length}.`)
  const hands = assignPianoStaffs(songA.notes)
  if (!hands.ready) fail(hands.message)
  const opening = openingMeasures({
    timeSignature: { numerator: 3, denominator: 4 },
    pickup: { present: true, duration: 'quarter' },
    ticksPerWrittenQuarter: 666.67,
  })
  if (!opening.ready) fail(opening.message)
  const measures = writtenMeasures(
    {
      timeSignature: { numerator: 3, denominator: 4 },
      pickup: { present: true, duration: 'quarter' },
      ticksPerWrittenQuarter: 666.67,
    },
    17,
  )
  if (!measures.ready) fail(measures.message)
  let recognized = 0
  let unresolved = 0
  for (const measure of measures.measures) {
    const content = buildMeasureContent({
      notes: songA.notes,
      span: measure.span,
      ticksPerWrittenQuarter: 666.67,
      staffByTrack: hands.staffByTrack,
      measureQuarters: fractionFromQuarters(measure.quarters),
      sustainedNotes: readings,
    })
    recognized += pitchCount(content)
    unresolved += content.unresolved.length
    if (content.ties.length !== 0) fail('Song A gained a tie from the Song B reading.')
  }
  if (recognized !== 155 || unresolved !== 21) {
    fail(`Song A should stay 155 written notes and 21 unresolved, got ${recognized} and ${unresolved}.`)
  }
  const first = measures.measures[0]
  const second = measures.measures[1]
  if (first === undefined || second === undefined) fail('Song A opening measures are missing.')
  const bar0 = buildMeasureContent({
    notes: songA.notes.filter((note: MidiNote) => note.startTick < opening.pickup.endTick),
    span: opening.pickup,
    ticksPerWrittenQuarter: 666.67,
    staffByTrack: hands.staffByTrack,
    measureQuarters: fractionFromQuarters(1),
  })
  if (pitchCount(bar0) !== 1) fail('Song A bar 0 changed.')
  void second
}
