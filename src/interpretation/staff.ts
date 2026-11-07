import type { MidiNote } from '../midi/parse-midi.ts'

export type PianoStaff = 'treble' | 'bass'

export type PianoStaffAssignment =
  | { ready: true; staffByTrack: ReadonlyMap<number, PianoStaff> }
  | { ready: false; message: string }

/**
 * The first note-bearing track in file order is the treble staff.
 * The second is the bass staff. Tracks with no notes are ignored.
 * A Song with any other number of note-bearing tracks is refused.
 */
export function assignPianoStaffs(notes: readonly MidiNote[]): PianoStaffAssignment {
  const tracks = noteBearingTracks(notes)
  if (tracks.length !== 2) {
    return { ready: false, message: unsupportedStaffMessage(tracks.length) }
  }
  const treble = tracks[0]
  const bass = tracks[1]
  if (treble === undefined || bass === undefined) {
    return { ready: false, message: unsupportedStaffMessage(tracks.length) }
  }
  return {
    ready: true,
    staffByTrack: new Map<number, PianoStaff>([
      [treble, 'treble'],
      [bass, 'bass'],
    ]),
  }
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
