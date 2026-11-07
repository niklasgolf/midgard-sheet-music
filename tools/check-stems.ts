/**
 * Temporary checks for stem direction, length, and attachment.
 * They do not read or write IndexedDB.
 */
import { readFileSync } from 'node:fs'
import {
  defaultStemDirection,
  placeChordNoteheads,
  STEM_DOWN,
  STEM_UP,
} from '../src/engraving/chord-offset.ts'
import {
  BASS_BOTTOM_DIATONIC,
  grandStaffFrame,
  noteheadY,
  pitchStaffStep,
  TREBLE_BOTTOM_DIATONIC,
} from '../src/engraving/geometry.ts'
import {
  durationHasStem,
  STEM_HEAD_INSET,
  STEM_LENGTH,
  STEM_THICKNESS,
  stemGeometry,
  type StemHead,
} from '../src/engraving/symbols.ts'
import { fractionFromQuarters } from '../src/interpretation/duration.ts'
import { buildMeasureContent } from '../src/interpretation/measure-content.ts'
import { assignPianoStaffs } from '../src/interpretation/staff.ts'
import { parseMidi } from '../src/midi/parse-midi.ts'
import { notesBeginningInSpan, openingMeasures } from '../src/notation/written-measures.ts'

const WIDTH = 16
const RADIUS = WIDTH / 2
const frame = grandStaffFrame()

function close(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > 1e-6) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

function headsFor(midis: readonly number[], staff: 'treble' | 'bass', anchorX = 40): {
  direction: ReturnType<typeof defaultStemDirection>
  heads: StemHead[]
} {
  const bottom = staff === 'bass' ? BASS_BOTTOM_DIATONIC : TREBLE_BOTTOM_DIATONIC
  const bottomY = staff === 'bass' ? frame.bassBottomY : frame.trebleBottomY
  const steps = midis.map((midi) => pitchStaffStep(midi, bottom))
  const direction = defaultStemDirection(steps)
  const placed = placeChordNoteheads(steps, direction, WIDTH)
  const heads = placed.map((placement) => ({
    x: anchorX + placement.offsetX,
    y: noteheadY(bottomY, placement.staffStep),
    staffStep: placement.staffStep,
    displaced: placement.displaced,
  }))
  return { direction, heads }
}

function stemFor(midis: readonly number[], staff: 'treble' | 'bass', anchorX = 40) {
  const { direction, heads } = headsFor(midis, staff, anchorX)
  const stem = stemGeometry({ heads, direction, noteheadRadiusX: RADIUS })
  if (stem === undefined) throw new Error('A note with pitches did not produce a stem.')
  if (stem.direction !== direction) throw new Error('Stem direction disagreed with notehead displacement.')
  return { direction, heads, stem }
}

if (durationHasStem('whole')) throw new Error('A whole note must not have a stem.')
if (!durationHasStem('half')) throw new Error('A half note must have a stem.')
if (!durationHasStem('quarter') || !durationHasStem('eighth') || !durationHasStem('sixteenth')) {
  throw new Error('Quarter, eighth, and sixteenth notes must have stems.')
}

const below = stemFor([64], 'treble')
if (below.direction !== STEM_UP) throw new Error('E4, below the middle line, should stem up.')
close(below.stem.x, 40 + RADIUS - STEM_THICKNESS / 2, 'up-stem x')
close(below.stem.baseY, below.heads[0]!.y - STEM_HEAD_INSET, 'up-stem base')
close(below.stem.tipY, below.heads[0]!.y - STEM_LENGTH, 'up-stem tip')

const middle = stemFor([71], 'treble')
if (middle.direction !== STEM_DOWN) throw new Error('B4, on the middle line, should stem down.')
close(middle.stem.x, 40 - RADIUS + STEM_THICKNESS / 2, 'middle-line stem x')

const above = stemFor([72], 'treble')
if (above.direction !== STEM_DOWN) throw new Error('C5, above the middle line, should stem down.')
close(above.stem.tipY, above.heads[0]!.y + STEM_LENGTH, 'down-stem tip')

const chord = stemFor([62, 67, 71], 'treble')
if (chord.direction !== STEM_UP) throw new Error('D4 G4 B4 should share an up-stem.')
if (chord.heads.length !== 3) throw new Error('The chord should keep three noteheads on one stem.')
const highest = Math.min(...chord.heads.map((head) => head.y))
const lowest = Math.max(...chord.heads.map((head) => head.y))
close(chord.stem.tipY, highest - STEM_LENGTH, 'chord tip')
close(chord.stem.baseY, lowest - STEM_HEAD_INSET, 'chord base')

const seconds = stemFor([60, 62], 'treble')
if (seconds.direction !== STEM_UP) throw new Error('C4 D4 should stem up.')
if (!seconds.heads[1]?.displaced || seconds.heads[0]?.displaced) {
  throw new Error('C4 D4 should displace only the upper note.')
}
close(seconds.stem.x, seconds.heads[0]!.x + RADIUS - STEM_THICKNESS / 2, 'second stem x')

const downChord = stemFor([71, 72], 'treble')
if (downChord.direction !== STEM_DOWN) throw new Error('B4 C5 should stem down.')
if (!downChord.heads[0]?.displaced) throw new Error('B4 should move left under a down-stem.')
close(downChord.stem.x, downChord.heads[1]!.x - RADIUS + STEM_THICKNESS / 2, 'down-chord stem x')

const half = stemFor([64], 'treble')
if (!durationHasStem('half') || half.stem.direction !== STEM_UP) {
  throw new Error('A half note below the middle line should keep an up-stem.')
}

const ledger = stemFor([40], 'bass')
if (ledger.direction !== STEM_UP) throw new Error('Bass E2 should stem up.')
if (ledger.heads[0]!.staffStep >= 0) throw new Error('E2 should sit below the bass staff.')
close(ledger.stem.baseY, ledger.heads[0]!.y - STEM_HEAD_INSET, 'ledger stem base')
close(ledger.stem.tipY, ledger.heads[0]!.y - STEM_LENGTH, 'ledger stem tip')

const far = stemFor([57], 'treble')
const farExtra = (4 - far.heads[0]!.staffStep - 7) * 7
if (farExtra <= 0) throw new Error('A3 should be far enough below the middle line to lengthen the stem.')
close(far.stem.tipY, far.heads[0]!.y - STEM_LENGTH - farExtra, 'lengthened ledger stem')

checkChopin()
console.log('Stem checks passed.')
console.log(
  `E4 stem ${below.stem.direction === STEM_UP ? 'up' : 'down'} from y ${below.stem.baseY} to y ${below.stem.tipY}.`,
)

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

  const expected = [
    { bar: 'Bar 0', span: opening.pickup, quarters: 1, events: [{ staff: 'treble', midis: [64], direction: STEM_UP, base: 'quarter' }] },
    {
      bar: 'Bar 1',
      span: opening.firstFull,
      quarters: 3,
      events: [
        { staff: 'treble', midis: [73], direction: STEM_DOWN, base: 'eighth' },
        { staff: 'bass', midis: [40], direction: STEM_UP, base: 'quarter' },
        { staff: 'treble', midis: [74], direction: STEM_DOWN, base: 'sixteenth' },
        { staff: 'treble', midis: [62, 68, 71], direction: STEM_UP, base: 'quarter' },
        { staff: 'bass', midis: [52, 64], direction: STEM_DOWN, base: 'quarter' },
        { staff: 'treble', midis: [62, 68, 71], direction: STEM_UP, base: 'quarter' },
        { staff: 'bass', midis: [52, 64], direction: STEM_DOWN, base: 'quarter' },
      ],
    },
  ] as const

  for (const measure of expected) {
    const content = buildMeasureContent({
      notes: notesBeginningInSpan(midi.notes, measure.span),
      span: measure.span,
      ticksPerWrittenQuarter: 666.67,
      staffByTrack: staves.staffByTrack,
      measureQuarters: fractionFromQuarters(measure.quarters),
    })
    if (!content.ready) throw new Error(content.message)
    const actual = content.columns.flatMap((column) => column.events)
    if (actual.length !== measure.events.length) {
      throw new Error(`${measure.bar} has ${actual.length} chords, expected ${measure.events.length}.`)
    }
    measure.events.forEach((want, index) => {
      const event = actual[index]
      if (event === undefined) throw new Error(`${measure.bar} is missing a chord.`)
      const midis = event.pitches.map((pitch) => pitch.midi)
      if (event.staff !== want.staff || event.duration.base !== want.base || midis.join() !== want.midis.join()) {
        throw new Error(`${measure.bar} chord ${index} is ${event.staff} ${midis.join()} ${event.duration.base}.`)
      }
      const bottom = event.staff === 'bass' ? BASS_BOTTOM_DIATONIC : TREBLE_BOTTOM_DIATONIC
      const steps = midis.map((midi) => pitchStaffStep(midi, bottom))
      const direction = defaultStemDirection(steps)
      if (direction !== want.direction) {
        throw new Error(`${measure.bar} ${want.staff} ${midis.join()} stemmed the wrong way.`)
      }
      if (!durationHasStem(event.duration.base)) throw new Error(`${measure.bar} dropped a stem.`)
      if (event.duration.base === 'eighth' && event.duration.dots !== 1) {
        throw new Error('C♯5 should remain a dotted eighth, and the dot does not remove the stem.')
      }
    })
  }
}
