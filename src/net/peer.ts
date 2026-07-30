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

/** Kanal tamponu bu eşiği aşarsa gönderime ara verilir (bayt) */
const BUFFER_LIMIT = 64 * 1024
/** Oda bulunamadığında kaç kez yeniden denenecek (host henüz kaydolmamış olabilir) */
const JOIN_RETRIES = 4
/** Bağlantı koptuğunda otomatik yeniden bağlanma denemesi sayısı */
const RECONNECT_ATTEMPTS = 3

const PEER_OPTIONS = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ],
  },
}

export function randomRoomCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  let code = ''
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  for (const b of bytes) code += alphabet[b % alphabet.length]
  return code
}

export class Room {
  /** Host'ta ID çakışması olursa yeni kod üretildiği için sabit değil */
  code: string
  readonly isHost: boolean
  private peer: Peer | null = null
  private conn: DataConnection | null = null
  private events: RoomEvents
  private closed = false

  /**
   * Misafirin giden bağlantıyı yalnızca bir kez kurmasını sağlar.
   * PeerJS, reconnect() sonrası 'open' olayını tekrar yayar; bu koruma olmadan
   * her seferinde yeni bir bağlantı açılıyor, host eskisini kapattığı için
   * sonsuz "bağlandı / koptu" döngüsü oluşuyordu.
   */
  private outgoingStarted = false
  private joinAttempt = 0
  private reconnectAttempt = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null

  private queue: Msg[] = []
  private draining = false

  private constructor(code: string, isHost: boolean, events: RoomEvents) {
    this.code = code
    this.isHost = isHost
    this.events = events
    this.createPeer()
  }

  static host(events: RoomEvents, code = randomRoomCode()): Room {
    return new Room(code, true, events)
  }

  static join(code: string, events: RoomEvents): Room {
    return new Room(code, false, events)
  }

  // ---- peer yaşam döngüsü ----

  private createPeer(): void {
    if (this.closed) return
    this.outgoingStarted = false
    this.events.onStatus('connecting')
    const peer = this.isHost
      ? new Peer(PREFIX + this.code, PEER_OPTIONS)
      : new Peer(PEER_OPTIONS)
    this.peer = peer

    peer.on('error', (err) => this.handlePeerError(err))

    peer.on('disconnected', () => {
      // Signaling sunucusuyla bağlantı koptu. Veri kanalı yaşıyor olabilir;
      // sadece signaling'i geri getir — yeni bir veri bağlantısı AÇMA.
      if (!this.closed && !peer.destroyed) {
        try {
          peer.reconnect()
        } catch {
          // yoksayılır; kalıcı kopmada 'error' zaten tetiklenir
        }
      }
    })

    if (this.isHost) {
      peer.on('open', () => {
        if (!this.closed) this.events.onStatus(this.conn?.open ? 'connected' : 'waiting')
      })
      peer.on('connection', (conn) => this.attach(conn))
    } else {
      peer.on('open', () => this.startOutgoing())
    }
  }

  /** Misafir: host'a giden bağlantıyı kur (oturum başına yalnızca bir kez) */
  private startOutgoing(): void {
    if (this.closed || this.outgoingStarted || !this.peer) return
    this.outgoingStarted = true
    this.attach(this.peer.connect(PREFIX + this.code, { reliable: true }))
  }

  private handlePeerError(err: { type?: string }): void {
    if (this.closed) return
    const type = String(err.type ?? err)

    // Host: bu oda kodu sunucuda hâlâ kayıtlı (ör. önceki sekme). Yeni kod üret.
    if (this.isHost && type === 'unavailable-id') {
      this.code = randomRoomCode()
      this.peer?.destroy()
      this.createPeer()
      return
    }

    // Misafir: host henüz kaydolmamış olabilir — kısa aralıklarla tekrar dene
    if (!this.isHost && type === 'peer-unavailable' && this.joinAttempt < JOIN_RETRIES) {
      this.joinAttempt++
      const delay = 800 * this.joinAttempt
      this.events.onStatus('connecting', `deneme ${this.joinAttempt}/${JOIN_RETRIES}`)
      this.retryTimer = setTimeout(() => {
        if (this.closed) return
        this.outgoingStarted = false
        this.startOutgoing()
      }, delay)
      return
    }

    this.events.onStatus('error', type)
  }

  private attach(conn: DataConnection): void {
    // Yalnızca gerçekten yeni bir bağlantı geldiğinde eskisini bırak.
    if (this.conn && this.conn !== conn) this.conn.close()
    this.conn = conn

    conn.on('open', () => {
      if (this.closed) return
      this.joinAttempt = 0
      this.reconnectAttempt = 0
      this.events.onStatus('connected')
      void this.drain()
    })
    conn.on('data', (data) => {
      if (!this.closed) this.events.onMessage(data as Msg)
    })
    conn.on('close', () => {
      if (this.closed || this.conn !== conn) return
      this.conn = null
      this.queue.length = 0
      if (this.isHost) {
        this.events.onStatus('waiting')
      } else {
        this.events.onStatus('disconnected')
        this.scheduleReconnect()
      }
    })
    conn.on('error', () => {
      if (this.closed || this.conn !== conn) return
      this.conn = null
      if (!this.isHost) {
        this.events.onStatus('disconnected')
        this.scheduleReconnect()
      }
    })
  }

  /** Misafir: kopan bağlantıyı elle butona basmadan geri getirmeyi dene */
  private scheduleReconnect(): void {
    if (this.closed || this.reconnectAttempt >= RECONNECT_ATTEMPTS) return
    this.reconnectAttempt++
    const delay = 1000 * this.reconnectAttempt
    this.retryTimer = setTimeout(() => {
      if (this.closed || this.conn) return
      this.events.onStatus('connecting', `yeniden bağlanılıyor ${this.reconnectAttempt}`)
      this.outgoingStarted = false
      if (this.peer && !this.peer.destroyed) this.startOutgoing()
      else this.createPeer()
    }, delay)
  }

  /** Elle yeniden bağlanma (kullanıcı butonu): sayaçları sıfırlar */
  retry(): void {
    if (this.closed) return
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.joinAttempt = 0
    this.reconnectAttempt = 0
    this.conn?.close()
    this.conn = null
    this.peer?.destroy()
    this.createPeer()
  }

  get connected(): boolean {
    return this.conn?.open === true
  }

  // ---- gönderim (akış kontrollü) ----

  /**
   * Mesajı kuyruğa alır. Fotoğraf parçaları gibi büyük veriler tek seferde
   * kanala basılırsa WebRTC tamponu taşıp bağlantı kopuyor; bu yüzden
   * bufferedAmount düşene kadar bekleyerek gönderiyoruz.
   */
  send(msg: Msg): void {
    if (!this.conn?.open) return
    this.queue.push(msg)
    void this.drain()
  }

  private async drain(): Promise<void> {
    if (this.draining) return
    this.draining = true
    try {
      while (this.queue.length > 0) {
        const conn = this.conn
        if (this.closed || !conn?.open) {
          this.queue.length = 0
          break
        }
        const dc = (conn as unknown as { dataChannel?: RTCDataChannel }).dataChannel
        if (dc && dc.bufferedAmount > BUFFER_LIMIT) {
          await new Promise((r) => setTimeout(r, 25))
          continue
        }
        const msg = this.queue.shift()!
        try {
          conn.send(msg)
        } catch {
          // kanal kapanmışsa kuyruğu boşalt; yeniden bağlanınca tam senkron gelir
          this.queue.length = 0
          break
        }
      }
    } finally {
      this.draining = false
    }
  }

  close(): void {
    this.closed = true
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.queue.length = 0
    this.conn?.close()
    this.peer?.destroy()
  }
}
