/**
 * Temporary check for chord-notehead displacement.
 * It does not read or write IndexedDB, and it is not part of the page.
 */
import { writeFileSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import {
  defaultStemDirection,
  noteheadExtent,
  placeChordNoteheads,
  STEM_UP,
  type NoteheadPlacement,
} from '../src/engraving/chord-offset.ts'
import { BASS_BOTTOM_DIATONIC, pitchStaffStep, TREBLE_BOTTOM_DIATONIC } from '../src/engraving/geometry.ts'
import { NOTEHEAD_EDGE_GAP, spaceColumns } from '../src/engraving/spacing.ts'
import { fraction, fractionFromQuarters } from '../src/interpretation/duration.ts'
import { buildMeasureContent, pitchCount } from '../src/interpretation/measure-content.ts'
import { assignPianoStaffs } from '../src/interpretation/staff.ts'
import { parseMidi } from '../src/midi/parse-midi.ts'
import { notesBeginningInSpan, openingMeasures } from '../src/notation/written-measures.ts'

const WIDTH = 16

const treble = (midi: number) => pitchStaffStep(midi, TREBLE_BOTTOM_DIATONIC)
const bass = (midi: number) => pitchStaffStep(midi, BASS_BOTTOM_DIATONIC)

function offsets(steps: readonly number[], direction = defaultStemDirection(steps)): number[] {
  return placeChordNoteheads(steps, direction, WIDTH).map((placement) => placement.offsetX)
}

function assertEqual(actual: readonly number[], expected: readonly number[], label: string): void {
  const same = actual.length === expected.length && actual.every((value, index) => value === expected[index])
  if (!same) throw new Error(`${label}: expected ${expected.join(', ')}, got ${actual.join(', ')}`)
}

const c4 = treble(60)
const d4 = treble(62)
const e4 = treble(64)
const f4 = treble(65)
if (d4 - c4 !== 1) throw new Error('C4 and D4 are not one diatonic step apart.')
if (f4 - e4 !== 1) throw new Error('E4 and F4 are not one diatonic step apart.')
if (62 - 60 !== 2 || 65 - 64 !== 1) throw new Error('The semitone check no longer matches the MIDI numbers used here.')

assertEqual(offsets([c4, d4]), [0, WIDTH], 'C4 D4')
assertEqual(offsets([e4, f4]), [0, WIDTH], 'E4 F4')
assertEqual(offsets([c4, d4, e4]), [0, WIDTH, 0], 'C4 D4 E4')
assertEqual(offsets([c4, e4]), [0, 0], 'C4 E4')
assertEqual(offsets([bass(43), bass(45)]), [0, WIDTH], 'bass G2 A2')
assertEqual(offsets([bass(40), bass(41), bass(43)]), [0, WIDTH, 0], 'bass E2 F2 G2')

const lowSecond = offsets([treble(69), treble(71)])
const highSecond = offsets([treble(71), treble(72)])
if (lowSecond[0] !== 0 || lowSecond[1] !== WIDTH) {
  throw new Error(`A4 B4 should shift the upper note right, got ${lowSecond.join(', ')}`)
}
if (highSecond[0] !== -WIDTH || highSecond[1] !== 0) {
  throw new Error(`B4 C5 should shift the lower note left, got ${highSecond.join(', ')}`)
}

const spacing = spaceColumns({
  onsets: [fraction(0, 1), fraction(1, 4)],
  measureQuarters: fraction(1, 1),
  originX: 40,
  noteheadWidth: WIDTH,
  extents: new Map([
    ['0/1', noteheadExtent(lowSecond, WIDTH)],
    ['1/4', noteheadExtent(highSecond, WIDTH)],
  ]),
})
const first = spacing.columns[0]
const second = spacing.columns[1]
if (first === undefined || second === undefined) throw new Error('The collision fixture did not produce two columns.')
const firstRight = first.x + noteheadExtent(lowSecond, WIDTH).right
const secondLeft = second.x - noteheadExtent(highSecond, WIDTH).left
if (secondLeft - firstRight < NOTEHEAD_EDGE_GAP) {
  throw new Error(`Displaced columns still collide: right ${firstRight}, left ${secondLeft}.`)
}
const oldNextLeft = first.x + 44 - noteheadExtent(highSecond, WIDTH).left
if (oldNextLeft >= firstRight) {
  throw new Error('These two columns would not have collided under the old spacing, so the fixture is too far apart.')
}

const ignoredDirection = placeChordNoteheads([c4, d4], STEM_UP, WIDTH)
if (ignoredDirection.some((placement) => placement.staffStep !== c4 && placement.staffStep !== d4)) {
  throw new Error('Placement lost a staff step.')
}

checkChopinOpening()
writeIllustration()
console.log('Chord displacement checks passed.')
console.log(`Collision fixture columns at x ${first.x} and x ${second.x}.`)

function checkChopinOpening(): void {
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

  const cases = [
    ['Bar 0', opening.pickup, 1, 1],
    ['Bar 1', opening.firstFull, 3, 13],
  ] as const
  for (const [label, span, quarters, expectedNotes] of cases) {
    const content = buildMeasureContent({
      notes: notesBeginningInSpan(midi.notes, span),
      span,
      ticksPerWrittenQuarter: 666.67,
      staffByTrack: staves.staffByTrack,
      measureQuarters: fractionFromQuarters(quarters),
    })
    if (!content.ready) throw new Error(content.message)
    if (pitchCount(content) !== expectedNotes) {
      throw new Error(`${label} has ${pitchCount(content)} notes, expected ${expectedNotes}.`)
    }
    for (const column of content.columns) {
      for (const event of column.events) {
        const bottom = event.staff === 'bass' ? BASS_BOTTOM_DIATONIC : TREBLE_BOTTOM_DIATONIC
        const steps = event.pitches.map((pitch) => pitchStaffStep(pitch.midi, bottom))
        const placed = placeChordNoteheads(steps, defaultStemDirection(steps), WIDTH)
        if (placed.some((placement) => placement.offsetX !== 0)) {
          throw new Error(`${label} displaced a note that is not a second.`)
        }
      }
    }
  }
}

function writeIllustration(): void {
  const rows = [
    row('C4 and D4', [60, 62], 'treble'),
    row('E4 and F4', [64, 65], 'treble'),
    row('C4, D4, and E4', [60, 62, 64], 'treble'),
    row('C4 and E4, a third', [60, 64], 'treble'),
    row('Bass G2 and A2', [43, 45], 'bass'),
  ]
  const body = rows
    .map((entry) => {
      const before = staffSvg(entry.label, entry.placements.map((placement) => ({ ...placement, offsetX: 0 })), entry.staff)
      const after = staffSvg(entry.label, entry.placements, entry.staff)
      return `<section><h2>${entry.label}</h2><div><p>Before</p>${before}</div><div><p>After</p>${after}</div></section>`
    })
    .join('')
  const html = `<!doctype html><meta charset="utf-8"><title>Chord displacement</title>
<style>
  body { margin: 24px; font: 16px Palatino, serif; background: #c7a47f; color: #2a1a0e; }
  section { display: flex; gap: 24px; align-items: end; margin-bottom: 28px; }
  h2 { width: 180px; font-size: 18px; }
  svg { background: #fff; border: 2px solid #00ff00; }
</style>
<h1>Adjacent noteheads</h1>
${body}`
  const collision = collisionSvg()
  writeFileSync('/tmp/chord-displacement.html', html.replace('</h1>', `</h1>${collision}`))
}

function collisionSvg(): string {
  const low = placeChordNoteheads([treble(69), treble(71)], defaultStemDirection([treble(69), treble(71)]), WIDTH)
  const high = placeChordNoteheads([treble(71), treble(72)], defaultStemDirection([treble(71), treble(72)]), WIDTH)
  const heads = [
    ...low.map((placement) => ({ ...placement, x: 40 + placement.offsetX })),
    ...high.map((placement) => ({ ...placement, x: 116 + placement.offsetX })),
  ]
  const lines = [0, 1, 2, 3, 4]
    .map((line) => `<line x1="12" x2="220" y1="${78 - line * 14}" y2="${78 - line * 14}" stroke="#2a1a0e" stroke-width="1.25"/>`)
    .join('')
  const ellipses = heads
    .map((placement) => `<ellipse cx="${placement.x}" cy="${78 - placement.staffStep * 7}" rx="8" ry="5.5" fill="#2a1a0e"/>`)
    .join('')
  return `<section><h2>Two close columns</h2><div><p>A4 B4, then B4 C5</p><svg xmlns="http://www.w3.org/2000/svg" width="232" height="120" viewBox="0 0 232 120" role="img" aria-label="Two close columns">${lines}${ellipses}</svg></div></section>`
}

function row(label: string, midis: readonly number[], staff: 'treble' | 'bass') {
  const bottom = staff === 'bass' ? BASS_BOTTOM_DIATONIC : TREBLE_BOTTOM_DIATONIC
  const steps = midis.map((midi) => pitchStaffStep(midi, bottom))
  return { label, staff, placements: placeChordNoteheads(steps, defaultStemDirection(steps), WIDTH) }
}

function staffSvg(label: string, placements: readonly NoteheadPlacement[], staff: 'treble' | 'bass'): string {
  const bottomY = 78
  const lines = [0, 1, 2, 3, 4]
    .map((line) => `<line x1="12" x2="148" y1="${bottomY - line * 14}" y2="${bottomY - line * 14}" stroke="#2a1a0e" stroke-width="1.25"/>`)
    .join('')
  const heads = placements
    .map((placement) => {
      const y = bottomY - placement.staffStep * 7
      const x = 70 + placement.offsetX
      return `<ellipse cx="${x}" cy="${y}" rx="8" ry="5.5" fill="#2a1a0e"/>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120" role="img" aria-label="${label} ${staff}">${lines}${heads}</svg>`
}
