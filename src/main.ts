import './style.css'
import referencePdfUrl from '../pdf-files/chopin-prelude-op-28-no-7-in-a-major.pdf?url'
import { previewSongTickWindow } from './midi/chopin-measure.ts'
import { renderMeasure, renderMeasureError } from './measure-view.ts'
import { loadChopinSong } from './song/import-chopin-song.ts'
import { renderSongStatus, renderSongStatusError } from './song/song-status-view.ts'

const referencePdf = document.querySelector<HTMLIFrameElement>('#reference-pdf')
if (!referencePdf) {
  throw new Error('Reference PDF frame not found')
}
referencePdf.src = referencePdfUrl

const storage = document.querySelector<HTMLElement>('#song-storage')
const measure = document.querySelector<HTMLElement>('#measure-1')
if (!storage || !measure) {
  throw new Error('Song page containers were not found')
}

/**
 * Temporary screen filter. It is not saved on the Song and is not a verified barline.
 * The stored prelude still contains every imported note.
 */
const developmentTickWindow = { startTick: 0, endTick: 2000 }

loadChopinSong()
  .then((load) => {
    renderSongStatus(storage, load)
    renderMeasure(measure, previewSongTickWindow(load.song, developmentTickWindow.startTick, developmentTickWindow.endTick))
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'The stored Song could not be read.'
    renderSongStatusError(storage, message)
    renderMeasureError(measure, message)
  })
