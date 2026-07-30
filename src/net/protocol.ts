// P2P mesaj protokolü. Tüm mesajlar JSON-serileştirilebilir
// (görsel aktarımı base64 chunk'larla yapılır — PeerJS json modu).

import type { StateSnapshot } from '../engine/state'

export interface MetaMsg {
  t: 'meta'
  seed: number
  pieceCount: number
  message: string
  /** base64 chunk sayısı */
  imgChunks: number
  elapsed: number
}

export interface ImgChunkMsg {
  t: 'img'
  i: number
  data: string
}

export interface StateMsg {
  t: 'state'
  snap: StateSnapshot
}

export interface GrabMsg {
  t: 'grab'
  g: number
}

export interface ReleaseMsg {
  t: 'release'
  g: number
}

export interface MoveMsg {
  t: 'move'
  g: number
  anchor: number
  x: number
  y: number
}

export interface DropMsg {
  t: 'drop'
  g: number
  anchor: number
  x: number
  y: number
}

export interface CursorMsg {
  t: 'cursor'
  x: number
  y: number
}

export type Msg =
  | MetaMsg
  | ImgChunkMsg
  | StateMsg
  | GrabMsg
  | ReleaseMsg
  | MoveMsg
  | DropMsg
  | CursorMsg

/** dataURL'i güvenli boyutlu chunk'lara böl */
export function chunkDataUrl(dataUrl: string, size = 48_000): string[] {
  const chunks: string[] = []
  for (let i = 0; i < dataUrl.length; i += size) chunks.push(dataUrl.slice(i, i + size))
  return chunks
}
