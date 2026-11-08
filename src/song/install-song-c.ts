import type { SongRepository } from './song-repository.ts'
import type { Song } from './song.ts'

export const SONG_C_ID = 'eine-kleine-nachtmusik-intermediate'

/** MIDI tick where the printed Bar 1 begins. The notes themselves stay at their file times. */
export const SONG_C_WRITTEN_START_TICK = 2734

/** Middle C. Pitches at or above this number are read on the treble staff. */
export const SONG_C_STAFF_SPLIT_PITCH = 60

export const SONG_C_MEASURE_COUNT = 6

export type SongCInstall =
  | { status: 'absent' }
  | { status: 'unchanged' }
  | { status: 'installed'; song: Song; messages: string[] }
  | { status: 'conflict'; message: string }

/**
 * Store Song C's written start, staff split, and first display choice when they are missing.
 * A different saved start or split is reported and left in place. An existing display choice is left in place.
 */
export async function installSongCFoundation(repository: SongRepository): Promise<SongCInstall> {
  const song = await repository.getSong(SONG_C_ID)
  if (song === undefined) return { status: 'absent' }

  const planned = planSongCFoundation(song)
  if (planned.action === 'unchanged') return { status: 'unchanged' }
  if (planned.action === 'conflict') return { status: 'conflict', message: planned.message }

  await repository.saveSong(planned.song)
  const stored = await repository.getSong(SONG_C_ID)
  if (stored === undefined) {
    throw new Error(`The Song C reading was saved but the Song could not be read back.`)
  }
  if (JSON.stringify(stored.originalMidi) !== JSON.stringify(song.originalMidi)) {
    throw new Error('Saving the Song C reading changed the imported MIDI.')
  }
  if (stored.musicalInterpretation.writtenStartTick !== planned.song.musicalInterpretation.writtenStartTick) {
    throw new Error('The written start tick was not present after it was saved.')
  }
  if (stored.musicalInterpretation.staffSplitPitch !== planned.song.musicalInterpretation.staffSplitPitch) {
    throw new Error('The staff split pitch was not present after it was saved.')
  }
  return { status: 'installed', song: stored, messages: planned.messages }
}

export function planSongCFoundation(song: Song):
  | { action: 'unchanged' }
  | { action: 'install'; song: Song; messages: string[] }
  | { action: 'conflict'; message: string } {
  if (song.id !== SONG_C_ID) return { action: 'unchanged' }

  let interpretation = song.musicalInterpretation
  let display = song.display
  let changed = false
  const messages: string[] = []

  const start = interpretation.writtenStartTick
  if (start === undefined) {
    interpretation = { ...interpretation, writtenStartTick: SONG_C_WRITTEN_START_TICK }
    changed = true
  } else if (start !== SONG_C_WRITTEN_START_TICK) {
    messages.push(
      `Song C already has a written start tick of ${start}. The reading ${SONG_C_WRITTEN_START_TICK} was left unused.`,
    )
  }

  const split = interpretation.staffSplitPitch
  if (split === undefined) {
    interpretation = { ...interpretation, staffSplitPitch: SONG_C_STAFF_SPLIT_PITCH }
    changed = true
  } else if (split !== SONG_C_STAFF_SPLIT_PITCH) {
    messages.push(
      `Song C already has a staff split pitch of ${split}. The reading ${SONG_C_STAFF_SPLIT_PITCH} was left unused.`,
    )
  }

  if (display === undefined) {
    display = { measures: { kind: 'count', count: SONG_C_MEASURE_COUNT } }
    changed = true
  }

  if (!changed) {
    if (messages.length === 0) return { action: 'unchanged' }
    return { action: 'conflict', message: messages.join(' ') }
  }

  return {
    action: 'install',
    song: {
      ...song,
      originalMidi: song.originalMidi,
      musicalInterpretation: interpretation,
      ...(display === undefined ? {} : { display }),
    },
    messages,
  }
}
