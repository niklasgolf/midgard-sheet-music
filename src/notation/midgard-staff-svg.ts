import {
  MIDGARD_BLUE,
  MIDGARD_LINE,
  MIDGARD_PINK,
  MIDGARD_SPACE,
  MIDGARD_STAFF_HEIGHT,
  MIDGARD_STAFF_WIDTH,
  MIDGARD_STROKE,
  MIDGARD_TIME_ZERO,
  midgardGroupLines,
  midgardGroupTop,
  midgardNoteY,
  midgardPairTop,
  MIDGARD_GROUP_COLORS,
  MIDGARD_GROUP_COUNT,
} from '../engraving/midgard-geometry.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Same center-to-center distance as a classical staff line. */
const SPACE = MIDGARD_SPACE
/** Matches the classical staff stroke, so the two systems share one scale. */
const STROKE = MIDGARD_STROKE
const WIDTH_SPACES = 25
const LINES_PER_ZONE = 4
const ZONE_SPACES = LINES_PER_ZONE - 1
/** Each white gap is three staff spaces, inside a frame and between frames. */
const GAP_SPACES = 3
const PAIR_SPACES = ZONE_SPACES + GAP_SPACES + ZONE_SPACES
const PINK = MIDGARD_PINK
const BLUE = MIDGARD_BLUE
const LINE_INK = MIDGARD_LINE
/** Filled ellipse, the same size and color as a classical notehead. */
const NOTE_RX = 8
const NOTE_RY = 5.5
const NOTE_INK = '#2a1a0e'
const MIDDLE_C_GREEN = '#1B7A45'
const NOTE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const
const TEST_NOTE_COUNT = NOTE_NAMES.length

const ZONE_PAIRS = [
  [PINK, PINK],
  [BLUE, BLUE],
  [PINK, PINK],
] as const

const STAFF_WIDTH = MIDGARD_STAFF_WIDTH
const STAFF_HEIGHT = MIDGARD_STAFF_HEIGHT

/**
 * One experimental midGard staff. The proportions come from public/midgard-staff.png,
 * measured in classical staff spaces. The seven noteheads are visual tests only.
 */
export function midgardStaffSvg(options: { noteOffset?: number; octave: number; highlightMiddleC?: boolean }): SVGSVGElement {
  const noteOffset = options.noteOffset ?? 0
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${STAFF_WIDTH} ${STAFF_HEIGHT}`)
  svg.setAttribute('width', String(STAFF_WIDTH))
  svg.setAttribute('height', String(STAFF_HEIGHT))
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', `midGard staff, C${options.octave} through B${options.octave}`)
  appendRect(svg, 0, 0, STAFF_WIDTH, STAFF_HEIGHT, '#ffffff')

  ZONE_PAIRS.forEach(([upper, lower], index) => {
    const top = pairTop(index)
    appendZone(svg, top, upper)
    appendZone(svg, top + (ZONE_SPACES + GAP_SPACES) * SPACE, lower)
    appendRule(svg, 0, top - STROKE / 2, STROKE, PAIR_SPACES * SPACE + STROKE)
    appendRule(svg, STAFF_WIDTH - STROKE, top - STROKE / 2, STROKE, PAIR_SPACES * SPACE + STROKE)
  })

  const bottomGap = pairTop(1) + PAIR_SPACES * SPACE
  appendLedgerPair(svg, pairTop(1) + ZONE_SPACES * SPACE, STROKE / 2 + SPACE)
  appendLedgerPair(svg, bottomGap + noteOffset, STROKE / 2 + SPACE)
  appendLedgerPair(svg, bottomGap + noteOffset, testNoteX(1) - SPACE)
  appendTestNotes(svg, noteOffset, options.octave, options.highlightMiddleC === true)
  return svg
}

/** Six staff spaces up from the left-hand notes. Twelve was twice this distance. */
function rightHandNoteOffset(): number {
  return -6 * SPACE
}

/** Puts the introduction staffs into Choose a Song. It does not read a Song. */
export function mountMidgardStaff(container: HTMLElement): void {
  container.replaceChildren(
    staffCopy({ octave: 3 }),
    staffCopy({ octave: 4, noteOffset: rightHandNoteOffset(), highlightMiddleC: true }),
  )
}

function staffCopy(options: { octave: number; noteOffset?: number; highlightMiddleC?: boolean }): HTMLDivElement {
  const copy = document.createElement('div')
  copy.className = 'midgard-staff__copy'
  copy.append(midgardStaffSvg(options))
  return copy
}

function pairTop(index: number): number {
  return midgardPairTop(index)
}

function appendZone(svg: SVGSVGElement, top: number, color: string): void {
  for (let band = 0; band < ZONE_SPACES; band += 1) {
    appendRect(svg, STROKE, top + band * SPACE + STROKE / 2, WIDTH_SPACES * SPACE - STROKE, SPACE - STROKE, color)
  }
  for (let line = 0; line < LINES_PER_ZONE; line += 1) {
    appendRule(svg, 0, top + line * SPACE - STROKE / 2, STAFF_WIDTH, STROKE)
  }
}

/** Two short lines that split a three-space gap into equal staff spaces. */
function appendLedgerPair(svg: SVGSVGElement, gapTop: number, x: number): void {
  for (const step of [1, 2]) {
    const y = gapTop + step * SPACE
    const line = document.createElementNS(SVG_NS, 'line')
    line.setAttribute('x1', String(x))
    line.setAttribute('x2', String(x + 2 * SPACE))
    line.setAttribute('y1', String(y))
    line.setAttribute('y2', String(y))
    line.setAttribute('stroke', LINE_INK)
    line.setAttribute('stroke-width', String(STROKE))
    svg.append(line)
  }
}

/** Sits the label in the open space directly above the notehead. */
function labelBaseline(noteX: number, noteY: number, noteOffset: number): number {
  const lines = lineCentersNear(noteX, noteOffset)
  const baseline = noteY - NOTE_RY - 2
  const blocking = lines.filter((line) => line < baseline + 1 && line > baseline - 8)
  if (blocking.length === 0) return baseline
  return Math.min(...blocking) - 3
}

function lineCentersNear(noteX: number, noteOffset: number): number[] {
  const lines: number[] = []
  for (let pair = 0; pair < ZONE_PAIRS.length; pair += 1) {
    const top = pairTop(pair)
    for (const step of [0, 1, 2, 3, 6, 7, 8, 9]) lines.push(top + step * SPACE)
  }
  const labelLeft = noteX - 8
  const labelRight = noteX + 8
  const ledgerAt = (gapTop: number, x: number): void => {
    if (x + 2 * SPACE < labelLeft || x > labelRight) return
    lines.push(gapTop + SPACE, gapTop + 2 * SPACE)
  }
  ledgerAt(pairTop(1) + ZONE_SPACES * SPACE, STROKE / 2 + SPACE)
  const noteGap = pairTop(1) + PAIR_SPACES * SPACE + noteOffset
  ledgerAt(noteGap, STROKE / 2 + SPACE)
  ledgerAt(noteGap, testNoteX(1) - SPACE)
  return lines
}

function testNoteX(index: number): number {
  const first = STROKE / 2 + SPACE
  const last = STAFF_WIDTH - STROKE / 2 - SPACE
  return first + (index * (last - first)) / (TEST_NOTE_COUNT - 1)
}

function appendTestNotes(
  svg: SVGSVGElement,
  noteOffset: number,
  octave: number,
  highlightMiddleC: boolean,
): void {
  const semitones = [0, 2, 4, 5, 7, 9, 11]
  for (let index = 0; index < TEST_NOTE_COUNT; index += 1) {
    const y = midgardNoteY(48 + (semitones[index] ?? 0)) + noteOffset
    const name = `${NOTE_NAMES[index]}${octave}`
    const ink = highlightMiddleC && name === 'C4' ? MIDDLE_C_GREEN : NOTE_INK
    const x = testNoteX(index)
    const head = document.createElementNS(SVG_NS, 'ellipse')
    head.setAttribute('cx', String(x))
    head.setAttribute('cy', String(y))
    head.setAttribute('rx', String(NOTE_RX))
    head.setAttribute('ry', String(NOTE_RY))
    head.setAttribute('fill', ink)
    svg.append(head)

    const label = document.createElementNS(SVG_NS, 'text')
    label.setAttribute('x', String(x))
    label.setAttribute('y', String(labelBaseline(x, y, noteOffset)))
    label.setAttribute('text-anchor', 'middle')
    label.setAttribute('fill', ink)
    label.setAttribute('font-family', "Palatino, 'Palatino Linotype', Georgia, serif")
    label.setAttribute('font-size', '11')
    label.textContent = name
    svg.append(label)
  }
}

function appendRule(svg: SVGSVGElement, x: number, y: number, width: number, height: number): void {
  appendRect(svg, x, y, width, height, LINE_INK)
}

/** The six colored groups, stretched across one measure and not scaled vertically. */
export function drawMidgardMeasureStaff(
  svg: SVGSVGElement,
  x1: number,
  x2: number,
  options?: { line?: string; margins?: { width: number; fill: string } },
): void {
  const lineColor = options?.line ?? LINE_INK
  for (let index = 0; index < MIDGARD_GROUP_COUNT; index += 1) {
    const lines = midgardGroupLines(index)
    const color = MIDGARD_GROUP_COLORS[index] ?? MIDGARD_PINK
    for (let band = 0; band < lines.length - 1; band += 1) {
      const upper = lines[band]
      const lower = lines[band + 1]
      if (upper === undefined || lower === undefined) continue
      appendRect(svg, x1, upper + STROKE / 2, x2 - x1, lower - upper - STROKE, color)
    }
  }
  const margins = options?.margins
  if (margins !== undefined) {
    const top = midgardGroupTop(0)
    const bottom = midgardStaffBottom()
    appendMargin(svg, x1, top, margins.width, bottom - top, margins.fill, 'left')
    appendMargin(svg, x2 - margins.width, top, margins.width, bottom - top, margins.fill, 'right')
  }
  for (let index = 0; index < MIDGARD_GROUP_COUNT; index += 1) {
    for (const y of midgardGroupLines(index)) appendStaffLine(svg, x1, x2, y, lineColor)
  }
}

/** The start of a pickup, drawn through the staff. It is not a barline. */
export function drawMidgardTimeZero(svg: SVGSVGElement, x: number, timelineTick: number): void {
  const line = document.createElementNS(SVG_NS, 'line')
  line.setAttribute('x1', String(x))
  line.setAttribute('x2', String(x))
  line.setAttribute('y1', String(midgardGroupTop(0)))
  line.setAttribute('y2', String(midgardStaffBottom()))
  line.setAttribute('stroke', MIDGARD_TIME_ZERO)
  line.setAttribute('stroke-width', '2')
  line.setAttribute('data-time-zero', 'true')
  line.setAttribute('data-time-tick', String(timelineTick))
  line.setAttribute('data-time-x', String(x))
  svg.append(line)
}

function midgardStaffBottom(): number {
  const lines = midgardGroupLines(MIDGARD_GROUP_COUNT - 1)
  return lines[lines.length - 1] ?? midgardGroupTop(0)
}

function appendStaffLine(svg: SVGSVGElement, x1: number, x2: number, y: number, lineColor: string): void {
  const line = document.createElementNS(SVG_NS, 'line')
  line.setAttribute('x1', String(x1))
  line.setAttribute('x2', String(x2))
  line.setAttribute('y1', String(y))
  line.setAttribute('y2', String(y))
  line.setAttribute('stroke', lineColor)
  line.setAttribute('stroke-width', String(STROKE))
  line.setAttribute('data-midgard-line', 'true')
  svg.append(line)
}

function appendMargin(
  svg: SVGSVGElement,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  side: 'left' | 'right',
): void {
  const rect = document.createElementNS(SVG_NS, 'rect')
  rect.setAttribute('x', String(x))
  rect.setAttribute('y', String(y))
  rect.setAttribute('width', String(width))
  rect.setAttribute('height', String(height))
  rect.setAttribute('fill', fill)
  rect.setAttribute('data-margin', side)
  svg.append(rect)
}

function appendRect(
  svg: SVGSVGElement,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
): void {
  const rect = document.createElementNS(SVG_NS, 'rect')
  rect.setAttribute('x', String(x))
  rect.setAttribute('y', String(y))
  rect.setAttribute('width', String(width))
  rect.setAttribute('height', String(height))
  rect.setAttribute('fill', fill)
  svg.append(rect)
}
