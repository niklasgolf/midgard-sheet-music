import { availableCompleteMeasures } from '../notation/written-measures.ts'
import type { SongRepository } from './song-repository.ts'
import { completeMeasureRequest, DEFAULT_COMPLETE_MEASURES, type MeasureDisplay, type Song } from './song.ts'

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
  if (!customField) throw new Error('Sheet Music Display controls were not found')

  let current: Song | undefined
  let filling = false

  form.addEventListener('submit', (event) => {
    event.preventDefault()
  })

  measures.addEventListener('change', () => {
    if (filling) return
    customField.hidden = measures.value !== 'custom'
    if (measures.value === '6' || measures.value === '12') {
      void persist(form, status, repository, () => current, { kind: 'count', count: Number(measures.value) }, onSaved, (song) => {
        current = song
      })
      return
    }
    if (measures.value === 'all') {
      void persist(form, status, repository, () => current, { kind: 'all' }, onSaved, (song) => {
        current = song
      })
      return
    }
    const parsed = parsePositiveInteger(customCount.value)
    if (!parsed.ok) {
      writeStatus(status, 'Enter a positive whole number of measures.', true)
      return
    }
    void persist(form, status, repository, () => current, { kind: 'count', count: parsed.value }, onSaved, (song) => {
      current = song
    })
  })

  customCount.addEventListener('change', () => {
    if (filling || measures.value !== 'custom') return
    const parsed = parsePositiveInteger(customCount.value)
    if (!parsed.ok) {
      writeStatus(status, 'Enter a positive whole number of measures.', true)
      return
    }
    void persist(form, status, repository, () => current, { kind: 'count', count: parsed.value }, onSaved, (song) => {
      current = song
    })
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
      } else if (choice.count === 6 || choice.count === 12) {
        measures.value = String(choice.count)
        customCount.value = ''
        customField.hidden = true
      } else {
        measures.value = 'custom'
        customCount.value = String(choice.count)
        customField.hidden = false
      }
      filling = false
      writeClamp(status, song)
    },
  }
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
  measures: MeasureDisplay,
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
    const next: Song = { ...song, display: { measures } }
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
