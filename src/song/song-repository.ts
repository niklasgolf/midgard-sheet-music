import type { Song } from './song.ts'

/**
 * The operations the application needs from a Song database.
 * The interface speaks in Songs. It does not mention IndexedDB, Convex, or queries.
 * IndexedDB implements it today. A later Convex implementation can replace that
 * class without a change to interpretation or engraving.
 */
export interface SongRepository {
  getSong(id: string): Promise<Song | undefined>
  listSongs(): Promise<Song[]>
  /** Inserts a Song. Fails if that id is already stored, so an existing Song is not replaced. */
  addSong(song: Song): Promise<void>
  /** Replaces an existing Song. Fails if the id is absent, so a save cannot create a second copy. */
  saveSong(song: Song): Promise<void>
}
