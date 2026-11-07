import {
  DURATION_TICK_TOLERANCE,
  fractionToNumber,
  undottedDuration,
  type WrittenDuration,
} from './duration.ts'
import type { SustainedNoteReading } from '../song/song.ts'

/**
 * One written note that belongs to a longer MIDI sound.
 * The sounding ticks are the original event. The start and duration are the written note.
 */
export type WrittenSegment = {
  index: number
  midi: number
  track: number
  soundingStartTick: number
  soundingEndTick: number
  soundingDurationTicks: number
  startTick: number
  endTick: number
  durationTicks: number
  duration: WrittenDuration
}

/** How one tie meets the measure that is being drawn. */
export type TieRole = 'complete' | 'outgoing' | 'incoming' | 'continuation'

/**
 * A tie between two consecutive written segments of one MIDI sound.
 * The relationship does not depend on where the measure divs sit on the page.
 */
export type PlannedTie = {
  id: string
  role: TieRole
  midi: number
  track: number
  soundingStartTick: number
  /** Written onset of the note this tie leaves, when that note begins in this measure. */
  fromStartTick?: number
  /** Written onset of the note this tie reaches, when that note begins in this measure. */
  toStartTick?: number
}

type SoundedNote = {
  track: number
  midi: number
  startTick: number
  endTick: number
  durationTicks: number
}

/**
 * Spell one MIDI sound as the written notes in a reading.
 * Returns nothing when the reading names a different event, or when the written
 * values do not add up to that event's duration. The MIDI note is not changed.
 */
export function spellSustainedNote(
  note: SoundedNote,
  reading: SustainedNoteReading,
  ticksPerWrittenQuarter: number,
): WrittenSegment[] | undefined {
  if (!sameSound(note, reading)) return undefined
  if (reading.written.length < 2) return undefined
  if (!Number.isFinite(ticksPerWrittenQuarter) || ticksPerWrittenQuarter <= 0) return undefined

  let cursor = note.startTick
  const segments: WrittenSegment[] = []
  for (let index = 0; index < reading.written.length; index += 1) {
    const value = reading.written[index]
    if (value === undefined) return undefined
    const duration = undottedDuration(value)
    const durationTicks = writtenTicks(duration, ticksPerWrittenQuarter)
    if (!(durationTicks > 0)) return undefined
    const endTick = cursor + durationTicks
    segments.push({
      index,
      midi: note.midi,
      track: note.track,
      soundingStartTick: note.startTick,
      soundingEndTick: note.endTick,
      soundingDurationTicks: note.durationTicks,
      startTick: cursor,
      endTick,
      durationTicks,
      duration,
    })
    cursor = endTick
  }

  if (Math.abs(cursor - note.endTick) > DURATION_TICK_TOLERANCE) return undefined
  return segments
}

/** Use the first reading whose written values reproduce this MIDI sound. */
export function spellMatchingReading(
  note: SoundedNote,
  readings: readonly SustainedNoteReading[],
  ticksPerWrittenQuarter: number,
): WrittenSegment[] | undefined {
  for (const reading of readings) {
    const segments = spellSustainedNote(note, reading, ticksPerWrittenQuarter)
    if (segments !== undefined) return segments
  }
  return undefined
}

/**
 * Ties of one spelled sound that this measure must draw.
 * A chain across three or more measures gives the middle measure an incoming
 * tie and an outgoing tie. A measure with neither written note, while the tie
 * still crosses it, gets a continuation.
 */
export function planTies(
  segments: readonly WrittenSegment[],
  span: { startTick: number; endTick: number },
): PlannedTie[] {
  const start = Math.round(span.startTick)
  const end = Math.round(span.endTick)
  const ties: PlannedTie[] = []
  const sounded = segments[0]
  if (sounded === undefined) return ties

  for (let index = 0; index < segments.length - 1; index += 1) {
    const left = segments[index]
    const right = segments[index + 1]
    if (left === undefined || right === undefined) continue
    const leftHere = begins(left.startTick, start, end)
    const rightHere = begins(right.startTick, start, end)
    const role = tieRole(leftHere, rightHere, left.startTick, right.startTick, start, end)
    if (role === undefined) continue
    ties.push({
      id: `tie:${left.track}:${left.midi}:${sounded.soundingStartTick}:${index}`,
      role,
      midi: left.midi,
      track: left.track,
      soundingStartTick: left.soundingStartTick,
      fromStartTick: leftHere ? left.startTick : undefined,
      toStartTick: rightHere ? right.startTick : undefined,
    })
  }
  return ties
}

function tieRole(
  leftHere: boolean,
  rightHere: boolean,
  leftStart: number,
  rightStart: number,
  spanStart: number,
  spanEnd: number,
): TieRole | undefined {
  if (leftHere && rightHere) return 'complete'
  if (leftHere) return 'outgoing'
  if (rightHere) return 'incoming'
  if (leftStart < spanStart && rightStart >= spanEnd) return 'continuation'
  return undefined
}

function begins(tick: number, start: number, end: number): boolean {
  return tick >= start && tick < end
}

function sameSound(note: SoundedNote, reading: SustainedNoteReading): boolean {
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
