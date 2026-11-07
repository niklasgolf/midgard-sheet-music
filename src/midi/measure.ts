import type { MidiNote } from './parse-midi.ts'

/**
 * Where one measure sits on the MIDI tick timeline.
 * The caller supplies this. A Standard MIDI file often has no barlines.
 */
export type MeasureWindow = {
  startTick: number
  endTick: number
  meter: {
    beats: number
    beatValue: number
  }
}

/** Notes that begin inside the window. A note ending later still keeps its original ticks. */
export function notesStartingInMeasure(
  notes: readonly MidiNote[],
  measure: MeasureWindow,
): MidiNote[] {
  if (!Number.isInteger(measure.startTick) || !Number.isInteger(measure.endTick)) {
    throw new Error('Measure ticks must be integers.')
  }
  if (measure.endTick <= measure.startTick) {
    throw new Error(
      `Measure end tick ${measure.endTick} must be after start tick ${measure.startTick}.`,
    )
  }

  return notes.filter(
    (note) => note.startTick >= measure.startTick && note.startTick < measure.endTick,
  )
}
