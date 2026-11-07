import { readingJunctions } from '../interpretation/sustained-note.ts'
import type { SongRepository } from './song-repository.ts'
import type { Song, SustainedNoteReading } from './song.ts'

/**
 * Song B's confirmed spelling of one MIDI sound.
 * This is the payload copied into that Song's Part C when the record does not
 * already contain it. Drawing reads the saved Song. It does not read this value.
 */
export const SONG_B_ID = 'chopin-prelude-op28-no7-b'

export const SONG_B_BAR5_D4: SustainedNoteReading = {
  track: 2,
  midi: 62,
  startTick: 5280,
  endTick: 6912,
  written: ['sixteenth', 'half', 'half'],
}

/** C♯5 in Bar 11. The last quarter is written again and is not tied. */
export const SONG_B_BAR11_CSHARP: SustainedNoteReading = {
  track: 2,
  midi: 73,
  startTick: 12192,
  endTick: 13056,
  written: ['sixteenth', 'quarter', 'quarter'],
  ties: [true, false],
}

/** E5 in Bar 11. The same written rhythm and the same tie as the C♯5 beside it. */
export const SONG_B_BAR11_E: SustainedNoteReading = {
  track: 2,
  midi: 76,
  startTick: 12192,
  endTick: 13056,
  written: ['sixteenth', 'quarter', 'quarter'],
  ties: [true, false],
}

export const SONG_B_READINGS: readonly SustainedNoteReading[] = [
  SONG_B_BAR5_D4,
  SONG_B_BAR11_CSHARP,
  SONG_B_BAR11_E,
]

export type SustainedReadingPlan =
  | { action: 'install'; song: Song }
  | { action: 'unchanged' }
  | { action: 'conflict'; message: string }
  | { action: 'midi-mismatch'; message: string }

export type SustainedReadingInstall =
  | { status: 'absent' }
  | { status: 'unchanged' }
  | { status: 'installed'; song: Song }
  | { status: 'conflict'; message: string }
  | { status: 'midi-mismatch'; message: string }

export type SustainedReadingsInstall =
  | { status: 'absent' }
  | { status: 'unchanged' }
  | { status: 'installed'; song: Song; messages: readonly string[] }
  | { status: 'conflict'; message: string }
  | { status: 'midi-mismatch'; message: string }

/**
 * Decide whether one written spelling can be added to a Song.
 * A matching spelling is left alone. A different spelling for the same MIDI
 * event is a conflict and is not replaced. The MIDI object is not copied or edited.
 */
export function planSustainedReading(song: Song, reading: SustainedNoteReading): SustainedReadingPlan {
  if (readingJunctions(reading) === undefined) {
    return {
      action: 'conflict',
      message: `Song ${song.id} was not given one tie flag for every junction of track ${reading.track}, MIDI ${reading.midi}, ticks ${reading.startTick}–${reading.endTick}. No spelling was saved.`,
    }
  }
  const stored = song.musicalInterpretation.sustainedNotes ?? []
  const sameEvent = stored.filter((entry) => sameSound(entry, reading))
  if (sameEvent.some((entry) => !sameSpelling(entry, reading))) {
    return {
      action: 'conflict',
      message: `Song ${song.id} already stores a different spelling for track ${reading.track}, MIDI ${reading.midi}, ticks ${reading.startTick}–${reading.endTick}. That spelling was left in place.`,
    }
  }
  if (sameEvent.length > 0) return { action: 'unchanged' }

  const matches = song.originalMidi.notes.filter(
    (note) =>
      note.track === reading.track &&
      note.midi === reading.midi &&
      note.startTick === reading.startTick &&
      note.endTick === reading.endTick,
  )
  const sounded = matches[0]
  if (matches.length !== 1 || sounded === undefined || sounded.durationTicks !== sounded.endTick - sounded.startTick) {
    return {
      action: 'midi-mismatch',
      message: `Song ${song.id} has no single MIDI note on track ${reading.track}, pitch ${reading.midi}, ticks ${reading.startTick}–${reading.endTick}. No spelling was saved.`,
    }
  }

  return {
    action: 'install',
    song: {
      ...song,
      originalMidi: song.originalMidi,
      musicalInterpretation: {
        ...song.musicalInterpretation,
        sustainedNotes: [...stored, reading],
      },
    },
  }
}

/**
 * Store a spelling in Part C when it is missing.
 * An unchanged Song is not written again. A conflict or a MIDI mismatch is not written.
 */
export async function installSustainedReading(
  repository: SongRepository,
  songId: string,
  reading: SustainedNoteReading,
): Promise<SustainedReadingInstall> {
  const result = await installSustainedReadings(repository, songId, [reading])
  if (result.status === 'installed') return { status: 'installed', song: result.song }
  if (result.status === 'conflict' || result.status === 'midi-mismatch') {
    return { status: result.status, message: result.message }
  }
  return { status: result.status }
}

/**
 * Store several spellings in one save.
 * A spelling that is already present is not written again. A different spelling
 * of the same MIDI event is left in place. Only a Song that gained a spelling is saved.
 */
export async function installSustainedReadings(
  repository: SongRepository,
  songId: string,
  readings: readonly SustainedNoteReading[],
): Promise<SustainedReadingsInstall> {
  const song = await repository.getSong(songId)
  if (song === undefined) return { status: 'absent' }

  let current = song
  const added: SustainedNoteReading[] = []
  const problems: { status: 'conflict' | 'midi-mismatch'; message: string }[] = []
  for (const reading of readings) {
    const plan = planSustainedReading(current, reading)
    if (plan.action === 'install') {
      current = plan.song
      added.push(reading)
      continue
    }
    if (plan.action === 'conflict' || plan.action === 'midi-mismatch') {
      problems.push({ status: plan.action, message: plan.message })
    }
  }

  if (added.length === 0) {
    if (problems.length === 0) return { status: 'unchanged' }
    const status = problems.every((problem) => problem.status === 'midi-mismatch') ? 'midi-mismatch' : 'conflict'
    return { status, message: problems.map((problem) => problem.message).join(' ') }
  }

  await repository.saveSong(current)
  const stored = await repository.getSong(songId)
  if (stored === undefined) {
    throw new Error(`The spelling for ${songId} was saved but the Song could not be read back.`)
  }
  if (JSON.stringify(stored.originalMidi) !== JSON.stringify(song.originalMidi)) {
    throw new Error(`Saving a spelling changed the imported MIDI for ${songId}.`)
  }
  for (const reading of added) {
    if (planSustainedReading(stored, reading).action !== 'unchanged') {
      throw new Error(`The spelling for ${songId} was not present after it was saved.`)
    }
  }
  return {
    status: 'installed',
    song: stored,
    messages: problems.map((problem) => problem.message),
  }
}

/** Copy Song B's Bar 5 D4 spelling into that record, once, when the MIDI event matches. */
export function installSongBBar5Reading(repository: SongRepository): Promise<SustainedReadingInstall> {
  return installSustainedReading(repository, SONG_B_ID, SONG_B_BAR5_D4)
}

/** Copy Song B's confirmed spellings into that record. Readings already stored are not written again. */
export function installSongBReadings(repository: SongRepository): Promise<SustainedReadingsInstall> {
  return installSustainedReadings(repository, SONG_B_ID, SONG_B_READINGS)
}

function sameSound(stored: SustainedNoteReading, reading: SustainedNoteReading): boolean {
  return (
    stored.track === reading.track &&
    stored.midi === reading.midi &&
    stored.startTick === reading.startTick &&
    stored.endTick === reading.endTick
  )
}

function sameSpelling(stored: SustainedNoteReading, reading: SustainedNoteReading): boolean {
  if (stored.written.length !== reading.written.length) return false
  if (!stored.written.every((value, index) => value === reading.written[index])) return false
  const storedTies = readingJunctions(stored)
  const readingTies = readingJunctions(reading)
  if (storedTies === undefined || readingTies === undefined) return false
  return storedTies.every((flag, index) => flag === readingTies[index])
}
