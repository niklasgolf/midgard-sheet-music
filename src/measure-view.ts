import type { ChopinMeasure, NoteGroup } from './midi/chopin-measure.ts'

export function renderMeasure(container: HTMLElement, measure: ChopinMeasure): void {
  const title = document.createElement('h2')
  title.className = 'measure__title'
  title.textContent = 'Chopin — Prelude Op. 28 No. 7'

  const meta = document.createElement('p')
  meta.className = 'measure__meta'
  meta.textContent = [
    'Measure 1',
    `Time signature ${measure.measure.meter.beats}/${measure.measure.meter.beatValue} (supplied)`,
    `${measure.noteCount} notes`,
  ].join(' · ')

  const hands = document.createElement('div')
  hands.className = 'measure__hands'

  for (const hand of measure.hands) {
    const panel = document.createElement('section')
    panel.className = 'measure__hand'

    const label = document.createElement('h3')
    label.className = 'measure__hand-label'
    label.textContent = hand.label

    const track = document.createElement('p')
    track.className = 'measure__track'
    track.textContent = hand.trackName

    const events = document.createElement('ol')
    events.className = 'measure__events'
    for (const group of hand.groups) {
      events.append(renderGroup(group))
    }

    panel.append(label, track, events)
    hands.append(panel)
  }

  container.replaceChildren(title, meta, hands)
}

export function renderMeasureError(container: HTMLElement, message: string): void {
  const title = document.createElement('h2')
  title.className = 'measure__title'
  title.textContent = 'Chopin — Prelude Op. 28 No. 7'

  const detail = document.createElement('p')
  detail.className = 'measure__meta'
  detail.textContent = message

  container.replaceChildren(title, detail)
}

function renderGroup(group: NoteGroup): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'measure__event'

  const tick = document.createElement('span')
  tick.className = 'measure__tick'
  tick.textContent = String(group.startTick)

  const pitches = document.createElement('span')
  pitches.className = 'measure__pitches'
  pitches.textContent = formatPitches(group.pitches)

  item.append(tick, pitches)
  return item
}

function formatPitches(pitches: readonly string[]): string {
  const only = pitches[0]
  if (pitches.length === 1 && only !== undefined) return only
  return `[${pitches.join(' ')}]`
}
