/**
 * Checks that rhythmic spacing fits a maximum width without overlapping noteheads.
 * A short measure keeps its comfortable width. The unlimited layout stays put.
 */
import { fraction } from '../src/interpretation/duration.ts'
import { NOTEHEAD_EDGE_GAP, PIXELS_PER_QUARTER, spaceColumns } from '../src/engraving/spacing.ts'

function fail(message: string): never {
  throw new Error(message)
}

const NOTEHEAD_WIDTH = 16
const RADIUS = NOTEHEAD_WIDTH / 2
const ORIGIN = 40
const sixteenths = [0, 1, 2, 3, 4, 5, 6, 7].map((step) => fraction(step, 4))
const twoQuarters = fraction(2, 1)

const ideal = spaceColumns({
  onsets: sixteenths,
  measureQuarters: twoQuarters,
  originX: ORIGIN,
  noteheadWidth: NOTEHEAD_WIDTH,
})
if (!ideal.fits) fail('Unlimited spacing reported that it did not fit.')
const roomy = spaceColumns({
  onsets: sixteenths,
  measureQuarters: twoQuarters,
  originX: ORIGIN,
  noteheadWidth: NOTEHEAD_WIDTH,
  maxContentRight: ideal.contentRight + 200,
})
if (roomy.contentRight !== ideal.contentRight || !roomy.fits) {
  fail('A maximum wider than the comfortable layout changed the spacing.')
}
const firstGap = (ideal.columns[1]?.x ?? 0) - (ideal.columns[0]?.x ?? 0)
const expectedGap = RADIUS + RADIUS + NOTEHEAD_EDGE_GAP + 0.25 * PIXELS_PER_QUARTER
if (Math.abs(firstGap - expectedGap) > 0.01) fail(`The comfortable sixteenth gap is ${firstGap}.`)

const budget = 300
const fitted = spaceColumns({
  onsets: sixteenths,
  measureQuarters: twoQuarters,
  originX: ORIGIN,
  noteheadWidth: NOTEHEAD_WIDTH,
  maxContentRight: budget,
})
if (!fitted.fits) fail('Eight sixteenths did not fit a 300px content width.')
if (fitted.contentRight > budget) fail(`Fitted content ends at ${fitted.contentRight}, past ${budget}.`)
if (fitted.columns.length !== sixteenths.length) fail('Fitting dropped a column.')
let previous = -Infinity
for (let index = 0; index < fitted.columns.length; index += 1) {
  const column = fitted.columns[index]
  if (column === undefined) fail('A fitted column is missing.')
  if (column.x < previous) fail('Fitted columns left chronological order.')
  const next = fitted.columns[index + 1]
  if (next !== undefined) {
    const clearance = next.x - RADIUS - (column.x + RADIUS)
    if (clearance < NOTEHEAD_EDGE_GAP - 0.01) fail(`Fitted clearance is ${clearance}.`)
  }
  previous = column.x
}
if (fitted.columns[0]?.x !== ideal.columns[0]?.x) fail('Fitting moved the first note away from the left margin.')
if (fitted.contentRight >= ideal.contentRight) fail('The dense measure did not become more compact.')

const quarterAndSixteenth = spaceColumns({
  onsets: [fraction(0, 1), fraction(1, 1), fraction(5, 4)],
  measureQuarters: twoQuarters,
  originX: ORIGIN,
  noteheadWidth: NOTEHEAD_WIDTH,
  maxContentRight: budget,
})
if (!quarterAndSixteenth.fits) fail('A mixed rhythm did not fit.')
const longGap =
  (quarterAndSixteenth.columns[1]?.x ?? 0) - (quarterAndSixteenth.columns[0]?.x ?? 0)
const shortGap =
  (quarterAndSixteenth.columns[2]?.x ?? 0) - (quarterAndSixteenth.columns[1]?.x ?? 0)
if (longGap <= shortGap) fail('A quarter gap became no wider than the following sixteenth gap.')

const cramped = spaceColumns({
  onsets: sixteenths,
  measureQuarters: twoQuarters,
  originX: ORIGIN,
  noteheadWidth: NOTEHEAD_WIDTH,
  maxContentRight: 80,
})
if (cramped.fits) fail('A width below the collision minimum claimed to fit.')
if (cramped.contentRight <= 80) fail('The collision minimum was squeezed into the impossible width.')
for (let index = 0; index < cramped.columns.length - 1; index += 1) {
  const column = cramped.columns[index]
  const next = cramped.columns[index + 1]
  if (column === undefined || next === undefined) fail('A cramped column is missing.')
  const clearance = next.x - RADIUS - (column.x + RADIUS)
  if (Math.abs(clearance - NOTEHEAD_EDGE_GAP) > 0.01) {
    fail(`The cramped clearance is ${clearance}, not the notehead gap.`)
  }
}

const pickup = spaceColumns({
  onsets: [fraction(0, 1)],
  measureQuarters: fraction(1, 2),
  originX: ORIGIN,
  noteheadWidth: NOTEHEAD_WIDTH,
})
const pickupWide = spaceColumns({
  onsets: [fraction(0, 1)],
  measureQuarters: fraction(1, 2),
  originX: ORIGIN,
  noteheadWidth: NOTEHEAD_WIDTH,
  maxContentRight: 800,
})
if (pickup.contentRight !== pickupWide.contentRight || pickup.columns[0]?.x !== pickupWide.columns[0]?.x) {
  fail('A short measure was stretched to fill the column.')
}

console.log('Measure-fit checks passed.')
console.log('Dense columns shrink by written time. The notehead clearance stays.')
