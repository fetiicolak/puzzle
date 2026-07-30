// PeerJS bağlantı yönetimi — çok kişilik oda.
//
// Topoloji yıldız: oda kuran (host) merkezdedir, herkes ona bağlanır ve host
// gelen mesajları diğer katılımcılara yansıtır. Böylece N kişi için N-1 bağlantı
// yeter; tam ağ (herkes herkese) kurmaya gerek kalmaz.

import Peer, { type DataConnection } from 'peerjs'
import type { Msg } from './protocol'

export type RoomStatus =
  | 'idle'
  | 'connecting'
  | 'waiting' // host: kimse yok / yer var
  | 'connected'
  | 'disconnected'
  | 'error'

export interface RoomEvents {
  onStatus: (status: RoomStatus, detail?: string) => void
  /** from: mesajı gönderen katılımcının kimliği */
  onMessage: (msg: Msg, from: string) => void
  onPeerJoined?: (id: string) => void
  onPeerLeft?: (id: string) => void
  /** Oda kodu değişti (kimlik çakışması sonrası) — davet linki tazelenmeli */
  onCodeChanged?: (code: string) => void
}

const PREFIX = 'birlikte-puzzle-'

/** Kanal tamponu bu eşiği aşarsa gönderime ara verilir (bayt) */
const BUFFER_LIMIT = 64 * 1024
/** Oda bulunamadığında kaç kez yeniden denenecek (host henüz kaydolmamış olabilir) */
const JOIN_RETRIES = 4
/** Bağlantı koptuğunda otomatik yeniden bağlanma denemesi sayısı */
const RECONNECT_ATTEMPTS = 3
/** Oda kodu meşgulse aynı kodla kaç kez beklenip denenecek */
const ID_RETRIES = 3

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

interface Outgoing {
  msg: Msg
  /** yalnızca bu katılımcıya; boşsa herkese */
  to?: string
}

export class Room {
  /** Host'ta kimlik çakışması olursa yeni kod üretildiği için sabit değil */
  code: string
  readonly isHost: boolean
  /** Odaya sen dahil kaç kişi girebilir */
  maxPlayers: number

  private peer: Peer | null = null
  /** Host: katılımcı kimliği -> bağlantı. Misafirde tek eleman (host). */
  private conns = new Map<string, DataConnection>()
  private events: RoomEvents
  private closed = false

  /**
   * Misafirin giden bağlantıyı yalnızca bir kez kurmasını sağlar.
   * PeerJS reconnect() sonrası 'open' olayını tekrar yayar; bu koruma olmadan
   * her seferinde yeni bağlantı açılıp sonsuz "bağlandı / koptu" döngüsü oluşuyordu.
   */
  private outgoingStarted = false
  private joinAttempt = 0
  private reconnectAttempt = 0
  private idAttempt = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null

  private queue: Outgoing[] = []
  private draining = false

  private constructor(code: string, isHost: boolean, events: RoomEvents, maxPlayers: number) {
    this.code = code
    this.isHost = isHost
    this.events = events
    this.maxPlayers = maxPlayers
    this.createPeer()
  }

  static host(events: RoomEvents, maxPlayers = 2, code?: string): Room {
    return new Room(code || randomRoomCode(), true, events, maxPlayers)
  }

  static join(code: string, events: RoomEvents): Room {
    return new Room(code, false, events, 99)
  }

  /** Kendi kimliğimiz (imleç/kilit sahipliğinde kullanılır) */
  get selfId(): string {
    return this.peer?.id ?? 'ben'
  }

  /** Host dahil odadaki kişi sayısı */
  get playerCount(): number {
    return this.isHost ? this.conns.size + 1 : (this.conns.size > 0 ? 2 : 1)
  }

  get peerIds(): string[] {
    return [...this.conns.keys()]
  }

  get connected(): boolean {
    for (const c of this.conns.values()) if (c.open) return true
    return false
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
      // Signaling koptu; veri kanalları yaşıyor olabilir. Yalnızca signaling'i
      // geri getir — YENİ bir veri bağlantısı açma.
      if (!this.closed && !peer.destroyed) {
        try {
          peer.reconnect()
        } catch {
          // kalıcı kopmada 'error' zaten tetiklenir
        }
      }
    })

    if (this.isHost) {
      peer.on('open', () => {
        if (!this.closed) this.emitHostStatus()
      })
      peer.on('connection', (conn) => {
        if (this.conns.size + 1 >= this.maxPlayers) {
          // oda dolu: bağlantıyı nazikçe reddet
          conn.on('open', () => {
            conn.send({ t: 'full' } as unknown as Msg)
            setTimeout(() => conn.close(), 250)
          })
          return
        }
        this.attach(conn)
      })
    } else {
      peer.on('open', () => this.startOutgoing())
    }
  }

  private emitHostStatus(): void {
    this.events.onStatus(this.conns.size > 0 ? 'connected' : 'waiting')
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

    // Host: oda kodu sunucuda hâlâ kayıtlı (ör. az önce kapatılan sekme).
    // Kayıt genelde birkaç saniyede düşer; önce AYNI kodla tekrar dene, çünkü
    // davet linki bu koda göre paylaşılmış olabilir. Ancak son çare olarak kod
    // değiştirilirse arayüzün linki tazelemesi için haber ver.
    if (this.isHost && type === 'unavailable-id') {
      this.peer?.destroy()
      if (this.idAttempt < ID_RETRIES) {
        this.idAttempt++
        this.events.onStatus('connecting', `oda kodu bekleniyor ${this.idAttempt}/${ID_RETRIES}`)
        this.retryTimer = setTimeout(() => {
          if (!this.closed) this.createPeer()
        }, 1500 * this.idAttempt)
      } else {
        this.code = randomRoomCode()
        this.idAttempt = 0
        this.events.onCodeChanged?.(this.code)
        this.createPeer()
      }
      return
    }

    // Misafir: host henüz kaydolmamış olabilir — kısa aralıklarla tekrar dene
    if (!this.isHost && type === 'peer-unavailable' && this.joinAttempt < JOIN_RETRIES) {
      this.joinAttempt++
      this.events.onStatus('connecting', `deneme ${this.joinAttempt}/${JOIN_RETRIES}`)
      this.retryTimer = setTimeout(() => {
        if (this.closed) return
        this.outgoingStarted = false
        this.startOutgoing()
      }, 800 * this.joinAttempt)
      return
    }

    this.events.onStatus('error', type)
  }

  private attach(conn: DataConnection): void {
    const id = conn.peer

    conn.on('open', () => {
      if (this.closed) return
      this.conns.set(id, conn)
      this.joinAttempt = 0
      this.reconnectAttempt = 0
      if (this.isHost) {
        this.emitHostStatus()
        this.events.onPeerJoined?.(id)
      } else {
        this.events.onStatus('connected')
      }
      void this.drain()
    })

    conn.on('data', (data) => {
      if (this.closed) return
      const msg = data as Msg & { t: string; from?: string }
      // Host merkezdir: gelen mesajı diğer katılımcılara aynen ilet
      if (this.isHost) {
        const relay = { ...msg, from: id }
        for (const [otherId, other] of this.conns) {
          if (otherId !== id && other.open) this.queue.push({ msg: relay as Msg, to: otherId })
        }
        void this.drain()
      }
      this.events.onMessage(msg as Msg, msg.from ?? id)
    })

    const bittiHandler = () => {
      if (this.closed || this.conns.get(id) !== conn) return
      this.conns.delete(id)
      if (this.isHost) {
        this.events.onPeerLeft?.(id)
        this.emitHostStatus()
      } else {
        this.events.onStatus('disconnected')
        this.scheduleReconnect()
      }
    }
    conn.on('close', bittiHandler)
    conn.on('error', bittiHandler)
  }

  /** Misafir: kopan bağlantıyı elle butona basmadan geri getirmeyi dene */
  private scheduleReconnect(): void {
    if (this.closed || this.reconnectAttempt >= RECONNECT_ATTEMPTS) return
    this.reconnectAttempt++
    this.retryTimer = setTimeout(() => {
      if (this.closed || this.connected) return
      this.events.onStatus('connecting', `yeniden bağlanılıyor ${this.reconnectAttempt}`)
      this.outgoingStarted = false
      if (this.peer && !this.peer.destroyed) this.startOutgoing()
      else this.createPeer()
    }, 1000 * this.reconnectAttempt)
  }

  /** Elle yeniden bağlanma (kullanıcı butonu): sayaçları sıfırlar */
  retry(): void {
    if (this.closed) return
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.joinAttempt = 0
    this.reconnectAttempt = 0
    for (const c of this.conns.values()) c.close()
    this.conns.clear()
    this.peer?.destroy()
    this.createPeer()
  }

  // ---- gönderim (akış kontrollü) ----

  /** Herkese gönder */
  send(msg: Msg): void {
    if (this.conns.size === 0) return
    this.queue.push({ msg })
    void this.drain()
  }

  /** Yalnızca bir katılımcıya gönder (host, yeni gelene tam senkron atarken) */
  sendTo(id: string, msg: Msg): void {
    if (!this.conns.has(id)) return
    this.queue.push({ msg, to: id })
    void this.drain()
  }

  /**
   * Fotoğraf parçaları gibi büyük veriler tek seferde kanala basılırsa WebRTC
   * tamponu taşıp bağlantı kopuyor; bufferedAmount düşene kadar bekleyerek
   * gönderiyoruz.
   */
  private async drain(): Promise<void> {
    if (this.draining) return
    this.draining = true
    try {
      while (this.queue.length > 0) {
        if (this.closed) {
          this.queue.length = 0
          break
        }
        const hedefler = this.queue[0].to
          ? [this.conns.get(this.queue[0].to!)].filter(Boolean as unknown as (c: DataConnection | undefined) => c is DataConnection)
          : [...this.conns.values()]

        // hedeflerden biri bile tıkalıysa bekle
        const tikali = hedefler.some((c) => {
          const dc = (c as unknown as { dataChannel?: RTCDataChannel }).dataChannel
          return c.open && dc && dc.bufferedAmount > BUFFER_LIMIT
        })
        if (tikali) {
          await new Promise((r) => setTimeout(r, 25))
          continue
        }

        const item = this.queue.shift()!
        for (const c of hedefler) {
          if (!c.open) continue
          try {
            c.send(item.msg)
          } catch {
            // kanal kapandıysa yoksay; yeniden bağlanınca tam senkron gelir
          }
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
    for (const c of this.conns.values()) c.close()
    this.conns.clear()
    this.peer?.destroy()
  }
}
