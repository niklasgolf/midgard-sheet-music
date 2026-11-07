import type { MidiFile } from '../midi/parse-midi.ts'

/** Document shape stored in IndexedDB. Independent of the database version. */
export const SONG_SCHEMA_VERSION = 1

export type SongMetadata = {
  title: string
  composer: string
  sourceFilename: string
}

/**
 * Musical corrections and additions made after import.
 * Empty until those fields are designed. Do not store measure guesses here yet.
 */
export type MusicalInterpretation = Record<string, never>

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

function isInterpretation(value: unknown): value is MusicalInterpretation {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
