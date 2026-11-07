import {
  compareFractions,
  fractionKey,
  fractionToNumber,
  subtractFractions,
  type Fraction,
} from '../interpretation/duration.ts'

import type { NoteheadExtent } from './chord-offset.ts'

/**
 * Horizontal room for one measure.
 *
 * Each written onset is one column, shared by both staves. The gap from one
 * column to the next keeps the facing noteheads apart, then adds room for the
 * written time between them. A notehead shifted sideways, or an augmentation
 * dot beyond it, widens that minimum through the column's right extent.
 * This is not a MIDI timeline and not VexFlow's softmax spacing.
 */

/** Clear pixels kept between the facing edges of neighboring columns. */
export const NOTEHEAD_EDGE_GAP = 16

/** Extra distance for each written quarter between two columns, in pixels. */
export const PIXELS_PER_QUARTER = 48

/** Room after the last column before the measure's right padding, in pixels. */
export const MIN_TRAILING_SPACE = 24

const DEFAULT_NOTEHEAD_WIDTH = 16

export type SpacedColumn = {
  onset: Fraction
  x: number
}

export type MeasureSpacing = {
  columns: SpacedColumn[]
  /** Right edge of the time that belongs to the last onset. */
  contentRight: number
}

export function spaceColumns(options: {
  onsets: readonly Fraction[]
  measureQuarters: Fraction
  originX: number
  extents?: ReadonlyMap<string, NoteheadExtent>
  noteheadWidth?: number
}): MeasureSpacing {
  const noteheadWidth = options.noteheadWidth ?? DEFAULT_NOTEHEAD_WIDTH
  const onsets = uniqueOnsets(options.onsets)
  if (onsets.length === 0) {
    return {
      columns: [],
      contentRight: options.originX + trailingSpace(options.measureQuarters),
    }
  }

  const first = onsets[0]
  const firstExtent = extentFor(options.extents, first, noteheadWidth)
  const leftOverflow = Math.max(0, firstExtent.left - noteheadWidth / 2)
  const columns: SpacedColumn[] = []
  let x = options.originX + leftOverflow
  for (let index = 0; index < onsets.length; index += 1) {
    const onset = onsets[index]
    if (onset === undefined) continue
    columns.push({ onset, x })
    const next = onsets[index + 1]
    if (next !== undefined) x += columnGap(onset, next, options.extents, noteheadWidth)
  }

  const last = columns[columns.length - 1]
  if (last === undefined) {
    return { columns, contentRight: options.originX }
  }
  const remaining = subtractFractions(options.measureQuarters, last.onset)
  const lastExtent = extentFor(options.extents, last.onset, noteheadWidth)
  return {
    columns,
    contentRight: last.x + Math.max(trailingSpace(remaining), lastExtent.right),
  }
}

export function columnX(spacing: MeasureSpacing, onset: Fraction): number {
  const column = spacing.columns.find((entry) => fractionKey(entry.onset) === fractionKey(onset))
  if (column === undefined) {
    throw new Error(`No horizontal column was spaced for onset ${fractionKey(onset)}.`)
  }
  return column.x
}

function columnGap(
  onset: Fraction,
  next: Fraction,
  extents: ReadonlyMap<string, NoteheadExtent> | undefined,
  noteheadWidth: number,
): number {
  const delta = fractionToNumber(subtractFractions(next, onset))
  if (delta <= 0) {
    throw new Error('Rhythmic columns must be spaced in onset order.')
  }
  const previous = extentFor(extents, onset, noteheadWidth)
  const following = extentFor(extents, next, noteheadWidth)
  return previous.right + following.left + NOTEHEAD_EDGE_GAP + delta * PIXELS_PER_QUARTER
}

function extentFor(
  extents: ReadonlyMap<string, NoteheadExtent> | undefined,
  onset: Fraction | undefined,
  noteheadWidth: number,
): NoteheadExtent {
  if (onset === undefined) return { left: noteheadWidth / 2, right: noteheadWidth / 2 }
  return extents?.get(fractionKey(onset)) ?? { left: noteheadWidth / 2, right: noteheadWidth / 2 }
}

function trailingSpace(remaining: Fraction): number {
  const quarters = Math.max(0, fractionToNumber(remaining))
  return Math.max(MIN_TRAILING_SPACE, quarters * PIXELS_PER_QUARTER)
}

function uniqueOnsets(onsets: readonly Fraction[]): Fraction[] {
  const seen = new Map<string, Fraction>()
  for (const onset of onsets) seen.set(fractionKey(onset), onset)
  return [...seen.values()].sort(compareFractions)
}
