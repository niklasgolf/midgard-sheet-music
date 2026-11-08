/**
 * Checks the editor's three screens.
 * Navigation is temporary. It is not stored on a Song.
 */
import { readFileSync } from 'node:fs'
import { chooseSongView, editNamesView, editSongView } from '../src/editor/editor-state.ts'
import { songChoiceLabel } from '../src/song/song-library-view.ts'
import { applySongNames } from '../src/song/song-settings.ts'
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
const names = editNamesView('chopin-prelude-op28-no7-b')
if (names.mode !== 'edit-names' || names.songId !== 'chopin-prelude-op28-no7-b') {
  fail('Edit Names did not keep the chosen Song id.')
}

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
const renamed = applySongNames(song, {
  title: 'Prelude Opus 28 No. 7 in A major',
  composer: song.metadata.composer,
})
if (renamed.metadata.title !== 'Prelude Opus 28 No. 7 in A major') fail('Edit Names did not store the new title.')
if (renamed.metadata.composer !== song.metadata.composer) fail('Edit Names changed the composer.')
if (renamed.metadata.sourceFilename !== song.metadata.sourceFilename) fail('Edit Names changed the MIDI filename.')
if (renamed.id !== song.id || renamed.schemaVersion !== song.schemaVersion) {
  fail('Edit Names changed the Song id or schema version.')
}
if (renamed.originalMidi !== song.originalMidi) fail('Edit Names changed the original MIDI.')
if (renamed.musicalInterpretation !== song.musicalInterpretation) fail('Edit Names changed the interpretation.')
if (renamed.display !== song.display) fail('Edit Names changed the display settings.')

const page = readFileSync('index.html', 'utf8')
if (!page.includes('The midGard Sheet Music Editor')) fail('The permanent editor title is missing.')
if (!page.includes('Choose a Song')) fail('Choose a Song is missing from the page.')
if (!page.includes('id="change-song"')) fail('Change song is missing.')
if (!page.includes('id="song-choices"')) fail('The song list is missing.')
if (page.includes('id="song-library"')) fail('The song dropdown is still in the page.')
if (page.includes('sheet__lead')) fail('The old project description is still in the page.')
if (page.includes('id="measure-1"') || page.includes('temporary development view')) {
  fail('The temporary note list is still in the page.')
}
if (page.includes('Composition-wide information for this Song')) {
  fail('The old Song Settings introduction is still in the main editor.')
}
if (!page.includes('>Edit Names<') || !page.includes('id="names-return"')) {
  fail('Edit Names is missing from the page.')
}
if (page.indexOf('id="song-storage"') > page.indexOf('id="edit-names"')) {
  fail('Edit Names is not after Song Storage.')
}
for (const marker of [
  'id="song-storage" aria-label="Song storage" hidden',
  'aria-label="Musical settings" hidden',
  'id="editor-display" hidden',
  'id="edit-names" type="button" hidden',
  'id="names-page" aria-labelledby="names-heading" hidden',
  'Measures per row',
  'Measures to display',
]) {
  if (!page.includes(marker)) fail(`A technical panel is not hidden: ${marker}.`)
}

const main = readFileSync('src/main.ts', 'utf8')
if (main.includes('CHOPIN_SONG_ID')) fail('Startup still chooses Song A on its own.')
if (!main.includes('listSongs()') || !main.includes('getSong(songId)')) {
  fail('The editor does not load songs through the repository.')
}
if (!main.includes('chooseSongView()')) fail('Refresh does not begin on Choose a Song.')
if (!main.includes('editNamesView(')) fail('Edit Names is not a separate editor state.')
if (!main.includes('These name changes are not saved.')) {
  fail('Return does not ask before discarding name changes.')
}
if (!main.includes('showReviewSections(false)') || !main.includes('showReviewSections(true)')) {
  fail('Edit Mode does not restore the previous sections, or Choose a Song still shows them.')
}

const songSource = readFileSync('src/song/song.ts', 'utf8')
if (songSource.includes('EditorView') || songSource.includes('choose-song')) {
  fail('Editor navigation was stored on the Song.')
}

console.log('Editor flow checks passed.')
console.log('Choose a Song is temporary. The stored Songs are unchanged.')
