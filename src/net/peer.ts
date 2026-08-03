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

/**
 * Bağlantı sunucuları.
 *
 * Yalnızca STUN varken iki taraf da birbirine doğrudan ulaşmak zorundaydı ve
 * bu birçok ağda çalışmıyor: tarayıcı yerel adresi mDNS ile gizliyor (aynı
 * evdeki iki cihaz birbirini çözemiyor), geriye kalan tek yol genel IP
 * üzerinden dönmek oluyor ve çoğu router bunu (hairpin) desteklemiyor. Mobil
 * operatörlerin ortak NAT'ı da aynı sonucu veriyor. Sonuç: "Bağlanamadık,
 * bazı ağlar bu tür bağlantıyı engelliyor".
 *
 * TURN, doğrudan yol bulunamadığında trafiği aktaran yedek yoldur. Aşağıdaki
 * açık sunucular ücretsizdir; trafik uçtan uca şifreli kalır ama aktarımı
 * üçüncü bir taraf yapar. Doğrudan bağlantı kurulabiliyorsa TURN kullanılmaz.
 */
/**
 * TURN bilgileri .env'den okunur; böylece kendi sunucun varsa kodu
 * değiştirmeden bağlanır (VITE_TURN_URLS virgülle ayrılır).
 * Tanımlı değilse açık kullanıma sunulmuş sunucular denenir.
 */
function turnSunuculari(): RTCIceServer[] {
  const urls = (import.meta.env.VITE_TURN_URLS as string | undefined)?.trim()
  const kullanici = (import.meta.env.VITE_TURN_USERNAME as string | undefined)?.trim()
  const parola = (import.meta.env.VITE_TURN_CREDENTIAL as string | undefined)?.trim()
  if (urls && kullanici && parola) {
    return [{ urls: urls.split(',').map((u) => u.trim()).filter(Boolean), username: kullanici, credential: parola }]
  }
  return [
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ]
}

const PEER_OPTIONS = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      ...turnSunuculari(),
    ],
    iceCandidatePoolSize: 4,
  },
}

/**
 * Bağlantı kurulamadığında sebebi ayırt etmek için: aktarma (relay) adayı
 * bulunabildi mi. Bulunamadıysa TURN sunucusuna erişilemiyor demektir ve
 * doğrudan yol kapalıysa bağlantı hiç kurulamaz.
 */
let relayAdayiGorundu = false

export function relayKullanilabilir(): boolean {
  return relayAdayiGorundu
}

export interface BaglantiTesti {
  /** Kendi cihazındaki adres bulundu mu */
  yerel: boolean
  /** Dışarıdan görünen adres bulundu mu (STUN çalışıyor) */
  disAdres: boolean
  /** Aktarma sunucusuna ulaşıldı mı (TURN çalışıyor) */
  aktarma: boolean
  /** Kullanıcıya gösterilecek özet */
  ozet: string
  /** Varsa aday toplama hataları */
  hatalar: string[]
}

/**
 * Bağlantı testi.
 *
 * Gerçek bir oda kurmadan, bu cihazın hangi yollarla bağlanabildiğini ölçer.
 * "Aktarma" satırı TURN ayarının çalışıp çalışmadığını gösterir — doğrudan
 * bağlantıya izin vermeyen ağlarda tek çalışan yol odur.
 */
export async function baglantiTesti(sureMs = 8000): Promise<BaglantiTesti> {
  const pc = new RTCPeerConnection(PEER_OPTIONS.config)
  const turler = new Set<string>()
  const hatalar: string[] = []
  pc.onicecandidate = (e) => {
    const t = e.candidate?.candidate.match(/typ (\w+)/)?.[1]
    if (t) turler.add(t)
  }
  pc.addEventListener('icecandidateerror', (e) => {
    const h = e as RTCPeerConnectionIceErrorEvent
    const metin = `${h.errorCode}: ${h.errorText}`
    if (!hatalar.includes(metin)) hatalar.push(metin)
  })
  try {
    pc.createDataChannel('test')
    await pc.setLocalDescription(await pc.createOffer())
    const bitis = Date.now() + sureMs
    while (pc.iceGatheringState !== 'complete' && Date.now() < bitis) {
      await new Promise((r) => setTimeout(r, 250))
    }
  } catch {
    // aşağıdaki özet zaten durumu anlatır
  } finally {
    pc.close()
  }

  const yerel = turler.has('host')
  const disAdres = turler.has('srflx')
  const aktarma = turler.has('relay')
  const ozet = aktarma
    ? 'Aktarma sunucusu çalışıyor. Doğrudan bağlanılamayan ağlarda da bağlanabilirsiniz.'
    : disAdres
      ? 'Aktarma sunucusuna ulaşılamadı. Doğrudan bağlantı kurulamayan ağlarda bağlanamayabilirsiniz.'
      : yerel
        ? 'Dış dünyaya çıkış bulunamadı. Ağınız WebRTC trafiğini engelliyor olabilir.'
        : 'Hiçbir bağlantı yolu bulunamadı.'
  return { yerel, disAdres, aktarma, ozet, hatalar: hatalar.slice(0, 3) }
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
  /** Host: bağlantı kimliği -> kişi kimliği (hesap ya da misafir cihazı) */
  private kimlikler = new Map<string, string>()
  /**
   * Host: odadan çıkarılan kişilerin kimlikleri.
   *
   * Hesabı olmayan misafirler sunucudaki katılımcı listesinde yer almadığı
   * için sunucu tarafında engellenemiyorlar; host onları burada tutup gelen
   * bağlantıyı kapatıyor. Oda kapanınca liste de gider — kalıcı bir yasak
   * değil, o oturum için geçerli.
   */
  private engellenenler = new Set<string>()
  private nabizTimer: ReturnType<typeof setInterval> | null = null

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
      // Kopan bağlantılar her zaman 'close' yaymıyor; düzenli tarama olmadan
      // hayalet kayıtlar odayı dolu gösteriyor.
      if (!this.nabizTimer) {
        this.nabizTimer = setInterval(() => {
          if (this.closed) return
          const once = this.conns.size
          this.oluleriTemizle()
          if (this.conns.size !== once) this.emitHostStatus()
        }, 5000)
      }
      peer.on('connection', (conn) => {
        // Önce ölü bağlantıları at. Karşı taraf sekmeyi kapattığında ya da
        // ağı düştüğünde 'close' olayı her zaman gelmiyor; kalan hayalet
        // kayıt odayı dolu gösterip aynı kişinin geri girmesini engelliyordu.
        this.oluleriTemizle()
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

  /** Veri kanalı kapanmış ama listede kalmış bağlantıları düşür */
  private oluleriTemizle(): void {
    for (const [id, c] of [...this.conns]) {
      const dc = (c as unknown as { dataChannel?: RTCDataChannel }).dataChannel
      const oldu = !c.open || (dc && (dc.readyState === 'closed' || dc.readyState === 'closing'))
      if (!oldu) continue
      this.conns.delete(id)
      this.kimlikler.delete(id)
      try {
        c.close()
      } catch {
        // zaten kapanmış olabilir
      }
      this.events.onPeerLeft?.(id)
    }
  }

  /**
   * Aynı kişi yeniden katıldığında eski bağlantısını kapat.
   *
   * Kişi kimliği hesabı varsa hesap kimliği, misafirse cihaz başına üretilen
   * kalıcı bir değerdir (bkz. GameScreen -> tanit). Bu olmadan aynı kullanıcı
   * odadan çıkıp geri geldiğinde eski kaydı yer kaplamaya devam ediyordu.
   */
  private kimlikKaydet(peerId: string, kimlik: string): void {
    if (!kimlik) return
    for (const [digerId, digerKimlik] of [...this.kimlikler]) {
      if (digerId === peerId || digerKimlik !== kimlik) continue
      const eski = this.conns.get(digerId)
      this.kimlikler.delete(digerId)
      this.conns.delete(digerId)
      try {
        eski?.close()
      } catch {
        // zaten kapanmış olabilir
      }
      this.events.onPeerLeft?.(digerId)
    }
    this.kimlikler.set(peerId, kimlik)
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

    // Aktarma adayı bulunabiliyor mu — hata mesajını doğru yazabilmek için
    const pc = (conn as unknown as { peerConnection?: RTCPeerConnection }).peerConnection
    pc?.addEventListener('icecandidate', (e) => {
      if (e.candidate?.candidate.includes('typ relay')) relayAdayiGorundu = true
    })

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
      // Kimlik tanıtımı: aynı kişinin eski bağlantısını kapat
      if (this.isHost && msg.t === 'hello' && !msg.from) {
        const h = msg as { kimlik?: string; uid?: string | null }
        const kimlik = h.kimlik || h.uid || ''
        // Çıkarılan biri aynı linkle geri geldiyse içeri alma
        if (kimlik && this.engellenenler.has(kimlik)) {
          this.conns.delete(id)
          this.kimlikler.delete(id)
          try {
            conn.send({ t: 'kick', uid: kimlik } as Msg)
            setTimeout(() => conn.close(), 250)
          } catch {
            conn.close()
          }
          this.emitHostStatus()
          return
        }
        this.kimlikKaydet(id, kimlik)
      }
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
      this.kimlikler.delete(id)
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

  /**
   * Kişiyi odadan çıkar (host).
   *
   * Hesabı olan biri için asıl engel sunucudadır; bu yalnızca bağlantıyı
   * hemen keser. Hesapsız misafir için tek yol budur.
   */
  cikar(kimlik: string): void {
    if (!this.isHost || !kimlik) return
    this.engellenenler.add(kimlik)
    for (const [id, k] of [...this.kimlikler]) {
      if (k !== kimlik) continue
      const conn = this.conns.get(id)
      try {
        conn?.send({ t: 'kick', uid: kimlik } as Msg)
      } catch {
        // kanal kapanmış olabilir
      }
      setTimeout(() => {
        this.kimlikler.delete(id)
        this.conns.delete(id)
        try {
          conn?.close()
        } catch {
          // zaten kapanmış olabilir
        }
        this.events.onPeerLeft?.(id)
        this.emitHostStatus()
      }, 250)
    }
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
    if (this.nabizTimer) clearInterval(this.nabizTimer)
    this.kimlikler.clear()
    this.queue.length = 0
    for (const c of this.conns.values()) c.close()
    this.conns.clear()
    this.peer?.destroy()
  }
}
