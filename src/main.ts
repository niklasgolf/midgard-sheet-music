import './style.css'
import { loadChopinFirstMeasure } from './midi/chopin-measure.ts'
import { renderMeasure, renderMeasureError } from './measure-view.ts'

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
