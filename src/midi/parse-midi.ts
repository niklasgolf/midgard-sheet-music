export class MidiReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MidiReadError'
  }
}

export type MidiTempo = {
  tick: number
  microsecondsPerQuarter: number
}

export type MidiTimeSignature = {
  tick: number
  numerator: number
  denominator: number
}

export type MidiKeySignature = {
  tick: number
  sharps: number
  mode: 'major' | 'minor'
}

export type MidiNote = {
  midi: number
  startTick: number
  endTick: number
  durationTicks: number
  velocity: number
  releaseVelocity: number
  /** 1–16, as musicians count MIDI channels. */
  channel: number
  /** 1-based track number in the file. Track 1 is the first MTrk chunk. */
  track: number
}

export type MidiTrackInfo = {
  track: number
  name: string | null
}

export type MidiFile = {
  format: number
  trackCount: number
  /** Null when the header uses SMPTE timing instead of ticks per quarter note. */
  ppq: number | null
  tracks: MidiTrackInfo[]
  tempos: MidiTempo[]
  timeSignatures: MidiTimeSignature[]
  keySignatures: MidiKeySignature[]
  notes: MidiNote[]
  warnings: string[]
}

type OpenNote = {
  startTick: number
  velocity: number
}

const CHANNEL_DATA_BYTES: Record<number, number> = {
  0x80: 2,
  0x90: 2,
  0xa0: 2,
  0xb0: 2,
  0xc0: 1,
  0xd0: 1,
  0xe0: 2,
}

const CHANNEL_EVENT_LABEL: Record<number, string> = {
  0xa0: 'polyphonic pressure',
  0xb0: 'control change',
  0xc0: 'program change',
  0xd0: 'channel pressure',
  0xe0: 'pitch bend',
}

export function parseMidi(data: Uint8Array): MidiFile {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let offset = 0
  const warnings: string[] = []

  const header = readChunk(data, view, offset, 'header')
  offset = header.dataOffset
  if (header.type !== 'MThd') {
    throw new MidiReadError(`Expected MThd at the start of the file, found ${header.type}.`)
  }
  if (header.length < 6) {
    throw new MidiReadError(`MIDI header is ${header.length} bytes; at least 6 are required.`)
  }

  const format = view.getUint16(offset)
  const trackCount = view.getUint16(offset + 2)
  const division = view.getUint16(offset + 4)
  if (header.length !== 6) {
    warnings.push(`MIDI header is ${header.length} bytes. The extra header data was skipped.`)
  }
  offset = header.nextOffset

  if (format > 2) {
    throw new MidiReadError(`MIDI format ${format} is not a Standard MIDI format (0, 1, or 2).`)
  }
  if (format === 2) {
    warnings.push(
      'MIDI format 2 keeps independent sequences in each track. This reader still places them on one tick timeline.',
    )
  }

  let ppq: number | null
  if ((division & 0x8000) !== 0) {
    ppq = null
    const framesPerSecond = ((division >> 8) & 0xff) - 256
    const ticksPerFrame = division & 0xff
    warnings.push(
      `SMPTE timing (${Math.abs(framesPerSecond)} frames/second, ${ticksPerFrame} ticks/frame) is not interpreted. Tick values stay raw, and PPQ is unavailable.`,
    )
  } else if (division === 0) {
    throw new MidiReadError('MIDI division is 0 ticks per quarter note.')
  } else {
    ppq = division
  }

  const tracks: MidiTrackInfo[] = []
  const tempos: MidiTempo[] = []
  const timeSignatures: MidiTimeSignature[] = []
  const keySignatures: MidiKeySignature[] = []
  const notes: MidiNote[] = []
  const ignoredChannelEvents = new Map<string, number>()
  const ignoredMeta = new Map<number, number>()
  let sysexCount = 0
  let realtimeCount = 0

  for (let index = 0; index < trackCount; index += 1) {
    const trackNumber = index + 1
    const chunk = readChunk(data, view, offset, `track ${trackNumber}`)
    if (chunk.type !== 'MTrk') {
      throw new MidiReadError(`Track ${trackNumber} starts with ${chunk.type}, expected MTrk.`)
    }

    const trackEnd = chunk.nextOffset
    offset = chunk.dataOffset
    let tick = 0
    let runningStatus: number | null = null
    let name: string | null = null
    const openNotes = new Map<string, OpenNote[]>()
    let sawEndOfTrack = false

    while (offset < trackEnd) {
      const delta = readVlq(data, offset, trackEnd)
      offset = delta.offset
      tick += delta.value
      if (offset >= trackEnd) {
        throw new MidiReadError(`Track ${trackNumber} ended at tick ${tick} before its event.`)
      }

      let status = data[offset]!
      if (status < 0x80) {
        if (runningStatus === null) {
          throw new MidiReadError(
            `Track ${trackNumber} uses running status at tick ${tick} before any channel event.`,
          )
        }
        status = runningStatus
      } else {
        offset += 1
        if (status < 0xf0) {
          runningStatus = status
        } else if (status < 0xf8 || status === 0xff) {
          // System common, sysex, and SMF meta events cancel running status.
          // Realtime bytes F8–FE do not.
          runningStatus = null
        }
      }

      if (status === 0xff) {
        if (offset >= trackEnd) {
          throw new MidiReadError(`Track ${trackNumber} meta event at tick ${tick} has no type.`)
        }
        const metaType = data[offset]!
        offset += 1
        const length = readVlq(data, offset, trackEnd)
        offset = length.offset
        const payload = readBytes(data, offset, length.value, trackEnd, `Track ${trackNumber} meta`)
        offset += length.value

        if (metaType === 0x2f) {
          sawEndOfTrack = true
          break
        }
        if (metaType === 0x03) {
          const text = decodeText(payload)
          if (name === null) {
            name = text
          } else {
            warnings.push(
              `Track ${trackNumber} has another name (${JSON.stringify(text)}) after ${JSON.stringify(name)}. The first name was kept.`,
            )
          }
        } else if (metaType === 0x51) {
          if (payload.length !== 3) {
            warnings.push(
              `Track ${trackNumber}: tempo event at tick ${tick} is ${payload.length} bytes, expected 3. It was not used.`,
            )
          } else {
            tempos.push({
              tick,
              microsecondsPerQuarter: payload[0]! * 65536 + payload[1]! * 256 + payload[2]!,
            })
          }
        } else if (metaType === 0x58) {
          if (payload.length < 4) {
            warnings.push(
              `Track ${trackNumber}: time-signature event at tick ${tick} is ${payload.length} bytes, expected 4. It was not used.`,
            )
          } else {
            timeSignatures.push({
              tick,
              numerator: payload[0]!,
              denominator: 2 ** payload[1]!,
            })
          }
        } else if (metaType === 0x59) {
          if (payload.length < 2) {
            warnings.push(
              `Track ${trackNumber}: key-signature event at tick ${tick} is ${payload.length} bytes, expected 2. It was not used.`,
            )
          } else {
            const mode = payload[1] === 0 ? 'major' : payload[1] === 1 ? 'minor' : null
            if (mode === null) {
              warnings.push(
                `Track ${trackNumber}: key-signature mode ${payload[1]} at tick ${tick} is not major or minor.`,
              )
            } else {
              keySignatures.push({
                tick,
                sharps: (payload[0]! << 24) >> 24,
                mode,
              })
            }
          }
        } else if (!isKnownUnusedMeta(metaType)) {
          ignoredMeta.set(metaType, (ignoredMeta.get(metaType) ?? 0) + 1)
        }
        continue
      }

      if (status === 0xf0 || status === 0xf7) {
        const length = readVlq(data, offset, trackEnd)
        offset = length.offset
        readBytes(data, offset, length.value, trackEnd, `Track ${trackNumber} sysex`)
        offset += length.value
        sysexCount += 1
        continue
      }

      if (status >= 0xf8) {
        realtimeCount += 1
        continue
      }

      if (status >= 0xf0) {
        offset = skipSystemCommon(data, offset, trackEnd, status, trackNumber, tick)
        continue
      }

      const kind = status & 0xf0
      const dataBytes = CHANNEL_DATA_BYTES[kind]
      if (dataBytes === undefined) {
        throw new MidiReadError(
          `Track ${trackNumber} has channel status ${hex(status)} at tick ${tick}, which this reader cannot size.`,
        )
      }
      const bytes = readBytes(data, offset, dataBytes, trackEnd, `Track ${trackNumber} channel event`)
      offset += dataBytes
      const channel = (status & 0x0f) + 1
      const data1 = bytes[0]!
      const data2 = dataBytes === 2 ? bytes[1]! : 0

      if (kind === 0x90 && data2 > 0) {
        const stack = openNotes.get(noteKey(channel, data1)) ?? []
        stack.push({ startTick: tick, velocity: data2 })
        openNotes.set(noteKey(channel, data1), stack)
      } else if (kind === 0x80 || (kind === 0x90 && data2 === 0)) {
        const stack = openNotes.get(noteKey(channel, data1))
        const started = stack?.shift()
        if (!started) {
          warnings.push(
            `Track ${trackNumber}: note-off for MIDI ${data1} on channel ${channel} at tick ${tick} has no matching note-on.`,
          )
        } else {
          notes.push({
            midi: data1,
            startTick: started.startTick,
            endTick: tick,
            durationTicks: tick - started.startTick,
            velocity: started.velocity,
            releaseVelocity: kind === 0x80 ? data2 : 0,
            channel,
            track: trackNumber,
          })
        }
      } else {
        const label = CHANNEL_EVENT_LABEL[kind] ?? hex(kind)
        ignoredChannelEvents.set(label, (ignoredChannelEvents.get(label) ?? 0) + 1)
      }
    }

    if (!sawEndOfTrack) {
      warnings.push(`Track ${trackNumber} has no end-of-track event.`)
    } else if (offset < trackEnd) {
      warnings.push(
        `Track ${trackNumber}: ${trackEnd - offset} bytes after end-of-track were ignored.`,
      )
    }
    offset = trackEnd

    for (const [key, stack] of openNotes) {
      if (stack.length === 0) continue
      const [, midiText] = key.split(':')
      warnings.push(
        `Track ${trackNumber}: ${stack.length} note-on event(s) for MIDI ${midiText} were never turned off.`,
      )
    }

    tracks.push({ track: trackNumber, name })
  }

  if (offset !== data.length) {
    warnings.push(`${data.length - offset} bytes after the last track were ignored.`)
  }

  if (sysexCount > 0) {
    warnings.push(
      `${sysexCount} system-exclusive packet(s) were skipped after their bytes were consumed.`,
    )
  }
  if (realtimeCount > 0) {
    warnings.push(`${realtimeCount} system realtime byte(s) were skipped.`)
  }
  if (ignoredChannelEvents.size > 0) {
    const parts = [...ignoredChannelEvents].map(([label, count]) => `${count} ${label}`)
    warnings.push(`Channel events read and not turned into notes: ${parts.join(', ')}.`)
  }
  if (ignoredMeta.size > 0) {
    const parts = [...ignoredMeta].map(([type, count]) => `${count} meta ${hex(type)}`)
    warnings.push(`Unsupported meta events were skipped: ${parts.join(', ')}.`)
  }

  return {
    format,
    trackCount,
    ppq,
    tracks,
    tempos,
    timeSignatures,
    keySignatures,
    notes,
    warnings,
  }
}

function noteKey(channel: number, midi: number): string {
  return `${channel}:${midi}`
}

function isKnownUnusedMeta(type: number): boolean {
  return (
    type === 0x00 ||
    type === 0x01 ||
    type === 0x02 ||
    type === 0x04 ||
    type === 0x05 ||
    type === 0x06 ||
    type === 0x07 ||
    type === 0x20 ||
    type === 0x21 ||
    type === 0x54
  )
}

function skipSystemCommon(
  data: Uint8Array,
  offset: number,
  trackEnd: number,
  status: number,
  trackNumber: number,
  tick: number,
): number {
  const size = status === 0xf2 ? 2 : status === 0xf1 || status === 0xf3 ? 1 : status === 0xf6 ? 0 : -1
  if (size < 0) {
    throw new MidiReadError(
      `Track ${trackNumber} has system status ${hex(status)} at tick ${tick}. Its length is undefined, so reading stopped.`,
    )
  }
  readBytes(data, offset, size, trackEnd, `Track ${trackNumber} system common`)
  return offset + size
}

function readChunk(
  data: Uint8Array,
  view: DataView,
  offset: number,
  label: string,
): { type: string; length: number; dataOffset: number; nextOffset: number } {
  readBytes(data, offset, 8, data.length, label)
  const type = String.fromCharCode(data[offset]!, data[offset + 1]!, data[offset + 2]!, data[offset + 3]!)
  const length = view.getUint32(offset + 4)
  const dataOffset = offset + 8
  const nextOffset = dataOffset + length
  if (nextOffset > data.length) {
    throw new MidiReadError(`${label} chunk ${type} claims ${length} bytes past the end of the file.`)
  }
  return { type, length, dataOffset, nextOffset }
}

function readVlq(
  data: Uint8Array,
  offset: number,
  end: number,
): { value: number; offset: number } {
  let value = 0
  for (let bytes = 0; bytes < 4; bytes += 1) {
    if (offset >= end) {
      throw new MidiReadError('Variable-length quantity ended early.')
    }
    const byte = data[offset]!
    offset += 1
    value = value * 128 + (byte & 0x7f)
    if ((byte & 0x80) === 0) {
      return { value, offset }
    }
  }
  throw new MidiReadError('Variable-length quantity is longer than 4 bytes.')
}

function readBytes(
  data: Uint8Array,
  offset: number,
  size: number,
  end: number,
  label: string,
): Uint8Array {
  if (offset < 0 || size < 0 || offset + size > end) {
    throw new MidiReadError(`${label} runs past the end of its chunk.`)
  }
  return data.subarray(offset, offset + size)
}

function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('iso-8859-1').decode(bytes)
  }
}

function hex(value: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(2, '0')}`
}
