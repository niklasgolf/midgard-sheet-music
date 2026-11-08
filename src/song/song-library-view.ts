import type { Song } from './song.ts'

export type SongLibraryController = {
  show(songs: readonly Song[]): void
}

/** The visible name of one stored Song. The id stays on the button and is not shown. */
export function songChoiceLabel(song: Song): string {
  return `${song.metadata.composer} — ${song.metadata.title}`
}

/**
 * Fills a vertical list from stored records.
 * Each row is a button, so it can be reached and activated from the keyboard.
 */
export function mountSongLibrary(
  list: HTMLUListElement,
  onSelect: (song: Song) => void,
): SongLibraryController {
  let songs: readonly Song[] = []

  list.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest('button')
    if (!(button instanceof HTMLButtonElement) || !list.contains(button)) return
    const song = songs.find((entry) => entry.id === button.dataset.songId)
    if (song) onSelect(song)
  })

  return {
    show(nextSongs) {
      songs = [...nextSongs].sort(
        (left, right) =>
          left.metadata.composer.localeCompare(right.metadata.composer) ||
          left.metadata.title.localeCompare(right.metadata.title) ||
          left.id.localeCompare(right.id),
      )
      list.replaceChildren()
      for (const song of songs) {
        const item = document.createElement('li')
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'editor__choice'
        button.dataset.songId = song.id
        button.textContent = songChoiceLabel(song)
        item.append(button)
        list.append(item)
      }
    },
  }
}
