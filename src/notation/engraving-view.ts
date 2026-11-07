import type { Song } from '../song/song.ts'
import { quartersInBar, quartersInNote, openingMeasures, notesBeginningInSpan } from './written-measures.ts'
import { measureSvg } from './piano-measure-svg.ts'

/** Draws Bar 0 and Bar 1 from the stored Song. The SVG is not saved. */
export function renderEngraving(container: HTMLElement, song: Song): void {
  const title = document.createElement('h2')
  title.id = 'engraving-title'
  title.className = 'engraving__title'
  title.textContent = 'Traditional Sheet Music — SVG Experiment'

  const interpretation = song.musicalInterpretation
  const measures = openingMeasures(interpretation)
  const signature = interpretation.timeSignature
  const pickup = interpretation.pickup
  if (!measures.ready || signature === undefined || pickup?.present !== true) {
    const message = document.createElement('p')
    message.className = 'engraving__message'
    message.textContent = measures.ready
      ? 'The musical settings needed to draw the measures are incomplete.'
      : measures.message
    container.replaceChildren(title, message)
    return
  }

  const barQuarters = quartersInBar(signature)
  const row = document.createElement('div')
  row.className = 'engraving__row'
  row.append(
    measureBlock(song, 'Bar 0', measures.pickup, quartersInNote(pickup.duration), barQuarters),
    measureBlock(song, 'Bar 1', measures.firstFull, barQuarters, barQuarters),
  )
  container.replaceChildren(title, row)
}

function measureBlock(
  song: Song,
  label: string,
  span: { startTick: number; endTick: number },
  spanQuarters: number,
  barQuarters: number,
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

  const frame = document.createElement('div')
  frame.className = 'measure'
  frame.append(
    measureSvg({
      notes,
      tracks: song.originalMidi.tracks,
      span,
      spanQuarters,
      barQuarters,
      label,
    }),
  )

  item.append(name, ticks, frame)
  return item
}
