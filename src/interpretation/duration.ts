/**
 * Written durations measured in quarter notes.
 * A written quarter is the Song's ticks-per-written-quarter setting.
 * It is not the MIDI file's PPQ.
 */

/** A note this many MIDI ticks away from a written value is still that value. */
export const DURATION_TICK_TOLERANCE = 2

export type Fraction = {
  numerator: number
  denominator: number
}

export type DurationBase = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth'

export type WrittenDuration = {
  base: DurationBase
  dots: 0 | 1
  /** Length in written quarter notes. */
  quarters: Fraction
}

export type RecognizedDuration =
  | { recognized: true; duration: WrittenDuration }
  | { recognized: false; message: string }

export type RecognizedOnset =
  | { recognized: true; quarters: Fraction }
  | { recognized: false; message: string }

const BASES: readonly { base: DurationBase; quarters: Fraction }[] = [
  { base: 'whole', quarters: fraction(4, 1) },
  { base: 'half', quarters: fraction(2, 1) },
  { base: 'quarter', quarters: fraction(1, 1) },
  { base: 'eighth', quarters: fraction(1, 2) },
  { base: 'sixteenth', quarters: fraction(1, 4) },
]

/** One eighth of a written quarter. Dotted sixteenths land on this grid. */
const ONSET_DIVISIONS = 8

const WRITTEN_VALUES: readonly WrittenDuration[] = BASES.flatMap(({ base, quarters }) => [
  { base, dots: 0 as const, quarters },
  { base, dots: 1 as const, quarters: fraction(quarters.numerator * 3, quarters.denominator * 2) },
])

export function fraction(numerator: number, denominator: number): Fraction {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || denominator === 0) {
    throw new Error('A written fraction needs an integer numerator and a non-zero integer denominator.')
  }
  const sign = numerator < 0 ? -1 : 1
  const top = Math.abs(numerator)
  const bottom = Math.abs(denominator)
  const divisor = greatestCommonDivisor(top, bottom)
  return { numerator: sign * (top / divisor), denominator: bottom / divisor }
}

export function fractionKey(value: Fraction): string {
  return `${value.numerator}/${value.denominator}`
}

export function fractionToNumber(value: Fraction): number {
  return value.numerator / value.denominator
}

export function compareFractions(left: Fraction, right: Fraction): number {
  return left.numerator * right.denominator - right.numerator * left.denominator
}

export function subtractFractions(left: Fraction, right: Fraction): Fraction {
  return fraction(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  )
}

/** Turn an exact quarter count, such as a 3/4 bar, into a reduced fraction. */
export function fractionFromQuarters(quarters: number): Fraction {
  if (!Number.isFinite(quarters) || quarters <= 0) {
    throw new Error('A measure length must be a positive number of written quarters.')
  }
  const divisions = Math.round(quarters * ONSET_DIVISIONS)
  if (Math.abs(quarters * ONSET_DIVISIONS - divisions) > 1e-6) {
    throw new Error(`Measure length ${quarters} is not a multiple of a dotted sixteenth.`)
  }
  return fraction(divisions, ONSET_DIVISIONS)
}

export function durationName(duration: WrittenDuration): string {
  return duration.dots === 1 ? `dotted ${duration.base}` : duration.base
}

/**
 * Match a MIDI duration to a written value.
 * The match must fall within DURATION_TICK_TOLERANCE. A nearer value outside
 * that tolerance is reported and not used.
 */
export function interpretDuration(durationTicks: number, ticksPerWrittenQuarter: number): RecognizedDuration {
  const calibration = calibrationError(ticksPerWrittenQuarter)
  if (calibration !== undefined) return { recognized: false, message: calibration }
  if (!Number.isFinite(durationTicks) || durationTicks <= 0) {
    return {
      recognized: false,
      message: `A note lasting ${durationTicks} MIDI ticks has no positive duration to interpret.`,
    }
  }

  let closest: { duration: WrittenDuration; distance: number } | undefined
  let tie = false
  for (const duration of WRITTEN_VALUES) {
    const expectedTicks = fractionToNumber(duration.quarters) * ticksPerWrittenQuarter
    const distance = Math.abs(durationTicks - expectedTicks)
    if (closest === undefined || distance < closest.distance - 1e-9) {
      closest = { duration, distance }
      tie = false
    } else if (closest !== undefined && Math.abs(distance - closest.distance) <= 1e-9) {
      tie = true
    }
  }

  if (closest === undefined || tie || closest.distance > DURATION_TICK_TOLERANCE) {
    const nearest = closest === undefined ? '' : ` The nearest supported value is ${formatTicks(closest.distance)} ticks away and was not used.`
    const reason = tie
      ? ' Two supported values are equally close, so neither was chosen.'
      : nearest
    return {
      recognized: false,
      message: `A duration of ${durationTicks} MIDI ticks is not a whole, half, quarter, eighth, or sixteenth note, with or without one dot, at ${ticksPerWrittenQuarter} ticks per written quarter.${reason}`,
    }
  }

  return { recognized: true, duration: closest.duration }
}

/**
 * Match a tick offset from the start of a measure to a written onset.
 * Offsets about one tick away from the grid still land on that onset.
 */
export function interpretOnset(offsetTicks: number, ticksPerWrittenQuarter: number): RecognizedOnset {
  const calibration = calibrationError(ticksPerWrittenQuarter)
  if (calibration !== undefined) return { recognized: false, message: calibration }
  if (!Number.isFinite(offsetTicks)) {
    return { recognized: false, message: 'A note onset could not be read as a MIDI tick.' }
  }

  const divisions = Math.round((offsetTicks / ticksPerWrittenQuarter) * ONSET_DIVISIONS)
  const snappedTicks = (divisions / ONSET_DIVISIONS) * ticksPerWrittenQuarter
  const distance = Math.abs(offsetTicks - snappedTicks)
  if (divisions < 0 || distance > DURATION_TICK_TOLERANCE) {
    return {
      recognized: false,
      message: `An onset ${formatTicks(offsetTicks)} MIDI ticks into the measure is not on a written beat at ${ticksPerWrittenQuarter} ticks per written quarter. It was not moved to a nearby beat.`,
    }
  }

  return { recognized: true, quarters: fraction(divisions, ONSET_DIVISIONS) }
}

function calibrationError(ticksPerWrittenQuarter: number): string | undefined {
  if (Number.isFinite(ticksPerWrittenQuarter) && ticksPerWrittenQuarter > 0) return undefined
  return 'Ticks per written quarter must be a positive number. The MIDI file’s PPQ is not used as the written quarter.'
}

function formatTicks(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left
  let b = right
  while (b !== 0) {
    const remainder = a % b
    a = b
    b = remainder
  }
  return a
}
