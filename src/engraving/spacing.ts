import {
  compareFractions,
  fractionKey,
  fractionToNumber,
  subtractFractions,
  type Fraction,
} from '../interpretation/duration.ts'

/**
 * Horizontal room for one measure.
 *
 * Each written onset is one column, shared by both staves. The gap from one
 * column to the next is a minimum distance plus room for the written time
 * between them. Short notes keep the minimum, so they are not scaled down to
 * a sliver of the measure. This is not a MIDI timeline and not VexFlow's
 * softmax spacing.
 */

/** Minimum distance between the centers of two successive columns, in pixels. */
export const MIN_COLUMN_GAP = 32

/** Extra distance for each written quarter between two columns, in pixels. */
export const PIXELS_PER_QUARTER = 48

/** Room after the last column before the measure's right padding, in pixels. */
export const MIN_TRAILING_SPACE = 24

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
}): MeasureSpacing {
  const onsets = uniqueOnsets(options.onsets)
  if (onsets.length === 0) {
    return {
      columns: [],
      contentRight: options.originX + trailingSpace(options.measureQuarters),
    }
  }

  const columns: SpacedColumn[] = []
  let x = options.originX
  for (let index = 0; index < onsets.length; index += 1) {
    const onset = onsets[index]
    if (onset === undefined) continue
    columns.push({ onset, x })
    const next = onsets[index + 1]
    if (next !== undefined) x += columnGap(onset, next)
  }

  const last = columns[columns.length - 1]
  if (last === undefined) {
    return { columns, contentRight: options.originX }
  }
  const remaining = subtractFractions(options.measureQuarters, last.onset)
  return {
    columns,
    contentRight: last.x + trailingSpace(remaining),
  }
}

export function columnX(spacing: MeasureSpacing, onset: Fraction): number {
  const column = spacing.columns.find((entry) => fractionKey(entry.onset) === fractionKey(onset))
  if (column === undefined) {
    throw new Error(`No horizontal column was spaced for onset ${fractionKey(onset)}.`)
  }
  return column.x
}

function columnGap(onset: Fraction, next: Fraction): number {
  const delta = fractionToNumber(subtractFractions(next, onset))
  if (delta <= 0) {
    throw new Error('Rhythmic columns must be spaced in onset order.')
  }
  return MIN_COLUMN_GAP + delta * PIXELS_PER_QUARTER
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
