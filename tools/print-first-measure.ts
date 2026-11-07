import { readFileSync } from 'node:fs'
import { notesStartingInMeasure, type MeasureWindow } from '../src/midi/measure.ts'
import { MidiReadError, parseMidi } from '../src/midi/parse-midi.ts'
import { pitchName } from '../src/midi/pitch.ts'

const filePath = process.argv[2] ?? 'midi-files/chopin-prelude-op-28-no-7-in-a-major.mid'

/** Supplied for this file. The MIDI itself contains no time signature and no barlines. */
const measure1: MeasureWindow = {
  startTick: 0,
  endTick: 2000,
  meter: { beats: 3, beatValue: 4 },
}

try {
  const file = readFileSync(filePath)
  const bytes = new Uint8Array(file.buffer, file.byteOffset, file.byteLength)
  const midi = parseMidi(bytes)
  const notes = notesStartingInMeasure(midi.notes, measure1).sort(
    (a, b) => a.startTick - b.startTick || a.track - b.track || a.midi - b.midi,
  )

  console.log(`File: ${filePath}`)
  console.log(`MIDI format: ${midi.format}`)
  console.log(`Track count: ${midi.trackCount}`)
  console.log(`PPQ: ${midi.ppq ?? 'unavailable'}`)
  console.log('Track names:')
  for (const track of midi.tracks) {
    console.log(`  ${track.track}  ${track.name ?? '(unnamed)'}`)
  }
  if (midi.tempos.length === 0) {
    console.log('Tempo events: none')
  } else {
    for (const tempo of midi.tempos) {
      console.log(`Tempo: tick ${tempo.tick}, ${tempo.microsecondsPerQuarter} us/quarter`)
    }
  }
  console.log(
    midi.timeSignatures.length === 0
      ? 'Time signatures in file: none'
      : `Time signatures in file: ${midi.timeSignatures
          .map((signature) => `tick ${signature.tick} ${signature.numerator}/${signature.denominator}`)
          .join('; ')}`,
  )
  console.log(`Measure start tick: ${measure1.startTick}`)
  console.log(`Measure end tick: ${measure1.endTick}`)
  console.log(`Supplied meter: ${measure1.meter.beats}/${measure1.meter.beatValue}`)
  console.log('')
  console.log('MIDI  Pitch  Start   End  Duration  Velocity  Track  Channel')
  for (const note of notes) {
    console.log(
      [
        pad(note.midi, 4),
        pad(pitchName(note.midi), 6),
        pad(note.startTick, 6),
        pad(note.endTick, 5),
        pad(note.durationTicks, 9),
        pad(note.velocity, 9),
        pad(note.track, 6),
        pad(note.channel, 8),
      ].join('  '),
    )
  }
  console.log('')
  console.log(`Total note count: ${notes.length}`)
  if (midi.warnings.length === 0) {
    console.log('Warnings: none')
  } else {
    console.log('Warnings:')
    for (const warning of midi.warnings) {
      console.log(`  ${warning}`)
    }
  }
} catch (error) {
  const message = error instanceof MidiReadError || error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
}

function pad(value: number | string, width: number): string {
  return String(value).padStart(width)
}
