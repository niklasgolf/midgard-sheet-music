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
import { defaultStemDirection, placeChordNoteheads, type StemDirection } from '../engraving/chord-offset.ts'
import { appendDot, appendStem, durationHasStem, extentWithDots, placeAugmentationDots, stemGeometry } from '../engraving/symbols.ts'
import { fractionKey } from '../interpretation/duration.ts'
import { columnX, spaceColumns } from '../engraving/spacing.ts'
import type { MeasureContent, MeasurePitch, RhythmicColumn, StaffEvent } from '../interpretation/measure-content.ts'
import { pitchCount } from '../interpretation/measure-content.ts'
import type { PianoStaff } from '../interpretation/staff.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'

const STAFF_INSET = 16
const NOTE_AREA_LEFT = 40
const NOTE_AREA_RIGHT = 32
const NOTE_RX = 8
const NOTE_RY = 5.5
const INK = '#2a1a0e'

const NOTEHEAD_WIDTH = NOTE_RX * 2

export function measureSvg(options: {
  label: string
  content: Extract<MeasureContent, { ready: true }>
}): SVGSVGElement {
  const placed = options.content.columns.map((column) => placeColumn(column))
  const extents = new Map(placed.map((column) => [fractionKey(column.onset), column.extent]))
  const spacing = spaceColumns({
    onsets: options.content.columns.map((column) => column.onset),
    measureQuarters: options.content.measureQuarters,
    originX: NOTE_AREA_LEFT,
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
  svg.setAttribute('aria-label', `${options.label}, ${notes} notes`)

  drawStaff(svg, staffLeft, staffRight, frame.trebleBottomY)
  drawStaff(svg, staffLeft, staffRight, frame.bassBottomY)
  drawRightBarline(svg, staffRight, frame.trebleBottomY, frame.bassBottomY)

  for (const column of placed) {
    const anchorX = columnX(spacing, column.onset)
    for (const group of column.events) {
      drawEvent(svg, frame, group, anchorX)
    }
  }

  return svg
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
  drawLedgerLines(svg, x, step, bottomY)
  drawNotehead(svg, pitch, event.staff, x, y)
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

function drawLedgerLines(svg: SVGSVGElement, x: number, step: number, bottomY: number): void {
  for (const ledgerStep of ledgerSteps(step)) {
    const y = noteheadY(bottomY, ledgerStep)
    const line = document.createElementNS(SVG_NS, 'line')
    line.setAttribute('x1', String(x - STAFF_SPACE))
    line.setAttribute('x2', String(x + STAFF_SPACE))
    line.setAttribute('y1', String(y))
    line.setAttribute('y2', String(y))
    line.setAttribute('stroke', INK)
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
): void {
  const head = document.createElementNS(SVG_NS, 'ellipse')
  head.setAttribute('cx', String(x))
  head.setAttribute('cy', String(y))
  head.setAttribute('rx', String(NOTE_RX))
  head.setAttribute('ry', String(NOTE_RY))
  head.setAttribute('fill', INK)
  head.setAttribute('data-midi', String(pitch.midi))
  head.setAttribute('data-start-tick', String(pitch.startTick))
  head.setAttribute('data-staff', staff)
  svg.append(head)
}
