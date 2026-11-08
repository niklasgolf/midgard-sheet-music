import type { SongRepository } from './song-repository.ts'
import { planWrittenDuration } from './install-sustained-reading.ts'
import type { Song, WrittenDurationReading, WrittenOnsetAlignment } from './song.ts'

export const SONG_C_ID = 'eine-kleine-nachtmusik-intermediate'

/** MIDI tick where the printed Bar 1 begins. The notes themselves stay at their file times. */
export const SONG_C_WRITTEN_START_TICK = 2734

/** Middle C. Pitches at or above this number are read on the treble staff. */
export const SONG_C_STAFF_SPLIT_PITCH = 60

export const SONG_C_MEASURE_COUNT = 6

/** Song C's first row choice. A saved choice is left alone. */
export const SONG_C_MEASURES_PER_ROW = 2

/** Sixteenth grid. An attack more than 30 ticks away keeps its MIDI onset. */
export const SONG_C_ONSET_ALIGNMENT: WrittenOnsetAlignment = {
  subdivisionsPerQuarter: 4,
  maxDeviationTicks: 30,
}

/**
 * Written eighths whose performed length is not an eighth.
 * The G chord at 3686 is an eighth in the print. G4 is held for 768 ticks.
 * The B chord at 5376 is an eighth in the print. B4 and B5 last 30 ticks.
 */
export const SONG_C_WRITTEN_DURATIONS: readonly WrittenDurationReading[] = [
  { track: 1, midi: 55, startTick: 3686, endTick: 4147, written: 'eighth', writtenEndTick: 3926 },
  { track: 1, midi: 67, startTick: 3686, endTick: 4454, written: 'eighth', writtenEndTick: 3926 },
  { track: 1, midi: 79, startTick: 3686, endTick: 3962, written: 'eighth', writtenEndTick: 3926 },
  { track: 1, midi: 59, startTick: 5376, endTick: 5621, written: 'eighth', writtenEndTick: 5616 },
  { track: 1, midi: 71, startTick: 5376, endTick: 5406, written: 'eighth', writtenEndTick: 5616 },
  { track: 1, midi: 83, startTick: 5376, endTick: 5406, written: 'eighth', writtenEndTick: 5616 },
]

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

  const alignment = interpretation.writtenOnsetAlignment
  if (alignment === undefined) {
    interpretation = { ...interpretation, writtenOnsetAlignment: SONG_C_ONSET_ALIGNMENT }
    changed = true
  } else if (!sameOnsetAlignment(alignment, SONG_C_ONSET_ALIGNMENT)) {
    messages.push('Song C already has a different written-onset alignment. The sixteenth-grid reading was left unused.')
  }

  for (const reading of SONG_C_WRITTEN_DURATIONS) {
    const planned = planWrittenDuration({ ...song, musicalInterpretation: interpretation }, reading)
    if (planned.action === 'install') {
      interpretation = planned.song.musicalInterpretation
      changed = true
    } else if (planned.action === 'conflict' || planned.action === 'midi-mismatch') {
      messages.push(planned.message)
    }
  }

  if (display === undefined) {
    display = {
      measures: { kind: 'count', count: SONG_C_MEASURE_COUNT },
      measuresPerRow: { kind: 'fixed', count: SONG_C_MEASURES_PER_ROW },
    }
    changed = true
  } else if (display.measuresPerRow === undefined) {
    display = { ...display, measuresPerRow: { kind: 'fixed', count: SONG_C_MEASURES_PER_ROW } }
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

function sameOnsetAlignment(left: WrittenOnsetAlignment, right: WrittenOnsetAlignment): boolean {
  return left.subdivisionsPerQuarter === right.subdivisionsPerQuarter && left.maxDeviationTicks === right.maxDeviationTicks
}
