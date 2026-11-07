import { fractionFromQuarters } from '../interpretation/duration.ts'
import { buildMeasureContent } from '../interpretation/measure-content.ts'
import { assignPianoStaffs, type PianoStaff } from '../interpretation/staff.ts'
import type { Song } from '../song/song.ts'
import { notesBeginningInSpan, writtenMeasures } from './written-measures.ts'
import { measureSvg } from './piano-measure-svg.ts'

/** Pickup plus sixteen complete measures. The page layout chooses this count. */
const EXPERIMENT_MEASURE_COUNT = 17

/** Draws the development measures from the stored Song. The SVGs are not saved. */
export function renderEngraving(container: HTMLElement, song: Song): void {
  const title = document.createElement('h2')
  title.id = 'engraving-title'
  title.className = 'engraving__title'
  title.textContent = 'Traditional Sheet Music — SVG Experiment'

  const interpretation = song.musicalInterpretation
  const plan = writtenMeasures(interpretation, EXPERIMENT_MEASURE_COUNT)
  const ticksPerWrittenQuarter = interpretation.ticksPerWrittenQuarter
  if (!plan.ready || ticksPerWrittenQuarter === undefined) {
    const message = document.createElement('p')
    message.className = 'engraving__message'
    message.textContent = plan.ready
      ? 'The musical settings needed to draw the measures are incomplete.'
      : plan.message
    container.replaceChildren(title, message)
    return
  }

  const staves = assignPianoStaffs(song.originalMidi.notes)
  if (!staves.ready) {
    const message = document.createElement('p')
    message.className = 'engraving__message'
    message.textContent = staves.message
    container.replaceChildren(title, message)
    return
  }

  const grid = document.createElement('div')
  grid.className = 'engraving__grid'
  for (const measure of plan.measures) {
    grid.append(
      measureBlock(
        song,
        `Bar ${measure.index}`,
        measure.span,
        measure.quarters,
        ticksPerWrittenQuarter,
        staves.staffByTrack,
      ),
    )
  }
  container.replaceChildren(title, grid)
  const widest = Math.max(
    0,
    ...[...grid.querySelectorAll<HTMLElement>('.engraving__item')].map((item) => item.offsetWidth),
  )
  if (widest > 0) grid.style.gridTemplateColumns = `repeat(3, ${widest}px)`
}

function measureBlock(
  song: Song,
  label: string,
  span: { startTick: number; endTick: number },
  spanQuarters: number,
  ticksPerWrittenQuarter: number,
  staffByTrack: ReadonlyMap<number, PianoStaff>,
): HTMLElement {
  const notes = notesBeginningInSpan(song.originalMidi.notes, span)
  const item = document.createElement('div')
  item.className = 'engraving__item'

  const name = document.createElement('p')
  name.className = 'engraving__label'
  name.textContent = label

  const ticks = document.createElement('p')
  ticks.className = 'engraving__ticks'
  ticks.textContent = `Ticks ${Math.round(span.startTick)}–${Math.round(span.endTick)}`

  const content = buildMeasureContent({
    notes,
    span,
    ticksPerWrittenQuarter,
    staffByTrack,
    measureQuarters: fractionFromQuarters(spanQuarters),
  })
  const frame = document.createElement('div')
  frame.className = 'measure'
  frame.append(measureSvg({ label, content }))
  item.append(name, ticks, frame)
  if (content.unresolved.length > 0) item.append(unresolvedWarning(content.unresolved))
  return item
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
