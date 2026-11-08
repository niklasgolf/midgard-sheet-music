import type { MidiNote } from '../midi/parse-midi.ts'

export type PianoStaff = 'treble' | 'bass'

export type PianoStaffAssignment =
  | {
      ready: true
      /** Track order for a two-track piano file. Empty when notes are split by pitch. */
      staffByTrack: ReadonlyMap<number, PianoStaff>
      /** The assignment to draw. A later per-note override can replace this function. */
      staffForNote: (note: MidiNote) => PianoStaff | undefined
    }
  | { ready: false; message: string }

/**
 * Two note-bearing tracks keep their order: the first is treble and the second is bass.
 * One note-bearing track uses `staffSplitPitch` when Part C provides it.
 * MIDI numbers at or above the pitch go to the treble. Lower numbers go to the bass.
 * The note's track number is not changed. Any other number of tracks is refused.
 */
export function assignPianoStaffs(
  notes: readonly MidiNote[],
  interpretation?: { staffSplitPitch?: number },
): PianoStaffAssignment {
  const tracks = noteBearingTracks(notes)
  if (tracks.length === 2) {
    const treble = tracks[0]
    const bass = tracks[1]
    if (treble === undefined || bass === undefined) {
      return { ready: false, message: unsupportedStaffMessage(tracks.length) }
    }
    const staffByTrack = new Map<number, PianoStaff>([
      [treble, 'treble'],
      [bass, 'bass'],
    ])
    return {
      ready: true,
      staffByTrack,
      staffForNote: (note) => staffByTrack.get(note.track),
    }
  }
  if (tracks.length === 1) {
    const pitch = interpretation?.staffSplitPitch
    if (pitch === undefined) {
      return {
        ready: false,
        message:
          'This Song has one note-bearing track. Save a staff split pitch to place higher notes on the treble staff and lower notes on the bass staff.',
      }
    }
    if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) {
      return { ready: false, message: 'The staff split pitch must be a MIDI note number from 0 through 127.' }
    }
    return {
      ready: true,
      staffByTrack: new Map<number, PianoStaff>(),
      staffForNote: (note) => (note.midi >= pitch ? 'treble' : 'bass'),
    }
  }
  return { ready: false, message: unsupportedStaffMessage(tracks.length) }
}

export function staffForTrack(staffByTrack: ReadonlyMap<number, PianoStaff>, track: number): PianoStaff {
  const staff = staffByTrack.get(track)
  if (staff === undefined) {
    throw new Error(
      `Track ${track} has notes and is not assigned to a piano staff. This experiment draws exactly one treble track and one bass track.`,
    )
  }
  return staff
}

/** Track numbers ascend with the order of tracks in the MIDI file. */
function noteBearingTracks(notes: readonly MidiNote[]): number[] {
  const seen = new Set<number>()
  for (const note of notes) seen.add(note.track)
  return [...seen].sort((left, right) => left - right)
}

function unsupportedStaffMessage(count: number): string {
  if (count === 0) {
    return 'This Song has no note-bearing tracks. The two-staff piano experiment needs one treble track and one bass track.'
  }
  if (count === 1) {
    return 'This Song has one note-bearing track. The two-staff piano experiment needs exactly two: the first is the treble staff and the second is the bass staff.'
  }
  return `This Song has ${count} note-bearing tracks. The two-staff piano experiment needs exactly two, so the extra tracks were not assigned to a staff.`
}
