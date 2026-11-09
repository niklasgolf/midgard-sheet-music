import type { MidiNote } from '../midi/parse-midi.ts'
import { fractionFromQuarters } from '../interpretation/duration.ts'
import { buildMeasureContent } from '../interpretation/measure-content.ts'
import { assignPianoStaffs, type PianoStaff } from '../interpretation/staff.ts'
import { resolveWrittenOnset } from '../interpretation/written-onset.ts'
import {
  completeMeasureRequest,
  measuresPerRowCount,
  midgardMeasureWidth,
  type Song,
  type TimeSignature,
} from '../song/song.ts'
import { displayedMeasures, quartersInBar } from './written-measures.ts'
import { measureSvg, type TrueTimeMeasure } from './piano-measure-svg.ts'
import type { NotationSystem } from './notation-system.ts'

/** Draws the selected measures from the stored Song. The SVGs are not saved. */
export function renderEngraving(container: HTMLElement, song: Song, system: NotationSystem = 'classical'): void {
  const title = document.createElement('h2')
  title.id = 'engraving-title'
  title.className = 'engraving__title'
  title.textContent = system === 'midgard' ? 'midGard Sheet Music' : 'Traditional Sheet Music — SVG Experiment'

  const interpretation = song.musicalInterpretation
  const plan = displayedMeasures(interpretation, song.originalMidi.notes, completeMeasureRequest(song))
  const ticksPerWrittenQuarter = interpretation.ticksPerWrittenQuarter
  const timeSignature = interpretation.timeSignature
  if (!plan.ready || ticksPerWrittenQuarter === undefined || timeSignature === undefined) {
    const message = document.createElement('p')
    message.className = 'engraving__message'
    message.textContent = plan.ready
      ? 'The musical settings needed to draw the measures are incomplete.'
      : plan.message
    container.replaceChildren(title, message)
    return
  }
  if (plan.measures.length === 0) {
    const message = document.createElement('p')
    message.className = 'engraving__message'
    message.textContent = 'There are no notes at or after the written start, so there are no measures to draw.'
    container.replaceChildren(title, message)
    return
  }

  const staves = assignPianoStaffs(song.originalMidi.notes, interpretation)
  if (!staves.ready) {
    const message = document.createElement('p')
    message.className = 'engraving__message'
    message.textContent = staves.message
    container.replaceChildren(title, message)
    return
  }

  const columns = measuresPerRowCount(song)
  const grid = document.createElement('div')
  grid.className = 'engraving__grid'
  grid.dataset.columns = String(columns)
  if (system === 'midgard') grid.dataset.notation = 'midgard'
  container.replaceChildren(title, grid)
  const maxWidth = availableSvgWidth(grid, columns)
  const measureWidth = midgardMeasureWidth(song)
  for (const measure of plan.measures) {
    grid.append(
      measureBlock(
        song,
        `Bar ${measure.index}`,
        measure.span,
        measure.quarters,
        ticksPerWrittenQuarter,
        timeSignature,
        staves.staffByTrack,
        staves.staffForNote,
        system,
        maxWidth,
        trueTimeForMeasure(measure.index, measure.quarters, ticksPerWrittenQuarter, timeSignature, measureWidth),
      ),
    )
  }
}

/** Bar 0 keeps a full measure's tick scale and parks the pickup at the right. */
function trueTimeForMeasure(
  measureIndex: number,
  spanQuarters: number,
  ticksPerWrittenQuarter: number,
  timeSignature: TimeSignature,
  measureWidth: number,
): TrueTimeMeasure {
  const fullMeasureTicks = quartersInBar(timeSignature) * ticksPerWrittenQuarter
  const spanTicks = spanQuarters * ticksPerWrittenQuarter
  const pickup = measureIndex === 0 && spanTicks < fullMeasureTicks - 0.5
  return {
    measureWidth,
    ticksPerWrittenQuarter,
    fullMeasureTicks,
    timelineOriginTicks: pickup ? fullMeasureTicks - spanTicks : 0,
  }
}

/** SVG width that fits one grid cell, after the measure border and padding. */
function availableSvgWidth(grid: HTMLElement, columns: number): number | undefined {
  const gridWidth = grid.clientWidth
  if (gridWidth <= 0 || columns < 1) return undefined
  const gap = Number.parseFloat(getComputedStyle(grid).columnGap)
  const columnGap = Number.isFinite(gap) ? gap : 0
  const slot = (gridWidth - columnGap * (columns - 1)) / columns
  const probe = document.createElement('div')
  probe.className = 'measure'
  grid.append(probe)
  const style = getComputedStyle(probe)
  const chrome =
    parsedPixels(style.paddingLeft) +
    parsedPixels(style.paddingRight) +
    parsedPixels(style.borderLeftWidth) +
    parsedPixels(style.borderRightWidth)
  probe.remove()
  return Math.floor(slot - chrome)
}

function parsedPixels(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function measureBlock(
  song: Song,
  label: string,
  span: { startTick: number; endTick: number },
  spanQuarters: number,
  ticksPerWrittenQuarter: number,
  timeSignature: TimeSignature,
  staffByTrack: ReadonlyMap<number, PianoStaff>,
  staffForNote: (note: MidiNote) => PianoStaff | undefined,
  system: NotationSystem,
  maxWidth: number | undefined,
  trueTime: TrueTimeMeasure,
): HTMLElement {
  const item = document.createElement('div')
  item.className = 'engraving__item'
  if (system === 'midgard') item.dataset.notation = 'midgard'

  const name = document.createElement('p')
  name.className = 'engraving__label'
  name.textContent = label

  const ticks = document.createElement('p')
  ticks.className = 'engraving__ticks'
  ticks.textContent = `Ticks ${Math.round(span.startTick)}–${Math.round(span.endTick)}`

  const content = buildMeasureContent({
    notes: song.originalMidi.notes,
    span,
    ticksPerWrittenQuarter,
    staffByTrack,
    staffForNote,
    measureQuarters: fractionFromQuarters(spanQuarters),
    sustainedNotes: song.musicalInterpretation.sustainedNotes,
    writtenDurations: song.musicalInterpretation.writtenDurations,
    graceNotes: song.musicalInterpretation.graceNotes,
    writtenOnsetTick: (note) => resolveWrittenOnset(note.startTick, song.musicalInterpretation),
  })
  const frame = document.createElement('div')
  frame.className = system === 'midgard' ? 'measure measure--midgard' : 'measure'
  const svg = measureSvg({
    label,
    content,
    timeSignature,
    system,
    maxWidth,
    trueTime: system === 'midgard' ? trueTime : undefined,
  })
  frame.append(svg)
  item.append(name, ticks, frame)
  if (svg.getAttribute('data-fits') === 'false') item.append(densityWarning(system === 'midgard'))
  if (content.unresolved.length > 0) item.append(unresolvedWarning(content.unresolved))
  return item
}

function densityWarning(trueTime: boolean): HTMLElement {
  const warning = document.createElement('p')
  warning.className = 'engraving__warning'
  warning.textContent = trueTime
    ? 'These notes stay at their written times. This width is too narrow for them to sit apart.'
    : 'This bar is too dense for the column. The notes kept their minimum spacing and were not overlapped.'
  return warning
}

function unresolvedWarning(notes: readonly { midi: number; track: number; startTick: number; durationTicks: number; reason: string }[]): HTMLElement {
  const count = notes.length
  const wrap = document.createElement('div')
  wrap.className = 'engraving__caution'

  const warning = document.createElement('p')
  warning.className = 'engraving__warning'
  warning.textContent = `⚠️ ${count} unresolved MIDI ${count === 1 ? 'note' : 'notes'}`

  const details = document.createElement('details')
  details.className = 'engraving__details'
  const summary = document.createElement('summary')
  summary.textContent = 'Show the unresolved notes'
  const list = document.createElement('ul')
  list.className = 'engraving__unresolved'
  for (const note of notes) {
    const item = document.createElement('li')
    item.textContent = `Track ${note.track}, MIDI pitch ${note.midi}, onset tick ${note.startTick}, duration ${note.durationTicks} ticks. ${note.reason}`
    list.append(item)
  }
  details.append(summary, list)
  wrap.append(warning, details)
  return wrap
}
