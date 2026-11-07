import './style.css'
import referencePdfUrl from '../pdf-files/chopin-prelude-op-28-no-7-in-a-major.pdf?url'
import { loadChopinFirstMeasure } from './midi/chopin-measure.ts'
import { renderMeasure, renderMeasureError } from './measure-view.ts'

const referencePdf = document.querySelector<HTMLIFrameElement>('#reference-pdf')
if (!referencePdf) {
  throw new Error('Reference PDF frame not found')
}
referencePdf.src = referencePdfUrl

const measure = document.querySelector<HTMLElement>('#measure-1')
if (!measure) {
  throw new Error('Measure container not found')
}

loadChopinFirstMeasure()
  .then((data) => {
    renderMeasure(measure, data)
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'The MIDI measure could not be read.'
    renderMeasureError(measure, message)
  })
