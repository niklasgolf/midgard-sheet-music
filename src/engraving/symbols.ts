/**
 * Stems for one chord.
 *
 * The length follows VexFlow: Tables.STEM_HEIGHT is 35 pixels when a staff
 * space is 10, which is three and a half spaces, one octave. The line starts
 * at the outer notehead and ends one octave past the inner notehead. If that
 * inner note is more than an octave from the middle line, the stem grows so
 * it still reaches the middle line. That is StaveNote.getStemExtension.
 *
 * A later beam or flag can lengthen or shorten the free end through
 * `extension`. Those symbols are not drawn here. VexFlow's Beam.drawStems
 * attaches to this same stem x, and a flag sits on the stem tip.
 */

import type { DurationBase } from '../interpretation/duration.ts'
import { MIDDLE_STAFF_STEP, noteheadExtent, STEM_DOWN, STEM_UP, type NoteheadExtent, type StemDirection } from './chord-offset.ts'
import { STAFF_SPACE, STAFF_STEP } from './geometry.ts'

const VEXFLOW_STAFF_SPACE = 10

/** Three and a half staff spaces. One octave. */
export const STEM_LENGTH = (35 / VEXFLOW_STAFF_SPACE) * STAFF_SPACE

/** VexFlow's stem is 1.5 pixels at a 10-pixel staff space. */
export const STEM_THICKNESS = (1.5 / VEXFLOW_STAFF_SPACE) * STAFF_SPACE

/**
 * How far the stem starts inside a notehead.
 * VexFlow's black notehead uses a 2-pixel tuck at a 10-pixel staff space.
 */
export const STEM_HEAD_INSET = (2 / VEXFLOW_STAFF_SPACE) * STAFF_SPACE

const OCTAVE_STEPS = 7

const SVG_NS = 'http://www.w3.org/2000/svg'

export function durationHasStem(base: DurationBase): boolean {
  return base !== 'whole'
}

export type StemHead = {
  /** Notehead center. */
  x: number
  /** Notehead center. A larger y is lower on the page. */
  y: number
  staffStep: number
  displaced: boolean
}

export type StemGeometry = {
  direction: StemDirection
  x: number
  /** End that meets the outer notehead. */
  baseY: number
  /** Free end. A beam or flag will attach here. */
  tipY: number
  thickness: number
}

export function stemGeometry(options: {
  heads: readonly StemHead[]
  direction: StemDirection
  noteheadRadiusX: number
  /** Extra length past the octave, for a future beam or flag. */
  extension?: number
}): StemGeometry | undefined {
  const heads = options.heads
  const first = heads[0]
  if (first === undefined) return undefined

  let lowest = first
  let highest = first
  for (const head of heads) {
    if (head.y > lowest.y) lowest = head
    if (head.y < highest.y) highest = head
  }

  const anchored = heads.filter((head) => !head.displaced)
  const side = anchored[0] ?? first
  const halfThickness = STEM_THICKNESS / 2
  const x =
    options.direction === STEM_UP
      ? side.x + options.noteheadRadiusX - halfThickness
      : side.x - options.noteheadRadiusX + halfThickness

  const extension = options.extension ?? 0
  if (options.direction === STEM_UP) {
    const pastOctave = MIDDLE_STAFF_STEP - highest.staffStep - OCTAVE_STEPS
    const reach = STEM_LENGTH + extension + (pastOctave > 0 ? pastOctave * STAFF_STEP : 0)
    return {
      direction: STEM_UP,
      x,
      baseY: lowest.y - STEM_HEAD_INSET,
      tipY: highest.y - reach,
      thickness: STEM_THICKNESS,
    }
  }

  const pastOctave = lowest.staffStep - MIDDLE_STAFF_STEP - OCTAVE_STEPS
  const reach = STEM_LENGTH + extension + (pastOctave > 0 ? pastOctave * STAFF_STEP : 0)
  return {
    direction: STEM_DOWN,
    x,
    baseY: highest.y + STEM_HEAD_INSET,
    tipY: lowest.y + reach,
    thickness: STEM_THICKNESS,
  }
}

/** VexFlow draws a dot with radius 2 at a 10-pixel staff space. */
export const DOT_RADIUS = (2 / VEXFLOW_STAFF_SPACE) * STAFF_SPACE

/**
 * Distance from the rightmost notehead edge to the dot's center.
 * VexFlow's draw places that center 5 pixels beyond the glyph at a 10-pixel staff space.
 */
export const DOT_CENTER_GAP = (5 / VEXFLOW_STAFF_SPACE) * STAFF_SPACE

/**
 * Extra distance between the centers of two dots that share a staff position.
 * VexFlow advances by the dot's width (5) plus one pixel of spacing.
 */
export const DOT_STACK_GAP = (6 / VEXFLOW_STAFF_SPACE) * STAFF_SPACE

export type AugmentationDot = {
  /** Center, in the same horizontal coordinates as the notehead centers. */
  x: number
  /** Staff step of the dot. A line note uses a neighboring space. */
  staffStep: number
}

/**
 * One dot beside each notehead.
 *
 * The walk follows VexFlow's Dot.format, from the highest note downward.
 * A note in a space keeps its dot at that height. A note on a line uses the
 * space above, unless that space already holds a dot or the note above it,
 * in which case the dot drops to the space below. Two dots that still share
 * a height are placed side by side. Every dot clears the rightmost notehead,
 * including one shifted sideways.
 */
export function placeAugmentationDots(
  heads: readonly { x: number; staffStep: number }[],
  noteheadRadiusX: number,
): AugmentationDot[] {
  const placed: AugmentationDot[] = heads.map((head) => ({ x: 0, staffStep: head.staffStep }))
  if (heads.length === 0) return placed

  let rightEdge = heads[0]?.x ?? 0
  for (const head of heads) rightEdge = Math.max(rightEdge, head.x + noteheadRadiusX)
  const firstX = rightEdge + DOT_CENTER_GAP

  const order = heads.map((head, index) => ({ head, index }))
  order.sort((left, right) => right.head.staffStep - left.head.staffStep || left.index - right.index)

  let previousHeadStep: number | undefined
  let previousDotStep: number | undefined
  const countAtStep = new Map<number, number>()

  for (const entry of order) {
    const step = entry.head.staffStep
    let dotStep = step
    if (previousHeadStep === step && previousDotStep !== undefined) {
      dotStep = previousDotStep
    } else if (step % 2 === 0) {
      const above = step + 1
      const noteOccupiesSpaceAbove = previousHeadStep !== undefined && previousHeadStep - step === 1
      dotStep = noteOccupiesSpaceAbove || previousDotStep === above ? step - 1 : above
    }

    const stacked = countAtStep.get(dotStep) ?? 0
    countAtStep.set(dotStep, stacked + 1)
    previousHeadStep = step
    previousDotStep = dotStep
    const dot = placed[entry.index]
    if (dot === undefined) continue
    dot.x = firstX + stacked * DOT_STACK_GAP
    dot.staffStep = dotStep
  }
  return placed
}

/** Notehead reach, widened on the right by any augmentation dots. */
export function extentWithDots(
  noteOffsets: readonly number[],
  noteheadWidth: number,
  dotCenters: readonly number[],
): NoteheadExtent {
  const extent = noteheadExtent(noteOffsets, noteheadWidth)
  let right = extent.right
  for (const center of dotCenters) right = Math.max(right, center + DOT_RADIUS)
  return { left: extent.left, right }
}

export function appendDot(
  svg: SVGSVGElement,
  dot: { x: number; y: number },
  color: string,
  attrs: { staff: string; startTick: number; midi: number },
): SVGCircleElement {
  const circle = document.createElementNS(SVG_NS, 'circle')
  circle.setAttribute('cx', String(dot.x))
  circle.setAttribute('cy', String(dot.y))
  circle.setAttribute('r', String(Math.round(DOT_RADIUS * 1000) / 1000))
  circle.setAttribute('fill', color)
  circle.setAttribute('data-dot', 'augmentation')
  circle.setAttribute('data-staff', attrs.staff)
  circle.setAttribute('data-start-tick', String(attrs.startTick))
  circle.setAttribute('data-midi', String(attrs.midi))
  svg.append(circle)
  return circle
}

export function appendStem(
  svg: SVGSVGElement,
  stem: StemGeometry,
  color: string,
  attrs: { staff: string; startTick: number },
): SVGLineElement {
  const line = document.createElementNS(SVG_NS, 'line')
  line.setAttribute('x1', String(stem.x))
  line.setAttribute('x2', String(stem.x))
  line.setAttribute('y1', String(stem.baseY))
  line.setAttribute('y2', String(stem.tipY))
  line.setAttribute('stroke', color)
  line.setAttribute('stroke-width', String(stem.thickness))
  line.setAttribute('stroke-linecap', 'butt')
  line.setAttribute('data-stem', stem.direction === STEM_UP ? 'up' : 'down')
  line.setAttribute('data-staff', attrs.staff)
  line.setAttribute('data-start-tick', String(attrs.startTick))
  svg.append(line)
  return line
}
