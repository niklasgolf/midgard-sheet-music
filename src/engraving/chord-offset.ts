/**
 * Sideways placement of noteheads that would otherwise overlap.
 *
 * The walk follows VexFlow's StaveNote.buildNoteHeads: notes are visited from
 * the stem outward, and a note a second away from the previous one switches
 * sides. Stem up moves that note to the right. Stem down moves it to the left.
 * Stems are not drawn yet. The direction is an input so Step 4 can supply the
 * direction it actually draws.
 */

/** Middle line of a five-line staff. Step 0 is the bottom line. */
export const MIDDLE_STAFF_STEP = 4

export type StemDirection = 1 | -1

export const STEM_UP: StemDirection = 1
export const STEM_DOWN: StemDirection = -1

export type NoteheadPlacement = {
  staffStep: number
  displaced: boolean
  /** Pixels added to the column anchor. Positive is to the right. */
  offsetX: number
}

export type NoteheadExtent = {
  left: number
  right: number
}

/**
 * Below the middle line, the future stem goes up.
 * On or above the middle line, it goes down.
 */
export function defaultStemDirection(staffSteps: readonly number[]): StemDirection {
  if (staffSteps.length === 0) return STEM_UP
  let lowest = staffSteps[0] ?? 0
  let highest = lowest
  for (const step of staffSteps) {
    if (step < lowest) lowest = step
    if (step > highest) highest = step
  }
  return (lowest + highest) / 2 < MIDDLE_STAFF_STEP ? STEM_UP : STEM_DOWN
}

export function placeChordNoteheads(
  staffSteps: readonly number[],
  stemDirection: StemDirection,
  noteheadWidth: number,
): NoteheadPlacement[] {
  const placements: NoteheadPlacement[] = staffSteps.map((staffStep) => ({
    staffStep,
    displaced: false,
    offsetX: 0,
  }))
  const order = staffSteps.map((step, index) => ({ step, index }))
  order.sort((left, right) => left.step - right.step || left.index - right.index)
  if (stemDirection === STEM_DOWN) order.reverse()

  let displaced = false
  let previousStep: number | undefined
  for (const entry of order) {
    if (previousStep !== undefined) {
      const gap = Math.abs(entry.step - previousStep)
      displaced = gap === 0 || gap === 1 ? !displaced : false
    }
    previousStep = entry.step
    const placement = placements[entry.index]
    if (placement === undefined) continue
    placement.displaced = displaced
    placement.offsetX = displaced ? stemDirection * noteheadWidth : 0
  }
  return placements
}

/** How far noteheads reach to either side of the column anchor. */
export function noteheadExtent(offsets: readonly number[], noteheadWidth: number): NoteheadExtent {
  const radius = noteheadWidth / 2
  let left = 0
  let right = 0
  for (const offset of offsets) {
    left = Math.max(left, radius - offset)
    right = Math.max(right, offset + radius)
  }
  return { left, right }
}
