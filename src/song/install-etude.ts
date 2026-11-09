import type { SongRepository } from './song-repository.ts'
import type { KeySignature, PickupInterpretation, Song, TimeSignature } from './song.ts'

export const ETUDE_SONG_ID = 'chopin-etude-op10-no3-tristesse'

/** Written meter after the eighth-note pickup. The file's 1/8 event is that pickup. */
export const ETUDE_TIME_SIGNATURE: TimeSignature = { numerator: 2, denominator: 4 }

/** Four sharps. The MIDI key signature and the PDF title both name E major. */
export const ETUDE_KEY_SIGNATURE: KeySignature = { tonic: 'E', mode: 'major' }

export const ETUDE_PICKUP: PickupInterpretation = { present: true, duration: 'eighth' }

/**
 * One written quarter is one MIDI quarter in this file.
 * The pickup ends at tick 240, and the opening attacks sit on a 120-tick grid.
 */
export const ETUDE_TICKS_PER_WRITTEN_QUARTER = 480

/**
 * Complete measures only. The pickup is Bar 0 and is not part of this count,
 * so the page draws Bars 0–5.
 */
export const ETUDE_COMPLETE_MEASURES = 5

export const ETUDE_MEASURES_PER_ROW = 3

export type EtudeInstall =
  | { status: 'absent' }
  | { status: 'unchanged' }
  | { status: 'installed'; song: Song; messages: string[] }
  | { status: 'conflict'; message: string }

/**
 * Store the étude's written meter, key, pickup, quarter, and first display choice when they are missing.
 * A different saved value is reported and left in place. Parts A and B are not rewritten.
 */
export async function installEtudeFoundation(repository: SongRepository): Promise<EtudeInstall> {
  const song = await repository.getSong(ETUDE_SONG_ID)
  if (song === undefined) return { status: 'absent' }

  const planned = planEtudeFoundation(song)
  if (planned.action === 'unchanged') return { status: 'unchanged' }
  if (planned.action === 'conflict') return { status: 'conflict', message: planned.message }

  await repository.saveSong(planned.song)
  const stored = await repository.getSong(ETUDE_SONG_ID)
  if (stored === undefined) {
    throw new Error('The étude reading was saved but the Song could not be read back.')
  }
  if (JSON.stringify(stored.originalMidi) !== JSON.stringify(song.originalMidi)) {
    throw new Error('Saving the étude reading changed the imported MIDI.')
  }
  if (stored.originalMidi.notes.length !== song.originalMidi.notes.length) {
    throw new Error('Saving the étude reading changed the number of imported notes.')
  }
  return { status: 'installed', song: stored, messages: planned.messages }
}

export function planEtudeFoundation(song: Song):
  | { action: 'unchanged' }
  | { action: 'install'; song: Song; messages: string[] }
  | { action: 'conflict'; message: string } {
  if (song.id !== ETUDE_SONG_ID) return { action: 'unchanged' }

  let interpretation = song.musicalInterpretation
  let display = song.display
  let changed = false
  const messages: string[] = []

  const signature = interpretation.timeSignature
  if (signature === undefined) {
    interpretation = { ...interpretation, timeSignature: ETUDE_TIME_SIGNATURE }
    changed = true
  } else if (!sameSignature(signature, ETUDE_TIME_SIGNATURE)) {
    messages.push(
      `The étude already has a time signature of ${signature.numerator}/${signature.denominator}. The 2/4 reading was left unused.`,
    )
  }

  const key = interpretation.keySignature
  if (key === undefined) {
    interpretation = { ...interpretation, keySignature: ETUDE_KEY_SIGNATURE }
    changed = true
  } else if (key.tonic !== ETUDE_KEY_SIGNATURE.tonic || key.mode !== ETUDE_KEY_SIGNATURE.mode) {
    messages.push(
      `The étude already has a key signature of ${key.tonic} ${key.mode}. The E major reading was left unused.`,
    )
  }

  const pickup = interpretation.pickup
  if (pickup === undefined) {
    interpretation = { ...interpretation, pickup: ETUDE_PICKUP }
    changed = true
  } else if (!samePickup(pickup, ETUDE_PICKUP)) {
    messages.push('The étude already has a different pickup reading. The eighth-note pickup was left unused.')
  }

  const quarter = interpretation.ticksPerWrittenQuarter
  if (quarter === undefined) {
    interpretation = { ...interpretation, ticksPerWrittenQuarter: ETUDE_TICKS_PER_WRITTEN_QUARTER }
    changed = true
  } else if (quarter !== ETUDE_TICKS_PER_WRITTEN_QUARTER) {
    messages.push(
      `The étude already has ${quarter} ticks per written quarter. The reading ${ETUDE_TICKS_PER_WRITTEN_QUARTER} was left unused.`,
    )
  }

  if (display === undefined) {
    display = {
      measures: { kind: 'count', count: ETUDE_COMPLETE_MEASURES },
      measuresPerRow: { kind: 'fixed', count: ETUDE_MEASURES_PER_ROW },
    }
    changed = true
  } else {
    if (display.measures === undefined) {
      display = { ...display, measures: { kind: 'count', count: ETUDE_COMPLETE_MEASURES } }
      changed = true
    } else if (display.measures.kind !== 'count' || display.measures.count !== ETUDE_COMPLETE_MEASURES) {
      messages.push(
        'The étude already has a different measure count. The opening of Bars 0–5 was left unused.',
      )
    }
    if (display.measuresPerRow === undefined) {
      display = { ...display, measuresPerRow: { kind: 'fixed', count: ETUDE_MEASURES_PER_ROW } }
      changed = true
    } else if (display.measuresPerRow.count !== ETUDE_MEASURES_PER_ROW) {
      messages.push('The étude already has a different row choice. Three measures per row was left unused.')
    }
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

function sameSignature(left: TimeSignature, right: TimeSignature): boolean {
  return left.numerator === right.numerator && left.denominator === right.denominator
}

function samePickup(left: PickupInterpretation, right: PickupInterpretation): boolean {
  if (!left.present || !right.present) return left.present === right.present
  return left.duration === right.duration
}
