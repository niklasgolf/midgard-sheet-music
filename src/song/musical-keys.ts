import type { KeyMode, KeySignature } from './song.ts'

export type KeySignatureChoice = KeySignature & {
  /** Positive counts sharps. Negative counts flats. Zero is an open key. */
  accidentals: number
}

const SHARP_MAJOR = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯']
const FLAT_MAJOR = ['F', 'B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'C♭']
const SHARP_MINOR = ['A', 'E', 'B', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯']
const FLAT_MINOR = ['D', 'G', 'C', 'F', 'B♭', 'E♭', 'A♭']

/** Major keys first, then minor keys, each walking the circle of fifths. */
export const KEY_SIGNATURES: readonly KeySignatureChoice[] = [
  ...circle(SHARP_MAJOR, 'major', 0, 1),
  ...circle(FLAT_MAJOR, 'major', -1, -1),
  ...circle(SHARP_MINOR, 'minor', 0, 1),
  ...circle(FLAT_MINOR, 'minor', -1, -1),
]

export function keyOptionValue(key: KeySignature): string {
  return `${key.tonic}|${key.mode}`
}

export function keyOptionLabel(key: KeySignatureChoice): string {
  return `${key.tonic} ${key.mode} — ${accidentalPhrase(key.accidentals)}`
}

export function isKnownKey(tonic: string, mode: KeyMode): boolean {
  return KEY_SIGNATURES.some((key) => key.tonic === tonic && key.mode === mode)
}

export function keyFromOption(value: string): KeySignature | undefined {
  const key = KEY_SIGNATURES.find((choice) => keyOptionValue(choice) === value)
  if (!key) return undefined
  return { tonic: key.tonic, mode: key.mode }
}

function circle(tonics: readonly string[], mode: KeyMode, start: number, step: number): KeySignatureChoice[] {
  return tonics.map((tonic, index) => ({
    tonic,
    mode,
    accidentals: start + index * step,
  }))
}

function accidentalPhrase(accidentals: number): string {
  if (accidentals === 0) return 'no sharps or flats'
  const count = Math.abs(accidentals)
  const name = accidentals > 0 ? 'sharp' : 'flat'
  return `${count} ${count === 1 ? name : `${name}s`}`
}
