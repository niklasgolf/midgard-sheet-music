import type { MidiNote } from '../midi/parse-midi.ts'
import type { PianoStaff } from './staff.ts'
import {
  compareFractions,
  fraction,
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

/**
 * Notes whose written duration is unknown.
 * They share a column when their MIDI onsets are the same tick.
 * The onset fraction is that tick as a share of the measure, not a written rhythm.
 */
export type ProvisionalEvent = {
  staff: PianoStaff
  onset: Fraction
  pitches: MeasurePitch[]
}

export type ProvisionalColumn = {
  onset: Fraction
  events: ProvisionalEvent[]
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
  provisional: ProvisionalColumn[]
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
  const provisional = new Map<string, ProvisionalEvent>()
  const spanTicks = options.span.endTick - options.span.startTick

  for (const note of options.notes) {
    const staff = options.staffByTrack.get(note.track)
    if (staff === undefined) {
      unresolved.push(unresolvedNote(note, `Track ${note.track} has no piano staff assignment.`))
      continue
    }

    const duration = interpretDuration(note.durationTicks, options.ticksPerWrittenQuarter)
    if (!duration.recognized) {
      unresolved.push(unresolvedNote(note, duration.message))
      rememberProvisional(provisional, note, staff, note.startTick - options.span.startTick, spanTicks, options.measureQuarters)
      continue
    }

    const onset = interpretOnset(note.startTick - options.span.startTick, options.ticksPerWrittenQuarter)
    if (!onset.recognized) {
      unresolved.push(unresolvedNote(note, onset.message))
      rememberProvisional(provisional, note, staff, note.startTick - options.span.startTick, spanTicks, options.measureQuarters)
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
    provisional: provisionalColumns(provisional),
    unresolved,
  }
}

export function pitchCount(content: MeasureContent): number {
  return content.columns.reduce(
    (sum, column) => sum + column.events.reduce((inner, event) => inner + event.pitches.length, 0),
    0,
  )
}

function rememberProvisional(
  groups: Map<string, ProvisionalEvent>,
  note: MidiNote,
  staff: PianoStaff,
  offsetTicks: number,
  spanTicks: number,
  measureQuarters: Fraction,
): void {
  const onset = tickShare(offsetTicks, spanTicks, measureQuarters)
  const key = `${staff}|${fractionKey(onset)}`
  const pitch = pitchFromNote(note)
  const event = groups.get(key)
  if (event === undefined) {
    groups.set(key, { staff, onset, pitches: [pitch] })
  } else {
    event.pitches.push(pitch)
  }
}

/**
 * Where a MIDI note sits in the measure, as a fraction of the measure's written length.
 * The tick is kept. It is not moved onto a beat, and it is not given a written duration.
 */
function tickShare(offsetTicks: number, spanTicks: number, measureQuarters: Fraction): Fraction {
  const span = spanTicks > 0 ? spanTicks : 1
  const offset = Math.min(Math.max(0, offsetTicks), span)
  const scale = 1000000
  return fraction(
    Math.round(offset * scale) * measureQuarters.numerator,
    Math.round(span * scale) * measureQuarters.denominator,
  )
}

function provisionalColumns(groups: Map<string, ProvisionalEvent>): ProvisionalColumn[] {
  const columns = new Map<string, ProvisionalColumn>()
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
    column.events.sort((left, right) => (left.staff === right.staff ? 0 : left.staff === 'treble' ? -1 : 1))
  }
  return ordered
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
