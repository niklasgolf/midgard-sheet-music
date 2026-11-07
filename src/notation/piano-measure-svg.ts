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
import { staffForTrack, type PianoStaff } from '../interpretation/staff.ts'
import type { MidiNote } from '../midi/parse-midi.ts'
import type { TickSpan } from './written-measures.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'

const STAFF_INSET = 16
const NOTE_AREA_LEFT = 40
const NOTE_AREA_RIGHT = 32
const FULL_BAR_WIDTH = 250
const NOTE_RX = 8
const NOTE_RY = 5.5
const INK = '#2a1a0e'

export function measureSvg(options: {
  notes: readonly MidiNote[]
  staffByTrack: ReadonlyMap<number, PianoStaff>
  span: TickSpan
  spanQuarters: number
  barQuarters: number
  label: string
}): SVGSVGElement {
  const noteArea = Math.max(96, (options.spanQuarters / options.barQuarters) * FULL_BAR_WIDTH)
  const width = NOTE_AREA_LEFT + noteArea + NOTE_AREA_RIGHT
  const frame = grandStaffFrame()
  const staffLeft = STAFF_INSET
  const staffRight = width - STAFF_INSET

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${width} ${frame.height}`)
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(frame.height))
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', `${options.label}, ${options.notes.length} notes`)

  drawStaff(svg, staffLeft, staffRight, frame.trebleBottomY)
  drawStaff(svg, staffLeft, staffRight, frame.bassBottomY)
  drawRightBarline(svg, staffRight, frame.trebleBottomY, frame.bassBottomY)

  const duration = options.span.endTick - options.span.startTick
  for (const note of options.notes) {
    const staff = staffForTrack(options.staffByTrack, note.track)
    const bottomY = staff === 'bass' ? frame.bassBottomY : frame.trebleBottomY
    const bottomDiatonic = staff === 'bass' ? BASS_BOTTOM_DIATONIC : TREBLE_BOTTOM_DIATONIC
    const step = pitchStaffStep(note.midi, bottomDiatonic)
    const y = noteheadY(bottomY, step)
    const x = NOTE_AREA_LEFT + ((note.startTick - options.span.startTick) / duration) * noteArea
    drawLedgerLines(svg, x, step, bottomY)
    drawNotehead(svg, note, staff, x, y)
  }

  return svg
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
  note: MidiNote,
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
  head.setAttribute('data-midi', String(note.midi))
  head.setAttribute('data-start-tick', String(note.startTick))
  head.setAttribute('data-staff', staff)
  svg.append(head)
}
