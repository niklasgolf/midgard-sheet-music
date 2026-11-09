/**
 * Written-time coordinates for one midGard measure.
 * A later playback scanner can move at a constant number of pixels per written tick.
 * This module does not read MIDI tempo, and it does not draw.
 */

/** Pixels of padding on each side of the musical timeline. */
export const TRUE_TIME_MARGIN = 28

export type TrueTimeTimeline = {
  measureWidth: number
  margin: number
  /** Left edge of musical time. The margin is to the left of this. */
  timelineStartX: number
  /** Width of one complete measure, in pixels. */
  timelineWidth: number
  /** Written ticks in one complete measure. A pickup uses this same count. */
  fullMeasureTicks: number
}

export function trueTimeTimeline(measureWidth: number, fullMeasureTicks: number): TrueTimeTimeline {
  const margin = TRUE_TIME_MARGIN
  return {
    measureWidth,
    margin,
    timelineStartX: margin,
    timelineWidth: measureWidth - margin * 2,
    fullMeasureTicks,
  }
}

/** `x = timelineStartX + (timelineTick / fullMeasureTicks) * timelineWidth` */
export function trueTimeX(timeline: TrueTimeTimeline, timelineTick: number): number {
  return timeline.timelineStartX + (timelineTick / timeline.fullMeasureTicks) * timeline.timelineWidth
}

/**
 * Where a pickup's local tick 0 sits on a complete-measure timeline.
 * A complete measure passes pickupTicks of 0 and gets an origin of 0.
 */
export function pickupTimelineOrigin(fullMeasureTicks: number, pickupTicks: number): number {
  return fullMeasureTicks - pickupTicks
}

/** A local written tick, measured from the start of this measure's own span. */
export function timelineTick(localTick: number, timelineOriginTicks: number): number {
  return timelineOriginTicks + localTick
}

/**
 * True when two different written times are closer than `minimumGap` pixels.
 * Notes that share a tick are one attack and are not a collision.
 */
export function trueTimeCrowded(
  timelineTicks: readonly number[],
  timeline: TrueTimeTimeline,
  minimumGap: number,
): boolean {
  const unique = [...new Set(timelineTicks.map((tick) => Math.round(tick * 1000) / 1000))].sort((left, right) => left - right)
  for (let index = 1; index < unique.length; index += 1) {
    const previous = unique[index - 1]
    const next = unique[index]
    if (previous === undefined || next === undefined) continue
    const gap = trueTimeX(timeline, next) - trueTimeX(timeline, previous)
    if (gap < minimumGap) return true
  }
  return false
}
