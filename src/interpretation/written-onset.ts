import type { MusicalInterpretation, WrittenOnsetAlignment } from '../song/song.ts'

export type AlignedOnset =
  | { aligned: true; writtenOnsetTick: number; deviationTicks: number }
  | { aligned: false; reason: string }

/**
 * Move one performed attack onto the written grid when it is close enough.
 * The result is a tick. The MIDI event that supplied the attack is not part of this value.
 * Quarters that do not divide into equal integer steps are left unresolved.
 */
export function alignWrittenOnset(
  originalOnsetTick: number,
  writtenStartTick: number,
  ticksPerWrittenQuarter: number,
  alignment: WrittenOnsetAlignment,
): AlignedOnset {
  if (!Number.isInteger(originalOnsetTick) || !Number.isInteger(writtenStartTick) || writtenStartTick < 0) {
    return { aligned: false, reason: 'A written onset needs whole MIDI ticks.' }
  }
  if (!Number.isInteger(ticksPerWrittenQuarter) || ticksPerWrittenQuarter <= 0) {
    return { aligned: false, reason: 'Written-onset alignment needs a whole number of ticks per written quarter.' }
  }
  const parts = alignment.subdivisionsPerQuarter
  const limit = alignment.maxDeviationTicks
  if (!Number.isInteger(parts) || parts < 1 || !Number.isInteger(limit) || limit < 0) {
    return { aligned: false, reason: 'The written-onset grid is not a whole number of steps.' }
  }
  if (ticksPerWrittenQuarter % parts !== 0) {
    return {
      aligned: false,
      reason: 'The written quarter does not divide into equal grid steps, so the attack was not moved.',
    }
  }

  const step = ticksPerWrittenQuarter / parts
  const relative = originalOnsetTick - writtenStartTick
  const grid = nearestMultiple(relative, step)
  const deviationTicks = Math.abs(relative - grid)
  if (deviationTicks > limit) {
    return {
      aligned: false,
      reason: `The attack is ${deviationTicks} ticks from the written grid. The limit is ${limit} ticks, so it was not moved.`,
    }
  }
  return { aligned: true, writtenOnsetTick: writtenStartTick + grid, deviationTicks }
}

/**
 * The tick used to choose a measure and a rhythmic column.
 * Without an alignment setting, this is the original MIDI onset.
 * An attack outside the allowed deviation also stays on its MIDI onset.
 */
export function resolveWrittenOnset(originalOnsetTick: number, interpretation: MusicalInterpretation): number {
  const alignment = interpretation.writtenOnsetAlignment
  const quarter = interpretation.ticksPerWrittenQuarter
  if (alignment === undefined || quarter === undefined) return originalOnsetTick
  const aligned = alignWrittenOnset(originalOnsetTick, interpretation.writtenStartTick ?? 0, quarter, alignment)
  return aligned.aligned ? aligned.writtenOnsetTick : originalOnsetTick
}

/** Nearest multiple of `step`, with a tie rounding away from zero. Both inputs are integers. */
function nearestMultiple(relative: number, step: number): number {
  const negative = relative < 0
  const magnitude = negative ? -relative : relative
  const quotient = Math.floor((magnitude + Math.floor(step / 2)) / step)
  const grid = quotient * step
  return negative ? -grid : grid
}
