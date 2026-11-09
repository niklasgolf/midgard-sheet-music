import {
  BASS_BOTTOM_DIATONIC,
  grandStaffFrame,
  ledgerSteps,
  noteheadY,
  pitchStaffStep,
  STAFF_LINE_COUNT,
  STAFF_SPACE,
  STAFF_STEP,
  staffLineY,
  staffTopY,
  TREBLE_BOTTOM_DIATONIC,
} from '../engraving/geometry.ts'
import {
  MIDGARD_MEASURE_LINE,
  MIDGARD_MARGIN_FILL,
  MIDGARD_STAFF_HEIGHT,
  midgardLedgerYs,
  midgardNoteY,
} from '../engraving/midgard-geometry.ts'
import { trueTimeTimeline, trueTimeX, type TrueTimeTimeline } from '../engraving/true-time.ts'
import { defaultStemDirection, noteheadExtent, placeChordNoteheads, type StemDirection } from '../engraving/chord-offset.ts'
import {
  graceCenterX,
  graceFlagCount,
  graceFlagPath,
  graceInkLeft,
  graceRadii,
  graceSlashLine,
  graceSlur,
  graceSlurPath,
  graceStem,
  GRACE_SCALE,
} from '../engraving/grace-note.ts'
import { layoutBeam, type BeamShape } from '../engraving/beam.ts'
import { appendDot, appendStem, durationHasStem, extentWithDots, placeAugmentationDots, stemGeometry, type StemGeometry } from '../engraving/symbols.ts'
import { beamEventKey, beamGroups } from '../interpretation/beam-group.ts'
import { fractionKey, fractionToNumber, type Fraction } from '../interpretation/duration.ts'
import type { TimeSignature } from '../song/song.ts'
import { columnX, spaceColumns, type MeasureSpacing } from '../engraving/spacing.ts'
import {
  TIE_APPROACH,
  tieAttachmentY,
  tieCurve,
  tieEndpoints,
  tieExtentY,
  tiePath,
  tieSideForChord,
  tiedGroupSteps,
} from '../engraving/tie.ts'
import type {
  MeasureContent,
  MeasureGraceNote,
  MeasurePitch,
  MeasureTie,
  ProvisionalColumn,
  ProvisionalEvent,
  RhythmicColumn,
  StaffEvent,
} from '../interpretation/measure-content.ts'
import { pitchCount } from '../interpretation/measure-content.ts'
import type { PianoStaff } from '../interpretation/staff.ts'
import { drawMidgardMeasureStaff, drawMidgardTimeZero } from './midgard-staff-svg.ts'
import type { NotationSystem } from './notation-system.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'

const STAFF_INSET = 16
const NOTE_AREA_LEFT = 40
const NOTE_AREA_RIGHT = 32
const NOTE_RX = 8
const NOTE_RY = 5.5
const INK = '#2a1a0e'
/** Unresolved MIDI notes. This color does not assign them a written duration. */
const UNRESOLVED_INK = '#742D38'

const NOTEHEAD_WIDTH = NOTE_RX * 2

/** Written timeline for one midGard measure. Classical does not read this. */
export type TrueTimeMeasure = {
  measureWidth: number
  ticksPerWrittenQuarter: number
  fullMeasureTicks: number
  /** Where this measure's local tick 0 sits on a complete-measure timeline. */
  timelineOriginTicks: number
}

export function measureSvg(options: {
  label: string
  content: MeasureContent
  timeSignature?: TimeSignature
  system?: NotationSystem
  /** Largest SVG width that still sits inside the measure's grid cell. Classical only. */
  maxWidth?: number
  /** Written-time coordinates. Used only when the system is midGard. */
  trueTime?: TrueTimeMeasure
}): SVGSVGElement {
  const system = options.system ?? 'classical'
  const placed = options.content.columns.map((column) => placeColumn(column, system))
  const provisional = options.content.provisional.map((column) => placeProvisional(column, system))
  const extents = new Map<string, { left: number; right: number }>()
  for (const column of [...placed, ...provisional]) {
    const key = fractionKey(column.onset)
    const current = extents.get(key)
    extents.set(
      key,
      current === undefined
        ? column.extent
        : { left: Math.max(current.left, column.extent.left), right: Math.max(current.right, column.extent.right) },
    )
  }
  for (const column of placed) {
    const key = fractionKey(column.onset)
    const current = extents.get(key)
    const lead = graceLead(column, options.content.graceNotes)
    if (current !== undefined && lead > current.left) {
      extents.set(key, { left: lead, right: current.right })
    }
  }
  const opensFromLeft = options.content.ties.some(
    (tie) => tie.role === 'incoming' || tie.role === 'continuation',
  )
  const rightPad = NOTE_AREA_RIGHT + STAFF_INSET
  const trueTime = system === 'midgard' ? options.trueTime : undefined
  if (system === 'midgard' && trueTime === undefined) {
    throw new Error('A midGard measure needs a true-time timeline.')
  }
  const timeline = trueTime === undefined ? undefined : trueTimeTimeline(trueTime.measureWidth, trueTime.fullMeasureTicks)
  const spacing =
    timeline === undefined || trueTime === undefined
      ? spaceColumns({
          onsets: [...placed, ...provisional].map((column) => column.onset),
          measureQuarters: options.content.measureQuarters,
          originX: NOTE_AREA_LEFT + (opensFromLeft ? TIE_APPROACH : 0),
          extents,
          noteheadWidth: NOTEHEAD_WIDTH,
          maxContentRight: options.maxWidth === undefined ? undefined : options.maxWidth - rightPad,
        })
      : spaceTrueTime(placed, provisional, trueTime, timeline)
  const width = timeline === undefined ? spacing.contentRight + rightPad : timeline.measureWidth
  const frame = grandStaffFrame()
  const height = system === 'midgard' ? MIDGARD_STAFF_HEIGHT : frame.height
  const staffLeft = timeline === undefined ? STAFF_INSET : timeline.timelineStartX
  const staffRight = timeline === undefined ? width - STAFF_INSET : timeline.timelineStartX + timeline.timelineWidth
  const notes = pitchCount(options.content)

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.setAttribute('role', 'img')
  svg.setAttribute('data-notation', system)
  svg.setAttribute('data-fits', spacing.fits ? 'true' : 'false')
  if (timeline !== undefined && trueTime !== undefined) {
    svg.setAttribute('data-spacing', 'true-time')
    svg.setAttribute('data-measure-width', String(timeline.measureWidth))
    svg.setAttribute('data-timeline-start', String(timeline.timelineStartX))
    svg.setAttribute('data-timeline-width', String(timeline.timelineWidth))
    svg.setAttribute('data-full-measure-ticks', String(timeline.fullMeasureTicks))
    svg.setAttribute('data-timeline-origin', String(trueTime.timelineOriginTicks))
  }
  const unresolved = options.content.unresolved.length
  const incomplete = unresolved === 0 ? '' : `, ${unresolved} unresolved`
  svg.setAttribute('aria-label', `${options.label}, ${notes} notes${incomplete}`)

  if (system === 'midgard' && timeline !== undefined && trueTime !== undefined) {
    drawMidgardMeasureStaff(svg, 0, width, {
      line: MIDGARD_MEASURE_LINE,
      margins: { width: timeline.margin, fill: MIDGARD_MARGIN_FILL },
    })
    if (trueTime.timelineOriginTicks > 0) {
      drawMidgardTimeZero(svg, trueTimeX(timeline, trueTime.timelineOriginTicks), trueTime.timelineOriginTicks)
    }
  } else {
    drawStaff(svg, staffLeft, staffRight, frame.trebleBottomY)
    drawStaff(svg, staffLeft, staffRight, frame.bassBottomY)
    drawRightBarline(svg, staffRight, frame.trebleBottomY, frame.bassBottomY)
  }

  const ink: InkEvent[] = []
  for (const column of placed) {
    const anchorX = columnX(spacing, column.onset)
    const timeTick = trueTime === undefined ? undefined : writtenTimelineTick(column.onset, trueTime)
    for (const group of column.events) {
      ink.push({ placed: group, anchorX, timeTick })
    }
  }
  const beams = stemNotes(svg, ink, options.timeSignature)
  for (const item of ink) drawEvent(svg, frame, item.placed, item.anchorX, system, item.timeTick)
  for (const beam of beams) appendBeam(svg, beam.shape, beam.staff)
  for (const column of provisional) {
    const anchorX = columnX(spacing, column.onset)
    const timeTick = trueTime === undefined ? undefined : writtenTimelineTick(column.onset, trueTime)
    for (const group of column.events) {
      drawProvisional(svg, frame, group, anchorX, system, timeTick)
    }
  }
  const tieLeft = timeline === undefined ? staffLeft : 0
  const tieRight = timeline === undefined ? staffRight : width
  drawTies(svg, options.content.ties, placed, spacing, tieLeft, tieRight, system)
  drawGraceNotes(svg, frame, options.content.graceNotes, placed, spacing, system)

  fitVerticalFrame(svg, width, height)
  return svg
}

type TimedHeadColumn = {
  onset: Fraction
  events: readonly { heads: readonly { offsetX: number }[] }[]
}

function writtenTimelineTick(onset: Fraction, spec: TrueTimeMeasure): number {
  return spec.timelineOriginTicks + fractionToNumber(onset) * spec.ticksPerWrittenQuarter
}

function spaceTrueTime(
  placed: readonly TimedHeadColumn[],
  provisional: readonly TimedHeadColumn[],
  spec: TrueTimeMeasure,
  timeline: TrueTimeTimeline,
): MeasureSpacing {
  const seen = new Set<string>()
  const columns: { onset: Fraction; x: number }[] = []
  const heads: { tick: number; x: number }[] = []
  for (const column of [...placed, ...provisional]) {
    const key = fractionKey(column.onset)
    const tick = writtenTimelineTick(column.onset, spec)
    const x = trueTimeX(timeline, tick)
    if (!seen.has(key)) {
      seen.add(key)
      columns.push({ onset: column.onset, x })
    }
    for (const group of column.events) {
      for (const head of group.heads) heads.push({ tick, x: x + head.offsetX })
    }
  }
  return {
    columns,
    contentRight: timeline.timelineStartX + timeline.timelineWidth,
    fits: !trueTimeTooNarrow(heads, timeline.measureWidth),
  }
}

/** Same-tick chords may share a coordinate. A narrow timeline does not move them. */
function trueTimeTooNarrow(heads: readonly { tick: number; x: number }[], width: number): boolean {
  for (const head of heads) {
    if (head.x - NOTE_RX < -0.01 || head.x + NOTE_RX > width + 0.01) return true
  }
  const sorted = [...heads].sort((left, right) => left.x - right.x || left.tick - right.tick)
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]
    const next = sorted[index]
    if (previous === undefined || next === undefined) continue
    if (Math.abs(previous.tick - next.tick) < 0.01) continue
    if (next.x - previous.x < NOTEHEAD_WIDTH - 0.01) return true
  }
  return false
}

/** Staff positions stay put. The frame grows only when a stem or notehead passes the padding. */
function fitVerticalFrame(svg: SVGSVGElement, width: number, minimumHeight: number): void {
  const ink = 8
  let minY = 0
  let maxY = minimumHeight
  for (const element of svg.querySelectorAll('line, ellipse, circle')) {
    for (const name of ['y1', 'y2', 'cy']) {
      const value = element.getAttribute(name)
      if (value === null) continue
      const y = Number(value)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }
  for (const element of svg.querySelectorAll('[data-extent-min], [data-extent-max]')) {
    const min = element.getAttribute('data-extent-min')
    const max = element.getAttribute('data-extent-max')
    if (min !== null) minY = Math.min(minY, Number(min))
    if (max !== null) maxY = Math.max(maxY, Number(max))
  }
  const top = minY < 0 ? minY - ink : 0
  const bottom = maxY > minimumHeight ? maxY + ink : minimumHeight
  const height = bottom - top
  svg.setAttribute('viewBox', `0 ${top} ${width} ${height}`)
  svg.setAttribute('height', String(height))
}

type PlacedHead = {
  pitch: MeasurePitch
  offsetX: number
  staffStep: number
  /** Notehead center. Classical and midGard both store the y they will draw. */
  y: number
  displaced: boolean
}

type PlacedDot = {
  offsetX: number
  y: number
  midi: number
  startTick: number
}

type PlacedEvent = {
  event: StaffEvent
  direction: StemDirection
  heads: PlacedHead[]
  dots: PlacedDot[]
}

function placeColumn(column: RhythmicColumn, system: NotationSystem): {
  onset: RhythmicColumn['onset']
  extent: { left: number; right: number }
  events: PlacedEvent[]
} {
  const events: PlacedEvent[] = []
  const offsets: number[] = []
  const dotCenters: number[] = []
  for (const event of column.events) {
    const bottom = event.staff === 'bass' ? BASS_BOTTOM_DIATONIC : TREBLE_BOTTOM_DIATONIC
    const steps = event.pitches.map((pitch) => pitchStaffStep(pitch.midi, bottom))
    const direction = defaultStemDirection(steps)
    const placed = placeChordNoteheads(steps, direction, NOTEHEAD_WIDTH)
    const heads = event.pitches.map((pitch, index) => {
      const placement = placed[index]
      const offsetX = placement?.offsetX ?? 0
      const staffStep = placement?.staffStep ?? steps[index] ?? 0
      offsets.push(offsetX)
      return {
        pitch,
        offsetX,
        staffStep,
        y: noteCenterY(system, event.staff, pitch.midi, staffStep),
        displaced: placement?.displaced ?? false,
      }
    })
    const dots: PlacedDot[] = []
    if (event.duration.dots === 1) {
      const positions = placeAugmentationDots(
        heads.map((head) => ({ x: head.offsetX, staffStep: dotStep(system, head.pitch.midi, head.staffStep) })),
        NOTE_RX,
      )
      positions.forEach((position, index) => {
        const head = heads[index]
        if (head === undefined) return
        dots.push({
          offsetX: position.x,
          y: dotCenterY(system, event.staff, head, position.staffStep),
          midi: head.pitch.midi,
          startTick: head.pitch.startTick,
        })
        dotCenters.push(position.x)
      })
    }
    events.push({ event, direction, heads, dots })
  }
  return { onset: column.onset, extent: extentWithDots(offsets, NOTEHEAD_WIDTH, dotCenters), events }
}

function placeProvisional(column: ProvisionalColumn, system: NotationSystem): {
  onset: ProvisionalColumn['onset']
  extent: { left: number; right: number }
  events: Array<ProvisionalEvent & { heads: PlacedHead[] }>
} {
  const events: Array<ProvisionalEvent & { heads: PlacedHead[] }> = []
  const offsets: number[] = []
  for (const event of column.events) {
    const bottom = event.staff === 'bass' ? BASS_BOTTOM_DIATONIC : TREBLE_BOTTOM_DIATONIC
    const steps = event.pitches.map((pitch) => pitchStaffStep(pitch.midi, bottom))
    const placed = placeChordNoteheads(steps, defaultStemDirection(steps), NOTEHEAD_WIDTH)
    const heads = event.pitches.map((pitch, index) => {
      const placement = placed[index]
      const offsetX = placement?.offsetX ?? 0
      const staffStep = placement?.staffStep ?? steps[index] ?? 0
      offsets.push(offsetX)
      return {
        pitch,
        offsetX,
        staffStep,
        y: noteCenterY(system, event.staff, pitch.midi, staffStep),
        displaced: placement?.displaced ?? false,
      }
    })
    events.push({ ...event, heads })
  }
  return { onset: column.onset, extent: noteheadExtent(offsets, NOTEHEAD_WIDTH), events }
}

function drawProvisional(
  svg: SVGSVGElement,
  frame: { trebleBottomY: number; bassBottomY: number },
  group: ProvisionalEvent & { heads: PlacedHead[] },
  anchorX: number,
  system: NotationSystem,
  timeTick?: number,
): void {
  const bottomY = group.staff === 'bass' ? frame.bassBottomY : frame.trebleBottomY
  drawHeadLedgers(svg, group.heads, anchorX, bottomY, UNRESOLVED_INK, system)
  for (const head of group.heads) {
    drawNotehead(svg, head.pitch, group.staff, anchorX + head.offsetX, head.y, UNRESOLVED_INK, timeTick, anchorX)
  }
}

type InkEvent = {
  placed: PlacedEvent
  anchorX: number
  timeTick?: number
}

function stemNotes(
  svg: SVGSVGElement,
  ink: readonly InkEvent[],
  timeSignature: TimeSignature | undefined,
): Array<{ shape: BeamShape; staff: string }> {
  const beamed = new Set<string>()
  const shapes: Array<{ shape: BeamShape; staff: string }> = []
  if (timeSignature !== undefined) {
    const groups = beamGroups({
      events: ink.map((item) => ({
        staff: item.placed.event.staff,
        onset: item.placed.event.onset,
        duration: item.placed.event.duration,
        stemDirection: item.placed.direction,
      })),
      timeSignature,
    })
    for (const group of groups) {
      const left = group.events[0]
      const right = group.events[1]
      if (left === undefined || right === undefined || group.events.length !== 2) continue
      const first = ink.find((item) => beamEventKey(item.placed.event) === left.key)
      const second = ink.find((item) => beamEventKey(item.placed.event) === right.key)
      if (first === undefined || second === undefined) continue
      if (first.placed.direction !== group.stemDirection || second.placed.direction !== group.stemDirection) continue
      const leftStem = eventStem(first, 0)
      const rightStem = eventStem(second, 0)
      if (leftStem === undefined || rightStem === undefined) continue
      const layout = layoutBeam({
        direction: group.stemDirection,
        stemThickness: leftStem.thickness,
        ends: [
          { stemX: leftStem.x, naturalTipY: leftStem.tipY, level: left.level },
          { stemX: rightStem.x, naturalTipY: rightStem.tipY, level: right.level },
        ],
      })
      drawStem(svg, first, layout.extensions[0])
      drawStem(svg, second, layout.extensions[1])
      for (const shape of layout.shapes) shapes.push({ shape, staff: group.staff })
      beamed.add(left.key)
      beamed.add(right.key)
    }
  }
  for (const item of ink) {
    if (beamed.has(beamEventKey(item.placed.event))) continue
    if (!durationHasStem(item.placed.event.duration.base)) continue
    drawStem(svg, item, 0)
  }
  return shapes
}

function eventStem(item: InkEvent, extension: number): StemGeometry | undefined {
  return stemGeometry({
    direction: item.placed.direction,
    noteheadRadiusX: NOTE_RX,
    extension,
    heads: item.placed.heads.map((head) => ({
      x: item.anchorX + head.offsetX,
      y: head.y,
      staffStep: head.staffStep,
      displaced: head.displaced,
    })),
  })
}

function drawStem(svg: SVGSVGElement, item: InkEvent, extension: number): void {
  const stem = eventStem(item, extension)
  const tick = item.placed.heads[0]?.pitch.startTick
  if (stem === undefined || tick === undefined) return
  appendStem(svg, stem, INK, { staff: item.placed.event.staff, startTick: tick })
}

function appendBeam(svg: SVGSVGElement, shape: BeamShape, staff: string): void {
  const polygon = document.createElementNS(SVG_NS, 'polygon')
  polygon.setAttribute('points', shape.points.map((point) => `${point.x},${point.y}`).join(' '))
  polygon.setAttribute('fill', INK)
  polygon.setAttribute('data-beam', shape.level === 1 ? 'primary' : 'secondary')
  polygon.setAttribute('data-staff', staff)
  let minY = shape.points[0].y
  let maxY = minY
  for (const point of shape.points) {
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }
  polygon.setAttribute('data-extent-min', String(minY))
  polygon.setAttribute('data-extent-max', String(maxY))
  svg.append(polygon)
}

function drawEvent(
  svg: SVGSVGElement,
  frame: { trebleBottomY: number; bassBottomY: number },
  group: PlacedEvent,
  anchorX: number,
  system: NotationSystem,
  timeTick?: number,
): void {
  const bottomY = group.event.staff === 'bass' ? frame.bassBottomY : frame.trebleBottomY
  drawHeadLedgers(svg, group.heads, anchorX, bottomY, INK, system)
  for (const head of group.heads) {
    drawNotehead(svg, head.pitch, group.event.staff, anchorX + head.offsetX, head.y, INK, timeTick, anchorX)
  }
  for (const dot of group.dots) {
    appendDot(svg, { x: anchorX + dot.offsetX, y: dot.y }, INK, {
      staff: group.event.staff,
      startTick: dot.startTick,
      midi: dot.midi,
    })
  }
}

function drawStaff(svg: SVGSVGElement, x1: number, x2: number, bottomY: number): void {
  for (let line = 0; line < STAFF_LINE_COUNT; line += 1) {
    const y = staffLineY(bottomY, line)
    const path = document.createElementNS(SVG_NS, 'line')
    path.setAttribute('x1', String(x1))
    path.setAttribute('x2', String(x2))
    path.setAttribute('y1', String(y))
    path.setAttribute('y2', String(y))
    path.setAttribute('stroke', INK)
    path.setAttribute('stroke-width', '1.25')
    svg.append(path)
  }
}

function drawRightBarline(
  svg: SVGSVGElement,
  x: number,
  trebleBottomY: number,
  bassBottomY: number,
): void {
  const line = document.createElementNS(SVG_NS, 'line')
  line.setAttribute('x1', String(x))
  line.setAttribute('x2', String(x))
  line.setAttribute('y1', String(staffTopY(trebleBottomY)))
  line.setAttribute('y2', String(bassBottomY))
  line.setAttribute('stroke', INK)
  line.setAttribute('stroke-width', '1.25')
  line.setAttribute('data-barline', 'right')
  svg.append(line)
}

function noteCenterY(system: NotationSystem, staff: PianoStaff, midi: number, staffStep: number): number {
  if (system === 'midgard') return midgardNoteY(midi)
  const frame = grandStaffFrame()
  const bottomY = staff === 'bass' ? frame.bassBottomY : frame.trebleBottomY
  return noteheadY(bottomY, staffStep)
}

/** Even steps are lines. MidGard lines fall on odd MIDI numbers, so the step is midi + 1. */
function dotStep(system: NotationSystem, midi: number, staffStep: number): number {
  return system === 'midgard' ? midi + 1 : staffStep
}

function dotCenterY(system: NotationSystem, staff: PianoStaff, head: PlacedHead, placedStep: number): number {
  if (system === 'midgard') return head.y - (placedStep - (head.pitch.midi + 1)) * STAFF_STEP
  const frame = grandStaffFrame()
  const bottomY = staff === 'bass' ? frame.bassBottomY : frame.trebleBottomY
  return noteheadY(bottomY, placedStep)
}

function drawHeadLedgers(
  svg: SVGSVGElement,
  heads: readonly PlacedHead[],
  anchorX: number,
  bottomY: number,
  color: string,
  system: NotationSystem,
): void {
  const ledgerColor = system === 'midgard' && color === INK ? MIDGARD_MEASURE_LINE : color
  if (system !== 'midgard') {
    for (const head of heads) drawLedgerLines(svg, anchorX + head.offsetX, head.staffStep, bottomY, color)
    return
  }
  const spans: Array<{ y: number; x1: number; x2: number }> = []
  for (const head of heads) {
    const x = anchorX + head.offsetX
    for (const y of midgardLedgerYs(head.pitch.midi)) spans.push({ y, x1: x - STAFF_SPACE, x2: x + STAFF_SPACE })
  }
  for (const span of mergeLedgerSpans(spans)) drawLedgerSpan(svg, span.x1, span.x2, span.y, ledgerColor)
}

function mergeLedgerSpans(
  spans: readonly { y: number; x1: number; x2: number }[],
): Array<{ y: number; x1: number; x2: number }> {
  const byLine = new Map<number, Array<{ x1: number; x2: number }>>()
  for (const span of spans) {
    const line = byLine.get(span.y) ?? []
    line.push({ x1: span.x1, x2: span.x2 })
    byLine.set(span.y, line)
  }
  const merged: Array<{ y: number; x1: number; x2: number }> = []
  for (const [y, line] of byLine) {
    line.sort((left, right) => left.x1 - right.x1)
    let current = line[0]
    if (current === undefined) continue
    for (const next of line.slice(1)) {
      if (next.x1 <= current.x2) current = { x1: current.x1, x2: Math.max(current.x2, next.x2) }
      else {
        merged.push({ y, x1: current.x1, x2: current.x2 })
        current = next
      }
    }
    merged.push({ y, x1: current.x1, x2: current.x2 })
  }
  return merged
}

function drawLedgerSpan(svg: SVGSVGElement, x1: number, x2: number, y: number, color: string): void {
  const line = document.createElementNS(SVG_NS, 'line')
  line.setAttribute('x1', String(x1))
  line.setAttribute('x2', String(x2))
  line.setAttribute('y1', String(y))
  line.setAttribute('y2', String(y))
  line.setAttribute('stroke', color)
  line.setAttribute('stroke-width', '1.25')
  line.setAttribute('data-ledger', 'midgard')
  svg.append(line)
}

function drawLedgerLines(svg: SVGSVGElement, x: number, step: number, bottomY: number, color: string): void {
  for (const ledgerStep of ledgerSteps(step)) {
    const y = noteheadY(bottomY, ledgerStep)
    const line = document.createElementNS(SVG_NS, 'line')
    line.setAttribute('x1', String(x - STAFF_SPACE))
    line.setAttribute('x2', String(x + STAFF_SPACE))
    line.setAttribute('y1', String(y))
    line.setAttribute('y2', String(y))
    line.setAttribute('stroke', color)
    line.setAttribute('stroke-width', '1.25')
    svg.append(line)
  }
}

function drawNotehead(
  svg: SVGSVGElement,
  pitch: MeasurePitch,
  staff: PianoStaff,
  x: number,
  y: number,
  color: string,
  timeTick?: number,
  timeX?: number,
): void {
  const head = document.createElementNS(SVG_NS, 'ellipse')
  head.setAttribute('cx', String(x))
  head.setAttribute('cy', String(y))
  head.setAttribute('rx', String(NOTE_RX))
  head.setAttribute('ry', String(NOTE_RY))
  head.setAttribute('fill', color)
  head.setAttribute('data-midi', String(pitch.midi))
  head.setAttribute('data-start-tick', String(pitch.startTick))
  head.setAttribute('data-staff', staff)
  if (timeTick !== undefined && timeX !== undefined) {
    head.setAttribute('data-time-tick', String(timeTick))
    head.setAttribute('data-time-x', String(timeX))
  }
  if (color === UNRESOLVED_INK) {
    head.setAttribute('data-unresolved', 'true')
    head.setAttribute('data-duration-ticks', String(pitch.durationTicks))
  }
  if (pitch.sounding !== undefined) {
    head.setAttribute('data-sounding-start', String(pitch.sounding.startTick))
    head.setAttribute('data-sounding-end', String(pitch.sounding.endTick))
  }
  svg.append(head)
}

type TieAnchor = {
  midi: number
  startTick: number
  staff: PianoStaff
  x: number
  y: number
  staffStep: number
}

function drawTies(
  svg: SVGSVGElement,
  ties: readonly MeasureTie[],
  placed: ReturnType<typeof placeColumn>[],
  spacing: MeasureSpacing,
  staffLeft: number,
  staffRight: number,
  system: NotationSystem,
): void {
  const anchors = tieAnchors(placed, spacing)
  const prepared = ties.map((tie) => {
    const from = anchorFor(anchors, tie, tie.fromStartTick)
    const to = anchorFor(anchors, tie, tie.toStartTick)
    const step =
      from?.staffStep ??
      to?.staffStep ??
      pitchStaffStep(tie.midi, tie.staff === 'bass' ? BASS_BOTTOM_DIATONIC : TREBLE_BOTTOM_DIATONIC)
    return { tie, from, to, step }
  })
  const onsets = prepared.map((item) => ({
    staff: item.tie.staff,
    staffStep: item.step,
    fromStartTick: item.tie.fromStartTick,
    toStartTick: item.tie.toStartTick,
  }))
  for (const [index, item] of prepared.entries()) {
    const { tie, from, to, step } = item
    const side = tieSideForChord(step, tiedGroupSteps(index, onsets))
    const openY = tieAttachmentY(noteCenterY(system, tie.staff, tie.midi, step), side, NOTE_RY)
    const startY = from === undefined ? openY : tieAttachmentY(from.y, side, NOTE_RY)
    const endY = to === undefined ? openY : tieAttachmentY(to.y, side, NOTE_RY)
    if (tie.role === 'complete' && (from === undefined || to === undefined)) continue
    if (tie.role === 'outgoing' && from === undefined) continue
    if (tie.role === 'incoming' && to === undefined) continue
    const ends = tieEndpoints({
      role: tie.role,
      staffLeft,
      staffRight,
      noteRadiusX: NOTE_RX,
      fromX: from?.x,
      toX: to?.x,
    })
    if (ends === undefined || ends.endX <= ends.startX) continue
    const curve = tieCurve({ startX: ends.startX, endX: ends.endX, startY, endY, side })
    const extent = tieExtentY(curve)
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', tiePath(curve))
    path.setAttribute('fill', INK)
    path.setAttribute('stroke', 'none')
    path.setAttribute('data-tie', tie.role)
    path.setAttribute('data-tie-id', tie.id)
    path.setAttribute('data-midi', String(tie.midi))
    path.setAttribute('data-tie-thickness', String(curve.thickness))
    path.setAttribute('data-tie-bow', String(curve.bow))
    path.setAttribute('data-tie-side', String(curve.side))
    path.setAttribute('data-tie-start-x', String(curve.startX))
    path.setAttribute('data-tie-end-x', String(curve.endX))
    path.setAttribute('data-tie-start-y', String(curve.startY))
    path.setAttribute('data-tie-end-y', String(curve.endY))
    path.setAttribute('data-extent-min', String(extent.min))
    path.setAttribute('data-extent-max', String(extent.max))
    svg.append(path)
  }
}

function graceLead(column: ReturnType<typeof placeColumn>, graceNotes: readonly MeasureGraceNote[]): number {
  let lead = 0
  for (const group of column.events) {
    for (const head of group.heads) {
      const attached = graceNotes.filter(
        (grace) =>
          grace.staff === group.event.staff &&
          grace.principal.track === head.pitch.track &&
          grace.principal.midi === head.pitch.midi &&
          grace.principal.startTick === head.pitch.startTick,
      )
      if (attached.length === 0) continue
      lead = Math.max(lead, graceInkLeft(attached.length, NOTE_RX) - head.offsetX)
    }
  }
  return lead
}

function drawGraceNotes(
  svg: SVGSVGElement,
  frame: { trebleBottomY: number; bassBottomY: number },
  graceNotes: readonly MeasureGraceNote[],
  placed: ReturnType<typeof placeColumn>[],
  spacing: MeasureSpacing,
  system: NotationSystem,
): void {
  for (const column of placed) {
    const anchorX = columnX(spacing, column.onset)
    for (const group of column.events) {
      for (const head of group.heads) {
        const attached = graceNotes
          .filter(
            (grace) =>
              grace.staff === group.event.staff &&
              grace.principal.track === head.pitch.track &&
              grace.principal.midi === head.pitch.midi &&
              grace.principal.startTick === head.pitch.startTick,
          )
          .sort((left, right) => right.startTick - left.startTick || right.midi - left.midi)
        const principalX = anchorX + head.offsetX
        const bottomY = group.event.staff === 'bass' ? frame.bassBottomY : frame.trebleBottomY
        attached.forEach((grace, index) => {
          drawOneGrace(svg, grace, index, principalX, head.y, bottomY, system)
        })
      }
    }
  }
}

function drawOneGrace(
  svg: SVGSVGElement,
  grace: MeasureGraceNote,
  indexFromPrincipal: number,
  principalX: number,
  principalY: number,
  bottomY: number,
  system: NotationSystem,
): void {
  const bottom = grace.staff === 'bass' ? BASS_BOTTOM_DIATONIC : TREBLE_BOTTOM_DIATONIC
  const step = pitchStaffStep(grace.midi, bottom)
  const radii = graceRadii(NOTE_RX, NOTE_RY)
  const x = graceCenterX(principalX, indexFromPrincipal, NOTE_RX)
  const y = noteCenterY(system, grace.staff, grace.midi, step)
  const direction = defaultStemDirection([step])
  if (system === 'midgard') {
    for (const ledgerY of midgardLedgerYs(grace.midi)) {
      drawLedgerSpan(svg, x - STAFF_SPACE, x + STAFF_SPACE, ledgerY, MIDGARD_MEASURE_LINE)
    }
  } else {
    drawLedgerLines(svg, x, step, bottomY, INK)
  }

  const head = document.createElementNS(SVG_NS, 'ellipse')
  head.setAttribute('cx', String(x))
  head.setAttribute('cy', String(y))
  head.setAttribute('rx', String(radii.x))
  head.setAttribute('ry', String(radii.y))
  head.setAttribute('fill', INK)
  head.setAttribute('data-grace', 'true')
  head.setAttribute('data-grace-scale', String(GRACE_SCALE))
  head.setAttribute('data-midi', String(grace.midi))
  head.setAttribute('data-start-tick', String(grace.startTick))
  head.setAttribute('data-staff', grace.staff)
  head.setAttribute('data-principal-start', String(grace.principal.startTick))
  head.setAttribute('data-principal-midi', String(grace.principal.midi))
  if (system === 'midgard') head.setAttribute('data-time-x', String(principalX))
  svg.append(head)

  const stem = graceStem({ headX: x, headY: y, staffStep: step, noteRadiusX: NOTE_RX, direction })
  if (stem !== undefined) {
    const line = document.createElementNS(SVG_NS, 'line')
    line.setAttribute('x1', String(stem.x))
    line.setAttribute('x2', String(stem.x))
    line.setAttribute('y1', String(stem.baseY))
    line.setAttribute('y2', String(stem.tipY))
    line.setAttribute('stroke', INK)
    line.setAttribute('stroke-width', String(stem.thickness))
    line.setAttribute('stroke-linecap', 'butt')
    line.setAttribute('data-grace-stem', direction === 1 ? 'up' : 'down')
    line.setAttribute('data-start-tick', String(grace.startTick))
    svg.append(line)

    const flags = graceFlagCount(grace.written)
    for (let flagIndex = 0; flagIndex < flags; flagIndex += 1) {
      const flag = graceFlagPath({ tipX: stem.x, tipY: stem.tipY, direction, index: flagIndex })
      const path = document.createElementNS(SVG_NS, 'path')
      path.setAttribute('d', flag.d)
      path.setAttribute('fill', INK)
      path.setAttribute('stroke', 'none')
      path.setAttribute('data-grace-flag', grace.written)
      path.setAttribute('data-start-tick', String(grace.startTick))
      path.setAttribute('data-extent-min', String(flag.minY))
      path.setAttribute('data-extent-max', String(flag.maxY))
      svg.append(path)
    }

    if (grace.slash) {
      const slash = graceSlashLine(stem)
      const mark = document.createElementNS(SVG_NS, 'line')
      mark.setAttribute('x1', String(slash.x1))
      mark.setAttribute('y1', String(slash.y1))
      mark.setAttribute('x2', String(slash.x2))
      mark.setAttribute('y2', String(slash.y2))
      mark.setAttribute('stroke', INK)
      mark.setAttribute('stroke-width', String(stem.thickness))
      mark.setAttribute('data-grace-slash', 'true')
      mark.setAttribute('data-start-tick', String(grace.startTick))
      svg.append(mark)
    }
  }

  if (grace.slur && indexFromPrincipal === 0) {
    const curve = graceSlur({
      graceX: x,
      graceY: y,
      graceRadiusX: radii.x,
      graceRadiusY: radii.y,
      principalX,
      principalY,
      principalRadiusX: NOTE_RX,
      principalRadiusY: NOTE_RY,
    })
    if (curve !== undefined) {
      const slur = graceSlurPath(curve)
      const path = document.createElementNS(SVG_NS, 'path')
      path.setAttribute('d', slur.d)
      path.setAttribute('fill', INK)
      path.setAttribute('stroke', 'none')
      path.setAttribute('data-grace-slur', 'true')
      path.setAttribute('data-start-tick', String(grace.startTick))
      path.setAttribute('data-principal-start', String(grace.principal.startTick))
      path.setAttribute('data-extent-min', String(slur.min))
      path.setAttribute('data-extent-max', String(slur.max))
      svg.append(path)
    }
  }
}

function tieAnchors(placed: ReturnType<typeof placeColumn>[], spacing: MeasureSpacing): TieAnchor[] {
  const anchors: TieAnchor[] = []
  for (const column of placed) {
    const anchorX = columnX(spacing, column.onset)
    for (const group of column.events) {
      for (const head of group.heads) {
        anchors.push({
          midi: head.pitch.midi,
          startTick: head.pitch.startTick,
          staff: group.event.staff,
          x: anchorX + head.offsetX,
          y: head.y,
          staffStep: head.staffStep,
        })
      }
    }
  }
  return anchors
}

function anchorFor(anchors: readonly TieAnchor[], tie: MeasureTie, startTick: number | undefined): TieAnchor | undefined {
  if (startTick === undefined) return undefined
  return anchors.find(
    (anchor) => anchor.midi === tie.midi && anchor.startTick === startTick && anchor.staff === tie.staff,
  )
}
