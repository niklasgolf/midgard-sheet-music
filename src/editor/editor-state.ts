/**
 * Which screen the editor is showing.
 * This is temporary navigation. It is not stored on a Song and it is not Part C.
 */
export type EditorView =
  | { mode: 'choose-song' }
  | { mode: 'edit-song'; songId: string }

/** The screen shown on startup and after a refresh. No Song is selected. */
export function chooseSongView(): EditorView {
  return { mode: 'choose-song' }
}

/** The screen shown after the user chooses one stored Song. */
export function editSongView(songId: string): EditorView {
  return { mode: 'edit-song', songId }
}
