/**
 * True time is a written-tick coordinate, shared by every midGard measure.
 * Classical spacing is a different function and is not used here.
 */
import { readFileSync } from 'node:fs'
import { isSong, midgardMeasureWidth, type Song } from '../src/song/song.ts'
import {
  pickupTimelineOrigin,
  trueTimeCrowded,
  trueTimeTimeline,
  trueTimeX,
  TRUE_TIME_MARGIN,
} from '../src/engraving/true-time.ts'

function fail(message: string): never {
  throw new Error(message)
}

const FULL = 960
const PICKUP = 240
const WIDTH = 400
const timeline = trueTimeTimeline(WIDTH, FULL)
if (timeline.measureWidth !== WIDTH) fail('A measure did not keep the requested width.')
if (timeline.margin !== TRUE_TIME_MARGIN || timeline.timelineStartX !== 28) fail('The timeline margin is not 28.')
if (timeline.timelineWidth !== WIDTH - 56) fail('The margins were taken out of the musical timeline.')

const origin = pickupTimelineOrigin(FULL, PICKUP)
if (origin !== 720) fail(`The étude pickup does not begin at tick 720. It begins at ${origin}.`)
const pickupX = trueTimeX(timeline, origin)
const expectedPickup = 28 + (720 / 960) * (WIDTH - 56)
if (Math.abs(pickupX - expectedPickup) > 1e-9) fail(`Pickup x is ${pickupX}, not ${expectedPickup}.`)
if (Math.abs(pickupX - (28 + 0.75 * (WIDTH - 56))) > 1e-9) fail('The étude pickup is not at 75% of the timeline.')

const complete = trueTimeTimeline(WIDTH, FULL)
if (complete.measureWidth !== timeline.measureWidth) fail('Bar 0 and a complete bar were given different widths.')
const localEighth = trueTimeX(timeline, origin + 240) - pickupX
const completeEighth = trueTimeX(complete, 240) - trueTimeX(complete, 0)
if (Math.abs(localEighth - completeEighth) > 1e-9) fail('A pickup eighth does not use the full-measure scale.')

const eighth = trueTimeX(timeline, 240) - trueTimeX(timeline, 0)
const quarter = trueTimeX(timeline, 480) - trueTimeX(timeline, 0)
if (Math.abs(quarter - eighth * 2) > 1e-9) fail('A quarter note does not occupy twice an eighth.')
if (trueTimeX(timeline, 480) !== trueTimeX(timeline, 480)) fail('One written tick produced two coordinates.')

for (const width of [200, 400, 800]) {
  const scaled = trueTimeTimeline(width, FULL)
  const fraction = (trueTimeX(scaled, origin) - scaled.timelineStartX) / scaled.timelineWidth
  if (Math.abs(fraction - 0.75) > 1e-9) fail(`Width ${width} moved the pickup off 75% of the timeline.`)
  if (scaled.measureWidth !== width) fail('The slider width was not the measure width.')
}

const narrow = trueTimeTimeline(200, FULL)
if (!trueTimeCrowded([0, 60], narrow, 16)) fail('A 60-tick gap at 200px was treated as clear.')
if (trueTimeCrowded([0, 0, 480], narrow, 16)) fail('Notes that share a tick were treated as a collision.')
if (trueTimeCrowded([0, 480], timeline, 16)) fail('A quarter at the default width was treated as crowded.')

const bare = {
  id: 'true-time',
  schemaVersion: 1,
  metadata: { title: 'True time', composer: 'Test', sourceFilename: 'true-time.mid' },
  originalMidi: {
    format: 1,
    trackCount: 0,
    ppq: 480,
    tracks: [],
    notes: [],
    tempos: [],
    timeSignatures: [],
    keySignatures: [],
    warnings: [],
  },
  musicalInterpretation: {},
}
if (midgardMeasureWidth(bare as Song) !== 400) fail('A Song without a width did not use 400.')
if (!isSong({ ...bare, display: { midgardMeasureWidth: 400 } })) fail('A stored width of 400 was rejected.')
if (!isSong({ ...bare, display: { measures: { kind: 'count', count: 5 }, midgardMeasureWidth: 520 } })) {
  fail('A width could not sit beside an existing display choice.')
}
if (isSong({ ...bare, display: { midgardMeasureWidth: 410 } })) fail('A width off the 20px step was stored.')
if (isSong({ ...bare, display: { midgardMeasureWidth: 180 } })) fail('A width below 200 was stored.')
const withWidth = { ...bare, display: { midgardMeasureWidth: 640 } } as Song
if (withWidth.musicalInterpretation !== bare.musicalInterpretation) fail('The width changed Part C.')
if (midgardMeasureWidth(withWidth) !== 640) fail('The stored width was not read back.')

const timing = readFileSync('src/engraving/true-time.ts', 'utf8')
if (timing.includes('spaceColumns') || timing.includes('document') || timing.includes('originalMidi')) {
  fail('True time reached into spacing, the DOM, or the MIDI file.')
}
const page = readFileSync('src/notation/piano-measure-svg.ts', 'utf8')
if (!page.includes('spaceColumns({')) fail('Classical spacing was removed.')
if (!page.includes("const trueTime = system === 'midgard' ? options.trueTime : undefined")) {
  fail('Classical can read the midGard timeline.')
}
if (!page.includes('drawMidgardTimeZero') || !page.includes('timelineOriginTicks > 0')) {
  fail('The green time-zero line is missing or is not limited to a pickup.')
}
if (page.includes('drawMidgardBarline')) fail('midGard still draws a right barline.')
if (!page.includes('drawRightBarline(')) fail('Classical lost its right barline.')
const view = readFileSync('src/notation/engraving-view.ts', 'utf8')
if (!view.includes('timelineOriginTicks: pickup ? fullMeasureTicks - spanTicks : 0')) {
  fail('Bar 0 is not placed at the end of a full-measure timeline.')
}
const geometry = readFileSync('src/engraving/midgard-geometry.ts', 'utf8')
if (!geometry.includes("export const MIDGARD_LINE = '#000000'")) fail('The introduction staff line color changed.')
if (!geometry.includes("export const MIDGARD_MEASURE_LINE = '#888888'")) fail('Measure staff lines are not #888888.')
if (!geometry.includes("export const MIDGARD_TIME_ZERO = '#6BCB8C'")) fail('The pickup time-zero line is not the lighter green.')
const html = readFileSync('index.html', 'utf8')
if (!html.includes('midGard Measure Width') || !html.includes('min="200"') || !html.includes('max="800"') || !html.includes('step="20"')) {
  fail('The midGard measure-width slider is missing or has the wrong range.')
}

console.log('True time checks passed.')
console.log('Equal written ticks keep equal distances. Bar 0 uses the full-measure scale.')
