import type { SongRepository } from './song-repository.ts'
import { applySongNames, parseSongNames } from './song-settings.ts'
import type { Song } from './song.ts'

export type SongNamesController = {
  show(song: Song): void
  isDirty(): boolean
}

export function mountSongNames(
  form: HTMLFormElement,
  status: HTMLElement,
  repository: SongRepository,
  onSaved: (song: Song) => void,
): SongNamesController {
  const title = requiredField<HTMLInputElement>(form, 'title')
  const composer = requiredField<HTMLInputElement>(form, 'composer')
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')
  if (!submit) throw new Error('Edit Names controls were not found')

  let current: Song | undefined
  let savedTitle = ''
  let savedComposer = ''

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    void save(form, status, submit, repository, () => current, onSaved, (song) => {
      current = song
      savedTitle = song.metadata.title
      savedComposer = song.metadata.composer
      title.value = savedTitle
      composer.value = savedComposer
    })
  })

  return {
    show(song) {
      current = song
      savedTitle = song.metadata.title
      savedComposer = song.metadata.composer
      title.value = savedTitle
      composer.value = savedComposer
      status.textContent = ''
      status.className = 'settings__status'
    },
    isDirty() {
      return title.value.trim() !== savedTitle || composer.value.trim() !== savedComposer
    },
  }
}

async function save(
  form: HTMLFormElement,
  status: HTMLElement,
  submit: HTMLButtonElement,
  repository: SongRepository,
  readCurrent: () => Song | undefined,
  onSaved: (song: Song) => void,
  remember: (song: Song) => void,
): Promise<void> {
  const song = readCurrent()
  if (!song) {
    writeStatus(status, 'The Song is not loaded yet.', true)
    return
  }

  const title = requiredField<HTMLInputElement>(form, 'title').value
  const composer = requiredField<HTMLInputElement>(form, 'composer').value
  const parsed = parseSongNames(title, composer)
  if (!parsed.ok) {
    writeStatus(status, parsed.message, true)
    return
  }

  const midiBefore = JSON.stringify(song.originalMidi)
  const interpretationBefore = JSON.stringify(song.musicalInterpretation)
  const displayBefore = JSON.stringify(song.display ?? null)
  const updated = applySongNames(song, parsed)
  submit.disabled = true
  try {
    await repository.saveSong(updated)
    const stored = await repository.getSong(song.id)
    if (!stored) throw new Error('The names were saved but the Song could not be read back.')
    if (stored.id !== song.id || stored.schemaVersion !== song.schemaVersion) {
      throw new Error('Saving changed the Song id or schema version.')
    }
    if (stored.metadata.sourceFilename !== song.metadata.sourceFilename) {
      throw new Error('Saving changed the source MIDI filename.')
    }
    if (stored.metadata.pdfFilename !== song.metadata.pdfFilename) {
      throw new Error('Saving changed the PDF filename.')
    }
    if (JSON.stringify(stored.originalMidi) !== midiBefore) {
      throw new Error('Saving changed the imported MIDI information.')
    }
    if (JSON.stringify(stored.musicalInterpretation) !== interpretationBefore) {
      throw new Error('Saving changed the musical interpretation.')
    }
    if (JSON.stringify(stored.display ?? null) !== displayBefore) {
      throw new Error('Saving changed the display settings.')
    }
    remember(stored)
    onSaved(stored)
    writeStatus(status, 'Saved. The title and composer are now in the Song.', false)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The names could not be saved.'
    writeStatus(status, message, true)
  } finally {
    submit.disabled = false
  }
}

function writeStatus(status: HTMLElement, message: string, isError: boolean): void {
  status.textContent = message
  status.className = isError ? 'settings__status settings__status--error' : 'settings__status'
}

function requiredField<T extends HTMLElement>(form: HTMLFormElement, name: string): T {
  const field = form.elements.namedItem(name)
  if (!(field instanceof HTMLElement)) {
    throw new Error(`Edit Names is missing the ${name} field.`)
  }
  return field as T
}
