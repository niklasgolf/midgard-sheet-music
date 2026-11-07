import {
  BASS_BOTTOM_DIATONIC,
  grandStaffFrame,
  ledgerSteps,
  noteheadY,
  pitchStaffStep,
  STAFF_LINE_COUNT,
  STAFF_SPACE,
  staffLineY,
  staffTopY,
  TREBLE_BOTTOM_DIATONIC,
} from '../engraving/geometry.ts'
import { defaultStemDirection, noteheadExtent, placeChordNoteheads, type StemDirection } from '../engraving/chord-offset.ts'
import { appendDot, appendStem, durationHasStem, extentWithDots, placeAugmentationDots, stemGeometry } from '../engraving/symbols.ts'
import { fractionKey } from '../interpretation/duration.ts'
import { columnX, spaceColumns, type MeasureSpacing } from '../engraving/spacing.ts'
import {
  TIE_APPROACH,
  tieAttachmentY,
  tieCurve,
  tieEndpoints,
  tieExtentY,
  tiePath,
  tieSideForStep,
} from '../engraving/tie.ts'
import type {
  MeasureContent,
  MeasurePitch,
  MeasureTie,
  ProvisionalColumn,
  ProvisionalEvent,
  RhythmicColumn,
  StaffEvent,
} from '../interpretation/measure-content.ts'
import { pitchCount } from '../interpretation/measure-content.ts'
import type { PianoStaff } from '../interpretation/staff.ts'

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

export function measureSvg(options: {
  label: string
  content: MeasureContent
}): SVGSVGElement {
  const placed = options.content.columns.map((column) => placeColumn(column))
  const provisional = options.content.provisional.map((column) => placeProvisional(column))
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
  const opensFromLeft = options.content.ties.some(
    (tie) => tie.role === 'incoming' || tie.role === 'continuation',
  )
  const spacing = spaceColumns({
    onsets: [...placed, ...provisional].map((column) => column.onset),
    measureQuarters: options.content.measureQuarters,
    originX: NOTE_AREA_LEFT + (opensFromLeft ? TIE_APPROACH : 0),
    extents,
    noteheadWidth: NOTEHEAD_WIDTH,
  })
  const width = spacing.contentRight + NOTE_AREA_RIGHT + STAFF_INSET
  const frame = grandStaffFrame()
  const staffLeft = STAFF_INSET
  const staffRight = width - STAFF_INSET
  const notes = pitchCount(options.content)

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${width} ${frame.height}`)
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(frame.height))
  svg.setAttribute('role', 'img')
  const unresolved = options.content.unresolved.length
  const incomplete = unresolved === 0 ? '' : `, ${unresolved} unresolved`
  svg.setAttribute('aria-label', `${options.label}, ${notes} notes${incomplete}`)

  drawStaff(svg, staffLeft, staffRight, frame.trebleBottomY)
  drawStaff(svg, staffLeft, staffRight, frame.bassBottomY)
  drawRightBarline(svg, staffRight, frame.trebleBottomY, frame.bassBottomY)

  for (const column of placed) {
    const anchorX = columnX(spacing, column.onset)
    for (const group of column.events) {
      drawEvent(svg, frame, group, anchorX)
    }
  }
  for (const column of provisional) {
    const anchorX = columnX(spacing, column.onset)
    for (const group of column.events) {
      drawProvisional(svg, frame, group, anchorX)
    }
  }
  drawTies(svg, frame, options.content.ties, placed, spacing, staffLeft, staffRight)

  fitVerticalFrame(svg, width, frame.height)
  return svg
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
  displaced: boolean
}

type PlacedDot = {
  offsetX: number
  staffStep: number
  midi: number
  startTick: number
}

type PlacedEvent = {
  event: StaffEvent
  direction: StemDirection
  heads: PlacedHead[]
  dots: PlacedDot[]
}

function placeColumn(column: RhythmicColumn): {
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
      offsets.push(offsetX)
      return {
        pitch,
        offsetX,
        staffStep: placement?.staffStep ?? steps[index] ?? 0,
        displaced: placement?.displaced ?? false,
      }
    })
    const dots: PlacedDot[] = []
    if (event.duration.dots === 1) {
      const positions = placeAugmentationDots(
        heads.map((head) => ({ x: head.offsetX, staffStep: head.staffStep })),
        NOTE_RX,
      )
      positions.forEach((position, index) => {
        const pitch = heads[index]?.pitch
        if (pitch === undefined) return
        dots.push({
          offsetX: position.x,
          staffStep: position.staffStep,
          midi: pitch.midi,
          startTick: pitch.startTick,
        })
        dotCenters.push(position.x)
      })
    }
    events.push({ event, direction, heads, dots })
  }
  return { onset: column.onset, extent: extentWithDots(offsets, NOTEHEAD_WIDTH, dotCenters), events }
}

function placeProvisional(column: ProvisionalColumn): {
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
      offsets.push(offsetX)
      return {
        pitch,
        offsetX,
        staffStep: placement?.staffStep ?? steps[index] ?? 0,
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
): void {
  for (const head of group.heads) {
    const x = anchorX + head.offsetX
    const bottomY = group.staff === 'bass' ? frame.bassBottomY : frame.trebleBottomY
    drawLedgerLines(svg, x, head.staffStep, bottomY, UNRESOLVED_INK)
    drawNotehead(svg, head.pitch, group.staff, x, noteheadY(bottomY, head.staffStep), UNRESOLVED_INK)
  }
}

function drawEvent(
  svg: SVGSVGElement,
  frame: { trebleBottomY: number; bassBottomY: number },
  group: PlacedEvent,
  anchorX: number,
): void {
  const bottomY = group.event.staff === 'bass' ? frame.bassBottomY : frame.trebleBottomY
  if (durationHasStem(group.event.duration.base)) {
    const stem = stemGeometry({
      direction: group.direction,
      noteheadRadiusX: NOTE_RX,
      heads: group.heads.map((head) => ({
        x: anchorX + head.offsetX,
        y: noteheadY(bottomY, head.staffStep),
        staffStep: head.staffStep,
        displaced: head.displaced,
      })),
    })
    const tick = group.heads[0]?.pitch.startTick
    if (stem !== undefined && tick !== undefined) {
      appendStem(svg, stem, INK, { staff: group.event.staff, startTick: tick })
    }
  }
  for (const head of group.heads) {
    drawPitch(svg, frame, group.event, head.pitch, anchorX + head.offsetX)
  }
  for (const dot of group.dots) {
    appendDot(svg, { x: anchorX + dot.offsetX, y: noteheadY(bottomY, dot.staffStep) }, INK, {
      staff: group.event.staff,
      startTick: dot.startTick,
      midi: dot.midi,
    })
  }
}

function drawPitch(
  svg: SVGSVGElement,
  frame: { trebleBottomY: number; bassBottomY: number },
  event: StaffEvent,
  pitch: MeasurePitch,
  x: number,
): void {
  const bottomY = event.staff === 'bass' ? frame.bassBottomY : frame.trebleBottomY
  const bottomDiatonic = event.staff === 'bass' ? BASS_BOTTOM_DIATONIC : TREBLE_BOTTOM_DIATONIC
  const step = pitchStaffStep(pitch.midi, bottomDiatonic)
  const y = noteheadY(bottomY, step)
  drawLedgerLines(svg, x, step, bottomY, INK)
  drawNotehead(svg, pitch, event.staff, x, y, INK)
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
  frame: { trebleBottomY: number; bassBottomY: number },
  ties: readonly MeasureTie[],
  placed: ReturnType<typeof placeColumn>[],
  spacing: MeasureSpacing,
  staffLeft: number,
  staffRight: number,
): void {
  const anchors = tieAnchors(frame, placed, spacing)
  for (const tie of ties) {
    const from = anchorFor(anchors, tie, tie.fromStartTick)
    const to = anchorFor(anchors, tie, tie.toStartTick)
    const step = from?.staffStep ?? to?.staffStep ?? pitchStaffStep(tie.midi, tie.staff === 'bass' ? BASS_BOTTOM_DIATONIC : TREBLE_BOTTOM_DIATONIC)
    const side = tieSideForStep(step)
    const bottomY = tie.staff === 'bass' ? frame.bassBottomY : frame.trebleBottomY
    const openY = tieAttachmentY(noteheadY(bottomY, step), side, NOTE_RY)
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

function tieAnchors(
  frame: { trebleBottomY: number; bassBottomY: number },
  placed: ReturnType<typeof placeColumn>[],
  spacing: MeasureSpacing,
): TieAnchor[] {
  const anchors: TieAnchor[] = []
  for (const column of placed) {
    const anchorX = columnX(spacing, column.onset)
    for (const group of column.events) {
      const bottomY = group.event.staff === 'bass' ? frame.bassBottomY : frame.trebleBottomY
      for (const head of group.heads) {
        anchors.push({
          midi: head.pitch.midi,
          startTick: head.pitch.startTick,
          staff: group.event.staff,
          x: anchorX + head.offsetX,
          y: noteheadY(bottomY, head.staffStep),
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
