import './style.css'
import { chooseSongView, editSongView, type EditorView } from './editor/editor-state.ts'
import { previewSongTickWindow } from './midi/chopin-measure.ts'
import { renderEngraving } from './notation/engraving-view.ts'
import { renderMeasure, renderMeasureError } from './measure-view.ts'
import type { SongLoad } from './song/import-chopin-song.ts'
import { IndexedDBSongRepository } from './song/indexeddb-song-repository.ts'
import { mountSheetDisplay } from './song/display-view.ts'
import { installSongCFoundation } from './song/install-song-c.ts'
import { installSongBInterpretations } from './song/install-sustained-reading.ts'
import { ensureProjectSongs, pdfUrlForSong } from './song/project-songs.ts'
import type { SongRepository } from './song/song-repository.ts'
import { mountSongLibrary } from './song/song-library-view.ts'
import { mountSongSettings } from './song/song-settings-view.ts'
import { renderSongStatus, renderSongStatusError } from './song/song-status-view.ts'
import type { Song } from './song/song.ts'

const referencePdf = document.querySelector<HTMLIFrameElement>('#reference-pdf')
const editorHeading = document.querySelector<HTMLElement>('#editor-heading')
const changeSong = document.querySelector<HTMLButtonElement>('#change-song')
const songChoices = document.querySelector<HTMLUListElement>('#song-choices')
const editorDisplay = document.querySelector<HTMLElement>('#editor-display')
const storage = document.querySelector<HTMLElement>('#song-storage')
const measure = document.querySelector<HTMLElement>('#measure-1')
const settingsForm = document.querySelector<HTMLFormElement>('#song-settings-form')
const settingsStatus = document.querySelector<HTMLElement>('#song-settings-status')
const displayForm = document.querySelector<HTMLFormElement>('#sheet-display-form')
const displayStatus = document.querySelector<HTMLElement>('#sheet-display-status')
const engraving = document.querySelector<HTMLElement>('#engraving')
if (
  !referencePdf ||
  !editorHeading ||
  !changeSong ||
  !songChoices ||
  !editorDisplay ||
  !storage ||
  !measure ||
  !settingsForm ||
  !settingsStatus ||
  !displayForm ||
  !displayStatus ||
  !engraving
) {
  throw new Error('Song page containers were not found')
}
const pdfFrame: HTMLIFrameElement = referencePdf
const editorTitle: HTMLElement = editorHeading
const changeSongButton: HTMLButtonElement = changeSong
const songList: HTMLUListElement = songChoices
const displayPanel: HTMLElement = editorDisplay
const storagePanel: HTMLElement = storage
const measurePanel: HTMLElement = measure
const engravingPanel: HTMLElement = engraving

/**
 * Temporary screen filter. It is not saved on the Song and is not a verified barline.
 * The stored prelude still contains every imported note.
 */
const developmentTickWindow = { startTick: 0, endTick: 2000 }

let view: EditorView = chooseSongView()
let loaded: SongLoad | undefined
let librarySongs: Song[] = []
let importedIds = new Set<string>()

const library = mountSongLibrary(songList, (song) => {
  void openSong(song.id)
})

const songs: SongRepository = new IndexedDBSongRepository()

const settings = mountSongSettings(settingsForm, settingsStatus, songs, (song) => {
  rememberOpenSong(song)
})

const display = mountSheetDisplay(displayForm, displayStatus, songs, (song) => {
  rememberOpenSong(song)
})

changeSongButton.addEventListener('click', () => {
  void returnToLibrary()
})

ensureProjectSongs(songs)
  .then(async (libraryLoad) => {
    const correction = await installSongBInterpretations(songs)
    const songC = await installSongCFoundation(songs)
    importedIds = new Set(libraryLoad.importedIds)
    librarySongs = await songs.listSongs()
    showLibrary()
    const correctionMessage = [installMessage(correction), installMessage(songC)].filter((message) => message !== '').join(' ')
    if (correctionMessage !== '') {
      settingsStatus.textContent = correctionMessage
      settingsStatus.className = 'settings__status settings__status--error'
    }
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'The stored Song could not be read.'
    renderSongStatusError(storagePanel, message)
    renderMeasureError(measurePanel, message)
    settingsStatus.textContent = message
    engravingPanel.replaceChildren()
  })

function showLibrary(): void {
  view = chooseSongView()
  applyEditorChrome()
  library.show(librarySongs)
  clearOpenSong()
}

async function openSong(songId: string): Promise<void> {
  const song = await songs.getSong(songId)
  if (song === undefined) {
    librarySongs = await songs.listSongs()
    showLibrary()
    return
  }
  view = editSongView(song.id)
  applyEditorChrome(song.metadata.title)
  showSong(song, true)
}

function applyEditorChrome(title?: string): void {
  if (view.mode === 'choose-song') {
    editorTitle.textContent = 'Choose a Song'
    changeSongButton.hidden = true
    songList.hidden = false
    displayPanel.hidden = true
    return
  }
  editorTitle.textContent = title ?? ''
  changeSongButton.hidden = false
  songList.hidden = true
  displayPanel.hidden = false
}

function rememberOpenSong(song: Song): void {
  librarySongs = librarySongs.map((entry) => (entry.id === song.id ? song : entry))
  if (view.mode === 'edit-song' && view.songId === song.id) showSong(song, false)
}

async function returnToLibrary(): Promise<void> {
  librarySongs = await songs.listSongs()
  showLibrary()
}

function showSong(song: Song, loadPdf: boolean): void {
  const previousId = loaded?.song.id
  loaded = {
    song,
    source: importedIds.has(song.id) ? 'imported' : 'existing',
  }
  importedIds.delete(song.id)
  if (loadPdf || previousId !== song.id) showPdf(song)
  renderStoredSong(loaded)
  settings.show(song)
  display.show(song)
}

function clearOpenSong(): void {
  loaded = undefined
  pdfFrame.removeAttribute('src')
  pdfFrame.title = 'Original sheet music'
  engravingPanel.replaceChildren()
  storagePanel.replaceChildren()
  measurePanel.replaceChildren()
}

function installMessage(
  result:
    | { status: 'absent' }
    | { status: 'unchanged' }
    | { status: 'installed'; messages: readonly string[] }
    | { status: 'conflict'; message: string }
    | { status: 'midi-mismatch'; message: string },
): string {
  if (result.status === 'conflict' || result.status === 'midi-mismatch') return result.message
  if (result.status === 'installed') return result.messages.join(' ')
  return ''
}

function showPdf(song: Song): void {
  const url = pdfUrlForSong(song)
  if (!url) return
  const next = new URL(url, window.location.href).href
  if (pdfFrame.src !== next) pdfFrame.src = url
  pdfFrame.title = `${song.metadata.composer} — ${song.metadata.title}`
}

function renderStoredSong(load: SongLoad): void {
  renderSongStatus(storagePanel, load)
  renderMeasure(
    measurePanel,
    previewSongTickWindow(load.song, developmentTickWindow.startTick, developmentTickWindow.endTick),
  )
  renderEngraving(engravingPanel, load.song)
}
