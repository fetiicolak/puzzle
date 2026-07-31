// P2P mesaj protokolü. Tüm mesajlar JSON-serileştirilebilir
// (görsel aktarımı base64 chunk'larla yapılır — PeerJS json modu).

import type { StateSnapshot } from '../engine/state'

export interface MetaMsg {
  t: 'meta'
  seed: number
  pieceCount: number
  title: string
  message: string
  /** base64 chunk sayısı */
  imgChunks: number
  elapsed: number
  /** döndürmeli zorluk açık mı */
  rotation?: boolean
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

/** Birleşmiş bir parçayı grubundan koparma */
export interface SplitMsg {
  t: 'split'
  piece: number
  group: number
  x: number
  y: number
}

/** Oda dolu — host yeni gelene bunu gönderip bağlantıyı kapatır */
export interface FullMsg {
  t: 'full'
}

/** Oda içi sohbet */
export interface ChatMsg {
  t: 'chat'
  /** Gönderenin görünen adı */
  ad: string
  metin: string
  /** Gönderim zamanı (gönderenin saati) */
  ts: number
}

/** Grubu çeyrek tur döndür */
export interface RotateMsg {
  t: 'rot'
  g: number
  /** Kaç çeyrek tur */
  d: number
}

/** Parçaları tepsiye diz (herkeste aynı sonucu verir) */
export interface TrayMsg {
  t: 'tray'
}

export type Msg = (
  | MetaMsg
  | ImgChunkMsg
  | StateMsg
  | GrabMsg
  | ReleaseMsg
  | MoveMsg
  | DropMsg
  | CursorMsg
  | SplitMsg
  | FullMsg
  | ChatMsg
  | RotateMsg
  | TrayMsg
) & {
  /** Host yansıtırken kaynağı işaretler; doğrudan gelen mesajlarda boştur */
  from?: string
}

/**
 * dataURL'i güvenli boyutlu chunk'lara böl.
 * 16 KB, WebRTC data channel'ın tek mesaj sınırının epey altında kalır;
 * daha büyük parçalar bazı tarayıcılarda kanalı kapattırıyordu.
 */
export function chunkDataUrl(dataUrl: string, size = 16_000): string[] {
  const chunks: string[] = []
  for (let i = 0; i < dataUrl.length; i += size) chunks.push(dataUrl.slice(i, i + size))
  return chunks
}
