// PeerJS bağlantı yönetimi — çok kişilik oda.
//
// Topoloji yıldız: oda kuran (host) merkezdedir, herkes ona bağlanır ve host
// gelen mesajları diğer katılımcılara yansıtır. Böylece N kişi için N-1 bağlantı
// yeter; tam ağ (herkes herkese) kurmaya gerek kalmaz.

import Peer, { type DataConnection, type MediaConnection } from 'peerjs'
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
  /** Karşı taraftan görüntü/ses akışı geldi */
  onRemoteStream?: (id: string, stream: MediaStream) => void
  /** Karşı tarafın görüntüsü kesildi */
  onRemoteStreamEnded?: (id: string) => void
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
/**
 * Giden bağlantı bu sürede açılmazsa iptal edilip yeniden denenir.
 * WebRTC el sıkışması bazen hata vermeden asılı kalıyor; bu olmadan
 * kullanıcı sonsuza kadar "Bağlanıyor" ekranında bekliyordu.
 */
const CONNECT_TIMEOUT = 8000

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
  private connectTimer: ReturnType<typeof setTimeout> | null = null

  private queue: Outgoing[] = []
  private draining = false

  /** Görüntülü arama: kendi kamera/mikrofon akışımız */
  private yerelAkis: MediaStream | null = null
  /**
   * Katılımcı başına TEK medya bağlantısı tutulur. İki taraf da birbirini
   * arayınca iki bağlantı açılıyor, aynı ses iki kez çalınıp yankı/cızırtı
   * yapıyordu. bizimAkisGitti, o bağlantıda kendi sesimizin/görüntümüzün
   * karşıya gidip gitmediğini söyler; gitmediyse yayına başlarken yenilenir.
   */
  private mediaBaglantilari = new Map<
    string,
    { cagri: MediaConnection; bizimAkisGitti: boolean }
  >()

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

    // Görüntülü arama: gelen çağrıyı, kendi yayınımız varsa onunla yanıtla
    peer.on('call', (cagri) => {
      if (this.closed) return
      cagri.answer(this.yerelAkis ?? undefined)
      this.mediaBagla(cagri, !!this.yerelAkis)
    })

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
    const conn = this.peer.connect(PREFIX + this.code, { reliable: true })
    this.attach(conn)

    // El sıkışması hata vermeden asılı kalırsa iptal edip tekrar dene
    if (this.connectTimer) clearTimeout(this.connectTimer)
    this.connectTimer = setTimeout(() => {
      if (this.closed || conn.open) return
      try {
        conn.close()
      } catch {
        // zaten kapanmış olabilir
      }
      if (this.joinAttempt < JOIN_RETRIES) {
        this.joinAttempt++
        this.events.onStatus('connecting', `deneme ${this.joinAttempt}/${JOIN_RETRIES}`)
        this.outgoingStarted = false
        this.startOutgoing()
      } else {
        this.events.onStatus('error', 'timeout')
      }
    }, CONNECT_TIMEOUT)
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
      if (this.connectTimer) {
        clearTimeout(this.connectTimer)
        this.connectTimer = null
      }
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
        const relay = { ...msg, from: id } as Msg
        for (const [otherId, other] of this.conns) {
          if (otherId === id || !other.open) continue
          if (this.birlestir(relay, otherId)) continue
          this.queue.push({ msg: relay, to: otherId })
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

  /**
   * Herkese gönder.
   *
   * Konum ve imleç mesajları "en yenisi geçerli" cinsindendir. Kanal tıkalıyken
   * bunları kuyruğa eklemek yerine bekleyenin üstüne yazıyoruz: yoksa sürükleme
   * sırasında onlarca eskimiş konum birikip, tıkanma açılınca hepsi birden
   * gidiyor. Bu hem bant genişliğini boşa harcayıp görüntüyü dondurabiliyor
   * hem de karşı tarafta hareketi sıçratıyordu.
   */
  send(msg: Msg): void {
    if (this.conns.size === 0) return
    if (this.birlestir(msg, undefined)) return
    this.queue.push({ msg })
    void this.drain()
  }

  /** Kuyrukta bekleyen aynı türden mesajın üstüne yaz; yazdıysa true */
  private birlestir(msg: Msg, to: string | undefined): boolean {
    if (msg.t !== 'move' && msg.t !== 'cursor') return false
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i]
      if (q.to !== to || q.msg.t !== msg.t) continue
      // Host yansıtırken kaynağı işaretler; farklı kişilerin imleçleri
      // birbirinin yerine geçmemeli.
      if (q.msg.from !== msg.from) continue
      // move'lar yalnızca aynı grup içinse birbirinin yerini alabilir
      if (msg.t === 'move' && (q.msg as { g: number }).g !== msg.g) continue
      this.queue[i] = { msg, to }
      return true
    }
    return false
  }

  /** Yalnızca bir katılımcıya gönder (host, yeni gelene tam senkron atarken) */
  sendTo(id: string, msg: Msg): void {
    if (!this.conns.has(id)) return
    if (this.birlestir(msg, id)) return
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

  // ---- görüntülü arama ----

  private mediaBagla(cagri: MediaConnection, bizimAkisGitti: boolean): void {
    const id = cagri.peer
    // aynı kişiyle ikinci bir bağlantı kalmasın
    const onceki = this.mediaBaglantilari.get(id)
    if (onceki && onceki.cagri !== cagri) onceki.cagri.close()
    this.mediaBaglantilari.set(id, { cagri, bizimAkisGitti })

    cagri.on('stream', (akis) => {
      if (this.closed) return
      // Bağlantı kurulduğunda kodlayıcıyı sınırla (aşağıya bak)
      void this.kodlayiciyiSinirla(cagri)
      this.events.onRemoteStream?.(id, akis)
    })
    const bitti = () => {
      // Bu çağrı yerine yenisi geçtiyse "görüntü kesildi" deme; eskiden bu
      // kontrol yoktu ve kapanan eski bağlantı, yeni gelen görüntüyü
      // arayüzden siliyordu.
      if (this.mediaBaglantilari.get(id)?.cagri !== cagri) return
      this.mediaBaglantilari.delete(id)
      if (!this.closed) this.events.onRemoteStreamEnded?.(id)
    }
    cagri.on('close', bitti)
    cagri.on('error', bitti)
  }

  /**
   * Giden görüntüye tavan koy.
   *
   * Varsayılanda tarayıcı bant genişliğinin izin verdiği kadarını almaya
   * çalışıyor; oyun zaten tuvali sürekli çizdiği için CPU sıkışınca kodlayıcı
   * geride kalıyor ve görüntü saniyelerce donuyordu. Küçük bir pencerede
   * gösterildiği için yüksek bit hızına gerek yok.
   *
   * degradationPreference = maintain-framerate: sıkışınca çözünürlükten ver,
   * akıcılığı koru. Donma yerine biraz bulanıklık tercih ediliyor.
   */
  private async kodlayiciyiSinirla(cagri: MediaConnection): Promise<void> {
    const pc = (cagri as unknown as { peerConnection?: RTCPeerConnection }).peerConnection
    if (!pc) return
    for (const gonderici of pc.getSenders()) {
      if (gonderici.track?.kind !== 'video') continue
      try {
        const par = gonderici.getParameters()
        if (!par.encodings || par.encodings.length === 0) par.encodings = [{}]
        par.encodings[0].maxBitrate = 400_000
        par.encodings[0].maxFramerate = 20
        ;(par as { degradationPreference?: string }).degradationPreference =
          'maintain-framerate'
        await gonderici.setParameters(par)
      } catch {
        // bazı tarayıcılar setParameters'ı kısıtlıyor; varsayılanla devam
      }
    }
  }

  /**
   * Kamerayı/mikrofonu aç ve odadaki herkesi ara. Karşı taraf bizi zaten
   * aradıysa ve akışımız o bağlantıdan gitmişse tekrar aramıyoruz.
   */
  async yayiniBaslat(akis: MediaStream): Promise<void> {
    this.yerelAkis = akis
    if (!this.peer) return
    for (const id of this.conns.keys()) {
      const mevcut = this.mediaBaglantilari.get(id)
      if (mevcut?.bizimAkisGitti) continue
      try {
        this.mediaBagla(this.peer.call(id, akis), true)
      } catch {
        // bu katılımcı arama kabul etmiyorsa diğerlerine devam
      }
    }
  }

  /** Kamerayı kapat, açık çağrıları sonlandır */
  yayiniDurdur(): void {
    const hepsi = [...this.mediaBaglantilari.values()]
    this.mediaBaglantilari.clear()
    for (const m of hepsi) m.cagri.close()
    this.yerelAkis = null
  }

  get yayindaMi(): boolean {
    return !!this.yerelAkis
  }

  close(): void {
    this.closed = true
    this.yayiniDurdur()
    if (this.retryTimer) clearTimeout(this.retryTimer)
    if (this.connectTimer) clearTimeout(this.connectTimer)
    this.queue.length = 0
    for (const c of this.conns.values()) c.close()
    this.conns.clear()
    this.peer?.destroy()
  }
}
