import { KEY_SIGNATURES, keyOptionLabel, keyOptionValue } from './musical-keys.ts'
import type { SongRepository } from './song-repository.ts'
import { applySongSettings, parseSongSettings, type SettingsFormValues } from './song-settings.ts'
import type { Song } from './song.ts'

export type SongSettingsController = {
  show(song: Song): void
}

export function mountSongSettings(
  form: HTMLFormElement,
  status: HTMLElement,
  repository: SongRepository,
  onSaved: (song: Song) => void,
): SongSettingsController {
  const numerator = requiredField<HTMLInputElement>(form, 'numerator')
  const denominator = requiredField<HTMLSelectElement>(form, 'denominator')
  const key = requiredField<HTMLSelectElement>(form, 'key')
  const pickupDuration = requiredField<HTMLSelectElement>(form, 'pickupDuration')
  const ticksPerQuarter = requiredField<HTMLInputElement>(form, 'ticksPerQuarter')
  const durationField = form.querySelector<HTMLElement>('[data-pickup-duration]')
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')
  if (!durationField || !submit) {
    throw new Error('Song Settings controls were not found')
  }

  fillKeyList(key)
  let current: Song | undefined
  setEnabled(form, false)

  form.addEventListener('change', () => {
    durationField.hidden = selectedPickup(form) !== 'yes'
  })

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    void save(form, status, submit, repository, () => current, onSaved, (song) => {
      current = song
    })
  })

  return {
    show(song) {
      current = song
      fillForm(song, {
        numerator,
        denominator,
        key,
        pickupDuration,
        ticksPerQuarter,
        form,
        durationField,
      })
      setEnabled(form, true)
      status.textContent = ''
      status.className = 'settings__status'
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

  const parsed = parseSongSettings(readValues(form, song))
  if (!parsed.ok) {
    writeStatus(status, parsed.message, true)
    return
  }

  const midiBefore = JSON.stringify(song.originalMidi)
  const updated = applySongSettings(song, parsed.settings)
  submit.disabled = true
  try {
    await repository.saveSong(updated)
    const stored = await repository.getSong(song.id)
    if (!stored) {
      throw new Error('The Song was saved but could not be read back.')
    }
    if (stored.id !== song.id || stored.schemaVersion !== song.schemaVersion) {
      throw new Error('Saving changed the Song id or schema version.')
    }
    if (stored.metadata.sourceFilename !== song.metadata.sourceFilename) {
      throw new Error('Saving changed the source MIDI filename.')
    }
    if (JSON.stringify(stored.originalMidi) !== midiBefore) {
      throw new Error('Saving changed the imported MIDI information.')
    }
    remember(stored)
    onSaved(stored)
    writeStatus(status, 'Saved. These settings are now in the Song. The imported MIDI was not changed.', false)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The Song could not be saved.'
    writeStatus(status, message, true)
  } finally {
    submit.disabled = false
  }
}

function fillKeyList(select: HTMLSelectElement): void {
  const blank = document.createElement('option')
  blank.value = ''
  blank.textContent = 'Not specified'
  select.append(blank)

  for (const mode of ['major', 'minor'] as const) {
    const group = document.createElement('optgroup')
    group.label = mode === 'major' ? 'Major' : 'Minor'
    for (const key of KEY_SIGNATURES) {
      if (key.mode !== mode) continue
      const option = document.createElement('option')
      option.value = keyOptionValue(key)
      option.textContent = keyOptionLabel(key)
      group.append(option)
    }
    select.append(group)
  }
}

function fillForm(
  song: Song,
  fields: {
    numerator: HTMLInputElement
    denominator: HTMLSelectElement
    key: HTMLSelectElement
    pickupDuration: HTMLSelectElement
    ticksPerQuarter: HTMLInputElement
    form: HTMLFormElement
    durationField: HTMLElement
  },
): void {
  const interpretation = song.musicalInterpretation
  fields.numerator.value = interpretation.timeSignature ? String(interpretation.timeSignature.numerator) : ''
  fields.denominator.value = interpretation.timeSignature ? String(interpretation.timeSignature.denominator) : ''
  fields.key.value = interpretation.keySignature ? keyOptionValue(interpretation.keySignature) : ''

  const pickup = interpretation.pickup
  setPickupChoice(fields.form, pickup?.present === true ? 'yes' : pickup?.present === false ? 'no' : '')
  fields.pickupDuration.value = pickup?.present === true ? pickup.duration : ''
  fields.durationField.hidden = pickup?.present !== true
  fields.ticksPerQuarter.value =
    interpretation.ticksPerWrittenQuarter === undefined ? '' : String(interpretation.ticksPerWrittenQuarter)
}

function readValues(form: HTMLFormElement, song: Song): SettingsFormValues {
  return {
    title: song.metadata.title,
    composer: song.metadata.composer,
    numerator: requiredField<HTMLInputElement>(form, 'numerator').value,
    denominator: requiredField<HTMLSelectElement>(form, 'denominator').value,
    key: requiredField<HTMLSelectElement>(form, 'key').value,
    pickup: selectedPickup(form),
    pickupDuration: requiredField<HTMLSelectElement>(form, 'pickupDuration').value,
    ticksPerQuarter: requiredField<HTMLInputElement>(form, 'ticksPerQuarter').value,
  }
}

function selectedPickup(form: HTMLFormElement): SettingsFormValues['pickup'] {
  const selected = form.querySelector<HTMLInputElement>('input[name="pickup"]:checked')
  if (selected?.value === 'yes' || selected?.value === 'no') return selected.value
  return ''
}

function setPickupChoice(form: HTMLFormElement, choice: SettingsFormValues['pickup']): void {
  for (const input of form.querySelectorAll<HTMLInputElement>('input[name="pickup"]')) {
    input.checked = input.value === choice
  }
}

function setEnabled(form: HTMLFormElement, enabled: boolean): void {
  for (const control of form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
    'input, select, button',
  )) {
    control.disabled = !enabled
  }
}

function writeStatus(status: HTMLElement, message: string, isError: boolean): void {
  status.textContent = message
  status.className = isError ? 'settings__status settings__status--error' : 'settings__status'
}

function requiredField<T extends HTMLElement>(form: HTMLFormElement, name: string): T {
  const field = form.elements.namedItem(name)
  if (!(field instanceof HTMLElement)) {
    throw new Error(`Song Settings is missing the ${name} field.`)
  }
  return field as T
}
