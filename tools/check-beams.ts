/**
 * Beam grouping and beam geometry.
 * This does not read or write IndexedDB, and it does not change Part C or MIDI.
 */
import { readFileSync } from 'node:fs'
import {
  BEAM_LEVEL_STEP,
  BEAM_MAX_SLOPE,
  BEAM_THICKNESS,
  BEAMLET_LENGTH,
  layoutBeam,
  type BeamEnd,
} from '../src/engraving/beam.ts'
import { defaultStemDirection, STEM_DOWN, STEM_UP } from '../src/engraving/chord-offset.ts'
import {
  BASS_BOTTOM_DIATONIC,
  grandStaffFrame,
  noteheadY,
  pitchStaffStep,
  TREBLE_BOTTOM_DIATONIC,
} from '../src/engraving/geometry.ts'
import { columnX, spaceColumns } from '../src/engraving/spacing.ts'
import { STEM_THICKNESS, stemGeometry, type StemHead } from '../src/engraving/symbols.ts'
import {
  beamBeatQuarters,
  beamEventKey,
  beamGroups,
  beamLevel,
  type BeamGroupEvent,
} from '../src/interpretation/beam-group.ts'
import { fraction, fractionKey, undottedDuration, type Fraction, type WrittenDuration } from '../src/interpretation/duration.ts'
import { buildMeasureContent, type MeasureContent, type StaffEvent } from '../src/interpretation/measure-content.ts'
import { assignPianoStaffs } from '../src/interpretation/staff.ts'
import { parseMidi } from '../src/midi/parse-midi.ts'
import { writtenMeasures } from '../src/notation/written-measures.ts'
import {
  SONG_B_BAR15_A4_GRACE,
  SONG_B_BAR15_A4_SIXTEENTH,
  SONG_B_READINGS,
} from '../src/song/install-sustained-reading.ts'

const QUARTER = 384
const THREE_FOUR = { numerator: 3, denominator: 4 }
const NOTE_RX = 8
const NOTEHEAD_WIDTH = NOTE_RX * 2
const NOTE_AREA_LEFT = 40
const NOTE_AREA_RIGHT = 32
const STAFF_INSET = 16

function fail(message: string): never {
  throw new Error(message)
}

function close(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > 1e-6) fail(`${label}: expected ${expected}, got ${actual}`)
}

function written(base: WrittenDuration['base'], dots: 0 | 1): WrittenDuration {
  const plain = undottedDuration(base)
  if (dots === 0) return plain
  return { base, dots, quarters: fraction(plain.quarters.numerator * 3, plain.quarters.denominator * 2) }
}

function onsetOf(quarters: number): Fraction {
  if (quarters === 0.75) return fraction(3, 4)
  if (quarters === 0.5) return fraction(1, 2)
  if (quarters === 0.25) return fraction(1, 4)
  return fraction(quarters, 1)
}

function event(
  onset: number,
  duration: WrittenDuration,
  stemDirection: 1 | -1,
  staff: 'treble' | 'bass' = 'treble',
): BeamGroupEvent {
  return { staff, onset: onsetOf(onset), duration, stemDirection }
}

const partC = JSON.stringify({
  readings: SONG_B_READINGS,
  sixteenth: SONG_B_BAR15_A4_SIXTEENTH,
  grace: SONG_B_BAR15_A4_GRACE,
})

const songB = parseMidi(new Uint8Array(readFileSync('midi-files/chopin-prelude-op-28-no-7-in-a-major-b.mid')))
const songBBefore = JSON.stringify(songB.notes)
if (songB.notes.length !== 168) fail(`Song B should still have 168 MIDI notes, found ${songB.notes.length}.`)
const a4 = songB.notes
  .filter((note) => note.track === 2 && note.midi === 69 && note.startTick >= 16800 && note.startTick <= 16896)
  .map((note) => `${note.startTick}:${note.endTick}:${note.durationTicks}`)
  .join(', ')
if (a4 !== '16800:16852:52, 16852:16896:44, 16896:18432:1536') fail(`The three A4 events are ${a4}.`)

const songA = parseMidi(new Uint8Array(readFileSync('midi-files/chopin-prelude-op-28-no-7-in-a-major.mid')))
const songABefore = JSON.stringify(songA.notes)
if (songA.notes.length !== 176) fail(`Song A should still have 176 MIDI notes, found ${songA.notes.length}.`)

const hands = assignPianoStaffs(songB.notes)
if (!hands.ready) fail(hands.message)
const measures = writtenMeasures(
  { timeSignature: THREE_FOUR, pickup: { present: true, duration: 'quarter' }, ticksPerWrittenQuarter: QUARTER },
  17,
)
if (!measures.ready) fail(measures.message)

const readings = {
  sustainedNotes: SONG_B_READINGS,
  writtenDurations: [SONG_B_BAR15_A4_SIXTEENTH],
  graceNotes: [SONG_B_BAR15_A4_GRACE],
}

function contentFor(index: number): MeasureContent {
  const measure = measures.measures[index]
  if (measure === undefined) fail(`Bar ${index} is missing.`)
  return buildMeasureContent({
    notes: songB.notes,
    span: measure.span,
    ticksPerWrittenQuarter: QUARTER,
    staffByTrack: hands.staffByTrack,
    measureQuarters: fraction(measure.quarters, 1),
    ...readings,
  })
}

function groupsIn(content: MeasureContent) {
  return beamGroups({
    events: content.columns.flatMap((column) =>
      column.events.map((item) => ({
        staff: item.staff,
        onset: item.onset,
        duration: item.duration,
        stemDirection: directionOf(item),
      })),
    ),
    timeSignature: THREE_FOUR,
  })
}

function directionOf(item: StaffEvent): 1 | -1 {
  const bottom = item.staff === 'bass' ? BASS_BOTTOM_DIATONIC : TREBLE_BOTTOM_DIATONIC
  return defaultStemDirection(item.pitches.map((pitch) => pitchStaffStep(pitch.midi, bottom)))
}

function pitchesOf(content: MeasureContent, key: string): string {
  for (const column of content.columns) {
    for (const item of column.events) {
      if (beamEventKey(item) !== key) continue
      return item.pitches.map((pitch) => pitch.midi).join('+')
    }
  }
  return ''
}

function ticksOf(content: MeasureContent, key: string): string {
  for (const column of content.columns) {
    for (const item of column.events) {
      if (beamEventKey(item) !== key) continue
      return item.pitches.map((pitch) => pitch.startTick).join('+')
    }
  }
  return ''
}

if (beamLevel(written('eighth', 0)) !== 1) fail('An eighth note takes one beam.')
if (beamLevel(written('eighth', 1)) !== 1) fail('A dotted eighth keeps one beam.')
if (beamLevel(written('sixteenth', 0)) !== 2) fail('A sixteenth note takes two beams.')
if (beamLevel(written('quarter', 0)) !== 0 || beamLevel(written('half', 0)) !== 0) {
  fail('Quarters and halves are not beamed.')
}
close(beamBeatQuarters(THREE_FOUR).numerator / beamBeatQuarters(THREE_FOUR).denominator, 1, '3/4 beam beat')
close(beamBeatQuarters({ numerator: 6, denominator: 8 }).numerator / beamBeatQuarters({ numerator: 6, denominator: 8 }).denominator, 1.5, '6/8 beam beat')

const eighths = beamGroups({
  events: [event(0, written('eighth', 0), STEM_UP), event(0.5, written('eighth', 0), STEM_UP)],
  timeSignature: THREE_FOUR,
})
if (eighths.length !== 1 || eighths[0]?.events.length !== 2) fail('Two eighths in one beat form one group.')
if (eighths[0]?.events[0]?.level !== 1 || eighths[0]?.events[1]?.level !== 1) fail('Two eighths use one beam level.')

const sixteenths = beamGroups({
  events: [event(0, written('sixteenth', 0), STEM_DOWN), event(0.25, written('sixteenth', 0), STEM_DOWN)],
  timeSignature: THREE_FOUR,
})
if (sixteenths.length !== 1 || sixteenths[0]?.events[0]?.level !== 2 || sixteenths[0]?.events[1]?.level !== 2) {
  fail('Two sixteenths share two beam levels.')
}

const dotted = beamGroups({
  events: [event(0, written('eighth', 1), STEM_DOWN), event(0.75, written('sixteenth', 0), STEM_DOWN)],
  timeSignature: THREE_FOUR,
})
if (dotted.length !== 1 || dotted[0]?.events[0]?.level !== 1 || dotted[0]?.events[1]?.level !== 2) {
  fail('A dotted eighth and a sixteenth are levels 1 and 2.')
}

const withQuarter = beamGroups({
  events: [
    event(0, written('eighth', 1), STEM_DOWN),
    event(0, written('quarter', 0), STEM_UP),
    event(0.75, written('sixteenth', 0), STEM_DOWN),
    event(1, written('quarter', 0), STEM_UP),
  ],
  timeSignature: THREE_FOUR,
})
if (withQuarter.length !== 1 || withQuarter[0]?.events.length !== 2) fail('A quarter must stay out of the beam.')
if (withQuarter[0]?.events.some((member) => member.level === 0)) fail('A beam member cannot be a quarter.')
if (withQuarter[0]?.stemDirection !== STEM_DOWN) fail('The quarter’s upward stem must not join the downward beam.')

const acrossBeat = beamGroups({
  events: [event(0, written('eighth', 0), STEM_UP), event(1, written('eighth', 0), STEM_UP)],
  timeSignature: THREE_FOUR,
})
if (acrossBeat.length !== 0) fail('A beam must stop at the beat.')

const firstMeasure = beamGroups({
  events: [event(0, written('eighth', 0), STEM_UP)],
  timeSignature: THREE_FOUR,
})
const nextMeasure = beamGroups({
  events: [event(0, written('eighth', 0), STEM_UP)],
  timeSignature: THREE_FOUR,
})
if (firstMeasure.length !== 0 || nextMeasure.length !== 0) fail('One eighth at a barline is not a beam by itself.')

const opposite = beamGroups({
  events: [event(0, written('eighth', 0), STEM_UP), event(0.5, written('eighth', 0), STEM_DOWN)],
  timeSignature: THREE_FOUR,
})
if (opposite.length !== 0) fail('Opposite stem directions stay unbeamed.')

const eighthLayout = layoutBeam({
  direction: STEM_UP,
  stemThickness: STEM_THICKNESS,
  ends: [
    { stemX: 80, naturalTipY: 40, level: 1 },
    { stemX: 160, naturalTipY: 30, level: 1 },
  ],
})
if (eighthLayout.shapes.length !== 1 || eighthLayout.shapes[0]?.level !== 1) fail('Two eighths draw one primary beam.')
if (Math.abs(eighthLayout.slope) > BEAM_MAX_SLOPE) fail('An eighth-note beam is steeper than the limit.')

const sixteenthLayout = layoutBeam({
  direction: STEM_DOWN,
  stemThickness: STEM_THICKNESS,
  ends: [
    { stemX: 80, naturalTipY: 120, level: 2 },
    { stemX: 150, naturalTipY: 110, level: 2 },
  ],
})
if (sixteenthLayout.shapes.length !== 2) fail('Two sixteenths draw two beam levels.')
if (sixteenthLayout.shapes[1]?.points[0]?.x !== sixteenthLayout.shapes[0]?.points[0]?.x) {
  fail('The second sixteenth beam should run the full width of the primary beam.')
}
const step = BEAM_LEVEL_STEP * BEAM_THICKNESS
close((sixteenthLayout.shapes[0]?.points[0]?.y ?? 0) - (sixteenthLayout.shapes[1]?.points[0]?.y ?? 0), step, 'beam separation')

const hook = layoutBeam({
  direction: STEM_DOWN,
  stemThickness: STEM_THICKNESS,
  ends: [
    { stemX: 90, naturalTipY: 140, level: 1 },
    { stemX: 170, naturalTipY: 132, level: 2 },
  ],
})
if (hook.shapes.length !== 2 || hook.shapes[1]?.level !== 2) fail('A dotted eighth and a sixteenth draw a secondary beam.')
const hookLeft = Math.min(...(hook.shapes[1]?.points.map((point) => point.x) ?? []))
const hookRight = Math.max(...(hook.shapes[1]?.points.map((point) => point.x) ?? []))
close(hookRight - hookLeft, BEAMLET_LENGTH, 'beamlet length')
if (hookLeft <= 90) fail('The beamlet must sit on the sixteenth, not on the dotted eighth.')
if (hook.extensions[0] < 0 || hook.extensions[1] < 0) fail('A beam must not shorten a stem.')
close(hook.tips[0], 140 + hook.extensions[0] * (STEM_DOWN === -1 ? 1 : -1), 'left stem meets the beam')

const steep = layoutBeam({
  direction: STEM_UP,
  stemThickness: STEM_THICKNESS,
  ends: [
    { stemX: 40, naturalTipY: 80, level: 1 },
    { stemX: 140, naturalTipY: 10, level: 2 },
  ],
})
close(steep.slope, -BEAM_MAX_SLOPE, 'slope cap')
if (steep.tips[0] > 80 || steep.tips[1] > 10) fail('A capped beam must not pull a stem back toward its notehead.')

const frame = grandStaffFrame()
const expected: Record<number, { pitches: [string, string]; direction: 1 | -1; ticks: [number, number] }> = {
  1: { pitches: ['73', '74'], direction: STEM_DOWN, ticks: [384, 672] },
  3: { pitches: ['72+75', '73+76'], direction: STEM_DOWN, ticks: [2688, 2976] },
  5: { pitches: ['61+70', '62+71'], direction: STEM_UP, ticks: [4992, 5280] },
  7: { pitches: ['62+68', '61+69'], direction: STEM_UP, ticks: [7296, 7584] },
  9: { pitches: ['73', '74'], direction: STEM_DOWN, ticks: [9600, 9888] },
  11: { pitches: ['72+75', '73+76'], direction: STEM_DOWN, ticks: [11904, 12192] },
  13: { pitches: ['70+73', '71+74'], direction: STEM_DOWN, ticks: [14208, 14496] },
  15: { pitches: ['62+71', '61+69'], direction: STEM_UP, ticks: [16512, 16800] },
}

for (const index of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) {
  const content = contentFor(index)
  const groups = groupsIn(content)
  const wanted = expected[index]
  if (wanted === undefined) {
    if (groups.length !== 0) fail(`Bar ${index} should have no beam, found ${groups.length}.`)
    continue
  }
  if (groups.length !== 1) fail(`Bar ${index} should have one beam group, found ${groups.length}.`)
  const group = groups[0]
  if (group === undefined || group.events.length !== 2) fail(`Bar ${index} should beam two events.`)
  if (group.staff !== 'treble') fail(`Bar ${index} beams the ${group.staff} staff.`)
  if (group.stemDirection !== wanted.direction) fail(`Bar ${index} stems ${group.stemDirection}, expected ${wanted.direction}.`)
  if (group.events[0]?.level !== 1 || group.events[1]?.level !== 2) fail(`Bar ${index} should be levels 1 then 2.`)
  const found = [pitchesOf(content, group.events[0]?.key ?? ''), pitchesOf(content, group.events[1]?.key ?? '')]
  if (found[0] !== wanted.pitches[0] || found[1] !== wanted.pitches[1]) {
    fail(`Bar ${index} beams ${found.join(' to ')}, expected ${wanted.pitches.join(' to ')}.`)
  }
  const ticks = ticksOf(content, group.events[1]?.key ?? '')
  if (!ticks.split('+').includes(String(wanted.ticks[1]))) fail(`Bar ${index} beamlet note starts at ${ticks}.`)
  if (group.events[0]?.level === 2) fail(`Bar ${index} puts a secondary beam on the dotted eighth.`)
}

const bar9 = contentFor(9)
const bar9Groups = groupsIn(bar9)
const bar9Keys = new Set(bar9Groups.flatMap((group) => group.events.map((member) => member.key)))
for (const column of bar9.columns) {
  for (const item of column.events) {
    if (item.duration.base === 'quarter' && bar9Keys.has(beamEventKey(item))) fail('Bar 9 beamed a quarter note.')
  }
}

const bar15 = contentFor(15)
if (bar15.graceNotes.length !== 1) fail('Bar 15 should still have its grace note.')
const grace = bar15.graceNotes[0]
if (grace === undefined || grace.startTick !== 16852 || grace.written !== 'eighth' || !grace.slur || grace.slash) {
  fail('The Bar 15 grace note changed.')
}
const bar15Group = groupsIn(bar15)[0]
const beamedTicks = bar15Group?.events.flatMap((member) => ticksOf(bar15, member.key).split('+')) ?? []
if (beamedTicks.includes('16852')) fail('The grace note joined the beam.')
if (!beamedTicks.includes('16800')) fail('The written sixteenth left the beam.')

function tieIds(content: MeasureContent): string {
  return content.ties
    .map((tie) => `${tie.id}:${tie.role}`)
    .sort()
    .join(',')
}
if (tieIds(contentFor(5)) !== 'tie:2:62:5280:0:complete,tie:2:62:5280:1:outgoing') {
  fail(`Bar 5 ties are ${tieIds(contentFor(5))}.`)
}
if (tieIds(contentFor(6)) !== 'tie:2:62:5280:1:incoming') fail(`Bar 6 ties are ${tieIds(contentFor(6))}.`)
if (tieIds(contentFor(11)) !== 'tie:2:73:12192:0:complete,tie:2:76:12192:0:complete') {
  fail(`Bar 11 ties are ${tieIds(contentFor(11))}.`)
}
if (tieIds(contentFor(15)) !== 'tie:2:69:16896:0:outgoing') fail(`Bar 15 ties are ${tieIds(contentFor(15))}.`)
if (tieIds(contentFor(16)) !== 'tie:2:69:16896:0:incoming') fail(`Bar 16 ties are ${tieIds(contentFor(16))}.`)

function placedBeam(index: number): ReturnType<typeof layoutBeam> {
  const content = contentFor(index)
  const group = groupsIn(content)[0]
  if (group === undefined || group.events.length !== 2) fail(`Bar ${index} has no pair to draw.`)
  const extents = new Map<string, { left: number; right: number }>()
  for (const column of content.columns) {
    extents.set(fractionKey(column.onset), { left: NOTE_RX, right: NOTE_RX })
  }
  const spacing = spaceColumns({
    onsets: content.columns.map((column) => column.onset),
    measureQuarters: content.measureQuarters,
    originX: NOTE_AREA_LEFT,
    extents,
    noteheadWidth: NOTEHEAD_WIDTH,
  })
  const width = spacing.contentRight + NOTE_AREA_RIGHT + STAFF_INSET
  const ends: BeamEnd[] = []
  for (const member of group.events) {
    let found: StaffEvent | undefined
    for (const column of content.columns) {
      found = column.events.find((item) => beamEventKey(item) === member.key) ?? found
    }
    if (found === undefined) fail(`Bar ${index} lost a beamed event.`)
    const anchorX = columnX(spacing, found.onset)
    const steps = found.pitches.map((pitch) => pitchStaffStep(pitch.midi, TREBLE_BOTTOM_DIATONIC))
    const heads: StemHead[] = steps.map((staffStep) => ({
      x: anchorX,
      y: noteheadY(frame.trebleBottomY, staffStep),
      staffStep,
      displaced: false,
    }))
    const natural = stemGeometry({ heads, direction: group.stemDirection, noteheadRadiusX: NOTE_RX })
    const extended = stemGeometry({
      heads,
      direction: group.stemDirection,
      noteheadRadiusX: NOTE_RX,
      extension: 12,
    })
    if (natural === undefined || extended === undefined) fail(`Bar ${index} did not grow a stem.`)
    if (natural.baseY !== extended.baseY || natural.x !== extended.x) fail(`Bar ${index} moved a notehead when the stem grew.`)
    ends.push({ stemX: natural.x, naturalTipY: natural.tipY, level: member.level })
  }
  const first = ends[0]
  const second = ends[1]
  if (first === undefined || second === undefined) fail(`Bar ${index} is missing a stem.`)
  const layout = layoutBeam({
    direction: group.stemDirection,
    stemThickness: STEM_THICKNESS,
    ends: [first, second],
  })
  for (const shape of layout.shapes) {
    for (const point of shape.points) {
      if (point.x < STAFF_INSET || point.x > width - STAFF_INSET) {
        fail(`Bar ${index} draws a beam at x ${point.x}, outside ${STAFF_INSET}–${width - STAFF_INSET}.`)
      }
    }
    const minY = Math.min(...shape.points.map((point) => point.y))
    const maxY = Math.max(...shape.points.map((point) => point.y))
    if (!Number.isFinite(minY) || !Number.isFinite(maxY)) fail(`Bar ${index} has no vertical beam extent.`)
  }
  if (Math.abs(layout.slope) > BEAM_MAX_SLOPE) fail(`Bar ${index} slope is ${layout.slope}.`)
  const reach = group.stemDirection === STEM_UP ? -1 : 1
  close(layout.tips[0], first.naturalTipY + reach * layout.extensions[0], `Bar ${index} left tip`)
  close(layout.tips[1], second.naturalTipY + reach * layout.extensions[1], `Bar ${index} right tip`)
  if (layout.extensions[0] < 0 || layout.extensions[1] < 0) fail(`Bar ${index} shortens a stem.`)
  if (layout.shapes[0] === undefined || layout.shapes[1] === undefined) fail(`Bar ${index} is missing a beam level.`)
  const secondaryXs = layout.shapes[1].points.map((point) => point.x)
  if (Math.min(...secondaryXs) <= first.stemX) fail(`Bar ${index} puts the beamlet on the dotted eighth.`)
  return layout
}

for (const index of [1, 3, 5, 7, 9, 11, 13, 15]) placedBeam(index)

const sample = placedBeam(1)
const sampleHeads: StemHead[] = [{ x: 100, y: noteheadY(frame.trebleBottomY, 5), staffStep: 5, displaced: false }]
const beforeStem = stemGeometry({ heads: sampleHeads, direction: STEM_DOWN, noteheadRadiusX: NOTE_RX })
const afterStem = stemGeometry({
  heads: sampleHeads,
  direction: STEM_DOWN,
  noteheadRadiusX: NOTE_RX,
  extension: sample.extensions[0],
})
if (beforeStem === undefined || afterStem === undefined) fail('The sample stem is missing.')
if (beforeStem.baseY !== afterStem.baseY || beforeStem.x !== afterStem.x) fail('Extending a stem moved its notehead.')
if (afterStem.tipY + 1e-6 < beforeStem.tipY) fail('The extended stem is shorter than the plain stem.')

if (JSON.stringify(songB.notes) !== songBBefore) fail('Song B MIDI changed.')
if (JSON.stringify(songA.notes) !== songABefore) fail('Song A MIDI changed.')
if (
  JSON.stringify({
    readings: SONG_B_READINGS,
    sixteenth: SONG_B_BAR15_A4_SIXTEENTH,
    grace: SONG_B_BAR15_A4_GRACE,
  }) !== partC
) {
  fail('Part C changed.')
}

console.log('Beam groups and beam geometry match the eight Chopin measures.')
