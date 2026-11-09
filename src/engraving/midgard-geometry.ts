import { STAFF_SPACE, STAFF_STEP } from './geometry.ts'

/** The introduction and the measure staff share these distances. */
export const MIDGARD_SPACE = STAFF_SPACE
export const MIDGARD_STROKE = 1.25
export const MIDGARD_PINK = '#FEEFEE'
export const MIDGARD_BLUE = '#ECF3FD'
export const MIDGARD_LINE = '#000000'
/** Measure staff and ledger lines. The introduction keeps MIDGARD_LINE. */
export const MIDGARD_MEASURE_LINE = '#888888'
/** Margin wash behind the measure staff. It is not a musical rest. */
export const MIDGARD_MARGIN_FILL = 'rgba(128, 128, 128, 0.10)'
/** Pickup time zero. This is not a barline. */
export const MIDGARD_TIME_ZERO = '#6BCB8C'

const LINES_PER_ZONE = 4
const ZONE_SPACES = LINES_PER_ZONE - 1
const GAP_SPACES = 3
const PAIR_SPACES = ZONE_SPACES + GAP_SPACES + ZONE_SPACES
const PAIR_COUNT = 3
const WIDTH_SPACES = 25

export const MIDGARD_GROUP_COUNT = PAIR_COUNT * 2

/** Top group to bottom group: pink, pink, blue, blue, pink, pink. */
export const MIDGARD_GROUP_COLORS = [
  MIDGARD_PINK,
  MIDGARD_PINK,
  MIDGARD_BLUE,
  MIDGARD_BLUE,
  MIDGARD_PINK,
  MIDGARD_PINK,
] as const

export const MIDGARD_STAFF_WIDTH = WIDTH_SPACES * MIDGARD_SPACE + MIDGARD_STROKE
export const MIDGARD_STAFF_HEIGHT =
  (PAIR_COUNT * PAIR_SPACES + (PAIR_COUNT - 1) * GAP_SPACES) * MIDGARD_SPACE + MIDGARD_STROKE

/** Top line of a colored pair. Pair 0 is the uppermost pair. */
export function midgardPairTop(index: number): number {
  return MIDGARD_STROKE / 2 + index * (PAIR_SPACES + GAP_SPACES) * MIDGARD_SPACE
}

/** Top line of one four-line group. Group 0 is the uppermost group. */
export function midgardGroupTop(index: number): number {
  const pair = Math.floor(index / 2)
  const lower = index % 2 === 1
  return midgardPairTop(pair) + (lower ? (ZONE_SPACES + GAP_SPACES) * MIDGARD_SPACE : 0)
}

/** Four line centers, top to bottom. */
export function midgardGroupLines(index: number): number[] {
  const top = midgardGroupTop(index)
  return [0, 1, 2, 3].map((line) => top + line * MIDGARD_SPACE)
}

/**
 * Vertical center of a MIDI pitch.
 * C4 (MIDI 60) sits where the introduction places it.
 * Each semitone is one diatonic step, half a staff space.
 * Enharmonic spellings share a MIDI number, so they share this height.
 */
export function midgardNoteY(midi: number): number {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
    throw new Error(`MIDI note ${midi} is outside 0–127.`)
  }
  const middleC = MIDGARD_STROKE / 2 + 17.5 * MIDGARD_SPACE
  return middleC - (midi - 60) * STAFF_STEP
}

/**
 * Short ledger lines for the gap below a four-line group.
 * The introduction places C beneath a pair of lines, D between that pair,
 * and the chromatic notes on the lines themselves:
 * C♯ on the lower line, D♯ on the upper line.
 * E through B, and the sharps between the group’s own lines, need none.
 */
export function midgardLedgerYs(midi: number): number[] {
  const y = midgardNoteY(midi)
  const pitchClass = midi % 12
  if (pitchClass === 0) return [y - STAFF_STEP, y - 3 * STAFF_STEP]
  if (pitchClass === 1 || pitchClass === 3) return [y]
  if (pitchClass === 2) return [y - STAFF_STEP, y + STAFF_STEP]
  return []
}
