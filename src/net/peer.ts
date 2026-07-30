// PeerJS bağlantı yönetimi: oda kurma (host) ve odaya katılma (guest).
// PeerJS'in ücretsiz cloud signaling sunucusu kullanılır; oyun verisi
// tarayıcıdan tarayıcıya doğrudan (WebRTC data channel) akar.

import Peer, { type DataConnection } from 'peerjs'
import type { Msg } from './protocol'

export type RoomStatus =
  | 'idle'
  | 'connecting'
  | 'waiting' // host: partner bekleniyor
  | 'connected'
  | 'disconnected'
  | 'error'

export interface RoomEvents {
  onStatus: (status: RoomStatus, detail?: string) => void
  onMessage: (msg: Msg) => void
}

const PREFIX = 'birlikte-puzzle-'

export function randomRoomCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  let code = ''
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  for (const b of bytes) code += alphabet[b % alphabet.length]
  return code
}

export class Room {
  readonly code: string
  readonly isHost: boolean
  private peer: Peer
  private conn: DataConnection | null = null
  private events: RoomEvents
  private closed = false

  private constructor(code: string, isHost: boolean, events: RoomEvents) {
    this.code = code
    this.isHost = isHost
    this.events = events
    this.peer = isHost ? new Peer(PREFIX + code) : new Peer()
    this.events.onStatus('connecting')

    this.peer.on('error', (err) => {
      // guest tarafında oda bulunamadıysa veya host ID çakıştıysa
      if (!this.closed) this.events.onStatus('error', String(err.type ?? err))
    })
    this.peer.on('disconnected', () => {
      // signaling koptu — mevcut data channel yaşayabilir; yeniden bağlanmayı dene
      if (!this.closed) this.peer.reconnect()
    })

    if (isHost) {
      this.peer.on('open', () => {
        if (!this.closed) this.events.onStatus('waiting')
      })
      this.peer.on('connection', (conn) => {
        // tek partnerlik oda: yeni bağlantı eskisinin yerine geçer
        this.attach(conn)
      })
    } else {
      this.peer.on('open', () => {
        if (this.closed) return
        this.attach(this.peer.connect(PREFIX + code, { reliable: true }))
      })
    }
  }

  static host(events: RoomEvents, code = randomRoomCode()): Room {
    return new Room(code, true, events)
  }

  static join(code: string, events: RoomEvents): Room {
    return new Room(code, false, events)
  }

  private attach(conn: DataConnection): void {
    this.conn?.close()
    this.conn = conn
    conn.on('open', () => {
      if (!this.closed) this.events.onStatus('connected')
    })
    conn.on('data', (data) => {
      if (!this.closed) this.events.onMessage(data as Msg)
    })
    conn.on('close', () => {
      if (!this.closed && this.conn === conn) {
        this.conn = null
        this.events.onStatus(this.isHost ? 'waiting' : 'disconnected')
      }
    })
    conn.on('error', () => {
      if (!this.closed && this.conn === conn) this.events.onStatus('disconnected')
    })
  }

  get connected(): boolean {
    return this.conn?.open === true
  }

  send(msg: Msg): void {
    if (this.conn?.open) this.conn.send(msg)
  }

  close(): void {
    this.closed = true
    this.conn?.close()
    this.peer.destroy()
  }
}
