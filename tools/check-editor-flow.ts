/**
 * Checks the editor's two screens.
 * Navigation is temporary. It is not stored on a Song.
 */
import { readFileSync } from 'node:fs'
import { chooseSongView, editSongView } from '../src/editor/editor-state.ts'
import { songChoiceLabel } from '../src/song/song-library-view.ts'
import type { Song } from '../src/song/song.ts'

function fail(message: string): never {
  throw new Error(message)
}

const choose = chooseSongView()
if (choose.mode !== 'choose-song') fail('The editor does not start on Choose a Song.')
const editing = editSongView('eine-kleine-nachtmusik-intermediate')
if (editing.mode !== 'edit-song' || editing.songId !== 'eine-kleine-nachtmusik-intermediate') {
  fail('Edit Mode did not keep the chosen Song id.')
}
const again = chooseSongView()
if (again.mode !== 'choose-song' || 'songId' in again) fail('Change song left a Song selected.')

const song = {
  id: 'example',
  schemaVersion: 1,
  metadata: { title: 'Prelude Op. 28 No. 7 in A major', composer: 'Frédéric Chopin', sourceFilename: 'example.mid' },
  originalMidi: { format: 1, ppq: 384, tempos: [], timeSignatures: [], keySignatures: [], notes: [] },
  musicalInterpretation: {},
} satisfies Song
if (songChoiceLabel(song) !== 'Frédéric Chopin — Prelude Op. 28 No. 7 in A major') {
  fail('The song list label was not taken from the stored composer and title.')
}

const page = readFileSync('index.html', 'utf8')
if (!page.includes('The midGard Sheet Music Editor')) fail('The permanent editor title is missing.')
if (!page.includes('Choose a Song')) fail('Choose a Song is missing from the page.')
if (!page.includes('id="change-song"')) fail('Change song is missing.')
if (!page.includes('id="song-choices"')) fail('The song list is missing.')
if (page.includes('id="song-library"')) fail('The song dropdown is still in the page.')
if (page.includes('sheet__lead')) fail('The old project description is still in the page.')
for (const marker of [
  'id="song-storage" aria-label="Song storage" hidden',
  'aria-labelledby="song-settings-title" hidden',
  'id="editor-display" hidden',
  'Measures per row',
  'Measures to display',
  'id="measure-1" aria-label="Notes from the stored Song" hidden',
]) {
  if (!page.includes(marker)) fail(`A technical panel is not hidden: ${marker}.`)
}

const main = readFileSync('src/main.ts', 'utf8')
if (main.includes('CHOPIN_SONG_ID')) fail('Startup still chooses Song A on its own.')
if (!main.includes('listSongs()') || !main.includes('getSong(songId)')) {
  fail('The editor does not load songs through the repository.')
}
if (!main.includes('chooseSongView()')) fail('Refresh does not begin on Choose a Song.')

const songSource = readFileSync('src/song/song.ts', 'utf8')
if (songSource.includes('EditorView') || songSource.includes('choose-song')) {
  fail('Editor navigation was stored on the Song.')
}

console.log('Editor flow checks passed.')
console.log('Choose a Song is temporary. The stored Songs are unchanged.')
