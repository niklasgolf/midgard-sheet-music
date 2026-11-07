import type { MidiFile } from '../midi/parse-midi.ts'
import type { SongLoad } from './import-chopin-song.ts'
import { SONG_DATABASE_NAME } from './song-database.ts'
import { pdfFilenameForSong } from './project-songs.ts'

export function renderSongStatus(container: HTMLElement, load: SongLoad): void {
  const title = document.createElement('h2')
  title.className = 'storage__title'
  title.textContent = 'Song Storage — IndexedDB'

  const facts = document.createElement('dl')
  facts.className = 'storage__facts'
  const midi = load.song.originalMidi
  const interpretation = load.song.musicalInterpretation
  facts.append(
    fact('Database', SONG_DATABASE_NAME),
    fact('Title', load.song.metadata.title),
    fact('Song ID', load.song.id),
    fact('MIDI file', load.song.metadata.sourceFilename),
    fact('PDF', pdfFilenameForSong(load.song) ?? 'No PDF is associated with this Song'),
    fact('Imported notes', String(midi.notes.length)),
    fact('MIDI tracks', String(midi.trackCount)),
    fact('MIDI PPQ', midi.ppq === null ? 'SMPTE timing' : String(midi.ppq)),
    fact('MIDI tempo', tempoText(midi)),
    fact('MIDI time signature', timeSignatureText(midi)),
    fact('Saved ticks per written quarter', savedQuarterText(interpretation.ticksPerWrittenQuarter)),
    fact('Storage', load.source === 'imported' ? 'Newly imported' : 'Loaded from existing storage'),
  )

  container.replaceChildren(title, facts)
}

export function renderSongStatusError(container: HTMLElement, message: string): void {
  const title = document.createElement('h2')
  title.className = 'storage__title'
  title.textContent = 'Song Storage — IndexedDB'

  const detail = document.createElement('p')
  detail.className = 'storage__message'
  detail.textContent = message

  container.replaceChildren(title, detail)
}

function tempoText(midi: MidiFile): string {
  if (midi.tempos.length === 0) return 'none in the file'
  return midi.tempos
    .map((tempo) => {
      const bpm = 60_000_000 / tempo.microsecondsPerQuarter
      const bpmText = Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(2)
      return `tick ${tempo.tick}: ${tempo.microsecondsPerQuarter} µs per MIDI quarter (${bpmText} BPM)`
    })
    .join('; ')
}

function timeSignatureText(midi: MidiFile): string {
  if (midi.timeSignatures.length === 0) return 'none in the file'
  return midi.timeSignatures
    .map((signature) => `${signature.numerator}/${signature.denominator} at tick ${signature.tick}`)
    .join('; ')
}

function savedQuarterText(ticks: number | undefined): string {
  if (ticks === undefined) return 'Not chosen yet. The MIDI PPQ is not used automatically.'
  return String(ticks)
}

function fact(label: string, value: string): DocumentFragment {
  const fragment = document.createDocumentFragment()
  const term = document.createElement('dt')
  term.textContent = label
  const description = document.createElement('dd')
  description.textContent = value
  fragment.append(term, description)
  return fragment
}
