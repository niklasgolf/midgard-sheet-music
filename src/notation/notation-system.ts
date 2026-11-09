/** Which staff the open song is drawn on. This is editor state, not part of a Song. */
export type NotationSystem = 'classical' | 'midgard'

/** Classical is the default. Any other value, including a missing one, stays classical. */
export function notationSystem(value: string | null | undefined): NotationSystem {
  return value === 'midgard' ? 'midgard' : 'classical'
}
