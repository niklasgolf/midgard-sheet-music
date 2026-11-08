import type { MidiFile } from '../midi/parse-midi.ts'
import { isKnownKey } from './musical-keys.ts'

/** Document shape stored in IndexedDB. Independent of the database version. */
export const SONG_SCHEMA_VERSION = 1

export type SongMetadata = {
  title: string
  composer: string
  sourceFilename: string
  /** Project PDF filename. Songs saved before the library may omit it. */
  pdfFilename?: string
}

/** Written note value. This is not a MIDI tick count. */
export const NOTE_VALUES = ['sixteenth', 'eighth', 'quarter', 'half'] as const

export type NoteValue = (typeof NOTE_VALUES)[number]

export type TimeSignature = {
  numerator: number
  denominator: number
}

export type KeyMode = 'major' | 'minor'

/** Tonic and mode, such as A major. Sharp and flat counts are derived for display. */
export type KeySignature = {
  tonic: string
  mode: KeyMode
}

export type PickupInterpretation =
  | { present: false }
  | { present: true; duration: NoteValue }

/**
 * One imported MIDI sound written as several notes.
 * The identity is the original event: track, pitch, onset, and ending.
 * `written` is the spelling of that one sound. It is not a new MIDI event.
 * `ties` has one flag for each junction between those written notes.
 * Omitted flags mean every junction is tied. `false` is a repeated written note.
 */
export type SustainedNoteReading = {
  track: number
  midi: number
  startTick: number
  endTick: number
  written: readonly NoteValue[]
  ties?: readonly boolean[]
}

/**
 * One MIDI performance written with a duration other than the time the key was held.
 * The identity is the original event. `writtenEndTick` is where the written note ends.
 */
export type WrittenDurationReading = {
  track: number
  midi: number
  startTick: number
  endTick: number
  written: NoteValue
  writtenEndTick: number
}

/** The written attack a grace note ornaments. This is a MIDI event, not a pixel. */
export type GraceNotePrincipal = {
  track: number
  midi: number
  startTick: number
}

/**
 * One ornamental MIDI event written as a small note before its principal attack.
 * Several readings may name the same principal. They do not add a counted beat.
 */
export type GraceNoteReading = {
  track: number
  midi: number
  startTick: number
  endTick: number
  principal: GraceNotePrincipal
  /** Flag and notehead value. This duration is not added to the measure. */
  written: NoteValue
  slash: boolean
  slur: boolean
}

/**
 * How performed attacks are moved onto a written rhythmic grid.
 * Absent means the original MIDI onset is the written onset.
 * The grid is a number of equal parts of one written quarter. 4 is a sixteenth grid.
 */
export type WrittenOnsetAlignment = {
  subdivisionsPerQuarter: number
  /** An attack farther than this many ticks from the grid keeps its MIDI onset. */
  maxDeviationTicks: number
}

/**
 * Composition-wide musical decisions made after import.
 * Fields are omitted until Song Settings saves them.
 * Other properties may be added by later milestones and must be left in place.
 */
export type MusicalInterpretation = {
  timeSignature?: TimeSignature
  keySignature?: KeySignature
  pickup?: PickupInterpretation
  /** MIDI ticks that last as long as one written quarter note. Not the file PPQ. */
  ticksPerWrittenQuarter?: number
  /**
   * MIDI tick where written Bar 1 begins, or where the pickup begins when there is one.
   * Absent means tick 0. The stored note times are not moved.
   */
  writtenStartTick?: number
  /**
   * Snaps a performed attack to the written grid before the measure is chosen.
   * Absent for Songs whose performed attacks already match the written grid.
   */
  writtenOnsetAlignment?: WrittenOnsetAlignment
  /**
   * For one note-bearing track, MIDI pitches at or above this number go to the treble staff.
   * Lower pitches go to the bass. Two-track piano files keep their track order.
   */
  staffSplitPitch?: number
  /**
   * Explicit spellings for MIDI sounds that are not one catalog duration.
   * Absent until an interpretation is stored. Drawing reads this list from the Song.
   */
  sustainedNotes?: readonly SustainedNoteReading[]
  /**
   * MIDI notes written with a rhythmic value other than the performed hold.
   * Absent until an interpretation is stored.
   */
  writtenDurations?: readonly WrittenDurationReading[]
  /**
   * Short ornamental notes attached to a principal attack.
   * Absent until an interpretation is stored.
   */
  graceNotes?: readonly GraceNoteReading[]
}

/** How many complete written measures the page draws for one Song. A pickup is extra. */
export type MeasureDisplay = { kind: 'count'; count: number } | { kind: 'all' }

/** Columns of measure SVGs. Later kinds, such as automatic or matching the source, can be added here. */
export type MeasuresPerRow = { kind: 'fixed'; count: 2 | 3 }

export type SongDisplay = {
  measures?: MeasureDisplay
  measuresPerRow?: MeasuresPerRow
}

/** Complete measures drawn when a Song has no saved display choice. A pickup is extra. */
export const DEFAULT_COMPLETE_MEASURES = 16

/** Measure columns used when a Song has no saved row choice. */
export const DEFAULT_MEASURES_PER_ROW = 3

export function completeMeasureRequest(song: Song): number | 'all' {
  const measures = song.display?.measures
  if (measures === undefined) return DEFAULT_COMPLETE_MEASURES
  if (measures.kind === 'all') return 'all'
  return measures.count
}

export function measuresPerRowCount(song: Song): 2 | 3 {
  const choice = song.display?.measuresPerRow
  if (choice?.kind === 'fixed') return choice.count
  return DEFAULT_MEASURES_PER_ROW
}

export type Song = {
  id: string
  schemaVersion: number
  metadata: SongMetadata
  /** Complete result of the MIDI parser, preserved as imported. */
  originalMidi: MidiFile
  musicalInterpretation: MusicalInterpretation
  /** How many measures to draw, and how many sit on each row. Absent until a display choice is saved. */
  display?: SongDisplay
}

export function isSong(value: unknown): value is Song {
  if (value === null || typeof value !== 'object') return false
  const song = value as Partial<Song>
  return (
    typeof song.id === 'string' &&
    typeof song.schemaVersion === 'number' &&
    isMetadata(song.metadata) &&
    isMidiFile(song.originalMidi) &&
    isInterpretation(song.musicalInterpretation) &&
    (song.display === undefined || isDisplay(song.display))
  )
}

function isMetadata(value: unknown): value is SongMetadata {
  if (value === null || typeof value !== 'object') return false
  const metadata = value as Partial<SongMetadata>
  return (
    typeof metadata.title === 'string' &&
    typeof metadata.composer === 'string' &&
    typeof metadata.sourceFilename === 'string' &&
    (metadata.pdfFilename === undefined || typeof metadata.pdfFilename === 'string')
  )
}

function isMidiFile(value: unknown): value is MidiFile {
  if (value === null || typeof value !== 'object') return false
  const midi = value as Partial<MidiFile>
  return (
    typeof midi.format === 'number' &&
    typeof midi.trackCount === 'number' &&
    (midi.ppq === null || typeof midi.ppq === 'number') &&
    Array.isArray(midi.tracks) &&
    Array.isArray(midi.notes) &&
    Array.isArray(midi.tempos) &&
    Array.isArray(midi.timeSignatures) &&
    Array.isArray(midi.keySignatures) &&
    Array.isArray(midi.warnings)
  )
}

const TIME_SIGNATURE_DENOMINATORS = [1, 2, 4, 8, 16, 32] as const

function isInterpretation(value: unknown): value is MusicalInterpretation {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const interpretation = value as MusicalInterpretation
  if (interpretation.timeSignature !== undefined && !isTimeSignature(interpretation.timeSignature)) {
    return false
  }
  if (interpretation.keySignature !== undefined && !isKeySignature(interpretation.keySignature)) {
    return false
  }
  if (interpretation.pickup !== undefined && !isPickup(interpretation.pickup)) return false
  if (
    interpretation.ticksPerWrittenQuarter !== undefined &&
    !isTicksPerWrittenQuarter(interpretation.ticksPerWrittenQuarter)
  ) {
    return false
  }
  if (interpretation.sustainedNotes !== undefined && !isSustainedNotes(interpretation.sustainedNotes)) {
    return false
  }
  if (interpretation.writtenDurations !== undefined && !isWrittenDurations(interpretation.writtenDurations)) {
    return false
  }
  if (interpretation.graceNotes !== undefined && !isGraceNotes(interpretation.graceNotes)) {
    return false
  }
  if (interpretation.writtenStartTick !== undefined && !isWrittenStartTick(interpretation.writtenStartTick)) {
    return false
  }
  if (
    interpretation.writtenOnsetAlignment !== undefined &&
    !isWrittenOnsetAlignment(interpretation.writtenOnsetAlignment)
  ) {
    return false
  }
  if (interpretation.staffSplitPitch !== undefined && !isStaffSplitPitch(interpretation.staffSplitPitch)) {
    return false
  }
  return true
}

function isWrittenStartTick(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isWrittenOnsetAlignment(value: unknown): value is WrittenOnsetAlignment {
  if (value === null || typeof value !== 'object') return false
  const alignment = value as Partial<WrittenOnsetAlignment>
  return (
    Number.isInteger(alignment.subdivisionsPerQuarter) &&
    alignment.subdivisionsPerQuarter !== undefined &&
    alignment.subdivisionsPerQuarter >= 1 &&
    Number.isInteger(alignment.maxDeviationTicks) &&
    alignment.maxDeviationTicks !== undefined &&
    alignment.maxDeviationTicks >= 0
  )
}

function isStaffSplitPitch(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 127
}

function isDisplay(value: unknown): value is SongDisplay {
  if (value === null || typeof value !== 'object') return false
  const display = value as Partial<SongDisplay>
  if (display.measures !== undefined && !isMeasureDisplay(display.measures)) return false
  if (display.measuresPerRow !== undefined && !isMeasuresPerRow(display.measuresPerRow)) return false
  return true
}

function isMeasureDisplay(value: unknown): value is MeasureDisplay {
  if (value === null || typeof value !== 'object') return false
  const measures = value as Partial<MeasureDisplay>
  if (measures.kind === 'all') return true
  return measures.kind === 'count' && Number.isInteger(measures.count) && measures.count !== undefined && measures.count >= 1
}

function isMeasuresPerRow(value: unknown): value is MeasuresPerRow {
  if (value === null || typeof value !== 'object') return false
  const choice = value as Partial<MeasuresPerRow>
  return choice.kind === 'fixed' && (choice.count === 2 || choice.count === 3)
}

function isSustainedNotes(value: unknown): value is readonly SustainedNoteReading[] {
  return Array.isArray(value) && value.every(isSustainedNote)
}

function isSustainedNote(value: unknown): value is SustainedNoteReading {
  if (value === null || typeof value !== 'object') return false
  const reading = value as Partial<SustainedNoteReading>
  return (
    Number.isInteger(reading.track) &&
    reading.track !== undefined &&
    reading.track >= 1 &&
    Number.isInteger(reading.midi) &&
    reading.midi !== undefined &&
    reading.midi >= 0 &&
    reading.midi <= 127 &&
    typeof reading.startTick === 'number' &&
    Number.isFinite(reading.startTick) &&
    typeof reading.endTick === 'number' &&
    Number.isFinite(reading.endTick) &&
    reading.endTick > reading.startTick &&
    Array.isArray(reading.written) &&
    reading.written.length >= 2 &&
    reading.written.every(isNoteValue) &&
    hasTieFlags(reading.ties, reading.written.length)
  )
}

/** Absent flags mean every junction is tied. A present list has one boolean per junction. */
function hasTieFlags(ties: unknown, writtenLength: number): boolean {
  if (ties === undefined) return true
  return Array.isArray(ties) && ties.length === writtenLength - 1 && ties.every((flag) => typeof flag === 'boolean')
}

function isWrittenDurations(value: unknown): value is readonly WrittenDurationReading[] {
  return Array.isArray(value) && value.every(isWrittenDuration)
}

function isWrittenDuration(value: unknown): value is WrittenDurationReading {
  if (!isSoundIdentity(value)) return false
  const reading = value as Partial<WrittenDurationReading>
  return (
    isNoteValue(reading.written) &&
    typeof reading.writtenEndTick === 'number' &&
    Number.isFinite(reading.writtenEndTick) &&
    reading.writtenEndTick > value.startTick
  )
}

function isGraceNotes(value: unknown): value is readonly GraceNoteReading[] {
  return Array.isArray(value) && value.every(isGraceNote)
}

function isGraceNote(value: unknown): value is GraceNoteReading {
  if (!isSoundIdentity(value)) return false
  const reading = value as Partial<GraceNoteReading>
  return (
    isNoteValue(reading.written) &&
    (reading.slash === true || reading.slash === false) &&
    (reading.slur === true || reading.slur === false) &&
    isPrincipal(reading.principal)
  )
}

function isPrincipal(value: unknown): value is GraceNotePrincipal {
  if (value === null || typeof value !== 'object') return false
  const principal = value as Partial<GraceNotePrincipal>
  return (
    Number.isInteger(principal.track) &&
    principal.track !== undefined &&
    principal.track >= 1 &&
    Number.isInteger(principal.midi) &&
    principal.midi !== undefined &&
    principal.midi >= 0 &&
    principal.midi <= 127 &&
    typeof principal.startTick === 'number' &&
    Number.isFinite(principal.startTick)
  )
}

function isSoundIdentity(
  value: unknown,
): value is { track: number; midi: number; startTick: number; endTick: number } {
  if (value === null || typeof value !== 'object') return false
  const reading = value as Partial<SustainedNoteReading>
  return (
    Number.isInteger(reading.track) &&
    reading.track !== undefined &&
    reading.track >= 1 &&
    Number.isInteger(reading.midi) &&
    reading.midi !== undefined &&
    reading.midi >= 0 &&
    reading.midi <= 127 &&
    typeof reading.startTick === 'number' &&
    Number.isFinite(reading.startTick) &&
    typeof reading.endTick === 'number' &&
    Number.isFinite(reading.endTick) &&
    reading.endTick > reading.startTick
  )
}

function isTicksPerWrittenQuarter(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isTimeSignature(value: unknown): value is TimeSignature {
  if (value === null || typeof value !== 'object') return false
  const signature = value as Partial<TimeSignature>
  return (
    Number.isInteger(signature.numerator) &&
    signature.numerator !== undefined &&
    signature.numerator >= 1 &&
    TIME_SIGNATURE_DENOMINATORS.some((denominator) => denominator === signature.denominator)
  )
}

function isKeySignature(value: unknown): value is KeySignature {
  if (value === null || typeof value !== 'object') return false
  const signature = value as Partial<KeySignature>
  return (
    typeof signature.tonic === 'string' &&
    (signature.mode === 'major' || signature.mode === 'minor') &&
    isKnownKey(signature.tonic, signature.mode)
  )
}

function isPickup(value: unknown): value is PickupInterpretation {
  if (value === null || typeof value !== 'object') return false
  const pickup = value as Partial<PickupInterpretation>
  if (pickup.present === false) return true
  return pickup.present === true && isNoteValue(pickup.duration)
}

function isNoteValue(value: unknown): value is NoteValue {
  return NOTE_VALUES.some((noteValue) => noteValue === value)
}
