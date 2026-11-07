import type { GraceNoteReading } from '../song/song.ts'

type SoundedNote = {
  track: number
  midi: number
  startTick: number
  endTick: number
}

/** The grace-note reading for this MIDI event, if one was stored. */
export function matchGraceNote(
  note: SoundedNote,
  readings: readonly GraceNoteReading[],
): GraceNoteReading | undefined {
  return readings.find((reading) => sameEvent(note, reading))
}

function sameEvent(note: SoundedNote, reading: GraceNoteReading): boolean {
  return (
    note.track === reading.track &&
    note.midi === reading.midi &&
    note.startTick === reading.startTick &&
    note.endTick === reading.endTick
  )
}
