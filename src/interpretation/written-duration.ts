import type { WrittenDurationReading } from '../song/song.ts'
import { DURATION_TICK_TOLERANCE, fractionToNumber, undottedDuration, type WrittenDuration } from './duration.ts'

type SoundedNote = {
  track: number
  midi: number
  startTick: number
  endTick: number
}

/**
 * The written note for one MIDI event whose performed hold is not its written value.
 * Returns nothing when the reading names another event, or when the named value
 * does not last from the attack until `writtenEndTick`.
 */
export function matchWrittenDuration(
  note: SoundedNote,
  readings: readonly WrittenDurationReading[],
  ticksPerWrittenQuarter: number,
): { duration: WrittenDuration; writtenEndTick: number; durationTicks: number } | undefined {
  if (!Number.isFinite(ticksPerWrittenQuarter) || ticksPerWrittenQuarter <= 0) return undefined
  for (const reading of readings) {
    if (!sameEvent(note, reading)) continue
    const duration = undottedDuration(reading.written)
    const durationTicks = writtenTicks(duration, ticksPerWrittenQuarter)
    const span = reading.writtenEndTick - note.startTick
    if (!(durationTicks > 0) || Math.abs(durationTicks - span) > DURATION_TICK_TOLERANCE) continue
    return { duration, writtenEndTick: reading.writtenEndTick, durationTicks }
  }
  return undefined
}

function sameEvent(note: SoundedNote, reading: WrittenDurationReading): boolean {
  return (
    note.track === reading.track &&
    note.midi === reading.midi &&
    note.startTick === reading.startTick &&
    note.endTick === reading.endTick
  )
}

function writtenTicks(duration: WrittenDuration, ticksPerWrittenQuarter: number): number {
  const ticks = fractionToNumber(duration.quarters) * ticksPerWrittenQuarter
  const nearest = Math.round(ticks)
  return Math.abs(ticks - nearest) <= 1e-6 ? nearest : ticks
}
