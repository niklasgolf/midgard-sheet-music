import type { MidiNote } from '../midi/parse-midi.ts'
import type { PianoStaff } from './staff.ts'
import {
  compareFractions,
  fractionKey,
  interpretDuration,
  interpretOnset,
  type Fraction,
  type WrittenDuration,
} from './duration.ts'

/** One imported note, kept so a later editor can find it again. The MIDI record is not changed. */
export type MeasurePitch = {
  midi: number
  track: number
  startTick: number
  endTick: number
  durationTicks: number
}

/** Notes on one staff that share an onset and a written duration. */
export type StaffEvent = {
  staff: PianoStaff
  onset: Fraction
  duration: WrittenDuration
  pitches: MeasurePitch[]
}

/** One written onset. Treble and bass events in this list share a horizontal column. */
export type RhythmicColumn = {
  onset: Fraction
  events: StaffEvent[]
}

/** A MIDI note this measure could not turn into written notation. The MIDI values are unchanged. */
export type UnresolvedNote = {
  midi: number
  track: number
  startTick: number
  durationTicks: number
  reason: string
}

export type MeasureContent = {
  ready: true
  measureQuarters: Fraction
  columns: RhythmicColumn[]
  unresolved: UnresolvedNote[]
}

/**
 * Musical contents of one measure. Positions in pixels are not decided here.
 */
export function buildMeasureContent(options: {
  notes: readonly MidiNote[]
  span: { startTick: number; endTick: number }
  ticksPerWrittenQuarter: number
  staffByTrack: ReadonlyMap<number, PianoStaff>
  measureQuarters: Fraction
}): MeasureContent {
  const unresolved: UnresolvedNote[] = []
  const groups = new Map<string, StaffEvent>()

  for (const note of options.notes) {
    const staff = options.staffByTrack.get(note.track)
    if (staff === undefined) {
      unresolved.push(unresolvedNote(note, `Track ${note.track} has no piano staff assignment.`))
      continue
    }

    const duration = interpretDuration(note.durationTicks, options.ticksPerWrittenQuarter)
    if (!duration.recognized) {
      unresolved.push(unresolvedNote(note, duration.message))
      continue
    }

    const onset = interpretOnset(note.startTick - options.span.startTick, options.ticksPerWrittenQuarter)
    if (!onset.recognized) {
      unresolved.push(unresolvedNote(note, onset.message))
      continue
    }

    const key = `${staff}|${fractionKey(onset.quarters)}|${fractionKey(duration.duration.quarters)}`
    const event = groups.get(key)
    const pitch = pitchFromNote(note)
    if (event === undefined) {
      groups.set(key, {
        staff,
        onset: onset.quarters,
        duration: duration.duration,
        pitches: [pitch],
      })
    } else {
      event.pitches.push(pitch)
    }
  }

  const columns = new Map<string, RhythmicColumn>()
  for (const event of groups.values()) {
    event.pitches.sort(comparePitches)
    const key = fractionKey(event.onset)
    const column = columns.get(key)
    if (column === undefined) {
      columns.set(key, { onset: event.onset, events: [event] })
    } else {
      column.events.push(event)
    }
  }

  const ordered = [...columns.values()].sort((left, right) => compareFractions(left.onset, right.onset))
  for (const column of ordered) {
    column.events.sort(compareEvents)
  }

  unresolved.sort(
    (left, right) => left.startTick - right.startTick || left.track - right.track || left.midi - right.midi,
  )

  return {
    ready: true,
    measureQuarters: options.measureQuarters,
    columns: ordered,
    unresolved,
  }
}

export function pitchCount(content: MeasureContent): number {
  return content.columns.reduce(
    (sum, column) => sum + column.events.reduce((inner, event) => inner + event.pitches.length, 0),
    0,
  )
}

function unresolvedNote(note: MidiNote, reason: string): UnresolvedNote {
  return {
    midi: note.midi,
    track: note.track,
    startTick: note.startTick,
    durationTicks: note.durationTicks,
    reason,
  }
}

function pitchFromNote(note: MidiNote): MeasurePitch {
  return {
    midi: note.midi,
    track: note.track,
    startTick: note.startTick,
    endTick: note.endTick,
    durationTicks: note.durationTicks,
  }
}

function comparePitches(left: MeasurePitch, right: MeasurePitch): number {
  return left.midi - right.midi || left.track - right.track || left.startTick - right.startTick
}

function compareEvents(left: StaffEvent, right: StaffEvent): number {
  if (left.staff !== right.staff) return left.staff === 'treble' ? -1 : 1
  return compareFractions(right.duration.quarters, left.duration.quarters)
}
