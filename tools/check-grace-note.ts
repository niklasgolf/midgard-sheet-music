/**
 * Checks the Bar 15 written-duration override and grace note.
 * This does not read or write IndexedDB, and it does not draw SVG.
 */
import { readFileSync } from 'node:fs'
import { defaultStemDirection, noteheadExtent } from '../src/engraving/chord-offset.ts'
import { pitchStaffStep, TREBLE_BOTTOM_DIATONIC } from '../src/engraving/geometry.ts'
import {
  graceCenterX,
  graceFlagCount,
  graceFlagPath,
  graceInkLeft,
  graceRadii,
  graceSlur,
  graceStem,
  GRACE_SCALE,
} from '../src/engraving/grace-note.ts'
import { columnX, NOTEHEAD_EDGE_GAP, PIXELS_PER_QUARTER, spaceColumns } from '../src/engraving/spacing.ts'
import { TIE_BOW, TIE_THICKNESS, tieCurve } from '../src/engraving/tie.ts'
import { fractionFromQuarters, fractionKey } from '../src/interpretation/duration.ts'
import { buildMeasureContent, pitchCount, type MeasureContent } from '../src/interpretation/measure-content.ts'
import { assignPianoStaffs } from '../src/interpretation/staff.ts'
import { parseMidi } from '../src/midi/parse-midi.ts'
import { writtenMeasures } from '../src/notation/written-measures.ts'
import {
  SONG_B_BAR15_A4_GRACE,
  SONG_B_BAR15_A4_SIXTEENTH,
  SONG_B_READINGS,
} from '../src/song/install-sustained-reading.ts'

const QUARTER = 384
const NOTE_RX = 8
const NOTE_RY = 5.5
const NOTEHEAD_WIDTH = NOTE_RX * 2
const NOTE_AREA_LEFT = 40

function fail(message: string): never {
  throw new Error(message)
}

const bytes = new Uint8Array(readFileSync('midi-files/chopin-prelude-op-28-no-7-in-a-major-b.mid'))
const midi = parseMidi(bytes)
const before = JSON.stringify(midi.notes)
if (midi.notes.length !== 168) fail(`Song B should still have 168 MIDI notes, found ${midi.notes.length}.`)

const events = midi.notes.filter((note) => note.track === 2 && note.midi === 69 && note.startTick >= 16800 && note.startTick <= 16896)
const described = events.map((note) => `${note.startTick}:${note.endTick}:${note.durationTicks}`).join(', ')
if (described !== '16800:16852:52, 16852:16896:44, 16896:18432:1536') {
  fail(`The three A4 events are ${described}.`)
}

const hands = assignPianoStaffs(midi.notes)
if (!hands.ready) fail(hands.message)
const measures = writtenMeasures(
  {
    timeSignature: { numerator: 3, denominator: 4 },
    pickup: { present: true, duration: 'quarter' },
    ticksPerWrittenQuarter: QUARTER,
  },
  17,
)
if (!measures.ready) fail(measures.message)
const bar15Measure = measures.measures[15]
const bar5Measure = measures.measures[5]
const bar11Measure = measures.measures[11]
if (bar15Measure === undefined || bar5Measure === undefined || bar11Measure === undefined) fail('A compared measure is missing.')
if (bar15Measure.span.startTick !== 16512 || bar15Measure.span.endTick !== 17664) {
  fail(`Bar 15 spans ${bar15Measure.span.startTick}–${bar15Measure.span.endTick}.`)
}

const readings = {
  sustainedNotes: SONG_B_READINGS,
  writtenDurations: [SONG_B_BAR15_A4_SIXTEENTH],
  graceNotes: [SONG_B_BAR15_A4_GRACE],
}

function contentFor(span: { startTick: number; endTick: number }, quarters: number, extra = readings): MeasureContent {
  return buildMeasureContent({
    notes: midi.notes,
    span,
    ticksPerWrittenQuarter: QUARTER,
    staffByTrack: hands.staffByTrack,
    measureQuarters: fractionFromQuarters(quarters),
    ...extra,
  })
}

const plain = contentFor(bar15Measure.span, bar15Measure.quarters, { sustainedNotes: SONG_B_READINGS, writtenDurations: [], graceNotes: [] })
const bar15 = contentFor(bar15Measure.span, bar15Measure.quarters)
if (pitchCount(bar15) !== pitchCount(plain) + 1) {
  fail(`The written sixteenth should add one counted note, got ${pitchCount(bar15)} against ${pitchCount(plain)}.`)
}
if (bar15.graceNotes.length !== 1) fail(`Bar 15 should have one grace note, found ${bar15.graceNotes.length}.`)
const unresolved = bar15.unresolved.map((note) => `${note.track}:${note.midi}:${note.startTick}:${note.durationTicks}`)
if (unresolved.includes('2:69:16800:52') || unresolved.includes('2:69:16852:44')) {
  fail(`Bar 15 still leaves an A4 unresolved: ${unresolved.join(', ')}.`)
}

const sixteenth = bar15.columns.flatMap((column) =>
  column.events.flatMap((event) =>
    event.pitches
      .filter((pitch) => pitch.midi === 69 && pitch.startTick === 16800)
      .map((pitch) => ({ pitch, base: event.duration.base, onset: column.onset })),
  ),
)
if (sixteenth.length !== 1) fail(`Expected one written A4 at tick 16800, found ${sixteenth.length}.`)
const writtenA4 = sixteenth[0]
if (writtenA4 === undefined) fail('The written A4 is missing.')
if (writtenA4.base !== 'sixteenth' || writtenA4.pitch.durationTicks !== 96 || writtenA4.pitch.endTick !== 16896) {
  fail(`The written A4 is ${writtenA4.base} lasting ${writtenA4.pitch.durationTicks} until ${writtenA4.pitch.endTick}.`)
}
if (writtenA4.pitch.sounding?.durationTicks !== 52 || writtenA4.pitch.sounding.endTick !== 16852) {
  fail('The written A4 lost its 52-tick sounding duration.')
}
const chord = bar15.columns.find((column) => column.onset === writtenA4.onset)
const chordPitches = chord?.events.flatMap((event) => event.pitches.map((pitch) => pitch.midi)).sort((left, right) => left - right)
if (chordPitches?.join(',') !== '61,69') fail(`The sixteenth chord is ${chordPitches?.join(',')}.`)
if (bar15.ties.some((tie) => tie.soundingStartTick === 16800 || tie.soundingStartTick === 16852)) {
  fail('The written sixteenth or the grace note created a tie.')
}
if (bar15.columns.some((column) => column.events.some((event) => event.pitches.some((pitch) => pitch.startTick === 16852)))) {
  fail('The grace note created a rhythmic column.')
}

const grace = bar15.graceNotes[0]
if (grace === undefined) fail('The grace note is missing.')
if (grace.principal.track !== 2 || grace.principal.midi !== 69 || grace.principal.startTick !== 16896) {
  fail('The grace note is not attached to the A4 at tick 16896.')
}
if (grace.written !== 'eighth' || grace.slash !== false || grace.slur !== true) {
  fail('The grace note is not an unslashed eighth with a slur.')
}
if (grace.durationTicks !== 44 || grace.endTick !== 16896) fail('The grace note lost its 44-tick MIDI duration.')

const principal = bar15.columns.flatMap((column) =>
  column.events.flatMap((event) =>
    event.pitches.filter((pitch) => pitch.midi === 69 && pitch.startTick === 16896),
  ),
)
if (principal.length !== 1 || principal[0]?.durationTicks !== 1536) {
  fail('The principal A4 is no longer the 1536-tick catalog note.')
}

const step = pitchStaffStep(69, TREBLE_BOTTOM_DIATONIC)
if (defaultStemDirection([step]) !== 1) fail('The A4 grace note should stem upward.')
const stem = graceStem({ headX: 100, headY: 80, staffStep: step, noteRadiusX: NOTE_RX, direction: 1 })
if (stem === undefined || !(stem.tipY < stem.baseY)) fail('The grace stem does not point upward.')
if (!(stem.thickness > 0) || stem.thickness >= 1.5) fail(`The grace stem is not scaled, thickness ${stem.thickness}.`)
if (graceFlagCount(grace.written) !== 1) fail('The eighth grace note should have one flag.')
if (graceFlagCount('sixteenth') !== 2 || graceFlagCount('quarter') !== 0) fail('Grace flag counts changed.')
const flag = graceFlagPath({ tipX: stem.x, tipY: stem.tipY, direction: 1, index: 0 })
if (!flag.d.includes('C') || flag.maxX <= stem.x) fail('The eighth flag was not drawn to the right of the stem.')
const radii = graceRadii(NOTE_RX, NOTE_RY)
if (Math.abs(radii.x / NOTE_RX - GRACE_SCALE) > 0.001) fail('The grace notehead is not scaled to 0.66.')

const extents = new Map<string, { left: number; right: number }>()
for (const column of bar15.columns) {
  const offsets = column.events.flatMap((event) => event.pitches.map(() => 0))
  const extent = noteheadExtent(offsets.length === 0 ? [0] : offsets, NOTEHEAD_WIDTH)
  extents.set(fractionKey(column.onset), extent)
}
const principalColumn = bar15.columns.find((column) =>
  column.events.some((event) => event.pitches.some((pitch) => pitch.startTick === 16896 && pitch.midi === 69)),
)
if (principalColumn === undefined || chord === undefined) fail('The spacing columns are missing.')
const principalKey = fractionKey(principalColumn.onset)
const plainExtent = extents.get(principalKey)
const lead = graceInkLeft(1, NOTE_RX)
if (plainExtent === undefined || lead <= plainExtent.left) fail('The grace note does not reserve space before the principal chord.')
extents.set(principalKey, { left: lead, right: plainExtent.right })

const without = spaceColumns({
  onsets: bar15.columns.map((column) => column.onset),
  measureQuarters: bar15.measureQuarters,
  originX: NOTE_AREA_LEFT,
  noteheadWidth: NOTEHEAD_WIDTH,
})
const withGrace = spaceColumns({
  onsets: bar15.columns.map((column) => column.onset),
  measureQuarters: bar15.measureQuarters,
  originX: NOTE_AREA_LEFT,
  extents,
  noteheadWidth: NOTEHEAD_WIDTH,
})
const previousX = columnX(withGrace, chord.onset)
const principalX = columnX(withGrace, principalColumn.onset)
if (previousX !== columnX(without, chord.onset)) fail('Reserving grace-note space moved the preceding chord.')
if (principalX <= columnX(without, principalColumn.onset)) fail('The principal chord did not move to make room.')
const graceX = graceCenterX(principalX, 0, NOTE_RX)
const graceLeft = graceX - radii.x
const previousRight = previousX + NOTE_RX
const gap = graceLeft - previousRight
const expectedGap = NOTEHEAD_EDGE_GAP + 0.25 * PIXELS_PER_QUARTER
if (Math.abs(gap - expectedGap) > 0.01) fail(`The gap before the grace note is ${gap}, expected ${expectedGap}.`)
if (graceLeft <= previousRight) fail('The grace note collides with the preceding chord.')
const placedFlag = graceFlagPath({ tipX: graceX + (stem.x - 100), tipY: stem.tipY, direction: 1, index: 0 })
if (placedFlag.maxX >= principalX - NOTE_RX) fail('The grace flag reaches the principal notehead.')

const slur = graceSlur({
  graceX,
  graceY: 90,
  graceRadiusX: radii.x,
  graceRadiusY: radii.y,
  principalX,
  principalY: 90,
  principalRadiusX: NOTE_RX,
  principalRadiusY: NOTE_RY,
})
if (slur === undefined) fail('The short slur was not created.')
if (slur.bow !== TIE_BOW * GRACE_SCALE || slur.thickness !== TIE_THICKNESS * GRACE_SCALE) {
  fail('The short slur does not use the shared curve at grace scale.')
}
if (slur.endX >= principalX - NOTE_RX || slur.startX <= graceX) fail('The short slur runs through a notehead.')
const ordinary = tieCurve({ startX: 10, endX: 40, startY: 20, endY: 20, side: 1 })
if (ordinary.bow !== TIE_BOW || ordinary.thickness !== TIE_THICKNESS) fail('Existing ties no longer use the shared bow and thickness.')
if (graceX <= 0 || placedFlag.maxX >= withGrace.contentRight) fail('Grace-note ink leaves the measure content.')
if (JSON.stringify(midi.notes) !== before) fail('Reading the grace note changed the MIDI.')

function tieIds(content: MeasureContent): string {
  return content.ties.map((tie) => tie.id).sort().join(',')
}
const bar5 = contentFor(bar5Measure.span, bar5Measure.quarters)
const bar5Plain = contentFor(bar5Measure.span, bar5Measure.quarters, {
  sustainedNotes: SONG_B_READINGS,
  writtenDurations: [],
  graceNotes: [],
})
if (tieIds(bar5) !== tieIds(bar5Plain) || bar5.graceNotes.length !== 0) fail('Bar 5 changed when Bar 15 readings were present.')
const bar11 = contentFor(bar11Measure.span, bar11Measure.quarters)
const bar11Plain = contentFor(bar11Measure.span, bar11Measure.quarters, {
  sustainedNotes: SONG_B_READINGS,
  writtenDurations: [],
  graceNotes: [],
})
if (tieIds(bar11) !== tieIds(bar11Plain) || pitchCount(bar11) !== pitchCount(bar11Plain)) {
  fail('Bar 11 changed when Bar 15 readings were present.')
}

const songA = parseMidi(new Uint8Array(readFileSync('midi-files/chopin-prelude-op-28-no-7-in-a-major.mid')))
if (songA.notes.length !== 176) fail(`Song A should still have 176 MIDI notes, found ${songA.notes.length}.`)
const songAHands = assignPianoStaffs(songA.notes)
if (!songAHands.ready) fail(songAHands.message)
const songAMeasures = writtenMeasures(
  {
    timeSignature: { numerator: 3, denominator: 4 },
    pickup: { present: true, duration: 'quarter' },
    ticksPerWrittenQuarter: 666.67,
  },
  17,
)
if (!songAMeasures.ready) fail(songAMeasures.message)
let recognized = 0
let unresolvedCount = 0
for (const measure of songAMeasures.measures) {
  const content = buildMeasureContent({
    notes: songA.notes,
    span: measure.span,
    ticksPerWrittenQuarter: 666.67,
    staffByTrack: songAHands.staffByTrack,
    measureQuarters: fractionFromQuarters(measure.quarters),
    ...readings,
  })
  recognized += pitchCount(content)
  unresolvedCount += content.unresolved.length
  if (content.ties.length !== 0 || content.graceNotes.length !== 0) fail('Song A gained a Song B ornament or tie.')
}
if (recognized !== 155 || unresolvedCount !== 21) {
  fail(`Song A should stay 155 written notes and 21 unresolved, got ${recognized} and ${unresolvedCount}.`)
}

console.log('Grace-note checks passed.')
