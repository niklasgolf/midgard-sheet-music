import type { MidiNote } from '../midi/parse-midi.ts'
import type { MusicalInterpretation, NoteValue, TimeSignature } from '../song/song.ts'

/** Exact tick span. Rounding happens only when notes are selected or ticks are shown. */
export type TickSpan = {
  startTick: number
  endTick: number
}

export type OpeningMeasures =
  | { ready: true; pickup: TickSpan; firstFull: TickSpan }
  | { ready: false; message: string }

const QUARTERS_IN_NOTE: Record<NoteValue, number> = {
  sixteenth: 1 / 4,
  eighth: 1 / 2,
  quarter: 1,
  half: 2,
}

/**
 * Notes whose onset is inside the span.
 * The span is rounded to whole ticks here. Stored note ends are not changed.
 */
export function notesBeginningInSpan(notes: readonly MidiNote[], span: TickSpan): MidiNote[] {
  const startTick = Math.round(span.startTick)
  const endTick = Math.round(span.endTick)
  if (endTick <= startTick) {
    throw new Error(`Measure end tick ${endTick} must be after start tick ${startTick}.`)
  }
  return notes.filter((note) => note.startTick >= startTick && note.startTick < endTick)
}

/**
 * Bar 0 is the pickup. Bar 1 is the first full measure after it.
 * Both edges are exact products of the saved settings, not stored boundaries.
 */
export function openingMeasures(interpretation: MusicalInterpretation): OpeningMeasures {
  const quarter = interpretation.ticksPerWrittenQuarter
  const signature = interpretation.timeSignature
  const pickup = interpretation.pickup
  const missing: string[] = []
  if (signature === undefined) missing.push('a time signature')
  if (pickup === undefined) missing.push('whether the piece has a pickup')
  if (quarter === undefined) missing.push('ticks per written quarter')

  if (missing.length > 0) {
    return {
      ready: false,
      message: `Save ${joinList(missing)} in Song Settings before these measures can be drawn. The MIDI file’s PPQ is not used as the written quarter.`,
    }
  }
  if (pickup?.present === false) {
    return {
      ready: false,
      message:
        'Song Settings says this piece has no pickup. These first two pictures are a pickup measure and the first full measure.',
    }
  }
  if (signature === undefined || pickup?.present !== true || quarter === undefined) {
    return { ready: false, message: 'The musical settings needed to draw the measures are incomplete.' }
  }

  const pickupEnd = QUARTERS_IN_NOTE[pickup.duration] * quarter
  const fullMeasure = quartersInBar(signature) * quarter
  return {
    ready: true,
    pickup: { startTick: 0, endTick: pickupEnd },
    firstFull: { startTick: pickupEnd, endTick: pickupEnd + fullMeasure },
  }
}

export function quartersInBar(signature: TimeSignature): number {
  return (signature.numerator * 4) / signature.denominator
}

export function quartersInNote(value: NoteValue): number {
  return QUARTERS_IN_NOTE[value]
}

function joinList(items: string[]): string {
  if (items.length === 1) return items[0] ?? ''
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}
