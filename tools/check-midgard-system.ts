/**
 * The Classical / midGard switch and the midGard pitch map.
 * The selector is editor state. It is not stored on a Song.
 */
import { readFileSync } from 'node:fs'
import { grandStaffFrame, noteheadY, pitchStaffStep, STAFF_STEP, TREBLE_BOTTOM_DIATONIC } from '../src/engraving/geometry.ts'
import {
  MIDGARD_GROUP_COLORS,
  MIDGARD_GROUP_COUNT,
  MIDGARD_STAFF_HEIGHT,
  midgardGroupLines,
  midgardLedgerYs,
  midgardNoteY,
} from '../src/engraving/midgard-geometry.ts'
import { notationSystem } from '../src/notation/notation-system.ts'

function fail(message: string): never {
  throw new Error(message)
}

if (notationSystem('classical') !== 'classical') fail('Classical was not kept.')
if (notationSystem('midgard') !== 'midgard') fail('midGard was not selected.')
if (notationSystem(null) !== 'classical' || notationSystem(undefined) !== 'classical' || notationSystem('other') !== 'classical') {
  fail('A missing or unknown sheet system must stay classical.')
}

const naturals: Array<[number, number]> = [
  [48, 329.625],
  [50, 315.625],
  [52, 301.625],
  [53, 294.625],
  [55, 280.625],
  [57, 266.625],
  [59, 252.625],
  [60, 245.625],
  [62, 231.625],
  [64, 217.625],
  [65, 210.625],
  [67, 196.625],
  [69, 182.625],
  [71, 168.625],
]
for (const [midi, y] of naturals) {
  if (midgardNoteY(midi) !== y) fail(`MIDI ${midi} was not at y ${y}.`)
}

const chromatic = [61, 63, 66, 68, 70]
for (const midi of chromatic) {
  const halfway = (midgardNoteY(midi - 1) + midgardNoteY(midi + 1)) / 2
  if (midgardNoteY(midi) !== halfway) fail(`MIDI ${midi} is not halfway between its neighbors.`)
}

if (midgardNoteY(61) !== midgardNoteY(61)) fail('The same MIDI pitch moved.')
if (midgardNoteY(72) - midgardNoteY(60) !== midgardNoteY(60) - midgardNoteY(48)) {
  fail('Octaves are not the same height.')
}
if (midgardNoteY(60) - midgardNoteY(61) !== STAFF_STEP) fail('A semitone is not one staff step.')

function sameLines(midi: number, expected: number[]): void {
  const lines = midgardLedgerYs(midi)
  if (lines.length !== expected.length || lines.some((line, index) => line !== expected[index])) {
    fail(`MIDI ${midi} ledgers were ${lines.join(', ')}.`)
  }
}

const c4 = midgardNoteY(60)
sameLines(60, [c4 - STAFF_STEP, c4 - 3 * STAFF_STEP])
sameLines(61, [midgardNoteY(61)])
sameLines(62, [midgardNoteY(62) - STAFF_STEP, midgardNoteY(62) + STAFF_STEP])
sameLines(63, [midgardNoteY(63)])
sameLines(64, [])
sameLines(65, [])
sameLines(66, [])
if (midgardLedgerYs(61).length !== 1 || midgardLedgerYs(62).length !== 2 || midgardLedgerYs(63).length !== 1) {
  fail('C♯, D, and D♯ do not have one, two, and one ledger lines.')
}

if (MIDGARD_GROUP_COUNT !== 6) fail('The midGard staff does not have six groups.')
if (MIDGARD_GROUP_COLORS.join(',') !== '#FEEFEE,#FEEFEE,#ECF3FD,#ECF3FD,#FEEFEE,#FEEFEE') {
  fail('The six groups are not pink, pink, blue, blue, pink, pink.')
}
for (let group = 0; group < MIDGARD_GROUP_COUNT; group += 1) {
  const lines = midgardGroupLines(group)
  if (lines.length !== 4) fail(`Group ${group} does not have four lines.`)
  for (let line = 1; line < lines.length; line += 1) {
    const previous = lines[line - 1]
    const current = lines[line]
    if (previous === undefined || current === undefined || current - previous !== 14) {
      fail(`Group ${group} is not spaced at 14px.`)
    }
  }
}
if (MIDGARD_STAFF_HEIGHT !== 463.25) fail('The midGard staff height changed.')

const frame = grandStaffFrame()
const classicalC4 = noteheadY(frame.trebleBottomY, pitchStaffStep(60, TREBLE_BOTTOM_DIATONIC))
if (classicalC4 === midgardNoteY(60)) fail('Classical and midGard were given the same coordinate system.')
if (frame.height === MIDGARD_STAFF_HEIGHT) fail('The classical frame grew to the midGard staff.')

const page = readFileSync('src/notation/piano-measure-svg.ts', 'utf8')
if (!page.includes("system === 'midgard'") || !page.includes('drawMidgardMeasureStaff')) {
  fail('The measure SVG does not draw the midGard staff.')
}
if (page.includes('accidental') || page.includes('♯') || page.includes('♭')) {
  fail('The measure SVG draws an accidental glyph.')
}
if (!page.includes('grandStaffFrame()')) fail('The classical staff frame was removed.')

const view = readFileSync('src/notation/engraving-view.ts', 'utf8')
if (!view.includes('measureSvg({ label, content, timeSignature, system, maxWidth })')) {
  fail('Each measure is not drawn by the shared measure SVG.')
}
if (!view.includes("system === 'midgard' ? 'midGard Sheet Music'")) {
  fail('The midGard score does not name itself.')
}

const main = readFileSync('src/main.ts', 'utf8')
if (!main.includes('useClassicalSheet()') || !main.includes("target.name !== 'sheetSystem'")) {
  fail('Opening a song does not return to Classical, or the selector does not redraw.')
}
const handler = main.slice(main.indexOf("target.name !== 'sheetSystem'"), main.indexOf('editNamesButton.addEventListener'))
if (handler.includes('getSong') || handler.includes('saveSong')) {
  fail('Switching the sheet system reloads or saves the Song.')
}
const settings = readFileSync('src/song/song-settings-view.ts', 'utf8')
if (settings.includes('sheetSystem')) fail('Song Settings stores the sheet system.')

console.log('midGard system checks passed.')
console.log('Classical stays the default. Pitch follows the MIDI number, with no accidental glyphs.')
