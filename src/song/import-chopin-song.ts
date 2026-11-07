import type { Song } from './song.ts'
import { CHOPIN_SONG_ID, ensureProjectSongs } from './project-songs.ts'

export { CHOPIN_SONG_ID }

export type SongLoad = {
  song: Song
  source: 'imported' | 'existing'
}

/**
 * Returns the original Chopin Song from IndexedDB.
 * Project Songs that are missing are imported once. An existing record is not parsed again.
 */
export async function loadChopinSong(): Promise<SongLoad> {
  const { songs, importedIds } = await ensureProjectSongs()
  const song = songs.find((entry) => entry.id === CHOPIN_SONG_ID)
  if (!song) {
    throw new Error('The Chopin Song is not in the library.')
  }
  return { song, source: importedIds.has(song.id) ? 'imported' : 'existing' }
}
