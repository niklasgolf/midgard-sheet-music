import chopinUrl from '../../midi-files/chopin-prelude-op-28-no-7-in-a-major.mid?url'
import { parseMidi, type MidiFile } from '../midi/parse-midi.ts'
import { SONG_SCHEMA_VERSION, type Song } from './song.ts'
import { addSong, getSong } from './song-database.ts'

/** First demonstration import. A later import screen will replace this fixed identity. */
export const CHOPIN_SONG_ID = 'chopin-prelude-op-28-no-7'

export type SongLoad = {
  song: Song
  source: 'imported' | 'existing'
}

/**
 * Returns the Chopin Song from IndexedDB.
 * The MIDI file is parsed only when that Song is not already stored.
 */
export async function loadChopinSong(): Promise<SongLoad> {
  const existing = await getSong(CHOPIN_SONG_ID)
  if (existing) return { song: existing, source: 'existing' }

  const originalMidi = await readChopinMidi()
  const song: Song = {
    id: CHOPIN_SONG_ID,
    schemaVersion: SONG_SCHEMA_VERSION,
    metadata: {
      title: 'Prelude Op. 28 No. 7 in A major',
      composer: 'Frédéric Chopin',
      sourceFilename: 'chopin-prelude-op-28-no-7-in-a-major.mid',
    },
    originalMidi,
    musicalInterpretation: {},
  }

  try {
    await addSong(song)
  } catch (error) {
    const stored = await getSong(CHOPIN_SONG_ID)
    if (stored) return { song: stored, source: 'existing' }
    throw error
  }

  const stored = await getSong(CHOPIN_SONG_ID)
  if (!stored) {
    throw new Error('The Chopin Song was saved but could not be read back.')
  }
  if (!sameMidi(stored.originalMidi, originalMidi)) {
    throw new Error('IndexedDB did not preserve the imported MIDI information.')
  }
  return { song: stored, source: 'imported' }
}

async function readChopinMidi(): Promise<MidiFile> {
  const response = await fetch(chopinUrl)
  if (!response.ok) {
    throw new Error(`Could not load the Chopin MIDI file (${response.status}).`)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  return parseMidi(bytes)
}

function sameMidi(stored: MidiFile, parsed: MidiFile): boolean {
  return JSON.stringify(stored) === JSON.stringify(parsed)
}
