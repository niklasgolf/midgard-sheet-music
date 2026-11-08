/**
 * How a beam group of two written events is drawn.
 *
 * The group is already chosen. This module places one primary beam on the
 * stem tips, and a second level when a note is a sixteenth. A sixteenth
 * beside an eighth gets a short beamlet. Two sixteenths share a full second
 * beam. The result is points and stem extensions. It does not create SVG.
 */

import type { BeamLevel } from '../interpretation/beam-group.ts'
import { STAFF_SPACE } from './geometry.ts'
import { STEM_UP, type StemDirection } from './chord-offset.ts'

/** Half a staff space. VexFlow uses 5 pixels at a 10-pixel staff space. */
export const BEAM_THICKNESS = STAFF_SPACE / 2

/** A short sixteenth beam. One staff space. */
export const BEAMLET_LENGTH = STAFF_SPACE

/**
 * How far the next beam's outer edge sits toward the notes, in beam thicknesses.
 * The clear gap between the two beams is half a thickness.
 */
export const BEAM_LEVEL_STEP = 1.5

/** Half the slope between the natural stem tips, and never steeper than this. */
export const BEAM_MAX_SLOPE = 0.25

export type BeamEnd = {
  stemX: number
  /** Free end of the stem before the beam lengthens it. */
  naturalTipY: number
  level: BeamLevel
}

export type BeamPoint = {
  x: number
  y: number
}

export type BeamShape = {
  level: BeamLevel
  points: readonly [BeamPoint, BeamPoint, BeamPoint, BeamPoint]
}

export type BeamLayout = {
  slope: number
  /** Added to each stem. Zero or positive, in the same order as `ends`. */
  extensions: readonly [number, number]
  /** Primary beam's outer edge at each stem center. The drawn stem ends here. */
  tips: readonly [number, number]
  shapes: readonly BeamShape[]
}

/**
 * Beam line for exactly two stems.
 * The slope is half the slope between the natural tips, clamped to
 * ±BEAM_MAX_SLOPE. The line then shifts outward until neither stem would
 * have to shrink. Upward stems carry the beam above the notes. Downward
 * stems carry it below them.
 */
export function layoutBeam(options: {
  direction: StemDirection
  stemThickness: number
  ends: readonly [BeamEnd, BeamEnd]
}): BeamLayout {
  const flipped = options.ends[1].stemX < options.ends[0].stemX
  const left = flipped ? options.ends[1] : options.ends[0]
  const right = flipped ? options.ends[0] : options.ends[1]
  const dx = right.stemX - left.stemX
  const raw = dx === 0 ? 0 : (right.naturalTipY - left.naturalTipY) / dx
  const slope = clamp(raw / 2, -BEAM_MAX_SLOPE, BEAM_MAX_SLOPE)
  const towardNotes = options.direction === STEM_UP ? 1 : -1

  let anchor = left.naturalTipY
  for (const end of [left, right]) {
    const required = end.naturalTipY - (end.stemX - left.stemX) * slope
    anchor = options.direction === STEM_UP ? Math.min(anchor, required) : Math.max(anchor, required)
  }
  const outerY = (x: number): number => anchor + (x - left.stemX) * slope
  const extensionFor = (end: BeamEnd): number => {
    const extra = options.direction === STEM_UP ? end.naturalTipY - outerY(end.stemX) : outerY(end.stemX) - end.naturalTipY
    return extra > 0 ? extra : 0
  }

  const half = options.stemThickness / 2
  const xStart = left.stemX - half
  const xEnd = right.stemX + half
  const shapes: BeamShape[] = [band(1, xStart, xEnd, outerY, towardNotes)]

  const secondary = secondLevel(left.level, right.level, xStart, xEnd)
  if (secondary !== undefined) {
    const offset = towardNotes * BEAM_LEVEL_STEP * BEAM_THICKNESS
    shapes.push(band(2, secondary.x1, secondary.x2, (x) => outerY(x) + offset, towardNotes))
  }

  const leftExtension = extensionFor(left)
  const rightExtension = extensionFor(right)
  const leftTip = outerY(left.stemX)
  const rightTip = outerY(right.stemX)
  return {
    slope,
    extensions: flipped ? [rightExtension, leftExtension] : [leftExtension, rightExtension],
    tips: flipped ? [rightTip, leftTip] : [leftTip, rightTip],
    shapes,
  }
}

function secondLevel(
  leftLevel: BeamLevel,
  rightLevel: BeamLevel,
  xStart: number,
  xEnd: number,
): { x1: number; x2: number } | undefined {
  if (leftLevel >= 2 && rightLevel >= 2) return { x1: xStart, x2: xEnd }
  if (rightLevel >= 2 && leftLevel < 2) return { x1: Math.max(xStart, xEnd - BEAMLET_LENGTH), x2: xEnd }
  if (leftLevel >= 2 && rightLevel < 2) return { x1: xStart, x2: Math.min(xEnd, xStart + BEAMLET_LENGTH) }
  return undefined
}

function band(
  level: BeamLevel,
  x1: number,
  x2: number,
  outerY: (x: number) => number,
  towardNotes: 1 | -1,
): BeamShape {
  const y1 = outerY(x1)
  const y2 = outerY(x2)
  const inner1 = y1 + towardNotes * BEAM_THICKNESS
  const inner2 = y2 + towardNotes * BEAM_THICKNESS
  return {
    level,
    points: [
      { x: x1, y: y1 },
      { x: x2, y: y2 },
      { x: x2, y: inner2 },
      { x: x1, y: inner1 },
    ],
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
