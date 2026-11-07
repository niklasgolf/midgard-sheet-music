import type { MidiNote } from '../midi/parse-midi.ts'
import type { GraceNotePrincipal, GraceNoteReading, NoteValue, SustainedNoteReading, WrittenDurationReading } from '../song/song.ts'
import { matchGraceNote } from './grace-note.ts'
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
import { planTies, spellMatchingReading, type PlannedTie, type WrittenSegment } from './sustained-note.ts'
import { matchWrittenDuration } from './written-duration.ts'

/** One written notehead. The MIDI record is not changed. */
export type MeasurePitch = {
  midi: number
  track: number
  /** Written onset. For an unsplit note this is the MIDI onset. */
  startTick: number
  /** Written end. For an unsplit note this is the MIDI end. */
  endTick: number
  /** Written duration in MIDI ticks. */
  durationTicks: number
  /** Present when this written note is one piece of a longer MIDI sound. */
  sounding?: {
    startTick: number
    endTick: number
    durationTicks: number
  }
}

/** A tie this measure draws. The role says which piece of the curve belongs here. */
export type MeasureTie = PlannedTie & {
  staff: PianoStaff
}

/** A grace note drawn before its principal attack. It is not a rhythmic column. */
export type MeasureGraceNote = {
  midi: number
  track: number
  staff: PianoStaff
  startTick: number
  endTick: number
  durationTicks: number
  written: NoteValue
  slash: boolean
  slur: boolean
  principal: GraceNotePrincipal
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
  ties: MeasureTie[]
  graceNotes: MeasureGraceNote[]
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
  /** Explicit spellings of MIDI sounds that are written as several tied notes. */
  sustainedNotes?: readonly SustainedNoteReading[]
  /** Performed holds written as a different rhythmic value. */
  writtenDurations?: readonly WrittenDurationReading[]
  /** Ornamental notes attached to a principal attack. */
  graceNotes?: readonly GraceNoteReading[]
}): MeasureContent {
  const unresolved: UnresolvedNote[] = []
  const groups = new Map<string, StaffEvent>()
  const provisional = new Map<string, ProvisionalEvent>()
  const ties: MeasureTie[] = []
  const graceNotes: MeasureGraceNote[] = []
  const spanTicks = options.span.endTick - options.span.startTick
  const readings = options.sustainedNotes ?? []
  const writtenDurations = options.writtenDurations ?? []
  const graceReadings = options.graceNotes ?? []

  for (const note of options.notes) {
    const segments = spellMatchingReading(note, readings, options.ticksPerWrittenQuarter)
    if (segments !== undefined) {
      placeSpelledNote(note, segments, options, groups, provisional, unresolved, ties, spanTicks)
      continue
    }
    const grace = matchGraceNote(note, graceReadings)
    if (grace !== undefined) {
      if (beginsInSpan(note.startTick, options.span)) placeGraceNote(note, grace, options, graceNotes, unresolved)
      continue
    }
    const written = matchWrittenDuration(note, writtenDurations, options.ticksPerWrittenQuarter)
    if (written !== undefined) {
      if (beginsInSpan(note.startTick, options.span)) {
        placeOverriddenNote(note, written, options, groups, provisional, unresolved, spanTicks)
      }
      continue
    }
    if (!beginsInSpan(note.startTick, options.span)) continue
    placeSingleNote(note, options, groups, provisional, unresolved, spanTicks)
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
  graceNotes.sort((left, right) => left.startTick - right.startTick || left.midi - right.midi)

  return {
    ready: true,
    measureQuarters: options.measureQuarters,
    columns: ordered,
    provisional: provisionalColumns(provisional),
    unresolved,
    ties,
    graceNotes,
  }
}

function placeGraceNote(
  note: MidiNote,
  reading: GraceNoteReading,
  options: { staffByTrack: ReadonlyMap<number, PianoStaff> },
  graceNotes: MeasureGraceNote[],
  unresolved: UnresolvedNote[],
): void {
  const staff = options.staffByTrack.get(note.track)
  if (staff === undefined) {
    unresolved.push(unresolvedNote(note, `Track ${note.track} has no piano staff assignment.`))
    return
  }
  graceNotes.push({
    midi: note.midi,
    track: note.track,
    staff,
    startTick: note.startTick,
    endTick: note.endTick,
    durationTicks: note.durationTicks,
    written: reading.written,
    slash: reading.slash,
    slur: reading.slur,
    principal: reading.principal,
  })
}

function placeOverriddenNote(
  note: MidiNote,
  written: { duration: WrittenDuration; writtenEndTick: number; durationTicks: number },
  options: {
    span: { startTick: number; endTick: number }
    ticksPerWrittenQuarter: number
    staffByTrack: ReadonlyMap<number, PianoStaff>
    measureQuarters: Fraction
  },
  groups: Map<string, StaffEvent>,
  provisional: Map<string, ProvisionalEvent>,
  unresolved: UnresolvedNote[],
  spanTicks: number,
): void {
  const staff = options.staffByTrack.get(note.track)
  if (staff === undefined) {
    unresolved.push(unresolvedNote(note, `Track ${note.track} has no piano staff assignment.`))
    return
  }
  const offsetTicks = note.startTick - options.span.startTick
  const onset = interpretOnset(offsetTicks, options.ticksPerWrittenQuarter)
  const pitch: MeasurePitch = {
    midi: note.midi,
    track: note.track,
    startTick: note.startTick,
    endTick: written.writtenEndTick,
    durationTicks: written.durationTicks,
    sounding: {
      startTick: note.startTick,
      endTick: note.endTick,
      durationTicks: note.durationTicks,
    },
  }
  if (!onset.recognized) {
    unresolved.push(unresolvedNote(note, onset.message))
    rememberProvisional(provisional, pitch, staff, offsetTicks, spanTicks, options.measureQuarters)
    return
  }
  addPitch(groups, staff, onset.quarters, written.duration, pitch)
}

function placeSpelledNote(
  note: MidiNote,
  segments: readonly WrittenSegment[],
  options: {
    span: { startTick: number; endTick: number }
    ticksPerWrittenQuarter: number
    staffByTrack: ReadonlyMap<number, PianoStaff>
    measureQuarters: Fraction
  },
  groups: Map<string, StaffEvent>,
  provisional: Map<string, ProvisionalEvent>,
  unresolved: UnresolvedNote[],
  ties: MeasureTie[],
  spanTicks: number,
): void {
  const staff = options.staffByTrack.get(note.track)
  if (staff === undefined) {
    if (beginsInSpan(note.startTick, options.span)) {
      unresolved.push(unresolvedNote(note, `Track ${note.track} has no piano staff assignment.`))
    }
    return
  }

  for (const segment of segments) {
    if (!beginsInSpan(segment.startTick, options.span)) continue
    const pitch = pitchFromSegment(segment)
    const offsetTicks = segment.startTick - options.span.startTick
    const onset = interpretOnset(offsetTicks, options.ticksPerWrittenQuarter)
    if (!onset.recognized) {
      unresolved.push({
        midi: note.midi,
        track: note.track,
        startTick: segment.startTick,
        durationTicks: segment.durationTicks,
        reason: onset.message,
      })
      rememberProvisional(provisional, pitch, staff, offsetTicks, spanTicks, options.measureQuarters)
      continue
    }
    addPitch(groups, staff, onset.quarters, segment.duration, pitch)
  }

  for (const tie of planTies(segments, options.span)) {
    ties.push({ ...tie, staff })
  }
}

function placeSingleNote(
  note: MidiNote,
  options: {
    span: { startTick: number; endTick: number }
    ticksPerWrittenQuarter: number
    staffByTrack: ReadonlyMap<number, PianoStaff>
    measureQuarters: Fraction
  },
  groups: Map<string, StaffEvent>,
  provisional: Map<string, ProvisionalEvent>,
  unresolved: UnresolvedNote[],
  spanTicks: number,
): void {
  const staff = options.staffByTrack.get(note.track)
  if (staff === undefined) {
    unresolved.push(unresolvedNote(note, `Track ${note.track} has no piano staff assignment.`))
    return
  }

  const duration = interpretDuration(note.durationTicks, options.ticksPerWrittenQuarter)
  const offsetTicks = note.startTick - options.span.startTick
  if (!duration.recognized) {
    unresolved.push(unresolvedNote(note, duration.message))
    rememberProvisional(provisional, pitchFromNote(note), staff, offsetTicks, spanTicks, options.measureQuarters)
    return
  }

  const onset = interpretOnset(offsetTicks, options.ticksPerWrittenQuarter)
  if (!onset.recognized) {
    unresolved.push(unresolvedNote(note, onset.message))
    rememberProvisional(provisional, pitchFromNote(note), staff, offsetTicks, spanTicks, options.measureQuarters)
    return
  }

  addPitch(groups, staff, onset.quarters, duration.duration, pitchFromNote(note))
}

function addPitch(
  groups: Map<string, StaffEvent>,
  staff: PianoStaff,
  onset: Fraction,
  duration: WrittenDuration,
  pitch: MeasurePitch,
): void {
  const key = `${staff}|${fractionKey(onset)}|${fractionKey(duration.quarters)}`
  const event = groups.get(key)
  if (event === undefined) {
    groups.set(key, { staff, onset, duration, pitches: [pitch] })
  } else {
    event.pitches.push(pitch)
  }
}

function beginsInSpan(tick: number, span: { startTick: number; endTick: number }): boolean {
  const start = Math.round(span.startTick)
  const end = Math.round(span.endTick)
  return tick >= start && tick < end
}

export function pitchCount(content: MeasureContent): number {
  return content.columns.reduce(
    (sum, column) => sum + column.events.reduce((inner, event) => inner + event.pitches.length, 0),
    0,
  )
}

function rememberProvisional(
  groups: Map<string, ProvisionalEvent>,
  pitch: MeasurePitch,
  staff: PianoStaff,
  offsetTicks: number,
  spanTicks: number,
  measureQuarters: Fraction,
): void {
  const onset = tickShare(offsetTicks, spanTicks, measureQuarters)
  const key = `${staff}|${fractionKey(onset)}`
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

function pitchFromSegment(segment: WrittenSegment): MeasurePitch {
  return {
    midi: segment.midi,
    track: segment.track,
    startTick: segment.startTick,
    endTick: segment.endTick,
    durationTicks: segment.durationTicks,
    sounding: {
      startTick: segment.soundingStartTick,
      endTick: segment.soundingEndTick,
      durationTicks: segment.soundingDurationTicks,
    },
  }
}

function comparePitches(left: MeasurePitch, right: MeasurePitch): number {
  return left.midi - right.midi || left.track - right.track || left.startTick - right.startTick
}

function compareEvents(left: StaffEvent, right: StaffEvent): number {
  if (left.staff !== right.staff) return left.staff === 'treble' ? -1 : 1
  return compareFractions(right.duration.quarters, left.duration.quarters)
}
