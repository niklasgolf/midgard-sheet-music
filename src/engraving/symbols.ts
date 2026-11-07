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
import { MIDDLE_STAFF_STEP, STEM_DOWN, STEM_UP, type StemDirection } from './chord-offset.ts'
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
