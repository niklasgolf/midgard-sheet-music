import { availableCompleteMeasures } from '../notation/written-measures.ts'
import type { SongRepository } from './song-repository.ts'
import {
  completeMeasureRequest,
  DEFAULT_COMPLETE_MEASURES,
  MIDGARD_MEASURE_WIDTH_MAX,
  MIDGARD_MEASURE_WIDTH_MIN,
  MIDGARD_MEASURE_WIDTH_STEP,
  measuresPerRowCount,
  midgardMeasureWidth,
  type Song,
  type SongDisplay,
} from './song.ts'

export type SheetDisplayController = {
  show(song: Song): void
}

export function mountSheetDisplay(
  form: HTMLFormElement,
  status: HTMLElement,
  repository: SongRepository,
  onSaved: (song: Song) => void,
): SheetDisplayController {
  const measures = requiredField<HTMLSelectElement>(form, 'measures')
  const customCount = requiredField<HTMLInputElement>(form, 'customCount')
  const customField = form.querySelector<HTMLElement>('[data-custom-count]')
  const rowRadios = [...form.querySelectorAll<HTMLInputElement>('input[name="measuresPerRow"]')]
  const widthSlider = requiredField<HTMLInputElement>(form, 'midgardMeasureWidth')
  const widthValue = form.querySelector<HTMLOutputElement>('#midgard-measure-width-value')
  if (!customField || rowRadios.length !== 2 || !widthValue) {
    throw new Error('Sheet Music Display controls were not found')
  }

  let current: Song | undefined
  let filling = false
  let writes: Promise<void> = Promise.resolve()

  form.addEventListener('submit', (event) => {
    event.preventDefault()
  })

  const save = (patch: SongDisplay): void => {
    writes = writes
      .then(() =>
        persist(form, status, repository, () => current, patch, onSaved, (song) => {
          current = song
        }),
      )
      .catch(() => undefined)
  }

  measures.addEventListener('change', () => {
    if (filling) return
    customField.hidden = measures.value !== 'custom'
    if (measures.value === 'all') {
      save({ measures: { kind: 'all' } })
      return
    }
    if (isListedCount(measures.value)) {
      save({ measures: { kind: 'count', count: Number(measures.value) } })
      return
    }
    const parsed = parsePositiveInteger(customCount.value)
    if (!parsed.ok) {
      writeStatus(status, 'Enter a positive whole number of measures.', true)
      return
    }
    save({ measures: { kind: 'count', count: parsed.value } })
  })

  customCount.addEventListener('input', () => {
    if (filling || measures.value !== 'custom') return
    if (!parsePositiveInteger(customCount.value).ok) {
      writeStatus(status, 'Enter a positive whole number of measures.', true)
      return
    }
    writeStatus(status, '', false)
  })

  customCount.addEventListener('change', () => {
    if (filling || measures.value !== 'custom') return
    const parsed = parsePositiveInteger(customCount.value)
    if (!parsed.ok) {
      writeStatus(status, 'Enter a positive whole number of measures.', true)
      return
    }
    save({ measures: { kind: 'count', count: parsed.value } })
  })

  for (const radio of rowRadios) {
    radio.addEventListener('change', () => {
      if (filling || !radio.checked) return
      const count = radio.value === '2' ? 2 : radio.value === '3' ? 3 : undefined
      if (count === undefined) return
      save({ measuresPerRow: { kind: 'fixed', count } })
    })
  }

  const applyWidth = (text: string, persistWidth: boolean): void => {
    if (!current) return
    const width = parseMidgardMeasureWidth(text)
    if (width === undefined) return
    widthValue.textContent = `${width}px`
    const next: Song = { ...current, display: { ...current.display, midgardMeasureWidth: width } }
    current = next
    if (persistWidth) {
      save({ midgardMeasureWidth: width })
      return
    }
    onSaved(next)
  }

  widthSlider.addEventListener('input', () => {
    if (filling) return
    applyWidth(widthSlider.value, false)
  })

  widthSlider.addEventListener('change', () => {
    if (filling) return
    applyWidth(widthSlider.value, true)
  })

  return {
    show(song) {
      current = song
      filling = true
      const choice = song.display?.measures
      if (choice === undefined) {
        measures.value = 'custom'
        customCount.value = String(DEFAULT_COMPLETE_MEASURES)
        customField.hidden = false
      } else if (choice.kind === 'all') {
        measures.value = 'all'
        customCount.value = ''
        customField.hidden = true
      } else if (isListedCount(String(choice.count))) {
        measures.value = String(choice.count)
        customCount.value = ''
        customField.hidden = true
      } else {
        measures.value = 'custom'
        customCount.value = String(choice.count)
        customField.hidden = false
      }
      const perRow = String(measuresPerRowCount(song))
      for (const radio of rowRadios) radio.checked = radio.value === perRow
      const width = midgardMeasureWidth(song)
      if (document.activeElement !== widthSlider) widthSlider.value = String(width)
      widthValue.textContent = `${width}px`
      filling = false
      writeClamp(status, song)
    },
  }
}

function parseMidgardMeasureWidth(text: string): number | undefined {
  const value = Number(text)
  if (
    !Number.isInteger(value) ||
    value < MIDGARD_MEASURE_WIDTH_MIN ||
    value > MIDGARD_MEASURE_WIDTH_MAX ||
    value % MIDGARD_MEASURE_WIDTH_STEP !== 0
  ) {
    return undefined
  }
  return value
}

function isListedCount(value: string): boolean {
  return value === '1' || value === '2' || value === '3' || value === '4' || value === '5' || value === '6'
}

export function parsePositiveInteger(text: string): { ok: true; value: number } | { ok: false } {
  const raw = text.trim()
  if (!/^[1-9]\d*$/.test(raw)) return { ok: false }
  const value = Number(raw)
  if (!Number.isSafeInteger(value)) return { ok: false }
  return { ok: true, value }
}

async function persist(
  form: HTMLFormElement,
  status: HTMLElement,
  repository: SongRepository,
  readCurrent: () => Song | undefined,
  patch: SongDisplay,
  onSaved: (song: Song) => void,
  remember: (song: Song) => void,
): Promise<void> {
  const song = readCurrent()
  if (!song) {
    writeStatus(status, 'The Song is not loaded yet.', true)
    return
  }
  form.setAttribute('aria-busy', 'true')
  try {
    const next: Song = { ...song, display: { ...song.display, ...patch } }
    await repository.saveSong(next)
    const stored = await repository.getSong(song.id)
    if (!stored) throw new Error('The display choice was saved but the Song could not be read back.')
    remember(stored)
    onSaved(stored)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The display choice could not be saved.'
    writeStatus(status, message, true)
  } finally {
    form.removeAttribute('aria-busy')
  }
}

function writeClamp(status: HTMLElement, song: Song): void {
  const available = availableCompleteMeasures(song.musicalInterpretation, song.originalMidi.notes)
  if (!available.ready) {
    writeStatus(status, '', false)
    return
  }
  const request = completeMeasureRequest(song)
  if (request !== 'all' && request > available.count) {
    const count = available.count
    const noun = count === 1 ? 'measure' : 'measures'
    writeStatus(status, `This piece has ${count} complete ${noun}, so ${count} are shown.`, false)
    return
  }
  writeStatus(status, '', false)
}

function writeStatus(status: HTMLElement, message: string, error: boolean): void {
  status.textContent = message
  status.className = error ? 'settings__status settings__status--error' : 'settings__status'
}

function requiredField<Element extends HTMLElement>(form: HTMLFormElement, name: string): Element {
  const field = form.elements.namedItem(name)
  if (!(field instanceof HTMLElement)) {
    throw new Error(`Sheet Music Display is missing the ${name} field.`)
  }
  return field as Element
}
