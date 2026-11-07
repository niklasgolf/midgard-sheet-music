import type { MusicalInterpretation, SustainedNoteReading } from '../song/song.ts'

/** Song B. The same id as CHOPIN_SONG_B_ID. This module does not load the MIDI file. */
const SONG_B_ID = 'chopin-prelude-op28-no7-b'

/**
 * Written spellings the MIDI duration cannot choose by itself.
 * These are applied when a Song is drawn. They are not written into IndexedDB.
 * A spelling stored on the Song wins for the same MIDI event.
 */
const PROJECT_SUSTAINED_NOTES: Readonly<Record<string, readonly SustainedNoteReading[]>> = {
  [SONG_B_ID]: [
    {
      track: 2,
      midi: 62,
      startTick: 5280,
      endTick: 6912,
      written: ['sixteenth', 'half', 'half'],
    },
  ],
}

export function sustainedReadingsFor(song: {
  id: string
  musicalInterpretation: MusicalInterpretation
}): readonly SustainedNoteReading[] {
  const stored = song.musicalInterpretation.sustainedNotes ?? []
  const project = PROJECT_SUSTAINED_NOTES[song.id] ?? []
  const seen = new Set(stored.map(readingKey))
  return [...stored, ...project.filter((reading) => !seen.has(readingKey(reading)))]
}

function readingKey(reading: SustainedNoteReading): string {
  return `${reading.track}|${reading.midi}|${reading.startTick}|${reading.endTick}`
}
