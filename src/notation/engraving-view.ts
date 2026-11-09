import type { MidiNote } from '../midi/parse-midi.ts'
import { fractionFromQuarters } from '../interpretation/duration.ts'
import { buildMeasureContent } from '../interpretation/measure-content.ts'
import { assignPianoStaffs, type PianoStaff } from '../interpretation/staff.ts'
import { resolveWrittenOnset } from '../interpretation/written-onset.ts'
import { completeMeasureRequest, measuresPerRowCount, type Song, type TimeSignature } from '../song/song.ts'
import { displayedMeasures } from './written-measures.ts'
import { measureSvg } from './piano-measure-svg.ts'
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

  const grid = document.createElement('div')
  grid.className = 'engraving__grid'
  grid.dataset.columns = String(measuresPerRowCount(song))
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
      ),
    )
  }
  container.replaceChildren(title, grid)
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
): HTMLElement {
  const item = document.createElement('div')
  item.className = 'engraving__item'

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
  frame.className = 'measure'
  frame.append(measureSvg({ label, content, timeSignature, system }))
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
