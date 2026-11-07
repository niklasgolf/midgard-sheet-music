import { addSong, getSong, listSongs, replaceSong } from './song-database.ts'
import type { SongRepository } from './song-repository.ts'
import type { Song } from './song.ts'

/**
 * The current Song database. IndexedDB remains authoritative for this prototype.
 * The methods delegate to the existing store. They do not open a second schema.
 */
export class IndexedDBSongRepository implements SongRepository {
  getSong(id: string): Promise<Song | undefined> {
    return getSong(id)
  }

  listSongs(): Promise<Song[]> {
    return listSongs()
  }

  addSong(song: Song): Promise<void> {
    return addSong(song)
  }

  saveSong(song: Song): Promise<void> {
    return replaceSong(song)
  }
}
