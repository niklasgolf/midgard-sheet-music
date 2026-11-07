import { MIDDLE_STAFF_STEP, type StemDirection } from './chord-offset.ts'
import type { TieRole } from '../interpretation/sustained-note.ts'

/**
 * Shared look of one musical tie.
 * Every piece of a split tie uses these numbers. A piece never looks at the
 * next measure's pixels or at the CSS gap between measure divs.
 */

/** Thickness of the filled curve, in pixels. */
export const TIE_THICKNESS = 3.5

/** How far the outer edge bows away from the notehead, in pixels. */
export const TIE_BOW = 9

/** Clear pixels between a curve end and the notehead edge. */
export const TIE_NOTE_GAP = 4

/** How far a partial curve stops inside its own staff edge. */
export const TIE_EDGE_INSET = 8

/** Room added before the first note when a tie arrives from the left of this measure. */
export const TIE_APPROACH = 36

/** Pixels between the notehead edge and the point where the curve meets it. */
export const TIE_HEAD_CLEARANCE = 2

export type TieCurve = {
  startX: number
  endX: number
  startY: number
  endY: number
  /** Control height of the outer edge. */
  outerY: number
  /** Control height of the inner edge. */
  innerY: number
  thickness: number
  bow: number
  side: StemDirection
}

/**
 * Below the middle line the stem goes up, so the tie bows down.
 * On or above the middle line the stem goes down, so the tie bows up.
 * A note that is tied by itself uses this side, so both measures of a split tie agree.
 */
export function tieSideForStep(staffStep: number): StemDirection {
  return staffStep < MIDDLE_STAFF_STEP ? 1 : -1
}

export type TiedOnset = {
  staff: string
  staffStep: number
  fromStartTick?: number
  toStartTick?: number
}

/**
 * Staff steps of the tied notes that share this tie's onset and staff.
 * A continuation, which has neither written onset in this measure, stands alone.
 */
export function tiedGroupSteps(index: number, onsets: readonly TiedOnset[]): number[] {
  const tie = onsets[index]
  if (tie === undefined) return []
  const ticks = [tie.fromStartTick, tie.toStartTick].filter((tick): tick is number => tick !== undefined)
  if (ticks.length === 0) return [tie.staffStep]
  return onsets
    .filter(
      (other) =>
        other.staff === tie.staff &&
        ticks.some((tick) => tick === other.fromStartTick || tick === other.toStartTick),
    )
    .map((other) => other.staffStep)
}

/**
 * Direction for one tie among the notes tied at the same onset.
 * One tied note keeps the middle-line side. Two or more put the lowest curve
 * below the chord and the highest curve above it, so the bows do not stack
 * on one side of the noteheads.
 */
export function tieSideForChord(staffStep: number, groupSteps: readonly number[]): StemDirection {
  const ordered = [...groupSteps].sort((left, right) => left - right)
  const lowest = ordered[0]
  const highest = ordered[ordered.length - 1]
  if (ordered.length < 2 || lowest === undefined || highest === undefined || lowest === highest) {
    return tieSideForStep(staffStep)
  }
  if (staffStep <= lowest) return 1
  if (staffStep >= highest) return -1
  const distanceBelow = staffStep - lowest
  const distanceAbove = highest - staffStep
  if (distanceBelow < distanceAbove) return -1
  if (distanceAbove < distanceBelow) return 1
  return tieSideForStep(staffStep)
}

/** The point where a tie meets a notehead, on the bow side. */
export function tieAttachmentY(headY: number, side: StemDirection, noteRadiusY: number): number {
  return headY + side * (noteRadiusY + TIE_HEAD_CLEARANCE)
}

/**
 * Horizontal ends of the curve drawn in this measure.
 * Partial ties stop at this measure's staff edges. They do not use another measure's x.
 */
export function tieEndpoints(options: {
  role: TieRole
  staffLeft: number
  staffRight: number
  noteRadiusX: number
  fromX?: number
  toX?: number
}): { startX: number; endX: number } | undefined {
  const leftEdge = options.staffLeft + TIE_EDGE_INSET
  const rightEdge = options.staffRight - TIE_EDGE_INSET
  if (options.role === 'continuation') return { startX: leftEdge, endX: rightEdge }
  if (options.role === 'outgoing') {
    if (options.fromX === undefined) return undefined
    return { startX: options.fromX + options.noteRadiusX + TIE_NOTE_GAP, endX: rightEdge }
  }
  if (options.role === 'incoming') {
    if (options.toX === undefined) return undefined
    return { startX: leftEdge, endX: options.toX - options.noteRadiusX - TIE_NOTE_GAP }
  }
  if (options.fromX === undefined || options.toX === undefined) return undefined
  return {
    startX: options.fromX + options.noteRadiusX + TIE_NOTE_GAP,
    endX: options.toX - options.noteRadiusX - TIE_NOTE_GAP,
  }
}

/** One banana-shaped curve. Both edges bow the same way and meet at the ends. */
export function tieCurve(options: {
  startX: number
  endX: number
  startY: number
  endY: number
  side: StemDirection
}): TieCurve {
  const midY = (options.startY + options.endY) / 2
  return {
    startX: options.startX,
    endX: options.endX,
    startY: options.startY,
    endY: options.endY,
    outerY: midY + options.side * TIE_BOW,
    innerY: midY + options.side * (TIE_BOW - TIE_THICKNESS),
    thickness: TIE_THICKNESS,
    bow: TIE_BOW,
    side: options.side,
  }
}

/** Closed path for the filled curve. The control x stays between the ends. */
export function tiePath(curve: TieCurve): string {
  const midX = (curve.startX + curve.endX) / 2
  return `M ${px(curve.startX)} ${px(curve.startY)} Q ${px(midX)} ${px(curve.outerY)} ${px(curve.endX)} ${px(curve.endY)} Q ${px(midX)} ${px(curve.innerY)} ${px(curve.startX)} ${px(curve.startY)} Z`
}

export function tieExtentY(curve: TieCurve): { min: number; max: number } {
  const ys = [curve.startY, curve.endY, curve.outerY, curve.innerY]
  return { min: Math.min(...ys), max: Math.max(...ys) }
}

function px(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return String(rounded)
}
