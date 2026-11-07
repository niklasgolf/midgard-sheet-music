/**
 * Staff positions for one piano grand staff, in SVG pixels.
 * One staff space is the distance between two adjacent staff lines.
 * A diatonic step is half of that space. Both staves use the same unit.
 */

/** Distance between two adjacent staff lines. */
export const STAFF_SPACE = 14

/** One letter higher or lower on the staff. */
export const STAFF_STEP = STAFF_SPACE / 2

export const STAFF_LINE_COUNT = 5

/** Space between the treble staff's bottom line and the bass staff's top line. */
export const GRAND_STAFF_GAP = 70

export const STAFF_PAD_TOP = 22
export const STAFF_PAD_BOTTOM = 28

const DIATONIC_FROM_C = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]

/** Bottom line of the treble staff is E4. Bottom line of the bass staff is G2. */
export const TREBLE_BOTTOM_DIATONIC = diatonic(64)
export const BASS_BOTTOM_DIATONIC = diatonic(43)

export type GrandStaffFrame = {
  trebleBottomY: number
  bassBottomY: number
  height: number
}

/** Vertical positions shared by every measure SVG. */
export function grandStaffFrame(): GrandStaffFrame {
  const trebleBottomY = STAFF_PAD_TOP + (STAFF_LINE_COUNT - 1) * STAFF_SPACE
  const bassTopY = trebleBottomY + GRAND_STAFF_GAP
  const bassBottomY = bassTopY + (STAFF_LINE_COUNT - 1) * STAFF_SPACE
  return {
    trebleBottomY,
    bassBottomY,
    height: bassBottomY + STAFF_PAD_BOTTOM,
  }
}

/** `line` 0 is the bottom line. Line 4 is the top line. */
export function staffLineY(bottomY: number, line: number): number {
  return bottomY - line * STAFF_SPACE
}

export function staffTopY(bottomY: number): number {
  return staffLineY(bottomY, STAFF_LINE_COUNT - 1)
}

/** `staffStep` 0 sits on the bottom line. Two steps equal one staff space. */
export function noteheadY(bottomY: number, staffStep: number): number {
  return bottomY - staffStep * STAFF_STEP
}

export function pitchStaffStep(midi: number, bottomDiatonic: number): number {
  return diatonic(midi) - bottomDiatonic
}

/**
 * Ledger lines are the even staff steps beyond the five-line staff.
 * Step 8 is the top line. The first ledger above it is step 10.
 */
export function ledgerSteps(staffStep: number): number[] {
  const lines: number[] = []
  if (staffStep < 0) {
    for (let step = -2; step >= staffStep; step -= 2) lines.push(step)
  }
  if (staffStep > 8) {
    for (let step = 10; step <= staffStep; step += 2) lines.push(step)
  }
  return lines
}

export function diatonic(midi: number): number {
  const step = DIATONIC_FROM_C[midi % 12]
  if (step === undefined || midi < 0 || midi > 127) {
    throw new Error(`MIDI note ${midi} is outside 0–127.`)
  }
  return Math.floor(midi / 12) * 7 + step
}
