import chopinUrl from '../../midi-files/chopin-prelude-op-28-no-7-in-a-major.mid?url'
import { notesStartingInMeasure, type MeasureWindow } from './measure.ts'
import { parseMidi, type MidiNote, type MidiTrackInfo } from './parse-midi.ts'
import { pitchName } from './pitch.ts'

/** Supplied for this file. The MIDI itself contains no time signature and no barlines. */
export const chopinFirstMeasure: MeasureWindow = {
  startTick: 0,
  endTick: 2000,
  meter: { beats: 3, beatValue: 4 },
}

export type HandId = 'right' | 'left' | 'other'

export type NoteGroup = {
  startTick: number
  pitches: string[]
}

export type HandPart = {
  id: HandId
  label: string
  trackName: string
  groups: NoteGroup[]
}

export type ChopinMeasure = {
  measure: MeasureWindow
  noteCount: number
  hands: HandPart[]
}

export async function loadChopinFirstMeasure(): Promise<ChopinMeasure> {
  const response = await fetch(chopinUrl)
  if (!response.ok) {
    throw new Error(`Could not load the Chopin MIDI file (${response.status}).`)
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  const midi = parseMidi(bytes)
  const notes = notesStartingInMeasure(midi.notes, chopinFirstMeasure)

  return {
    measure: chopinFirstMeasure,
    noteCount: notes.length,
    hands: handsFromTrackNames(midi.tracks, notes),
  }
}

function handsFromTrackNames(
  tracks: readonly MidiTrackInfo[],
  notes: readonly MidiNote[],
): HandPart[] {
  const notesByTrack = new Map<number, MidiNote[]>()
  for (const note of notes) {
    const trackNotes = notesByTrack.get(note.track) ?? []
    trackNotes.push(note)
    notesByTrack.set(note.track, trackNotes)
  }

  const hands: HandPart[] = []
  for (const track of tracks) {
    const trackNotes = notesByTrack.get(track.track)
    if (!trackNotes || trackNotes.length === 0) continue

    const identified = identifyHand(track.name)
    const trackName = track.name ?? `Track ${track.track}`
    hands.push({
      id: identified?.id ?? 'other',
      label: identified?.label ?? trackName,
      trackName,
      groups: groupByStartTick(trackNotes),
    })
  }

  const order: Record<HandId, number> = { right: 0, left: 1, other: 2 }
  hands.sort((a, b) => order[a.id] - order[b.id])
  return hands
}

function identifyHand(trackName: string | null): { id: HandId; label: string } | null {
  if (trackName === 'Main droite') return { id: 'right', label: 'Right hand' }
  if (trackName === 'Main gauche') return { id: 'left', label: 'Left hand' }
  return null
}

function groupByStartTick(notes: readonly MidiNote[]): NoteGroup[] {
  const sorted = [...notes].sort((a, b) => a.startTick - b.startTick || a.midi - b.midi)
  const groups: NoteGroup[] = []

  for (const note of sorted) {
    const pitch = pitchName(note.midi)
    const current = groups[groups.length - 1]
    if (current && current.startTick === note.startTick) {
      current.pitches.push(pitch)
    } else {
      groups.push({ startTick: note.startTick, pitches: [pitch] })
    }
  }

  return groups
}
