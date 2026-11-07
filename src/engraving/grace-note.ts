import type { NoteValue } from '../song/song.ts'
import { STEM_UP, type StemDirection } from './chord-offset.ts'
import { STEM_THICKNESS, stemGeometry, type StemGeometry } from './symbols.ts'
import { TIE_BOW, TIE_HEAD_CLEARANCE, TIE_NOTE_GAP, TIE_THICKNESS, tieAttachmentY, tieCurve, tieExtentY, tiePath, type TieCurve } from './tie.ts'

/** VexFlow draws grace glyphs at two-thirds of a normal note. */
export const GRACE_SCALE = 0.66

/** Clear pixels between the grace notehead and the principal notehead. */
export const GRACE_CLEARANCE = 14

/** Clear pixels between two grace notes that share a principal attack. */
export const GRACE_GROUP_GAP = 8

export function graceRadii(noteRadiusX: number, noteRadiusY: number): { x: number; y: number } {
  return { x: noteRadiusX * GRACE_SCALE, y: noteRadiusY * GRACE_SCALE }
}

/** How many flags the ornamental value uses. A quarter or longer grace note has none. */
export function graceFlagCount(written: NoteValue): number {
  if (written === 'sixteenth') return 2
  if (written === 'eighth') return 1
  return 0
}

/**
 * Distance from the principal note's center to the left edge of its grace notes.
 * `closestFirst` is zero for the grace note nearest the principal.
 * The result is how far left of the column anchor the ink reaches when the
 * principal head itself is not shifted.
 */
export function graceInkLeft(count: number, noteRadiusX: number): number {
  if (count <= 0) return 0
  const graceRx = noteRadiusX * GRACE_SCALE
  return noteRadiusX + GRACE_CLEARANCE + count * graceRx * 2 + (count - 1) * GRACE_GROUP_GAP
}

/** Center of one grace note. Index 0 is the note nearest the principal head. */
export function graceCenterX(principalX: number, indexFromPrincipal: number, noteRadiusX: number): number {
  const graceRx = noteRadiusX * GRACE_SCALE
  const nearest = principalX - noteRadiusX - GRACE_CLEARANCE - graceRx
  return nearest - indexFromPrincipal * (graceRx * 2 + GRACE_GROUP_GAP)
}

export function graceStem(options: {
  headX: number
  headY: number
  staffStep: number
  noteRadiusX: number
  direction: StemDirection
}): StemGeometry | undefined {
  const full = stemGeometry({
    direction: options.direction,
    noteheadRadiusX: options.noteRadiusX * GRACE_SCALE,
    heads: [{ x: options.headX, y: options.headY, staffStep: options.staffStep, displaced: false }],
  })
  if (full === undefined) return undefined
  const reach = Math.abs(full.tipY - full.baseY) * GRACE_SCALE
  const tipY = options.direction === STEM_UP ? full.baseY - reach : full.baseY + reach
  return {
    direction: options.direction,
    x: full.x,
    baseY: full.baseY,
    tipY,
    thickness: STEM_THICKNESS * GRACE_SCALE,
  }
}

/** Filled eighth-note flag hanging from a stem tip. `index` stacks a second flag below the first. */
export function graceFlagPath(options: {
  tipX: number
  tipY: number
  direction: StemDirection
  index: number
}): { d: string; minX: number; maxX: number; minY: number; maxY: number } {
  const width = 11 * GRACE_SCALE
  const height = 18 * GRACE_SCALE
  const drop = options.index * 8 * GRACE_SCALE
  const sign = options.direction === STEM_UP ? 1 : -1
  const x = options.tipX
  const y = options.tipY + sign * drop
  const endY = y + sign * height
  const outerX = x + width
  const d = [
    `M ${px(x)} ${px(y)}`,
    `C ${px(outerX)} ${px(y + sign * height * 0.2)}, ${px(outerX)} ${px(y + sign * height * 0.62)}, ${px(x + width * 0.2)} ${px(endY)}`,
    `C ${px(x + width * 0.55)} ${px(y + sign * height * 0.68)}, ${px(x + width * 0.25)} ${px(y + sign * height * 0.38)}, ${px(x)} ${px(y + sign * height * 0.45)}`,
    'Z',
  ].join(' ')
  const ys = [y, endY, y + sign * height * 0.2, y + sign * height * 0.68]
  return {
    d,
    minX: x,
    maxX: outerX,
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

/** A straight slash across the stem. Drawn only when the reading asks for one. */
export function graceSlashLine(stem: StemGeometry): { x1: number; y1: number; x2: number; y2: number } {
  const midY = (stem.baseY + stem.tipY) / 2
  const rise = 8 * GRACE_SCALE
  const run = 9 * GRACE_SCALE
  return {
    x1: stem.x - run,
    y1: midY + rise,
    x2: stem.x + run,
    y2: midY - rise,
  }
}

/**
 * Short slur from a grace note to its principal note.
 * The curve is the shared tie shape at grace scale. It does not join durations.
 */
export function graceSlur(options: {
  graceX: number
  graceY: number
  graceRadiusX: number
  graceRadiusY: number
  principalX: number
  principalY: number
  principalRadiusX: number
  principalRadiusY: number
}): TieCurve | undefined {
  const startX = options.graceX + options.graceRadiusX + TIE_HEAD_CLEARANCE
  const endX = options.principalX - options.principalRadiusX - TIE_NOTE_GAP
  if (endX <= startX) return undefined
  const startY = tieAttachmentY(options.graceY, 1, options.graceRadiusY)
  const endY = tieAttachmentY(options.principalY, 1, options.principalRadiusY)
  return tieCurve({
    startX,
    endX,
    startY,
    endY,
    side: 1,
    bow: TIE_BOW * GRACE_SCALE,
    thickness: TIE_THICKNESS * GRACE_SCALE,
  })
}

export function graceSlurPath(curve: TieCurve): { d: string; min: number; max: number } {
  const extent = tieExtentY(curve)
  return { d: tiePath(curve), min: extent.min, max: extent.max }
}

function px(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return String(rounded)
}
