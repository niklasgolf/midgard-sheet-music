import './style.css'
import { previewSongTickWindow } from './midi/chopin-measure.ts'
import { renderEngraving } from './notation/engraving-view.ts'
import { renderMeasure, renderMeasureError } from './measure-view.ts'
import { CHOPIN_SONG_ID, type SongLoad } from './song/import-chopin-song.ts'
import { ensureProjectSongs, pdfUrlForSong } from './song/project-songs.ts'
import { mountSongLibrary } from './song/song-library-view.ts'
import { mountSongSettings } from './song/song-settings-view.ts'
import { renderSongStatus, renderSongStatusError } from './song/song-status-view.ts'
import type { Song } from './song/song.ts'

const referencePdf = document.querySelector<HTMLIFrameElement>('#reference-pdf')
const librarySelect = document.querySelector<HTMLSelectElement>('#song-library')
const storage = document.querySelector<HTMLElement>('#song-storage')
const measure = document.querySelector<HTMLElement>('#measure-1')
const settingsForm = document.querySelector<HTMLFormElement>('#song-settings-form')
const settingsStatus = document.querySelector<HTMLElement>('#song-settings-status')
const engraving = document.querySelector<HTMLElement>('#engraving')
if (!referencePdf || !librarySelect || !storage || !measure || !settingsForm || !settingsStatus || !engraving) {
  throw new Error('Song page containers were not found')
}
const pdfFrame: HTMLIFrameElement = referencePdf
const storagePanel: HTMLElement = storage
const measurePanel: HTMLElement = measure
const engravingPanel: HTMLElement = engraving

/**
 * Temporary screen filter. It is not saved on the Song and is not a verified barline.
 * The stored prelude still contains every imported note.
 */
const developmentTickWindow = { startTick: 0, endTick: 2000 }

let loaded: SongLoad | undefined
let librarySongs: Song[] = []
let importedIds = new Set<string>()

const library = mountSongLibrary(librarySelect, (song) => {
  showSong(song, false)
})

const settings = mountSongSettings(settingsForm, settingsStatus, (song) => {
  librarySongs = librarySongs.map((entry) => (entry.id === song.id ? song : entry))
  showSong(song, false)
})

ensureProjectSongs()
  .then((libraryLoad) => {
    librarySongs = libraryLoad.songs
    importedIds = new Set(libraryLoad.importedIds)
    const initial = librarySongs.find((song) => song.id === CHOPIN_SONG_ID) ?? librarySongs[0]
    if (!initial) {
      throw new Error('The song library is empty.')
    }
    showSong(initial, true)
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'The stored Song could not be read.'
    renderSongStatusError(storagePanel, message)
    renderMeasureError(measurePanel, message)
    settingsStatus.textContent = message
    engravingPanel.replaceChildren()
  })

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
  library.show(librarySongs, song.id)
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
