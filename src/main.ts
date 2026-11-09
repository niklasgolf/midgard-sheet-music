import './style.css'
import { chooseSongView, editNamesView, editSongView, type EditorView } from './editor/editor-state.ts'
import { renderEngraving } from './notation/engraving-view.ts'
import { notationSystem } from './notation/notation-system.ts'
import { mountMidgardStaff } from './notation/midgard-staff-svg.ts'
import type { SongLoad } from './song/import-chopin-song.ts'
import { IndexedDBSongRepository } from './song/indexeddb-song-repository.ts'
import { mountSheetDisplay } from './song/display-view.ts'
import { installSongCFoundation } from './song/install-song-c.ts'
import { installSongBInterpretations } from './song/install-sustained-reading.ts'
import { ensureProjectSongs, pdfUrlForSong } from './song/project-songs.ts'
import type { SongRepository } from './song/song-repository.ts'
import { mountSongLibrary } from './song/song-library-view.ts'
import { mountSongNames } from './song/song-names-view.ts'
import { mountSongSettings } from './song/song-settings-view.ts'
import { renderSongStatus, renderSongStatusError } from './song/song-status-view.ts'
import type { Song } from './song/song.ts'

const referencePdf = document.querySelector<HTMLIFrameElement>('#reference-pdf')
const editorHeading = document.querySelector<HTMLElement>('#editor-heading')
const namesHeading = document.querySelector<HTMLElement>('#names-heading')
const changeSong = document.querySelector<HTMLButtonElement>('#change-song')
const songChoices = document.querySelector<HTMLUListElement>('#song-choices')
const editorDisplay = document.querySelector<HTMLElement>('#editor-display')
const editNames = document.querySelector<HTMLButtonElement>('#edit-names')
const storage = document.querySelector<HTMLElement>('#song-storage')
const settingsForm = document.querySelector<HTMLFormElement>('#song-settings-form')
const settingsStatus = document.querySelector<HTMLElement>('#song-settings-status')
const namesPage = document.querySelector<HTMLElement>('#names-page')
const namesForm = document.querySelector<HTMLFormElement>('#song-names-form')
const namesStatus = document.querySelector<HTMLElement>('#song-names-status')
const namesReturn = document.querySelector<HTMLButtonElement>('#names-return')
const displayForm = document.querySelector<HTMLFormElement>('#sheet-display-form')
const displayStatus = document.querySelector<HTMLElement>('#sheet-display-status')
const engraving = document.querySelector<HTMLElement>('#engraving')
const midgardSystem = document.querySelector<HTMLElement>('#midgard-system')
const midgardSystemStaffs = document.querySelector<HTMLElement>('#midgard-system-staffs')
if (
  !referencePdf ||
  !editorHeading ||
  !namesHeading ||
  !changeSong ||
  !songChoices ||
  !editorDisplay ||
  !editNames ||
  !storage ||
  !settingsForm ||
  !settingsStatus ||
  !namesPage ||
  !namesForm ||
  !namesStatus ||
  !namesReturn ||
  !displayForm ||
  !displayStatus ||
  !engraving ||
  !midgardSystem ||
  !midgardSystemStaffs
) {
  throw new Error('Song page containers were not found')
}
const pdfFrame: HTMLIFrameElement = referencePdf
const editorTitle: HTMLElement = editorHeading
const namesTitle: HTMLElement = namesHeading
const changeSongButton: HTMLButtonElement = changeSong
const songList: HTMLUListElement = songChoices
const displayPanel: HTMLElement = editorDisplay
const editNamesButton: HTMLButtonElement = editNames
const storagePanel: HTMLElement = storage
const namesPanel: HTMLElement = namesPage
const namesReturnButton: HTMLButtonElement = namesReturn
const musicalForm: HTMLFormElement = settingsForm
const settingsSection = musicalForm.closest('section')
const engravingPanel: HTMLElement = engraving
const midgardSystemPanel: HTMLElement = midgardSystem
mountMidgardStaff(midgardSystemStaffs)
if (!settingsSection) throw new Error('Song Settings were not found')
const settingsPanel: HTMLElement = settingsSection

let view: EditorView = chooseSongView()
let loaded: SongLoad | undefined
let librarySongs: Song[] = []
let importedIds = new Set<string>()

const library = mountSongLibrary(songList, (song) => {
  void openSong(song.id)
})

const songs: SongRepository = new IndexedDBSongRepository()

const settings = mountSongSettings(musicalForm, settingsStatus, songs, (song) => {
  rememberOpenSong(song)
})

const display = mountSheetDisplay(displayForm, displayStatus, songs, (song) => {
  rememberOpenSong(song)
})

const names = mountSongNames(namesForm, namesStatus, songs, (song) => {
  rememberOpenSong(song)
})

changeSongButton.addEventListener('click', () => {
  void returnToLibrary()
})

musicalForm.addEventListener('change', (event) => {
  const target = event.target
  if (!(target instanceof HTMLInputElement) || target.name !== 'sheetSystem') return
  if (view.mode !== 'edit-song' || loaded === undefined) return
  renderEngraving(engravingPanel, loaded.song, notationSystem(target.value))
})

editNamesButton.addEventListener('click', () => {
  openNames()
})

namesReturnButton.addEventListener('click', () => {
  returnFromNames()
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
  useClassicalSheet()
  showSong(song, true)
}

function applyEditorChrome(title?: string): void {
  namesTitle.hidden = view.mode !== 'edit-names'
  if (view.mode === 'choose-song') {
    editorTitle.textContent = 'Choose a Song'
    changeSongButton.hidden = true
    songList.hidden = false
    displayPanel.hidden = true
    editNamesButton.hidden = true
    namesPanel.hidden = true
    showReviewSections(false)
    return
  }
  if (view.mode === 'edit-names') {
    editorTitle.textContent = title ?? ''
    changeSongButton.hidden = true
    songList.hidden = true
    displayPanel.hidden = true
    editNamesButton.hidden = true
    namesPanel.hidden = false
    showReviewSections(false)
    return
  }
  editorTitle.textContent = title ?? ''
  changeSongButton.hidden = false
  songList.hidden = true
  displayPanel.hidden = false
  editNamesButton.hidden = false
  namesPanel.hidden = true
  showReviewSections(true)
}

function openNames(): void {
  const song = loaded?.song
  if (!song || view.mode !== 'edit-song') return
  view = editNamesView(song.id)
  applyEditorChrome(song.metadata.title)
  names.show(song)
}

function returnFromNames(): void {
  if (names.isDirty() && !window.confirm('These name changes are not saved. Return to the song without saving?')) {
    return
  }
  const song = loaded?.song
  if (!song) {
    showLibrary()
    return
  }
  view = editSongView(song.id)
  applyEditorChrome(song.metadata.title)
}

function showReviewSections(visible: boolean): void {
  storagePanel.hidden = !visible
  settingsPanel.hidden = !visible
}

function rememberOpenSong(song: Song): void {
  librarySongs = librarySongs.map((entry) => (entry.id === song.id ? song : entry))
  if (view.mode === 'choose-song' || view.songId !== song.id) return
  if (view.mode === 'edit-names') {
    if (loaded) loaded = { ...loaded, song }
    editorTitle.textContent = song.metadata.title
    pdfFrame.title = `${song.metadata.composer} — ${song.metadata.title}`
    if (loaded) renderSongStatus(storagePanel, loaded)
    return
  }
  showSong(song, false)
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
  midgardSystemPanel.hidden = false
  storagePanel.replaceChildren()
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
  midgardSystemPanel.hidden = true
  renderEngraving(engravingPanel, load.song, currentSheetSystem())
}

function currentSheetSystem(): ReturnType<typeof notationSystem> {
  const selected = musicalForm.querySelector<HTMLInputElement>('input[name="sheetSystem"]:checked')
  return notationSystem(selected?.value)
}

function useClassicalSheet(): void {
  const classical = musicalForm.querySelector<HTMLInputElement>('input[name="sheetSystem"][value="classical"]')
  if (classical) classical.checked = true
}
