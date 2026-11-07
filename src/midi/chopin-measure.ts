import type { MidiNote, MidiTrackInfo } from './parse-midi.ts'
import type { Song } from '../song/song.ts'
import { pitchName } from './pitch.ts'

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

/** A screen slice of a stored Song. The tick window is not a saved measure. */
export type NotePreview = {
  composer: string
  title: string
  windowStart: number
  windowEnd: number
  noteCount: number
  hands: HandPart[]
}

export function previewSongTickWindow(
  song: Song,
  windowStart: number,
  windowEnd: number,
): NotePreview {
  const notes = song.originalMidi.notes.filter(
    (note) => note.startTick >= windowStart && note.startTick < windowEnd,
  )

  return {
    composer: song.metadata.composer,
    title: song.metadata.title,
    windowStart,
    windowEnd,
    noteCount: notes.length,
    hands: handsFromTrackNames(song.originalMidi.tracks, notes),
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
