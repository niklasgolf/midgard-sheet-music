const PITCH_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const

/** Scientific pitch, with MIDI note 60 spelled as C4. */
export function pitchName(midi: number): string {
  const name = PITCH_NAMES[midi % 12]
  if (name === undefined) {
    throw new Error(`MIDI note ${midi} is outside 0–127.`)
  }
  const octave = Math.floor(midi / 12) - 1
  return `${name}${octave}`
}
