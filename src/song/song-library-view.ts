import type { Song } from './song.ts'

export type SongLibraryController = {
  show(songs: readonly Song[], selectedId: string): void
}

/** Fills the Song dropdown from stored records. The option value is the Song id. */
export function mountSongLibrary(
  select: HTMLSelectElement,
  onSelect: (song: Song) => void,
): SongLibraryController {
  let songs: readonly Song[] = []

  select.addEventListener('change', () => {
    const song = songs.find((entry) => entry.id === select.value)
    if (song) onSelect(song)
  })

  return {
    show(nextSongs, selectedId) {
      songs = [...nextSongs].sort(
        (left, right) =>
          left.metadata.title.localeCompare(right.metadata.title) || left.id.localeCompare(right.id),
      )
      select.replaceChildren()
      for (const song of songs) {
        const option = document.createElement('option')
        option.value = song.id
        option.textContent = `${song.metadata.composer} — ${song.metadata.title}`
        select.append(option)
      }
      if (songs.some((song) => song.id === selectedId)) select.value = selectedId
    },
  }
}
