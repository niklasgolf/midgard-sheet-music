import { isSong, type Song } from './song.ts'

export const SONG_DATABASE_NAME = 'midgard-sheet-music'
export const SONG_DATABASE_VERSION = 1
export const SONG_STORE_NAME = 'songs'

export class SongDatabaseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SongDatabaseError'
  }
}

export function openSongDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SONG_DATABASE_NAME, SONG_DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(SONG_STORE_NAME)) {
        database.createObjectStore(SONG_STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(asDatabaseError(request.error, 'The song database could not be opened.'))
    request.onblocked = () => {
      reject(new SongDatabaseError('The song database is blocked by another open tab.'))
    }
  })
}

/** Inserts a Song. Fails if that id is already stored, so an existing Song is not replaced. */
export async function addSong(song: Song): Promise<void> {
  const database = await openSongDatabase()
  try {
    const transaction = database.transaction(SONG_STORE_NAME, 'readwrite')
    const request = transaction.objectStore(SONG_STORE_NAME).add(song)
    await finishWrite(request, transaction)
  } finally {
    database.close()
  }
}

/**
 * Replaces an existing Song record. Does not create a Song when the id is absent,
 * so a save cannot insert a second copy under a new identity.
 */
export async function replaceSong(song: Song): Promise<void> {
  if (!isSong(song)) {
    throw new SongDatabaseError('The updated record is not a Song document.')
  }
  const database = await openSongDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(SONG_STORE_NAME, 'readwrite')
      const store = transaction.objectStore(SONG_STORE_NAME)
      const lookup = store.get(song.id)
      let settled = false
      const fail = (error: DOMException | null, fallback: string) => {
        if (settled) return
        settled = true
        reject(asDatabaseError(error, fallback))
      }

      lookup.onerror = () => fail(lookup.error, 'The existing Song could not be read.')
      lookup.onsuccess = () => {
        if (lookup.result === undefined) {
          fail(null, `There is no saved Song with id ${song.id}.`)
          transaction.abort()
          return
        }
        const write = store.put(song)
        write.onerror = () => fail(write.error, 'The Song could not be saved.')
      }
      transaction.onabort = () => fail(transaction.error, 'Saving the Song was aborted.')
      transaction.oncomplete = () => {
        if (settled) return
        settled = true
        resolve()
      }
    })
  } finally {
    database.close()
  }
}

export async function getSong(id: string): Promise<Song | undefined> {
  const database = await openSongDatabase()
  try {
    const transaction = database.transaction(SONG_STORE_NAME, 'readonly')
    const request = transaction.objectStore(SONG_STORE_NAME).get(id)
    const value = await requestResult(request)
    if (value === undefined) return undefined
    if (!isSong(value)) {
      throw new SongDatabaseError(`The record ${id} is not a Song document.`)
    }
    return value
  } finally {
    database.close()
  }
}

export async function listSongs(): Promise<Song[]> {
  const database = await openSongDatabase()
  try {
    const transaction = database.transaction(SONG_STORE_NAME, 'readonly')
    const request = transaction.objectStore(SONG_STORE_NAME).getAll()
    const value = await requestResult(request)
    if (!Array.isArray(value) || !value.every(isSong)) {
      throw new SongDatabaseError('The songs store returned a record that is not a Song.')
    }
    return value
  } finally {
    database.close()
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(asDatabaseError(request.error, 'An IndexedDB request failed.'))
  })
}

function finishWrite(request: IDBRequest<IDBValidKey>, transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const fail = (error: DOMException | null, fallback: string) => {
      if (settled) return
      settled = true
      reject(asDatabaseError(error, fallback))
    }

    request.onerror = () => fail(request.error, 'The Song could not be saved.')
    transaction.onabort = () => fail(transaction.error, 'Saving the Song was aborted.')
    transaction.oncomplete = () => {
      if (settled) return
      settled = true
      resolve()
    }
  })
}

function asDatabaseError(error: DOMException | null, fallback: string): SongDatabaseError {
  const message = error?.message ? `${fallback} ${error.message}` : fallback
  return new SongDatabaseError(message)
}
