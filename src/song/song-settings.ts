import { keyFromOption } from './musical-keys.ts'
import {
  NOTE_VALUES,
  type KeySignature,
  type MusicalInterpretation,
  type NoteValue,
  type PickupInterpretation,
  type Song,
  type TimeSignature,
} from './song.ts'

const TIME_SIGNATURE_DENOMINATORS = [1, 2, 4, 8, 16, 32] as const

export type SettingsFormValues = {
  title: string
  composer: string
  numerator: string
  denominator: string
  key: string
  pickup: 'yes' | 'no' | ''
  pickupDuration: string
  ticksPerQuarter: string
}

export type SongSettingsInput = {
  title: string
  composer: string
  timeSignature?: TimeSignature
  keySignature?: KeySignature
  pickup?: PickupInterpretation
  ticksPerWrittenQuarter?: number
}

export type SettingsParse =
  | { ok: true; settings: SongSettingsInput }
  | { ok: false; message: string }

/**
 * Copies the title and composer onto the Song.
 * The id, schema version, filenames, original MIDI, interpretation, and display stay as they are.
 */
export function applySongNames(song: Song, names: { title: string; composer: string }): Song {
  return {
    ...song,
    metadata: {
      ...song.metadata,
      title: names.title,
      composer: names.composer,
    },
  }
}

export function parseSongNames(
  titleText: string,
  composerText: string,
): { ok: true; title: string; composer: string } | { ok: false; message: string } {
  const title = titleText.trim()
  const composer = composerText.trim()
  if (title === '') return { ok: false, message: 'Enter a song title.' }
  if (composer === '') return { ok: false, message: 'Enter a composer.' }
  return { ok: true, title, composer }
}

/**
 * Copies title, composer, and the composition-wide settings onto the Song.
 * The id, schema version, source filename, and original MIDI object stay as they are.
 * Properties of the interpretation other than these settings are kept.
 */
export function applySongSettings(song: Song, settings: SongSettingsInput): Song {
  const musicalInterpretation: MusicalInterpretation = { ...song.musicalInterpretation }
  assignSetting(musicalInterpretation, 'timeSignature', settings.timeSignature)
  assignSetting(musicalInterpretation, 'keySignature', settings.keySignature)
  assignSetting(musicalInterpretation, 'pickup', settings.pickup)
  assignSetting(musicalInterpretation, 'ticksPerWrittenQuarter', settings.ticksPerWrittenQuarter)

  return {
    id: song.id,
    schemaVersion: song.schemaVersion,
    metadata: {
      ...song.metadata,
      title: settings.title,
      composer: settings.composer,
    },
    originalMidi: song.originalMidi,
    musicalInterpretation,
    ...(song.display === undefined ? {} : { display: song.display }),
  }
}

export function parseSongSettings(values: SettingsFormValues): SettingsParse {
  const title = values.title.trim()
  const composer = values.composer.trim()
  if (title === '') return { ok: false, message: 'Enter a song title.' }
  if (composer === '') return { ok: false, message: 'Enter a composer.' }

  const timeSignature = parseTimeSignature(values.numerator, values.denominator)
  if (!timeSignature.ok) return timeSignature
  const keySignature = parseKey(values.key)
  if (!keySignature.ok) return keySignature
  const pickup = parsePickup(values.pickup, values.pickupDuration)
  if (!pickup.ok) return pickup
  const ticksPerWrittenQuarter = parseTicksPerQuarter(values.ticksPerQuarter)
  if (!ticksPerWrittenQuarter.ok) return ticksPerWrittenQuarter

  return {
    ok: true,
    settings: {
      title,
      composer,
      timeSignature: timeSignature.value,
      keySignature: keySignature.value,
      pickup: pickup.value,
      ticksPerWrittenQuarter: ticksPerWrittenQuarter.value,
    },
  }
}

function parseTimeSignature(
  numeratorText: string,
  denominatorText: string,
): { ok: true; value: TimeSignature | undefined } | { ok: false; message: string } {
  const numeratorRaw = numeratorText.trim()
  const denominatorRaw = denominatorText.trim()
  if (numeratorRaw === '' && denominatorRaw === '') return { ok: true, value: undefined }
  if (numeratorRaw === '' || denominatorRaw === '') {
    return { ok: false, message: 'Enter both numbers of the time signature, or leave both empty.' }
  }

  const numerator = Number(numeratorRaw)
  const denominator = Number(denominatorRaw)
  if (!Number.isInteger(numerator) || numerator < 1) {
    return { ok: false, message: 'The upper number of the time signature must be a whole number, 1 or greater.' }
  }
  if (!TIME_SIGNATURE_DENOMINATORS.some((choice) => choice === denominator)) {
    return { ok: false, message: 'The lower number of the time signature must be 1, 2, 4, 8, 16, or 32.' }
  }
  return { ok: true, value: { numerator, denominator } }
}

function parseKey(
  value: string,
): { ok: true; value: KeySignature | undefined } | { ok: false; message: string } {
  if (value === '') return { ok: true, value: undefined }
  const key = keyFromOption(value)
  if (!key) return { ok: false, message: 'Choose a key from the list.' }
  return { ok: true, value: key }
}

function parsePickup(
  choice: SettingsFormValues['pickup'],
  durationText: string,
): { ok: true; value: PickupInterpretation | undefined } | { ok: false; message: string } {
  if (choice === '') return { ok: true, value: undefined }
  if (choice === 'no') return { ok: true, value: { present: false } }
  if (!isNoteValue(durationText)) {
    return { ok: false, message: 'Choose a pickup duration: sixteenth, eighth, quarter, or half note.' }
  }
  return { ok: true, value: { present: true, duration: durationText } }
}

function isNoteValue(value: string): value is NoteValue {
  return NOTE_VALUES.some((noteValue) => noteValue === value)
}

function parseTicksPerQuarter(
  text: string,
): { ok: true; value: number | undefined } | { ok: false; message: string } {
  const raw = text.trim()
  if (raw === '') return { ok: true, value: undefined }
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, message: 'Ticks per written quarter must be a positive number.' }
  }
  return { ok: true, value }
}

function assignSetting<Key extends 'timeSignature' | 'keySignature' | 'pickup' | 'ticksPerWrittenQuarter'>(
  interpretation: MusicalInterpretation,
  key: Key,
  value: MusicalInterpretation[Key],
): void {
  if (value === undefined) {
    delete interpretation[key]
    return
  }
  interpretation[key] = value
}
