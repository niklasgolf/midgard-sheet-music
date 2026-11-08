/**
 * Which written notes share a beam.
 *
 * A beam is a rhythmic fact: eighths and sixteenths on one staff, in one
 * beat, with one stem direction. This module names those groups. It does
 * not choose pixels, and it does not read Part C. Grace notes never appear
 * here, because they are not rhythmic events. The caller passes one measure.
 */

import type { TimeSignature } from '../song/song.ts'
import { compareFractions, fraction, fractionKey, type Fraction, type WrittenDuration } from './duration.ts'
import type { PianoStaff } from './staff.ts'

/** 1 stems up. -1 stems down. The engraving supplies the direction it already chose. */
export type BeamStemDirection = 1 | -1

export type BeamLevel = 1 | 2

export type BeamGroupEvent = {
  staff: PianoStaff
  onset: Fraction
  duration: WrittenDuration
  stemDirection: BeamStemDirection
}

export type BeamGroupMember = {
  key: string
  onset: Fraction
  level: BeamLevel
}

export type BeamGroup = {
  staff: PianoStaff
  stemDirection: BeamStemDirection
  events: readonly BeamGroupMember[]
}

/** Eighths take one beam. Sixteenths take two. A dot does not add a level. */
export function beamLevel(duration: WrittenDuration): 0 | BeamLevel {
  if (duration.base === 'eighth') return 1
  if (duration.base === 'sixteenth') return 2
  return 0
}

export function beamEventKey(event: Pick<BeamGroupEvent, 'staff' | 'onset' | 'duration'>): string {
  return `${event.staff}:${fractionKey(event.onset)}:${event.duration.base}:${event.duration.dots}`
}

/**
 * How long one beam group may last, in written quarters.
 * Simple meters beam inside one beat. Meters whose beat is shorter than a
 * quarter beam in twos, or in threes when the numerator is a multiple of three.
 * 3/4 and 4/4 therefore beam inside one quarter. 6/8 beams inside a dotted quarter.
 */
export function beamBeatQuarters(signature: TimeSignature): Fraction {
  if (
    !Number.isInteger(signature.numerator) ||
    !Number.isInteger(signature.denominator) ||
    signature.numerator < 1 ||
    signature.denominator < 1
  ) {
    throw new Error('A beam group needs a time signature with a positive numerator and denominator.')
  }
  const units = signature.denominator <= 4 ? 1 : signature.numerator % 3 === 0 ? 3 : 2
  return fraction(units * 4, signature.denominator)
}

/**
 * Beam groups inside one measure.
 * Events are read in onset order. A group stays on one staff and one stem
 * direction, and it stops at the next beat. A quarter, half, or whole note
 * ends any group that has already started. Two notes at the same onset stay
 * independent. A group of one note is not a beam.
 */
export function beamGroups(options: {
  events: readonly BeamGroupEvent[]
  timeSignature: TimeSignature
}): BeamGroup[] {
  const beat = beamBeatQuarters(options.timeSignature)
  const ordered = [...options.events].sort((left, right) => {
    const byOnset = compareFractions(left.onset, right.onset)
    if (byOnset !== 0) return byOnset
    if (left.staff !== right.staff) return left.staff < right.staff ? -1 : 1
    return left.stemDirection - right.stemDirection
  })

  const groups: BeamGroup[] = []
  for (const staff of ['treble', 'bass'] as const) {
    const open = new Map<BeamStemDirection, BeamGroupEvent[]>()
    const finish = (events: readonly BeamGroupEvent[]): void => {
      const first = events[0]
      if (first === undefined || events.length < 2) return
      groups.push({
        staff: first.staff,
        stemDirection: first.stemDirection,
        events: events.map((event) => ({
          key: beamEventKey(event),
          onset: event.onset,
          level: levelOf(event),
        })),
      })
    }
    const closeBefore = (onset: Fraction, keep: BeamStemDirection | undefined): void => {
      for (const direction of [1, -1] as const) {
        if (direction === keep) continue
        const current = open.get(direction)
        const last = current?.[current.length - 1]
        if (current === undefined || last === undefined || compareFractions(last.onset, onset) >= 0) continue
        finish(current)
        open.set(direction, [])
      }
    }

    for (const event of ordered) {
      if (event.staff !== staff) continue
      const level = beamLevel(event.duration)
      if (level === 0) {
        closeBefore(event.onset, undefined)
        continue
      }
      closeBefore(event.onset, event.stemDirection)
      const current = open.get(event.stemDirection) ?? []
      const first = current[0]
      const last = current[current.length - 1]
      if (first === undefined || last === undefined) {
        open.set(event.stemDirection, [event])
        continue
      }
      const simultaneous = compareFractions(last.onset, event.onset) === 0
      const nextBeat = beatIndex(first.onset, beat) !== beatIndex(event.onset, beat)
      if (simultaneous || nextBeat) {
        finish(current)
        open.set(event.stemDirection, [event])
        continue
      }
      current.push(event)
      open.set(event.stemDirection, current)
    }
    for (const current of open.values()) finish(current)
  }
  return groups
}

function levelOf(event: BeamGroupEvent): BeamLevel {
  const level = beamLevel(event.duration)
  if (level === 0) {
    throw new Error('A beam group cannot contain a quarter, half, or whole note.')
  }
  return level
}

function beatIndex(onset: Fraction, beat: Fraction): number {
  const scaled = onset.numerator * beat.denominator
  const unit = onset.denominator * beat.numerator
  return Math.floor(scaled / unit)
}
