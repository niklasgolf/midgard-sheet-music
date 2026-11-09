import type { OmittedNoteReading } from '../song/song.ts'

type SoundedNote = {
  track: number
  midi: number
  startTick: number
  endTick: number
}

/**
 * The omission for this MIDI event, if one was stored.
 * Track, pitch, onset, and ending must all match. Another event that shares
 * the pitch and the onset, and ends later, is a different note.
 */
export function matchOmittedNote(
  note: SoundedNote,
  readings: readonly OmittedNoteReading[],
): OmittedNoteReading | undefined {
  return readings.find((reading) => sameEvent(note, reading))
}

function sameEvent(note: SoundedNote, reading: OmittedNoteReading): boolean {
  return (
    note.track === reading.track &&
    note.midi === reading.midi &&
    note.startTick === reading.startTick &&
    note.endTick === reading.endTick
  )
}
