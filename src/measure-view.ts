import type { NoteGroup, NotePreview } from './midi/chopin-measure.ts'

export function renderMeasure(container: HTMLElement, preview: NotePreview): void {
  const title = document.createElement('h2')
  title.className = 'measure__title'
  title.textContent = `${preview.composer} — ${preview.title}`

  const meta = document.createElement('p')
  meta.className = 'measure__meta'
  meta.textContent = [
    `Ticks ${preview.windowStart}–${preview.windowEnd}`,
    'temporary development view',
    `${preview.noteCount} notes`,
  ].join(' · ')

  const hands = document.createElement('div')
  hands.className = 'measure__hands'

  for (const hand of preview.hands) {
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
  title.textContent = 'Stored Song'

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
