/** Which staff the open song is drawn on. This is editor state, not part of a Song. */
export type NotationSystem = 'classical' | 'midgard'

/** The middle panel. Original PDF is a workspace, not a staff. */
export type ScoreView = NotationSystem | 'original-pdf'

/** Classical is the default. Any other value, including a missing one, stays classical. */
export function notationSystem(value: string | null | undefined): NotationSystem {
  return value === 'midgard' ? 'midgard' : 'classical'
}

/** Classical is the default. midGard and Original PDF are the only other views. */
export function scoreView(value: string | null | undefined): ScoreView {
  if (value === 'midgard') return 'midgard'
  if (value === 'original-pdf') return 'original-pdf'
  return 'classical'
}
