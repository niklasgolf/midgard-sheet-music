import type { MidiFile } from '../midi/parse-midi.ts'
import { isKnownKey } from './musical-keys.ts'

/** Document shape stored in IndexedDB. Independent of the database version. */
export const SONG_SCHEMA_VERSION = 1

export type SongMetadata = {
  title: string
  composer: string
  sourceFilename: string
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
}

export type Song = {
  id: string
  schemaVersion: number
  metadata: SongMetadata
  /** Complete result of the MIDI parser, preserved as imported. */
  originalMidi: MidiFile
  musicalInterpretation: MusicalInterpretation
}

export function isSong(value: unknown): value is Song {
  if (value === null || typeof value !== 'object') return false
  const song = value as Partial<Song>
  return (
    typeof song.id === 'string' &&
    typeof song.schemaVersion === 'number' &&
    isMetadata(song.metadata) &&
    isMidiFile(song.originalMidi) &&
    isInterpretation(song.musicalInterpretation)
  )
}

function isMetadata(value: unknown): value is SongMetadata {
  if (value === null || typeof value !== 'object') return false
  const metadata = value as Partial<SongMetadata>
  return (
    typeof metadata.title === 'string' &&
    typeof metadata.composer === 'string' &&
    typeof metadata.sourceFilename === 'string'
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
  return true
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
