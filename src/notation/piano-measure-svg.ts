import type { MidiNote, MidiTrackInfo } from '../midi/parse-midi.ts'
import type { TickSpan } from './written-measures.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'

const LINE = 14
const STEP = LINE / 2
const STAFF_GAP = 70
const PAD_TOP = 22
const PAD_BOTTOM = 28
const STAFF_INSET = 16
const NOTE_AREA_LEFT = 40
const NOTE_AREA_RIGHT = 32
const FULL_BAR_WIDTH = 250
const NOTE_RX = 8
const NOTE_RY = 5.5
const INK = '#2a1a0e'

const DIATONIC_FROM_C = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]

/** Bottom line of the treble staff is E4. Bottom line of the bass staff is G2. */
const TREBLE_BOTTOM = diatonic(64)
const BASS_BOTTOM = diatonic(43)

export function measureSvg(options: {
  notes: readonly MidiNote[]
  tracks: readonly MidiTrackInfo[]
  span: TickSpan
  spanQuarters: number
  barQuarters: number
  label: string
}): SVGSVGElement {
  const noteArea = Math.max(96, (options.spanQuarters / options.barQuarters) * FULL_BAR_WIDTH)
  const width = NOTE_AREA_LEFT + noteArea + NOTE_AREA_RIGHT
  const trebleBottomY = PAD_TOP + 4 * LINE
  const bassTopY = trebleBottomY + STAFF_GAP
  const bassBottomY = bassTopY + 4 * LINE
  const height = bassBottomY + PAD_BOTTOM

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', `${options.label}, ${options.notes.length} notes`)

  drawStaff(svg, STAFF_INSET, width - STAFF_INSET, trebleBottomY)
  drawStaff(svg, STAFF_INSET, width - STAFF_INSET, bassBottomY)

  const duration = options.span.endTick - options.span.startTick
  for (const note of options.notes) {
    const hand = handForTrack(options.tracks, note.track)
    const staffBottom = hand === 'left' ? BASS_BOTTOM : TREBLE_BOTTOM
    const bottomY = hand === 'left' ? bassBottomY : trebleBottomY
    const staffStep = diatonic(note.midi) - staffBottom
    const y = bottomY - staffStep * STEP
    const x = NOTE_AREA_LEFT + ((note.startTick - options.span.startTick) / duration) * noteArea
    drawLedgerLines(svg, x, staffStep, hand === 'left' ? bassBottomY : trebleBottomY)
    drawNotehead(svg, note, hand, x, y)
  }

  return svg
}

function drawStaff(svg: SVGSVGElement, x1: number, x2: number, bottomY: number): void {
  for (let line = 0; line < 5; line += 1) {
    const y = bottomY - line * LINE
    const path = document.createElementNS(SVG_NS, 'line')
    path.setAttribute('x1', String(x1))
    path.setAttribute('x2', String(x2))
    path.setAttribute('y1', String(y))
    path.setAttribute('y2', String(y))
    path.setAttribute('stroke', INK)
    path.setAttribute('stroke-width', '1.25')
    svg.append(path)
  }
}

function drawLedgerLines(svg: SVGSVGElement, x: number, staffStep: number, bottomY: number): void {
  const lines: number[] = []
  if (staffStep < 0) {
    for (let step = -2; step >= staffStep; step -= 2) lines.push(step)
  }
  if (staffStep > 8) {
    for (let step = 10; step <= staffStep; step += 2) lines.push(step)
  }
  for (const step of lines) {
    const y = bottomY - step * STEP
    const line = document.createElementNS(SVG_NS, 'line')
    line.setAttribute('x1', String(x - 14))
    line.setAttribute('x2', String(x + 14))
    line.setAttribute('y1', String(y))
    line.setAttribute('y2', String(y))
    line.setAttribute('stroke', INK)
    line.setAttribute('stroke-width', '1.25')
    svg.append(line)
  }
}

function drawNotehead(
  svg: SVGSVGElement,
  note: MidiNote,
  hand: 'right' | 'left' | 'other',
  x: number,
  y: number,
): void {
  const head = document.createElementNS(SVG_NS, 'ellipse')
  head.setAttribute('cx', String(x))
  head.setAttribute('cy', String(y))
  head.setAttribute('rx', String(NOTE_RX))
  head.setAttribute('ry', String(NOTE_RY))
  head.setAttribute('fill', INK)
  head.setAttribute('data-midi', String(note.midi))
  head.setAttribute('data-start-tick', String(note.startTick))
  head.setAttribute('data-hand', hand)
  svg.append(head)
}

function handForTrack(
  tracks: readonly MidiTrackInfo[],
  trackNumber: number,
): 'right' | 'left' | 'other' {
  const name = tracks.find((track) => track.track === trackNumber)?.name ?? null
  if (name === 'Main droite') return 'right'
  if (name === 'Main gauche') return 'left'
  return 'other'
}

function diatonic(midi: number): number {
  const step = DIATONIC_FROM_C[midi % 12]
  if (step === undefined || midi < 0 || midi > 127) {
    throw new Error(`MIDI note ${midi} is outside 0–127.`)
  }
  return Math.floor(midi / 12) * 7 + step
}
