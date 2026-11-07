import { readingJunctions } from '../interpretation/sustained-note.ts'
import type { SongRepository } from './song-repository.ts'
import type { GraceNoteReading, Song, SustainedNoteReading, WrittenDurationReading } from './song.ts'

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

/**
 * The principal A4 in Bars 15 and 16.
 * One MIDI sound is written as two tied half notes, one in each measure.
 */
export const SONG_B_BAR15_A4_HALVES: SustainedNoteReading = {
  track: 2,
  midi: 69,
  startTick: 16896,
  endTick: 18432,
  written: ['half', 'half'],
  ties: [true],
}

export const SONG_B_READINGS: readonly SustainedNoteReading[] = [
  SONG_B_BAR5_D4,
  SONG_B_BAR11_CSHARP,
  SONG_B_BAR11_E,
  SONG_B_BAR15_A4_HALVES,
]

/** The sixteenth A4 in Bar 15. The key is released early, before the written note ends. */
export const SONG_B_BAR15_A4_SIXTEENTH: WrittenDurationReading = {
  track: 2,
  midi: 69,
  startTick: 16800,
  endTick: 16852,
  written: 'sixteenth',
  writtenEndTick: 16896,
}

/** The grace-note A4 in Bar 15. It ornaments the A4 that begins on the next beat. */
export const SONG_B_BAR15_A4_GRACE: GraceNoteReading = {
  track: 2,
  midi: 69,
  startTick: 16852,
  endTick: 16896,
  principal: { track: 2, midi: 69, startTick: 16896 },
  written: 'eighth',
  slash: false,
  slur: true,
}

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

/**
 * Decide whether one written-duration override can be added.
 * A matching override is left alone. A different override for the same MIDI event is not replaced.
 */
export function planWrittenDuration(song: Song, reading: WrittenDurationReading): SustainedReadingPlan {
  const stored = song.musicalInterpretation.writtenDurations ?? []
  const sameEvent = stored.filter((entry) => sameSound(entry, reading))
  if (sameEvent.some((entry) => entry.written !== reading.written || entry.writtenEndTick !== reading.writtenEndTick)) {
    return {
      action: 'conflict',
      message: `Song ${song.id} already stores a different written duration for track ${reading.track}, MIDI ${reading.midi}, ticks ${reading.startTick}–${reading.endTick}. That duration was left in place.`,
    }
  }
  if (sameEvent.length > 0) return { action: 'unchanged' }
  if (!hasOneMidiEvent(song, reading)) {
    return {
      action: 'midi-mismatch',
      message: `Song ${song.id} has no single MIDI note on track ${reading.track}, pitch ${reading.midi}, ticks ${reading.startTick}–${reading.endTick}. No written duration was saved.`,
    }
  }
  return {
    action: 'install',
    song: {
      ...song,
      originalMidi: song.originalMidi,
      musicalInterpretation: {
        ...song.musicalInterpretation,
        writtenDurations: [...stored, reading],
      },
    },
  }
}

/**
 * Decide whether one grace note can be added.
 * A matching ornament is left alone. A different ornament for the same MIDI event is not replaced.
 */
export function planGraceNote(song: Song, reading: GraceNoteReading): SustainedReadingPlan {
  const stored = song.musicalInterpretation.graceNotes ?? []
  const sameEvent = stored.filter((entry) => sameSound(entry, reading))
  if (sameEvent.some((entry) => !sameGrace(entry, reading))) {
    return {
      action: 'conflict',
      message: `Song ${song.id} already stores a different grace note for track ${reading.track}, MIDI ${reading.midi}, ticks ${reading.startTick}–${reading.endTick}. That grace note was left in place.`,
    }
  }
  if (sameEvent.length > 0) return { action: 'unchanged' }
  if (!hasOneMidiEvent(song, reading)) {
    return {
      action: 'midi-mismatch',
      message: `Song ${song.id} has no single MIDI note on track ${reading.track}, pitch ${reading.midi}, ticks ${reading.startTick}–${reading.endTick}. No grace note was saved.`,
    }
  }
  const principals = song.originalMidi.notes.filter(
    (note) =>
      note.track === reading.principal.track &&
      note.midi === reading.principal.midi &&
      note.startTick === reading.principal.startTick,
  )
  if (principals.length !== 1) {
    return {
      action: 'midi-mismatch',
      message: `Song ${song.id} has no single principal note on track ${reading.principal.track}, pitch ${reading.principal.midi}, tick ${reading.principal.startTick}. No grace note was saved.`,
    }
  }
  return {
    action: 'install',
    song: {
      ...song,
      originalMidi: song.originalMidi,
      musicalInterpretation: {
        ...song.musicalInterpretation,
        graceNotes: [...stored, reading],
      },
    },
  }
}

/**
 * Copy Song B's confirmed Part C readings into that record.
 * Sustained notes, written durations, and grace notes already stored are not written again.
 * One save covers every reading that was missing.
 */
export async function installSongBInterpretations(repository: SongRepository): Promise<SustainedReadingsInstall> {
  const song = await repository.getSong(SONG_B_ID)
  if (song === undefined) return { status: 'absent' }

  let current = song
  const problems: { status: 'conflict' | 'midi-mismatch'; message: string }[] = []
  const added: Array<(stored: Song) => boolean> = []

  const apply = (plan: SustainedReadingPlan, stillThere: (stored: Song) => boolean) => {
    if (plan.action === 'install') {
      current = plan.song
      added.push(stillThere)
      return
    }
    if (plan.action === 'conflict' || plan.action === 'midi-mismatch') {
      problems.push({ status: plan.action, message: plan.message })
    }
  }

  for (const reading of SONG_B_READINGS) {
    apply(planSustainedReading(current, reading), (stored) => planSustainedReading(stored, reading).action === 'unchanged')
  }
  apply(
    planWrittenDuration(current, SONG_B_BAR15_A4_SIXTEENTH),
    (stored) => planWrittenDuration(stored, SONG_B_BAR15_A4_SIXTEENTH).action === 'unchanged',
  )
  apply(
    planGraceNote(current, SONG_B_BAR15_A4_GRACE),
    (stored) => planGraceNote(stored, SONG_B_BAR15_A4_GRACE).action === 'unchanged',
  )

  if (added.length === 0) {
    if (problems.length === 0) return { status: 'unchanged' }
    const status = problems.every((problem) => problem.status === 'midi-mismatch') ? 'midi-mismatch' : 'conflict'
    return { status, message: problems.map((problem) => problem.message).join(' ') }
  }

  await repository.saveSong(current)
  const stored = await repository.getSong(SONG_B_ID)
  if (stored === undefined) {
    throw new Error(`The interpretation for ${SONG_B_ID} was saved but the Song could not be read back.`)
  }
  if (JSON.stringify(stored.originalMidi) !== JSON.stringify(song.originalMidi)) {
    throw new Error(`Saving an interpretation changed the imported MIDI for ${SONG_B_ID}.`)
  }
  for (const stillThere of added) {
    if (!stillThere(stored)) {
      throw new Error(`An interpretation for ${SONG_B_ID} was not present after it was saved.`)
    }
  }
  return { status: 'installed', song: stored, messages: problems.map((problem) => problem.message) }
}

function hasOneMidiEvent(song: Song, reading: { track: number; midi: number; startTick: number; endTick: number }): boolean {
  const matches = song.originalMidi.notes.filter(
    (note) =>
      note.track === reading.track &&
      note.midi === reading.midi &&
      note.startTick === reading.startTick &&
      note.endTick === reading.endTick,
  )
  const sounded = matches[0]
  return matches.length === 1 && sounded !== undefined && sounded.durationTicks === sounded.endTick - sounded.startTick
}

function sameGrace(stored: GraceNoteReading, reading: GraceNoteReading): boolean {
  return (
    stored.written === reading.written &&
    stored.slash === reading.slash &&
    stored.slur === reading.slur &&
    stored.principal.track === reading.principal.track &&
    stored.principal.midi === reading.principal.midi &&
    stored.principal.startTick === reading.principal.startTick
  )
}

function sameSound(
  stored: { track: number; midi: number; startTick: number; endTick: number },
  reading: { track: number; midi: number; startTick: number; endTick: number },
): boolean {
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
