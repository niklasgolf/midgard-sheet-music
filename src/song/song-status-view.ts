import type { SongLoad } from './import-chopin-song.ts'
import { SONG_DATABASE_NAME } from './song-database.ts'

export function renderSongStatus(container: HTMLElement, load: SongLoad): void {
  const title = document.createElement('h2')
  title.className = 'storage__title'
  title.textContent = 'Song Storage — IndexedDB'

  const facts = document.createElement('dl')
  facts.className = 'storage__facts'
  facts.append(
    fact('Database', SONG_DATABASE_NAME),
    fact('Title', load.song.metadata.title),
    fact('Song ID', load.song.id),
    fact('Imported notes', String(load.song.originalMidi.notes.length)),
    fact('MIDI tracks', String(load.song.originalMidi.trackCount)),
    fact('Storage', load.source === 'imported' ? 'Newly imported' : 'Loaded from existing storage'),
  )

  container.replaceChildren(title, facts)
}

export function renderSongStatusError(container: HTMLElement, message: string): void {
  const title = document.createElement('h2')
  title.className = 'storage__title'
  title.textContent = 'Song Storage — IndexedDB'

  const detail = document.createElement('p')
  detail.className = 'storage__message'
  detail.textContent = message

  container.replaceChildren(title, detail)
}

function fact(label: string, value: string): DocumentFragment {
  const fragment = document.createDocumentFragment()
  const term = document.createElement('dt')
  term.textContent = label
  const description = document.createElement('dd')
  description.textContent = value
  fragment.append(term, description)
  return fragment
}
