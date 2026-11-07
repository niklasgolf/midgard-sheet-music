/**
 * Temporary checks for augmentation dots.
 * They do not read or write IndexedDB.
 */
import { readFileSync } from 'node:fs'
import { defaultStemDirection, placeChordNoteheads, STEM_UP } from '../src/engraving/chord-offset.ts'
import {
  BASS_BOTTOM_DIATONIC,
  noteheadY,
  pitchStaffStep,
  TREBLE_BOTTOM_DIATONIC,
} from '../src/engraving/geometry.ts'
import { NOTEHEAD_EDGE_GAP, spaceColumns } from '../src/engraving/spacing.ts'
import {
  DOT_CENTER_GAP,
  DOT_RADIUS,
  DOT_STACK_GAP,
  extentWithDots,
  placeAugmentationDots,
} from '../src/engraving/symbols.ts'
import { fraction, fractionFromQuarters } from '../src/interpretation/duration.ts'
import { buildMeasureContent, pitchCount } from '../src/interpretation/measure-content.ts'
import { assignPianoStaffs } from '../src/interpretation/staff.ts'
import { parseMidi } from '../src/midi/parse-midi.ts'
import { notesBeginningInSpan, openingMeasures } from '../src/notation/written-measures.ts'

const RADIUS = 8
const WIDTH = RADIUS * 2

function close(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > 1e-6) throw new Error(`${label}: expected ${expected}, got ${actual}`)
}

function dotsFor(midis: readonly number[], staff: 'treble' | 'bass') {
  const bottom = staff === 'bass' ? BASS_BOTTOM_DIATONIC : TREBLE_BOTTOM_DIATONIC
  const steps = midis.map((midi) => pitchStaffStep(midi, bottom))
  const direction = defaultStemDirection(steps)
  const placed = placeChordNoteheads(steps, direction, WIDTH)
  const heads = placed.map((placement) => ({ x: placement.offsetX, staffStep: placement.staffStep }))
  return { steps, direction, placed, dots: placeAugmentationDots(heads, RADIUS) }
}

const line = dotsFor([64], 'treble')
if (line.steps[0] !== 0 || line.steps[0]! % 2 !== 0) throw new Error('E4 should sit on the bottom line.')
if (line.dots[0]?.staffStep !== 1) throw new Error('A line note should dot the space above.')
close(line.dots[0]!.x, RADIUS + DOT_CENTER_GAP, 'line-note dot x')

const space = dotsFor([65], 'treble')
if (space.steps[0] !== 1) throw new Error('F4 should sit in a space.')
if (space.dots[0]?.staffStep !== 1) throw new Error('A space note should keep its dot at the notehead height.')
close(noteheadY(78, space.dots[0]!.staffStep), noteheadY(78, space.steps[0]!), 'space-note dot y')

const ledger = dotsFor([40], 'bass')
if (ledger.steps[0]! >= 0 || ledger.steps[0]! % 2 !== 0) throw new Error('E2 should sit on a ledger line.')
if (ledger.dots[0]?.staffStep !== ledger.steps[0]! + 1) throw new Error('A ledger-line note should dot the space above.')

const chord = dotsFor([62, 67, 71], 'treble')
if (chord.dots.length !== 3) throw new Error('Each note of a dotted chord needs its own dot.')
const chordSteps = new Set(chord.dots.map((dot) => dot.staffStep))
if (chordSteps.size !== 3) throw new Error('The three chord dots should not share one height.')

const seconds = dotsFor([60, 62], 'treble')
if (seconds.direction !== STEM_UP || !seconds.placed[1]?.displaced) {
  throw new Error('C4 D4 should still shift the upper note before the dots are placed.')
}
const rightEdge = Math.max(...seconds.placed.map((placement) => placement.offsetX + RADIUS))
if (seconds.dots.some((dot) => dot.x < rightEdge + DOT_CENTER_GAP - 1e-6)) {
  throw new Error('A dot overlaps the displaced notehead.')
}
if (seconds.dots[0]?.staffStep === seconds.dots[1]?.staffStep) {
  throw new Error('C4 and D4 should not put their dots on the same staff step.')
}

const unison = dotsFor([60, 60], 'treble')
if (unison.dots[0]?.staffStep !== unison.dots[1]?.staffStep) {
  throw new Error('Unison dots should share a height and separate sideways.')
}
const separation = Math.abs(unison.dots[0]!.x - unison.dots[1]!.x)
if (separation < DOT_STACK_GAP - 1e-6 || separation < DOT_RADIUS * 2) {
  throw new Error('Unison dots still overlap.')
}

const bassLine = dotsFor([43], 'bass')
const bassSpace = dotsFor([45], 'bass')
if (bassLine.dots[0]?.staffStep !== bassLine.steps[0]! + 1) throw new Error('Bass G2 should dot the space above.')
if (bassSpace.dots[0]?.staffStep !== bassSpace.steps[0]) throw new Error('Bass A2 should dot its own space.')

const dotted = dotsFor([73], 'treble')
const extent = extentWithDots([0], WIDTH, dotted.dots.map((dot) => dot.x))
const plain = extentWithDots([0], WIDTH, [])
if (extent.right <= plain.right) throw new Error('A dot did not widen the column.')
const spacing = spaceColumns({
  onsets: [fraction(0, 1), fraction(1, 4)],
  measureQuarters: fraction(1, 1),
  originX: 40,
  noteheadWidth: WIDTH,
  extents: new Map([
    ['0/1', extent],
    ['1/4', plain],
  ]),
})
const first = spacing.columns[0]
const second = spacing.columns[1]
if (first === undefined || second === undefined) throw new Error('The close columns were not spaced.')
const dotRight = first.x + extent.right
const nextLeft = second.x - plain.left
if (nextLeft - dotRight < NOTEHEAD_EDGE_GAP) {
  throw new Error(`The following note collides with the dot: ${dotRight} then ${nextLeft}.`)
}

checkChopin()
console.log('Augmentation-dot checks passed.')
console.log(`A line-note dot sits ${DOT_CENTER_GAP}px beyond the notehead, with radius ${DOT_RADIUS}.`)

function checkChopin(): void {
  const bytes = new Uint8Array(readFileSync('midi-files/chopin-prelude-op-28-no-7-in-a-major.mid'))
  const midi = parseMidi(bytes)
  const staves = assignPianoStaffs(midi.notes)
  if (!staves.ready) throw new Error(staves.message)
  const opening = openingMeasures({
    timeSignature: { numerator: 3, denominator: 4 },
    pickup: { present: true, duration: 'quarter' },
    ticksPerWrittenQuarter: 666.67,
  })
  if (!opening.ready) throw new Error(opening.message)

  const bar0 = buildMeasureContent({
    notes: notesBeginningInSpan(midi.notes, opening.pickup),
    span: opening.pickup,
    ticksPerWrittenQuarter: 666.67,
    staffByTrack: staves.staffByTrack,
    measureQuarters: fractionFromQuarters(1),
  })
  const bar1 = buildMeasureContent({
    notes: notesBeginningInSpan(midi.notes, opening.firstFull),
    span: opening.firstFull,
    ticksPerWrittenQuarter: 666.67,
    staffByTrack: staves.staffByTrack,
    measureQuarters: fractionFromQuarters(3),
  })
  if (!bar0.ready || !bar1.ready) throw new Error('The Chopin opening could not be read.')
  if (pitchCount(bar0) !== 1 || pitchCount(bar1) !== 13) throw new Error('The Chopin note counts changed.')

  const dotted = bar1.columns.flatMap((column) => column.events).filter((event) => event.duration.dots === 1)
  if (dotted.length !== 1 || dotted[0]?.pitches[0]?.midi !== 73 || dotted[0]?.duration.base !== 'eighth') {
    throw new Error('Bar 1 should contain one dotted eighth, C♯5.')
  }
  const step = pitchStaffStep(73, TREBLE_BOTTOM_DIATONIC)
  const dot = placeAugmentationDots([{ x: 0, staffStep: step }], RADIUS)[0]
  if (dot?.staffStep !== step) throw new Error('C♯5 is in a space, so its dot should stay at that height.')
  if (bar0.columns.some((column) => column.events.some((event) => event.duration.dots !== 0))) {
    throw new Error('Bar 0 should have no augmentation dot.')
  }
}
