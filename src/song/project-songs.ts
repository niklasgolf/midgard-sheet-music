import midiAUrl from '../../midi-files/chopin-prelude-op-28-no-7-in-a-major.mid?url'
import midiBUrl from '../../midi-files/chopin-prelude-op-28-no-7-in-a-major-b.mid?url'
import midiCUrl from '../../midi-files/eine-kleine-nachtmusik-intermediate.mid?url'
import midiEtudeUrl from '../../midi-files/etude-op10-no3-e-major-tristesse-chopin.mid?url'
import pdfAUrl from '../../pdf-files/chopin-prelude-op-28-no-7-in-a-major.pdf?url'
import pdfBUrl from '../../pdf-files/chopin-prelude-op-28-no-7-in-a-major-b.pdf?url'
import pdfCUrl from '../../pdf-files/eine-kleine-nachtmusik-intermediate.pdf?url'
import pdfEtudeUrl from '../../pdf-files/etude-op10-no3-e-major-tristesse-chopin.pdf?url'
import { parseMidi, type MidiFile } from '../midi/parse-midi.ts'
import type { SongRepository } from './song-repository.ts'
import { SONG_SCHEMA_VERSION, type Song } from './song.ts'

/** Existing demonstration Song. This id is already stored and must not be replaced. */
export const CHOPIN_SONG_ID = 'chopin-prelude-op-28-no-7'

export const CHOPIN_SONG_B_ID = 'chopin-prelude-op28-no7-b'

export const EINE_KLEINE_SONG_ID = 'eine-kleine-nachtmusik-intermediate'

export const CHOPIN_ETUDE_SONG_ID = 'chopin-etude-op10-no3-tristesse'

type ProjectSongFile = {
  id: string
  title: string
  composer: string
  sourceFilename: string
  pdfFilename: string
  midiUrl: string
  pdfUrl: string
}

/**
 * Files shipped with the project. A stored Song is never rewritten from this list.
 * The library dropdown itself reads IndexedDB.
 */
const PROJECT_SONGS: readonly ProjectSongFile[] = [
  {
    id: CHOPIN_SONG_ID,
    title: 'Prelude Op. 28 No. 7 in A major',
    composer: 'Frédéric Chopin',
    sourceFilename: 'chopin-prelude-op-28-no-7-in-a-major.mid',
    pdfFilename: 'chopin-prelude-op-28-no-7-in-a-major.pdf',
    midiUrl: midiAUrl,
    pdfUrl: pdfAUrl,
  },
  {
    id: CHOPIN_SONG_B_ID,
    title: 'Prelude Op. 28 No. 7 in A major (B)',
    composer: 'Frédéric Chopin',
    sourceFilename: 'chopin-prelude-op-28-no-7-in-a-major-b.mid',
    pdfFilename: 'chopin-prelude-op-28-no-7-in-a-major-b.pdf',
    midiUrl: midiBUrl,
    pdfUrl: pdfBUrl,
  },
  {
    id: EINE_KLEINE_SONG_ID,
    title: 'Eine kleine Nachtmusik — Intermediate',
    composer: 'Wolfgang Amadeus Mozart',
    sourceFilename: 'eine-kleine-nachtmusik-intermediate.mid',
    pdfFilename: 'eine-kleine-nachtmusik-intermediate.pdf',
    midiUrl: midiCUrl,
    pdfUrl: pdfCUrl,
  },
  {
    id: CHOPIN_ETUDE_SONG_ID,
    title: 'Étude Op. 10 No. 3 in E major (Tristesse)',
    composer: 'Frédéric Chopin',
    sourceFilename: 'etude-op10-no3-e-major-tristesse-chopin.mid',
    pdfFilename: 'etude-op10-no3-e-major-tristesse-chopin.pdf',
    midiUrl: midiEtudeUrl,
    pdfUrl: pdfEtudeUrl,
  },
]

export type ProjectSongLoad = {
  songs: Song[]
  importedIds: ReadonlySet<string>
}

/**
 * Adds a project Song only when its id is absent.
 * An existing record, including its settings and MIDI, is left untouched.
 */
export async function ensureProjectSongs(repository: SongRepository): Promise<ProjectSongLoad> {
  const importedIds = new Set<string>()
  for (const entry of PROJECT_SONGS) {
    const existing = await repository.getSong(entry.id)
    if (existing) continue
    const imported = await importMissingSong(repository, entry)
    if (imported) importedIds.add(entry.id)
  }
  return { songs: await repository.listSongs(), importedIds }
}

/** PDF for a stored Song. The known project files cover records saved before pdfFilename existed. */
export function pdfUrlForSong(song: Song): string | undefined {
  const match = PROJECT_SONGS.find(
    (entry) =>
      entry.id === song.id ||
      entry.pdfFilename === song.metadata.pdfFilename ||
      entry.sourceFilename === song.metadata.sourceFilename,
  )
  return match?.pdfUrl
}

export function pdfFilenameForSong(song: Song): string | undefined {
  if (song.metadata.pdfFilename) return song.metadata.pdfFilename
  return PROJECT_SONGS.find((entry) => entry.id === song.id || entry.sourceFilename === song.metadata.sourceFilename)
    ?.pdfFilename
}

async function importMissingSong(repository: SongRepository, entry: ProjectSongFile): Promise<boolean> {
  const originalMidi = await readMidi(entry.midiUrl)
  const song: Song = {
    id: entry.id,
    schemaVersion: SONG_SCHEMA_VERSION,
    metadata: {
      title: entry.title,
      composer: entry.composer,
      sourceFilename: entry.sourceFilename,
      pdfFilename: entry.pdfFilename,
    },
    originalMidi,
    musicalInterpretation: {},
  }

  try {
    await repository.addSong(song)
  } catch (error) {
    const stored = await repository.getSong(entry.id)
    if (stored) return false
    throw error
  }

  const stored = await repository.getSong(entry.id)
  if (!stored) {
    throw new Error(`The Song ${entry.id} was saved but could not be read back.`)
  }
  if (JSON.stringify(stored.originalMidi) !== JSON.stringify(originalMidi)) {
    throw new Error(`IndexedDB did not preserve the imported MIDI for ${entry.id}.`)
  }
  return true
}

async function readMidi(url: string): Promise<MidiFile> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Could not load a project MIDI file (${response.status}).`)
  }
  return parseMidi(new Uint8Array(await response.arrayBuffer()))
}
