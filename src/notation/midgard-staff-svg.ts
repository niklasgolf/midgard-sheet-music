import { STAFF_SPACE } from '../engraving/geometry.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Same center-to-center distance as a classical staff line. */
const SPACE = STAFF_SPACE
/** Matches the classical staff stroke, so the two systems share one scale. */
const STROKE = 1.25
/** The reference staff is 25 spaces from border to border. */
const WIDTH_SPACES = 25
const LINES_PER_ZONE = 4
const ZONE_SPACES = LINES_PER_ZONE - 1
/** Each white gap is three staff spaces, inside a frame and between frames. */
const GAP_SPACES = 3
const PAIR_SPACES = ZONE_SPACES + GAP_SPACES + ZONE_SPACES
const PINK = '#FEEFEE'
const BLUE = '#ECF3FD'
const LINE_INK = '#000000'
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

const STAFF_WIDTH = WIDTH_SPACES * SPACE + STROKE
const STAFF_HEIGHT = (ZONE_PAIRS.length * PAIR_SPACES + (ZONE_PAIRS.length - 1) * GAP_SPACES) * SPACE + STROKE

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
  appendTestNotes(svg, bottomGap, noteOffset, options.octave, options.highlightMiddleC === true)
  return svg
}

/** Six staff spaces up from the left-hand notes. Twelve was twice this distance. */
function rightHandNoteOffset(): number {
  return -6 * SPACE
}

/** Puts the experimental staffs into the preview. It does not read a Song. */
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
  return STROKE / 2 + index * (PAIR_SPACES + GAP_SPACES) * SPACE
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
  bottomGap: number,
  noteOffset: number,
  octave: number,
  highlightMiddleC: boolean,
): void {
  const yByIndex = [
    bottomGap + 2 * SPACE + SPACE / 2,
    bottomGap + 1.5 * SPACE,
    bottomGap + SPACE / 2,
    bottomGap,
    bottomGap - SPACE,
    bottomGap - 2 * SPACE,
    bottomGap - 3 * SPACE,
  ]
  for (let index = 0; index < TEST_NOTE_COUNT; index += 1) {
    const y = yByIndex[index] + noteOffset
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
