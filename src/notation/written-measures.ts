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

export type WrittenMeasure = {
  /** Bar 0 is the pickup. Bar 1 is the first complete measure. */
  index: number
  span: TickSpan
  quarters: number
}

export type WrittenMeasurePlan =
  | { ready: true; measures: WrittenMeasure[] }
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
 * Bar 0 is the pickup when the song has one. Each later bar is one complete measure.
 * A song with no pickup begins at Bar 1. `measureCount` is the number of measures
 * returned: it includes Bar 0 when a pickup is present, and only complete bars when it is not.
 * The edges are products of the saved settings, not stored boundaries.
 */
export function writtenMeasures(interpretation: MusicalInterpretation, measureCount: number): WrittenMeasurePlan {
  if (!Number.isInteger(measureCount) || measureCount < 1) {
    return { ready: false, message: 'The measure count must be a positive whole number.' }
  }

  const ready = measureGrid(interpretation)
  if (!ready.ready) return ready

  return { ready: true, measures: planMeasures(ready.grid, measureCount) }
}

/** How many complete written measures contain a note onset at or after the written start. */
export function availableCompleteMeasures(
  interpretation: MusicalInterpretation,
  notes: readonly MidiNote[],
): { ready: true; count: number } | { ready: false; message: string } {
  const ready = measureGrid(interpretation)
  if (!ready.ready) return ready
  return { ready: true, count: completeMeasuresThrough(ready.grid, notes) }
}

export type DisplayedMeasures =
  | { ready: true; measures: WrittenMeasure[]; requested: number; available: number; shown: number }
  | { ready: false; message: string }

/**
 * The measures the page should draw for a requested count of complete bars.
 * `'all'` uses every complete bar that contains a note.
 * A larger request is shortened to that length. A pickup, when present, is added and is not part of the count.
 */
export function displayedMeasures(
  interpretation: MusicalInterpretation,
  notes: readonly MidiNote[],
  request: number | 'all',
): DisplayedMeasures {
  const ready = measureGrid(interpretation)
  if (!ready.ready) return ready
  const available = completeMeasuresThrough(ready.grid, notes)
  const requested = request === 'all' ? available : request
  if (request !== 'all' && (!Number.isInteger(requested) || requested < 1)) {
    return { ready: false, message: 'The measure count must be a positive whole number.' }
  }
  const shown = Math.min(requested, available)
  const hasPickup = ready.grid.pickupQuarters !== undefined
  const planCount = hasPickup ? shown + 1 : shown
  if (planCount < 1) {
    return { ready: true, measures: [], requested, available, shown }
  }
  return { ready: true, measures: planMeasures(ready.grid, planCount), requested, available, shown }
}

/**
 * Bar 0 is the pickup. Bar 1 is the first full measure after it.
 */
export function openingMeasures(interpretation: MusicalInterpretation): OpeningMeasures {
  if (interpretation.pickup?.present === false) {
    return { ready: false, message: 'This piece has no pickup. Complete measures begin at Bar 1.' }
  }
  const plan = writtenMeasures(interpretation, 2)
  if (!plan.ready) return plan
  const pickup = plan.measures[0]
  const firstFull = plan.measures[1]
  if (pickup === undefined || firstFull === undefined) {
    return { ready: false, message: 'The musical settings needed to draw the measures are incomplete.' }
  }
  return { ready: true, pickup: pickup.span, firstFull: firstFull.span }
}

export function quartersInBar(signature: TimeSignature): number {
  return (signature.numerator * 4) / signature.denominator
}

export function quartersInNote(value: NoteValue): number {
  return QUARTERS_IN_NOTE[value]
}

type MeasureGrid = {
  origin: number
  quarter: number
  barQuarters: number
  fullMeasure: number
  /** Present when Bar 0 is a pickup. The value is the pickup length in quarters. */
  pickupQuarters?: number
}

function measureGrid(
  interpretation: MusicalInterpretation,
): { ready: true; grid: MeasureGrid } | { ready: false; message: string } {
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
  const origin = interpretation.writtenStartTick ?? 0
  if (!Number.isFinite(origin) || origin < 0) {
    return { ready: false, message: 'The written start tick must be zero or a positive number.' }
  }
  if (signature === undefined || pickup === undefined || quarter === undefined) {
    return { ready: false, message: 'The musical settings needed to draw the measures are incomplete.' }
  }

  const barQuarters = quartersInBar(signature)
  return {
    ready: true,
    grid: {
      origin,
      quarter,
      barQuarters,
      fullMeasure: barQuarters * quarter,
      pickupQuarters: pickup.present ? QUARTERS_IN_NOTE[pickup.duration] : undefined,
    },
  }
}

function planMeasures(grid: MeasureGrid, measureCount: number): WrittenMeasure[] {
  const measures: WrittenMeasure[] = []
  const pickupQuarters = grid.pickupQuarters
  const pickupTicks = pickupQuarters === undefined ? 0 : pickupQuarters * grid.quarter
  const firstFull = grid.origin + pickupTicks
  for (let step = 0; step < measureCount; step += 1) {
    if (pickupQuarters !== undefined && step === 0) {
      measures.push({
        index: 0,
        span: { startTick: grid.origin, endTick: firstFull },
        quarters: pickupQuarters,
      })
      continue
    }
    const index = pickupQuarters === undefined ? step + 1 : step
    const startTick = firstFull + (index - 1) * grid.fullMeasure
    measures.push({
      index,
      span: { startTick, endTick: startTick + grid.fullMeasure },
      quarters: grid.barQuarters,
    })
  }
  return measures
}

function completeMeasuresThrough(grid: MeasureGrid, notes: readonly MidiNote[]): number {
  const pickupTicks = grid.pickupQuarters === undefined ? 0 : grid.pickupQuarters * grid.quarter
  const firstFull = grid.origin + pickupTicks
  let count = 0
  for (const note of notes) {
    if (note.startTick < firstFull) continue
    const index = Math.floor((note.startTick - firstFull) / grid.fullMeasure) + 1
    if (index > count) count = index
  }
  return count
}

function joinList(items: string[]): string {
  if (items.length === 1) return items[0] ?? ''
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}
