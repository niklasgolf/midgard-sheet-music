import './style.css'
import referencePdfUrl from '../pdf-files/chopin-prelude-op-28-no-7-in-a-major.pdf?url'
import { previewSongTickWindow } from './midi/chopin-measure.ts'
import { renderMeasure, renderMeasureError } from './measure-view.ts'
import { loadChopinSong, type SongLoad } from './song/import-chopin-song.ts'
import { mountSongSettings } from './song/song-settings-view.ts'
import { renderSongStatus, renderSongStatusError } from './song/song-status-view.ts'

const referencePdf = document.querySelector<HTMLIFrameElement>('#reference-pdf')
if (!referencePdf) {
  throw new Error('Reference PDF frame not found')
}
referencePdf.src = referencePdfUrl

const storage = document.querySelector<HTMLElement>('#song-storage')
const measure = document.querySelector<HTMLElement>('#measure-1')
const settingsForm = document.querySelector<HTMLFormElement>('#song-settings-form')
const settingsStatus = document.querySelector<HTMLElement>('#song-settings-status')
if (!storage || !measure || !settingsForm || !settingsStatus) {
  throw new Error('Song page containers were not found')
}
const storagePanel: HTMLElement = storage
const measurePanel: HTMLElement = measure

/**
 * Temporary screen filter. It is not saved on the Song and is not a verified barline.
 * The stored prelude still contains every imported note.
 */
const developmentTickWindow = { startTick: 0, endTick: 2000 }

let loaded: SongLoad | undefined

const settings = mountSongSettings(settingsForm, settingsStatus, (song) => {
  if (!loaded) return
  loaded = { song, source: loaded.source }
  renderStoredSong(loaded)
})

loadChopinSong()
  .then((load) => {
    loaded = load
    renderStoredSong(load)
    settings.show(load.song)
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'The stored Song could not be read.'
    renderSongStatusError(storagePanel, message)
    renderMeasureError(measurePanel, message)
    settingsStatus.textContent = message
  })

function renderStoredSong(load: SongLoad): void {
  renderSongStatus(storagePanel, load)
  renderMeasure(
    measurePanel,
    previewSongTickWindow(load.song, developmentTickWindow.startTick, developmentTickWindow.endTick),
  )
}
