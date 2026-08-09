import { useEffect, useMemo, useRef, useState } from 'react'
import { PuzzleBoard } from '../engine/board'
import { generateCut, renderPieceBitmaps } from '../engine/cutter'
import {
  arrangeTray,
  canSplit,
  shufflePieces,
  createGameState,
  dropGroup,
  nextFreeGroupId,
  progress,
  restore,
  rotateGroup,
  setGroupPos,
  snapshot,
  splitPiece,
  type GameState,
  type StateSnapshot,
} from '../engine/state'
import Certificate from './Certificate'
import ConfirmDialog from './ConfirmDialog'
import FriendsPanel from './FriendsPanel'
import Linkli from './Linkli'
import RoomPanel, { type BagliKisi } from './RoomPanel'
import SesAyarlari from './SesAyarlari'
import {
  birlesme,
  kutlama,
  muzigiBaslat,
  muzigiDurdur,
  muzikAcikMi,
  sesAcikMi,
  sesiAyarla,
  sesiKapat,
  tik,
} from '../audio'
import Tutorial from './Tutorial'
import VideoPanel from './VideoPanel'
import { useSurukle } from './surukle'
import {
  baglantiTesti,
  relayKullanilabilir,
  Room,
  type BaglantiTesti,
  type RoomStatus,
} from '../net/peer'
import { cevir, suankiDil, useDil } from '../dil'
import { chunkDataUrl, type Msg } from '../net/protocol'
import {
  loadImage,
  misafirAdi,
  misafirKimligi,
  savePuzzle,
  tanitimGorulduMu,
  tanitimiIsaretle,
  urlToDataUrl,
} from '../storage'
import { useAuth } from '../supabase/auth'
import {
  createRemotePuzzle,
  joinRemotePuzzle,
  kilitliMi,
  OdaHatasi,
  puzzleImageUrl,
  saveRemoteProgress,
  updateRemoteRoomCode,
} from '../supabase/puzzles'

export interface GameConfig {
  puzzleId: string
  /**
   * local  — cihazdaki puzzle (fotoğraf elde)
   * guest  — davet linkiyle odaya katılan
   * remote — sunucudaki ortak tablodan devam (fotoğraf depodan iner)
   */
  mode: 'local' | 'guest' | 'remote'
  /** guest/remote: oda kodu */
  roomCode?: string
  /** remote: depodaki fotoğrafın yolu */
  imagePath?: string
  /** local: oyun açılır açılmaz oda kur ve daveti göster */
  autoHost?: boolean
  title?: string
  imageDataUrl?: string
  seed?: number
  pieceCount?: number
  message?: string
  /** Sen dahil odaya girebilecek toplam kişi sayısı */
  maxPlayers?: number
  elapsed?: number
  snap?: StateSnapshot | null
  /** Sunucudaki kayıt kimliği (ortak geçmişten devam ederken) */
  remoteId?: string | null
  /** Döndürmeli zorluk */
  rotation?: boolean
  /** Özel gün: bu tarihe kadar kilitli (ISO) */
  unlockAt?: string | null
  /** Hazır eser seçildiyse ressamı */
  artist?: string
  /**
   * Davet ekranında "misafir olarak devam et" seçildi.
   *
   * Cihazda açık bir oturum olsa bile hesap kullanılmaz: kullanıcı bilerek
   * misafir olmayı seçti. Bu bayrak olmadan, tabletinde hesabı açık olan
   * biri misafir dese de hesabıyla girmiş sayılıyordu.
   */
  misafirZorla?: boolean
}

export interface ChatSatiri {
  ad: string
  metin: string
  ts: number
  benMi: boolean
}

interface Props {
  config: GameConfig
  onExit: () => void
}

interface EngineRefs {
  board: PuzzleBoard | null
  game: GameState | null
  room: Room | null
  imageDataUrl: string
  seed: number
  pieceCount: number
  imgChunks: string[]
  imgTotal: number
  pendingSnap: StateSnapshot | null
  /** Son fotoğraf parçasının alındığı an — takılan aktarımı tespit etmek için */
  lastChunkAt: number
  /** Sunucudaki puzzle kaydının kimliği (giriş yapılmışsa) */
  remoteId: string | null
  /** Döndürmeli zorluk (misafirde meta ile gelir) */
  rotation: boolean
  lastRemoteSave: number
  lastMoveSent: number
  lastCursorSent: number
  elapsed: number
  completed: boolean
  destroyed: boolean
}

// Bileşen dışında ve olay işleyicilerinde kullanılan çeviri kısayolu;
// dil <html lang>'ten okunuyor (bkz. dil.tsx)
const c = (metin: string, degerler?: Record<string, string | number>) =>
  cevir(suankiDil(), metin, degerler)

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

const STATUS_TEXT: Record<RoomStatus, string> = {
  idle: '',
  connecting: 'Bağlanıyor',
  waiting: 'Bekleniyor',
  connected: 'Bağlı',
  disconnected: 'Koptu',
  error: 'Bağlanamadı',
}

const STATUS_COLOR: Record<RoomStatus, string> = {
  idle: 'transparent',
  connecting: '#f2c94c',
  waiting: '#f2c94c',
  connected: 'var(--ok)',
  disconnected: '#eb5757',
  error: '#eb5757',
}

export default function GameScreen({ config, onExit }: Props) {
  const auth = useAuth()
  const { ceviri } = useDil()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState<'loading' | 'playing' | 'done'>('loading')
  const [loadText, setLoadText] = useState(
    config.mode === 'guest' ? c('Odaya bağlanılıyor') : c('Parçalar kesiliyor'),
  )
  const [error, setError] = useState<string | null>(null)
  const [roomStatus, setRoomStatus] = useState<RoomStatus>('idle')
  const [statusDetail, setStatusDetail] = useState('')
  const [playerCount, setPlayerCount] = useState(1)
  const [roomCode, setRoomCode] = useState(config.roomCode ?? '')
  /**
   * Üst çubuğun gerçek yüksekliği --ust-cubuk değişkenine yazılıyor.
   *
   * Yüzen paneller "üst çubuğun altına" konumlanıyor ama çubuğun boyu sabit
   * değil: düğmeler dar ekranda ikinci satıra sarıyor. Sabit 64px varsayınca
   * sol üstteki panel sarkan düğmelerin üstüne biniyordu.
   */
  const oyunKokRef = useRef<HTMLDivElement>(null)
  const ustCubukRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const cubuk = ustCubukRef.current
    const kok = oyunKokRef.current
    if (!cubuk || !kok) return
    const olc = () =>
      kok.style.setProperty('--ust-cubuk', `${Math.round(cubuk.getBoundingClientRect().height)}px`)
    olc()
    const ro = new ResizeObserver(olc)
    ro.observe(cubuk)
    return () => ro.disconnect()
  }, [])

  /** Orijinal görseli köşede göster */
  const [peek, setPeek] = useState(false)
  const [edgeOnly, setEdgeOnly] = useState(false)
  const [araclarAcik, setAraclarAcik] = useState(false)
  const [yerelAkis, setYerelAkis] = useState<MediaStream | null>(null)
  /**
   * Kamera/mikrofon akışının ref kopyası.
   *
   * Temizlik effect'i boş bağımlılıkla kurulduğu için state'in ilk (null)
   * değerini görüyor; odadan çıkınca kamera açık kalıyordu. Ref her zaman
   * güncel akışı tutar.
   */
  const yerelAkisRef = useRef<MediaStream | null>(null)
  yerelAkisRef.current = yerelAkis
  const [uzakAkislar, setUzakAkislar] = useState<Map<string, MediaStream>>(new Map())
  const [kameraAcik, setKameraAcik] = useState(true)
  const [sesAcik, setSesAcik] = useState(true)
  /** Görüşme yalnızca sesli mi başlatıldı */
  const [sadeceSes, setSadeceSes] = useState(false)
  const [gorusmeBekliyor, setGorusmeBekliyor] = useState(false)
  const [odaPanel, setOdaPanel] = useState(false)
  /** Arkadaş listesi: kim sitede, mesaj ve odaya davet */
  const [arkadasPanel, setArkadasPanel] = useState(false)
  /** Nasıl oynanır turu; ilk oyunda kendiliğinden açılır */
  const [tanitim, setTanitim] = useState(false)
  /** Bilgi/hata kutusu — tarayıcının alert'i yerine */
  const [bilgi, setBilgi] = useState<{ baslik: string; mesaj: string } | null>(null)
  /** Bağlantı testi sonucu; null iken test hiç çalıştırılmamış */
  const [test, setTest] = useState<BaglantiTesti | null>(null)
  const [testSuruyor, setTestSuruyor] = useState(false)
  /** Ses efektleri ve arka plan müziği */
  const [sesler, setSesler] = useState(sesAcikMi)
  const [muzik, setMuzik] = useState(false)
  const [sesPanel, setSesPanel] = useState(false)

  // Aynı iki eylem hem üst çubuktan hem ses ayarları penceresinden çağrılıyor
  const sesleriDegistir = () => {
    const yeni = !sesler
    sesiAyarla(yeni)
    setSesler(yeni)
    if (!yeni) setMuzik(false)
  }
  const muzigiDegistir = () => {
    if (muzik) {
      muzigiDurdur()
      setMuzik(false)
      return
    }
    // Tarayıcı sesi ancak kullanıcı dokunduktan sonra açtırır; bu tıklama
    // o izni veriyor.
    if (!sesler) {
      sesiAyarla(true)
      setSesler(true)
    }
    void muzigiBaslat().then((oldu) => setMuzik(oldu))
  }
  /** Bitiş ekranından açılan hatıra kartı */
  const [sertifika, setSertifika] = useState(false)
  /** Şu an bağlı olanlar: peer kimliği -> ad + hesap kimliği */
  const [bagliOlanlar, setBagliOlanlar] = useState<Map<string, BagliKisi>>(new Map())
  const [chatAcik, setChatAcik] = useState(false)
  const [chat, setChat] = useState<ChatSatiri[]>([])
  const [okunmamis, setOkunmamis] = useState(0)
  const [chatMetni, setChatMetni] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [elapsed, setElapsed] = useState(config.elapsed ?? 0)
  const [prog, setProg] = useState(0)
  const [ghost, setGhost] = useState(true)
  const [surprise, setSurprise] = useState(config.message ?? '')
  const [title, setTitle] = useState(config.title ?? '')
  const [artist, setArtist] = useState(config.artist ?? '')

  const refs = useRef<EngineRefs>({
    board: null,
    game: null,
    room: null,
    imageDataUrl: config.imageDataUrl ?? '',
    seed: config.seed ?? 0,
    pieceCount: config.pieceCount ?? 100,
    imgChunks: [],
    imgTotal: -1,
    pendingSnap: config.snap ?? null,
    lastChunkAt: 0,
    remoteId: config.remoteId ?? null,
    rotation: config.rotation ?? false,
    lastRemoteSave: 0,
    lastMoveSent: 0,
    lastCursorSent: 0,
    elapsed: config.elapsed ?? 0,
    completed: false,
    destroyed: false,
  })

  // Oda kodu kimlik çakışmasında değişebilir; link her zaman güncel kodu
  // göstermeli, yoksa paylaşılan davet ölü bir odaya işaret eder.
  /**
   * Bu oturumdaki hesabım. Misafir olarak devam edilmişse cihazda açık bir
   * oturum olsa bile null; böylece hesap hiçbir yerde kullanılmaz.
   */
  const hesap = config.misafirZorla ? null : auth.user

  /** Odada görünecek adım: hesap adı, misafirsem kendi seçtiğim ad */
  const benimAdim = hesap ? auth.displayName : misafirAdi() || 'Misafir'

  const inviteLink = useMemo(
    () => (roomCode ? `${location.origin}${location.pathname}#room=${roomCode}` : ''),
    [roomCode],
  )

  // ---- kayıt ----
  const save = (zorla = false) => {
    const r = refs.current
    if (!r.game || !r.imageDataUrl) return
    savePuzzle({
      id: config.puzzleId,
      title: titleRef.current,
      imageDataUrl: r.imageDataUrl,
      seed: r.seed,
      pieceCount: r.pieceCount,
      snap: snapshot(r.game),
      elapsed: r.elapsed,
      message: surpriseRef.current,
      completed: r.completed,
      updatedAt: Date.now(),
      unlockAt: config.unlockAt ?? null,
    })

    // Sunucudaki ortak kayda da yaz. Normalde seyrek yazılır; oyundan
    // ayrılırken (zorla=true) beklemeden yazılır, yoksa son hamleler
    // sunucuya hiç ulaşmadan sekme kapanabiliyor.
    if (r.remoteId && (zorla || Date.now() - r.lastRemoteSave > 8000)) {
      r.lastRemoteSave = Date.now()
      void saveRemoteProgress(r.remoteId, {
        state: snapshot(r.game),
        elapsed: r.elapsed,
        completed: r.completed,
        title: titleRef.current,
      }).catch(() => {
        // çevrimdışıysak yerel kayıt zaten duruyor
      })
    }
  }
  const surpriseRef = useRef(surprise)
  surpriseRef.current = surprise
  const titleRef = useRef(title)
  titleRef.current = title

  // ---- motor kurulumu ----
  const build = async (imageDataUrl: string, pieceCount: number, seed: number) => {
    const r = refs.current
    setLoadText(c('Parçalar kesiliyor'))
    const img = await loadImage(imageDataUrl)
    if (r.destroyed || !canvasRef.current) return
    const cut = generateCut(img.naturalWidth, img.naturalHeight, pieceCount, seed)
    const bitmaps = renderPieceBitmaps(img, cut)
    const game = createGameState(cut, seed + 1, r.rotation)
    if (r.pendingSnap) {
      restore(game, r.pendingSnap)
      r.pendingSnap = null
    }
    r.imageDataUrl = imageDataUrl
    r.seed = seed
    r.pieceCount = pieceCount
    r.game = game

    const board = new PuzzleBoard(canvasRef.current, game, bitmaps, {
      onGrab: (g) => {
        r.room?.send({ t: 'grab', g })
        return true
      },
      onMove: (g, anchor, x, y) => {
        const now = performance.now()
        if (now - r.lastMoveSent > 45) {
          r.lastMoveSent = now
          r.room?.send({ t: 'move', g, anchor, x, y })
        }
      },
      onDrop: (g) => {
        const ids = game.groups.get(g)
        if (ids) {
          const anchor = game.pieces[ids[0]]
          r.room?.send({ t: 'drop', g, anchor: anchor.id, x: anchor.x, y: anchor.y })
        }
        const res = dropGroup(game, g)
        afterStateChange(res)
      },
      onCursor: (x, y) => {
        const now = performance.now()
        // Görüşme açıkken imleç daha seyrek gönderiliyor: veri kanalı ile
        // görüntü aynı bağlantıyı paylaştığı için sık gönderim görüntüyü
        // dondurabiliyor.
        const aralik = r.room?.yayindaMi ? 110 : 60
        if (now - r.lastCursorSent > aralik) {
          r.lastCursorSent = now
          r.room?.send({ t: 'cursor', x, y, ad: benimAdim })
        }
      },
      onRotate: (g) => {
        rotateGroup(game, g, 1)
        r.room?.send({ t: 'rot', g, d: 1 })
        const res = dropGroup(game, g)
        afterStateChange(res)
      },
      onSplit: (pieceId) => {
        if (!canSplit(game, pieceId)) return
        const p = game.pieces[pieceId]
        const newGroup = nextFreeGroupId(game)
        // koparılan parça biraz kenara çıksın ki ayrıldığı görülsün
        const x = p.x + game.cut.cellW * 0.65
        const y = p.y + game.cut.cellH * 0.65
        if (splitPiece(game, pieceId, newGroup, x, y)) {
          r.room?.send({ t: 'split', piece: pieceId, group: newGroup, x, y })
          afterStateChange({ completed: false })
        }
      },
    })
    r.board = board
    if (import.meta.env.DEV) {
      // dev'de konsoldan/testten erişim için
      ;(window as unknown as Record<string, unknown>).__puzzle = { game, board, refs: r }
    }
    setProg(progress(game))
    setPhase(game.pieces.length > 0 && progressDone(game) ? 'done' : 'playing')
    // hiç parça oynatılmadan çıkılsa bile geçmişte görünsün
    save()
    // tek başına oynananlar dahil sunucuya kaydet
    if (config.mode === 'local') void registerRemoteRoom()
  }

  const progressDone = (game: GameState) => progress(game) >= 1

  /**
   * @param sonuc dropGroup'un döndürdüğü özet; ses efektleri buna göre çalar.
   *   Karşı tarafın hamlelerinde de çalıyor — birlikte oynadığını duymak
   *   oyunun havasının bir parçası.
   */
  const afterStateChange = (sonuc: {
    completed: boolean
    snappedToFrame?: boolean
    merges?: number
  }) => {
    const r = refs.current
    const { completed } = sonuc
    if (sonuc.merges && sonuc.merges > 0) birlesme()
    else if (sonuc.snappedToFrame) tik()
    if (!r.game || !r.board) return
    // birleşmelerde geçersiz kalan kilitleri temizle
    for (const g of [...r.board.lockedGroups.keys()]) {
      if (!r.game.groups.has(g)) r.board.lockedGroups.delete(g)
    }
    r.board.invalidate()
    setProg(progress(r.game))
    if (completed && !r.completed) {
      r.completed = true
      kutlama()
      setPhase('done')
      // Tamamlanma bilgisi beklemeden sunucuya yazılmalı. Normal kayıt 8
      // saniyede bir yapıldığı için, son kayıttan hemen sonra biten puzzle
      // "bitmemiş" olarak kalıyordu ve istatistiklere hiç yansımıyordu.
      save(true)
      return
    }
    save()
  }

  // ---- ağ ----
  const handleMsg = (msg: Msg, from: string) => {
    const r = refs.current
    switch (msg.t) {
      case 'full': {
        setError('Oda dolu.')
        break
      }
      case 'meta': {
        r.seed = msg.seed
        r.pieceCount = msg.pieceCount
        r.elapsed = msg.elapsed
        setElapsed(msg.elapsed)
        setSurprise(msg.message)
        setTitle(msg.title)
        setArtist(msg.artist ?? '')
        r.rotation = msg.rotation ?? false
        r.imgChunks = []
        r.imgTotal = msg.imgChunks
        setLoadText(c('Fotoğraf geliyor'))
        break
      }
      case 'img': {
        r.imgChunks[msg.i] = msg.data
        r.lastChunkAt = Date.now()
        const got = r.imgChunks.filter(Boolean).length
        if (r.imgTotal > 0) {
          if (got === r.imgTotal) {
            const dataUrl = r.imgChunks.join('')
            r.imgChunks = []
            r.imgTotal = -1
            void build(dataUrl, r.pieceCount, r.seed)
          } else {
            setLoadText(`Fotoğraf geliyor · %${Math.round((got / r.imgTotal) * 100)}`)
          }
        }
        break
      }
      case 'state': {
        if (r.game) {
          restore(r.game, msg.snap)
          r.board?.invalidate()
          setProg(progress(r.game))
        } else {
          r.pendingSnap = msg.snap
        }
        break
      }
      case 'grab': {
        r.board?.kilitle(msg.g, from)
        break
      }
      case 'release': {
        r.board?.kilidiAc(msg.g)
        break
      }
      case 'move': {
        if (!r.game) break
        // Saniyede ~20 kez geliyor. kilitle() grubu üst katmana taşıdığı için
        // sonraki hareketler yalnızca o katmanı yeniliyor; duran parçalar
        // yeniden çizilmiyor.
        r.board?.kilitle(msg.g, from)
        setGroupPos(r.game, msg.g, msg.anchor, msg.x, msg.y)
        r.board?.grupTasindi()
        break
      }
      case 'drop': {
        if (!r.game) break
        setGroupPos(r.game, msg.g, msg.anchor, msg.x, msg.y)
        r.board?.kilidiAc(msg.g)
        const res = dropGroup(r.game, msg.g)
        afterStateChange(res)
        break
      }
      case 'cursor': {
        if (r.board) {
          r.board.remoteCursors.set(from, {
            x: msg.x,
            y: msg.y,
            at: Date.now(),
            ad: msg.ad,
          })
          // parçalara dokunulmadı: statik katman olduğu gibi kalsın
          r.board.imlecDegisti()
        }
        break
      }
      case 'split': {
        if (!r.game) break
        splitPiece(r.game, msg.piece, msg.group, msg.x, msg.y)
        afterStateChange({ completed: false })
        break
      }
      case 'rot': {
        if (!r.game) break
        rotateGroup(r.game, msg.g, msg.d)
        const res = dropGroup(r.game, msg.g)
        afterStateChange(res)
        break
      }
      case 'tray': {
        if (!r.game) break
        arrangeTray(r.game, msg.seed)
        afterStateChange({ completed: false })
        break
      }
      case 'shuffle': {
        if (!r.game) break
        shufflePieces(r.game, msg.seed)
        afterStateChange({ completed: false })
        break
      }
      case 'chat': {
        setChat((l) => [...l.slice(-99), { ad: msg.ad, metin: msg.metin, ts: msg.ts, benMi: false }])
        setChatAcik((acik) => {
          if (!acik) setOkunmamis((n) => n + 1)
          return acik
        })
        break
      }
      case 'hello': {
        setBagliOlanlar((m) =>
          new Map(m).set(from, {
            peerId: from,
            ad: msg.ad,
            uid: msg.uid,
            kimlik: msg.kimlik ?? msg.uid ?? from,
          }),
        )
        break
      }
      case 'kick': {
        // Çıkarılan kişi odadan düşsün; sunucu zaten erişimini kesti
        // Hesabım varsa hesap kimliğim, misafirsem cihaz kimliğim eşleşir
        const benimKimligim = hesap?.id ?? misafirKimligi()
        if (msg.uid === benimKimligim) {
          r.room?.close()
          r.room = null
          setError(c('Bu odadan çıkarıldın.'))
        }
        break
      }
    }
  }

  const roomEvents = {
    onRemoteStream: (id: string, akis: MediaStream) => {
      if (!refs.current.destroyed) setUzakAkislar((m) => new Map(m).set(id, akis))
    },
    onRemoteStreamEnded: (id: string) => {
      if (refs.current.destroyed) return
      setUzakAkislar((m) => {
        const y = new Map(m)
        y.delete(id)
        return y
      })
    },
    onCodeChanged: (code: string) => {
      const r = refs.current
      if (r.destroyed) return
      setRoomCode(code)
      // sunucudaki kayıt da yeni kodu göstersin, yoksa davet linkiyle
      // gelen kişi kaydı bulamaz
      if (r.remoteId) void updateRemoteRoomCode(r.remoteId, code).catch(() => {})
    },
    onPeerJoined: (id: string) => {
      const r = refs.current
      if (r.destroyed) return
      // yeni gelene her şeyi yolla (yalnızca ona, diğerleri zaten senkron)
      sendFullSync(id)
      tanit()
      setInviteOpen(false)
      setPlayerCount(r.room?.playerCount ?? 1)
    },
    onPeerLeft: (id: string) => {
      const r = refs.current
      if (r.destroyed) return
      setBagliOlanlar((m) => {
        const y = new Map(m)
        y.delete(id)
        return y
      })
      // ayrılan kişinin tuttuğu parçalar serbest kalsın, imleci kaybolsun
      r.board?.remoteCursors.delete(id)
      if (r.board) {
        for (const [g, sahip] of [...r.board.lockedGroups]) {
          if (sahip === id) r.board.lockedGroups.delete(g)
        }
        r.board.invalidate()
      }
      setPlayerCount(r.room?.playerCount ?? 1)
    },
    onStatus: (status: RoomStatus, detail?: string) => {
      const r = refs.current
      if (r.destroyed) return
      setRoomStatus(status)
      setStatusDetail(detail ?? '')
      if (status === 'connecting') setError(null)
      if (status === 'error') {
        if (config.mode === 'guest') {
          setError(
            detail === 'peer-unavailable'
              ? c('Oda kapalı. Karşı tarafın sayfası hâlâ açık mı?')
              : relayKullanilabilir()
                ? c('Bağlanamadık. Karşı taraf sayfayı öne alıp tekrar denesin.')
                : c(
                    'Bağlanamadık. Ağınız doğrudan bağlantıya izin vermiyor ve yedek aktarma sunucusuna da ulaşılamadı. Farklı bir ağ (ör. mobil veri) deneyebilirsiniz.',
                  ),
          )
        }
      }
      if (status === 'connected') {
        // odadaki listede görünmek için kimliğini tanıt
        tanit()
        if (config.mode === 'guest') {
          r.lastChunkAt = Date.now()
          if (!r.game) setLoadText('Puzzle bekleniyor')
        }
      }
      // oda kodu kesinleştiğinde sunucuya kaydet
      if (config.mode === 'local' && (status === 'waiting' || status === 'connected')) {
        void registerRemoteRoom()
      }
      setPlayerCount(r.room?.playerCount ?? 1)
    },
    onMessage: handleMsg,
  }

  /**
   * Kim olduğumuzu odaya duyur. Misafirler sunucudaki katılımcı listesinde
   * olmadığı için "odadakiler" listesi yalnızca bununla eksiksiz oluyor.
   */
  const tanit = () => {
    refs.current.room?.send({
      t: 'hello',
      ad: benimAdim,
      uid: hesap?.id ?? null,
      kimlik: hesap?.id ?? misafirKimligi(),
    })
  }

  /** Tüm puzzle verisini gönder. hedef verilirse yalnızca ona. */
  const sendFullSync = (hedef?: string) => {
    const r = refs.current
    if (!r.room || !r.game || !r.imageDataUrl) return
    const chunks = chunkDataUrl(r.imageDataUrl)
    const yolla = (m: Msg) => (hedef ? r.room!.sendTo(hedef, m) : r.room!.send(m))
    yolla({
      t: 'meta',
      seed: r.seed,
      pieceCount: r.pieceCount,
      title: titleRef.current,
      artist: config.artist ?? '',
      message: surpriseRef.current,
      imgChunks: chunks.length,
      elapsed: r.elapsed,
      rotation: r.rotation,
    })
    chunks.forEach((data, i) => yolla({ t: 'img', i, data }))
    yolla({ t: 'state', snap: snapshot(r.game) })
  }

  const createRoom = () => {
    const r = refs.current
    if (r.room) {
      setInviteOpen(true)
      return
    }
    // ortak tablodan devam ediliyorsa eski oda kodunu koru: önceki davet
    // linki çalışmaya devam etsin
    r.room = Room.host(roomEvents, config.maxPlayers ?? 2, config.roomCode)
    setRoomCode(r.room.code)
    setInviteOpen(true)
  }

  /**
   * Puzzle'ı sunucuya kaydet. Tek başına oynananlar da kaydedilir; böylece
   * "Tablolarım"da görünür ve başka bir cihazdan kaldığı yerden devam edilebilir.
   */
  const registerRemoteRoom = async () => {
    const r = refs.current
    const kod = r.room?.code ?? config.roomCode
    if (!hesap || r.remoteId || !kod || !r.imageDataUrl) return
    try {
      const uzak = await createRemotePuzzle({
        roomCode: kod,
        title: titleRef.current,
        artist: config.artist ?? '',
        imageDataUrl: r.imageDataUrl,
        seed: r.seed,
        // Seçilen sayı yaklaşıktır (100 seçilince 104 parça çıkabilir).
        // İstatistikler doğru olsun diye gerçek parça sayısını yazıyoruz.
        pieceCount: r.game?.pieces.length ?? r.pieceCount,
        message: surpriseRef.current,
        maxPlayers: config.maxPlayers ?? 2,
        rotation: r.rotation,
        unlockAt: config.unlockAt ?? null,
      })
      if (uzak && !r.destroyed) r.remoteId = uzak.id
    } catch {
      // sunucuya yazılamadıysa oyun yine çalışır, sadece ortak geçmişe düşmez
    }
  }

  const rejoin = () => {
    const r = refs.current
    if (config.mode !== 'guest' || !config.roomCode) return
    setError(null)
    r.imgChunks = []
    r.imgTotal = -1
    setLoadText(c('Odaya bağlanılıyor'))
    // Yeni bir Room kurmak yerine mevcut olanı sıfırla: eskisi arka planda
    // yaşamaya devam edip çakışan ikinci bir bağlantı açıyordu.
    if (r.room) r.room.retry()
    else r.room = Room.join(config.roomCode, roomEvents)
  }

  /**
   * Misafir açılışı: giriş yapılmışsa puzzle'ı doğrudan sunucudan al
   * (fotoğraf dahil), böylece host'un aktarımını beklemeye gerek kalmaz.
   * Giriş yoksa eski yol: her şey odadan gelir.
   */
  const initGuest = async () => {
    const r = refs.current
    const kod = config.roomCode!
    // Misafir olarak devam edilmişse sunucuya hiç dokunma: puzzle odadan
    // gelir, kayıt da geçmişe düşmez.
    if (hesap) {
      try {
        setLoadText('Puzzle getiriliyor')
        const uzak = await joinRemotePuzzle(kod)
        if (uzak && kilitliMi(uzak) && uzak.owner !== hesap.id) {
          setError(c('Bu puzzle henüz açılmadı. Özel gün için saklanmış.'))
          return
        }
        if (uzak && !r.destroyed) {
          const url = await puzzleImageUrl(uzak.image_path)
          if (url && !r.destroyed) {
            const dataUrl = await urlToDataUrl(url)
            r.remoteId = uzak.id
            r.elapsed = uzak.elapsed
            r.pendingSnap = uzak.state
            setElapsed(uzak.elapsed)
            setTitle(uzak.title)
            setArtist(uzak.artist ?? '')
            setSurprise(uzak.message)
            await build(dataUrl, uzak.piece_count, uzak.seed)
          }
        }
      } catch (e) {
        if (e instanceof OdaHatasi && e.tur === 'kilitli') {
          setError(e.message)
          return
        }
        // başka bir sebeple alınamadıysa odadan gelmesini bekleriz
      }
    }
    if (r.destroyed) return
    if (!r.game) setLoadText(c('Odaya bağlanılıyor'))
    r.room = Room.join(kod, roomEvents)
  }

  /** Ortak geçmişten devam: fotoğrafı depodan indirip kur */
  const initRemote = async () => {
    const r = refs.current
    try {
      setLoadText(c('Fotoğraf getiriliyor'))
      const url = await puzzleImageUrl(config.imagePath!)
      if (!url) throw new Error(c('Fotoğrafa erişilemedi'))
      const dataUrl = await urlToDataUrl(url)
      if (r.destroyed) return
      await build(dataUrl, config.pieceCount!, config.seed!)
    } catch {
      if (!r.destroyed) {
        setError(c('Fotoğrafa ulaşamadık. Bağlantını kontrol et.'))
      }
    }
  }

  // ---- yaşam döngüsü ----
  useEffect(() => {
    const r = refs.current
    r.destroyed = false

    if (config.mode === 'local') {
      void build(config.imageDataUrl!, config.pieceCount!, config.seed!).then(() => {
        if (!r.destroyed && config.autoHost) createRoom()
      })
    } else if (config.mode === 'remote') {
      void initRemote()
    } else {
      void initGuest()
    }

    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__refs = r
    }

    // Sekme kapanırken/arka plana atılırken son durumu yaz. Mobilde
    // beforeunload çoğu zaman çalışmaz; asıl güvenilir sinyal budur.
    const onUnload = () => save(true)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') save(true)
    }
    window.addEventListener('beforeunload', onUnload)
    window.addEventListener('pagehide', onUnload)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      r.destroyed = true
      window.removeEventListener('beforeunload', onUnload)
      window.removeEventListener('pagehide', onUnload)
      document.removeEventListener('visibilitychange', onVisibility)
      save(true)
      sesiKapat()
      // Kamera/mikrofon her durumda bırakılsın: oda hiç kurulmadıysa
      // room.close() çalışmaz ve cihazın ışığı yanmaya devam eder.
      yerelAkisRef.current?.getTracks().forEach((iz) => iz.stop())
      r.board?.destroy()
      r.room?.close()
      r.board = null
      r.room = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Nasıl oynanır turu yalnızca ilk oyunda kendiliğinden açılır. Sonraki
  // seferlerde üstteki ? düğmesinden açılabilir.
  useEffect(() => {
    if (phase !== 'playing' || tanitimGorulduMu()) return
    setTanitim(true)
    tanitimiIsaretle()
  }, [phase])

  // Müzik açık bırakıldıysa oyuna girer girmez değil, ilk dokunuşta başlar:
  // tarayıcı kullanıcı etkileşimi olmadan ses çaldırmıyor.
  useEffect(() => {
    if (phase !== 'playing' || !muzikAcikMi()) return
    const basla = () => {
      void muzigiBaslat().then((oldu) => setMuzik(oldu))
      window.removeEventListener('pointerdown', basla)
    }
    window.addEventListener('pointerdown', basla, { once: true })
    return () => window.removeEventListener('pointerdown', basla)
  }, [phase])

  // süre sayacı + düzenli otomatik kayıt
  useEffect(() => {
    if (phase !== 'playing') return
    const id = setInterval(() => {
      const r = refs.current
      r.elapsed += 1
      setElapsed(r.elapsed)
      // Parça oynatılmadan geçen uzun sürelerde de ilerleme kaybolmasın
      if (r.elapsed % 15 === 0) save()
    }, 1000)
    return () => clearInterval(id)
  }, [phase])

  // Misafir "bağlandı" görünüp veri gelmiyorsa sonsuza kadar bekletme:
  // aktarım 20 sn takılırsa kullanıcıya durumu söyle ve tekrar denet.
  useEffect(() => {
    if (config.mode !== 'guest' || phase !== 'loading' || roomStatus !== 'connected') return
    const id = setInterval(() => {
      const r = refs.current
      if (r.lastChunkAt && Date.now() - r.lastChunkAt > 20_000) {
        setError(c('Bağlandık ama puzzle gelmedi. Karşı taraf sayfayı öne alsın.'))
      }
    }, 2000)
    return () => clearInterval(id)
  }, [config.mode, phase, roomStatus])

  const chatGonder = (metin: string) => {
    const temiz = metin.trim().slice(0, 300)
    if (!temiz) return
    const ad = benimAdim
    const ts = Date.now()
    refs.current.room?.send({ t: 'chat', ad, metin: temiz, ts })
    setChat((l) => [...l.slice(-99), { ad, metin: temiz, ts, benMi: true }])
    setChatMetni('')
  }

  const tepsiyeDiz = () => {
    const r = refs.current
    if (!r.game) return
    const seed = (Math.random() * 0xffffffff) >>> 0
    arrangeTray(r.game, seed)
    r.room?.send({ t: 'tray', seed })
    afterStateChange({ completed: false })
    r.board?.fitView()
  }

  const karistir = () => {
    const r = refs.current
    if (!r.game) return
    const seed = (Math.random() * 0xffffffff) >>> 0
    shufflePieces(r.game, seed)
    r.room?.send({ t: 'shuffle', seed })
    afterStateChange({ completed: false })
    r.board?.fitView()
  }

  /**
   * Mikrofon ayarları. Yankı ve cızırtının başlıca sebebi hoparlörden çıkan
   * sesin mikrofona geri girmesi; bu üç bayrak tarayıcının yankı gidericisini
   * açıyor. Tek kanal ve 48 kHz, mobil tarayıcıların kendi kendine seçtiği
   * uyumsuz ayarlardan kaynaklanan cızırtıyı da kesiyor.
   */
  const SES_AYARI: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 48000,
  }

  /**
   * Kamera/mikrofon aç ve odadakilerle görüşmeyi başlat.
   *
   * Tablette "izin verdim ama açılmıyor" sorununun sebebi, istenen çözünürlük
   * ve ön kamera kısıtının bazı cihazlarda karşılanamaması: tarayıcı izni
   * veriyor ama akışı vermiyordu. Artık kısıtlar kademeli olarak gevşetiliyor
   * ve gerçek hata kullanıcıya söyleniyor.
   */
  const gorusmeBaslat = async (yalnizSes = false) => {
    const r = refs.current
    if (!r.room || gorusmeBekliyor) return

    if (!navigator.mediaDevices?.getUserMedia) {
      setBilgi({
        baslik: 'Kamera açılamıyor',
        mesaj:
          location.protocol === 'https:' || location.hostname === 'localhost'
            ? c('Bu tarayıcı kamera ve mikrofon erişimini desteklemiyor.')
            : c('Kamera yalnızca güvenli bağlantıda (https) açılabilir.'),
      })
      return
    }

    // Sırayla dene: istenen ayar → sade ayar → en sade. İlk tutan kullanılır.
    const denemeler: MediaStreamConstraints[] = yalnizSes
      ? [{ video: false, audio: SES_AYARI }, { video: false, audio: true }]
      : [
          {
            // Kare hızına tavan: küçük pencerede 30 fps gerekmiyor ve
            // kodlayıcı sıkışmadığı için görüntü daha az donuyor.
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 20, max: 24 },
              facingMode: 'user',
            },
            audio: SES_AYARI,
          },
          { video: { frameRate: { ideal: 20, max: 24 } }, audio: SES_AYARI },
          { video: true, audio: true },
        ]

    setGorusmeBekliyor(true)
    let akis: MediaStream | null = null
    let sonHata: unknown = null
    for (const kisit of denemeler) {
      try {
        akis = await navigator.mediaDevices.getUserMedia(kisit)
        break
      } catch (e) {
        sonHata = e
      }
    }
    setGorusmeBekliyor(false)

    if (!akis) {
      const ad = sonHata instanceof Error ? sonHata.name : ''
      setBilgi({
        baslik: yalnizSes ? 'Mikrofon açılamadı' : 'Kamera açılamadı',
        mesaj:
          ad === 'NotAllowedError'
            ? c(
                'İzin verilmedi. Tarayıcı adres çubuğundaki kilit simgesinden kamera ve mikrofon iznini açabilirsin.',
              )
            : ad === 'NotFoundError' || ad === 'OverconstrainedError'
              ? yalnizSes
                ? c('Mikrofon bulunamadı.')
                : c('Kamera bulunamadı. Yalnızca sesli konuşmayı deneyebilirsin.')
              : ad === 'NotReadableError'
                ? c('Kamera başka bir uygulamada açık görünüyor. Onu kapatıp tekrar dene.')
                : c('Açılamadı{ek}. Sayfayı yenileyip tekrar dene.', {
                    ek: ad ? ` (${ad})` : '',
                  }),
      })
      return
    }

    if (r.destroyed) {
      akis.getTracks().forEach((t) => t.stop())
      return
    }
    setYerelAkis(akis)
    setSadeceSes(yalnizSes)
    setKameraAcik(akis.getVideoTracks().length > 0)
    setSesAcik(akis.getAudioTracks().length > 0)
    await r.room.yayiniBaslat(akis)
  }

  const gorusmeBitir = () => {
    yerelAkis?.getTracks().forEach((t) => t.stop())
    setYerelAkis(null)
    setUzakAkislar(new Map())
    setSadeceSes(false)
    refs.current.room?.yayiniDurdur()
  }

  const kamerayiDegistir = () => {
    const iz = yerelAkis?.getVideoTracks()[0]
    if (!iz) return
    iz.enabled = !iz.enabled
    setKameraAcik(iz.enabled)
  }

  const sesiDegistir = () => {
    const iz = yerelAkis?.getAudioTracks()[0]
    if (!iz) return
    iz.enabled = !iz.enabled
    setSesAcik(iz.enabled)
  }

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard yoksa kullanıcı metni elle seçebilir
    }
  }

  return (
    <div className="game-root" ref={oyunKokRef}>
      <div className="game-topbar" ref={ustCubukRef}>
        <button className="icon-btn" onClick={onExit} title={ceviri('Çık')}>
          ←
        </button>
        {title && (
          <span className="game-title" title={artist ? `${title} — ${artist}` : title}>
            {title}
            {artist && <em className="game-artist">{artist}</em>}
          </span>
        )}
        <span className="stat tabular">{formatTime(elapsed)}</span>

        <div className="progress" title={ceviri('%{yuzde} tamam', { yuzde: Math.round(prog * 100) })}>
          <div className="progress-fill" style={{ width: `${Math.round(prog * 100)}%` }} />
          <span className="progress-text tabular">%{Math.round(prog * 100)}</span>
        </div>

        <span className="spacer" />

        {roomStatus !== 'idle' && (
          <span
            className="stat"
            title={
              statusDetail
                ? `${ceviri(STATUS_TEXT[roomStatus])} (${statusDetail})`
                : ceviri(STATUS_TEXT[roomStatus])
            }
          >
            <span className="status-dot" style={{ background: STATUS_COLOR[roomStatus] }} />
            <span className="status-text">{ceviri(STATUS_TEXT[roomStatus])}</span>
            {config.mode !== 'guest' && (config.maxPlayers ?? 2) > 1 && (
              <span className="tabular">
                {' '}
                {playerCount}/{config.maxPlayers ?? 2}
              </span>
            )}
          </span>
        )}
        {config.mode === 'guest' && (roomStatus === 'disconnected' || roomStatus === 'error') && (
          <button className="btn btn-sm btn-secondary" onClick={rejoin}>
            {ceviri('Bağlan')}
          </button>
        )}
        {config.mode !== 'guest' && (
          <button className="btn btn-sm btn-secondary" onClick={createRoom}>
            {ceviri('Davet')}
          </button>
        )}
        {roomStatus !== 'idle' && (
          <button
            className={`icon-btn ${odaPanel ? 'on' : ''}`}
            onClick={() => {
              setOdaPanel((v) => !v)
              setArkadasPanel(false)
            }}
            title={ceviri('Odadakiler')}
          >
            👥
          </button>
        )}
        {/* Arkadaş listesi yalnızca hesapla anlamlı; misafirde arkadaşlık yok */}
        {hesap && (
          <button
            className={`icon-btn ${arkadasPanel ? 'on' : ''}`}
            onClick={() => {
              setArkadasPanel((v) => !v)
              setOdaPanel(false)
            }}
            title={ceviri('Arkadaşlar — mesaj gönder, odaya davet et')}
          >
            🤝
          </button>
        )}
        {roomStatus !== 'idle' && (
          <button
            className={`icon-btn ${yerelAkis && !sadeceSes ? 'on' : ''}`}
            disabled={gorusmeBekliyor}
            onClick={() =>
              yerelAkis && !sadeceSes ? gorusmeBitir() : void gorusmeBaslat(false)
            }
            title={
              yerelAkis && !sadeceSes ? ceviri('Görüşmeyi bitir') : ceviri('Görüntülü konuş')
            }
          >
            📹
          </button>
        )}
        {roomStatus !== 'idle' && (
          <button
            className={`icon-btn ${sadeceSes ? 'on' : ''}`}
            disabled={gorusmeBekliyor}
            onClick={() => (sadeceSes ? gorusmeBitir() : void gorusmeBaslat(true))}
            title={sadeceSes ? ceviri('Görüşmeyi bitir') : ceviri('Yalnızca sesli konuş')}
          >
            🎙
          </button>
        )}
        {roomStatus !== 'idle' && (
          <button
            className={`icon-btn ${chatAcik ? 'on' : ''}`}
            onClick={() => {
              setChatAcik((v) => !v)
              setOkunmamis(0)
            }}
            title={ceviri('Sohbet')}
          >
            💬
            {okunmamis > 0 && <span className="dot-badge">{okunmamis}</span>}
          </button>
        )}
        {/* İkincil araçlar: dar ekranda "⋯" ile açılır, geniş ekranda hep görünür */}
        <div className={`tool-group ${araclarAcik ? 'acik' : ''}`}>
          <button className="icon-btn" onClick={tepsiyeDiz} title={ceviri('Parçaları yanlara diz')}>
            ⫴
          </button>
          <button className="icon-btn" onClick={karistir} title={ceviri('Karıştır')}>
            🔀
          </button>
          <button
            className={`icon-btn ${edgeOnly ? 'on' : ''}`}
            onClick={() => {
              const b = refs.current.board
              if (b) {
                b.edgeOnly = !b.edgeOnly
                setEdgeOnly(b.edgeOnly)
                b.invalidate()
              }
            }}
            title={ceviri('Sadece kenarlar')}
          >
            ⬚
          </button>
          <button
            className={`icon-btn ${sesler ? 'on' : ''}`}
            onClick={sesleriDegistir}
            title={sesler ? ceviri('Ses efektlerini kapat') : ceviri('Ses efektlerini aç')}
          >
            {sesler ? '🔊' : '🔈'}
          </button>
          <button
            className={`icon-btn ${sesPanel ? 'on' : ''}`}
            onClick={() => setSesPanel((v) => !v)}
            title={ceviri('Ses ayarları')}
          >
            🎚
          </button>
          <button
            className={`icon-btn ${ghost ? 'on' : ''}`}
            onClick={() => {
              const b = refs.current.board
              if (b) {
                b.showGhost = !b.showGhost
                setGhost(b.showGhost)
                b.invalidate()
              }
            }}
            title={ceviri('Izgara')}
          >
            ⊞
          </button>
        </div>
        <button
          className={`icon-btn tool-more ${araclarAcik ? 'on' : ''}`}
          onClick={() => setAraclarAcik((v) => !v)}
          title={ceviri('Diğer araçlar')}
        >
          ⋯
        </button>
        <button
          className={`icon-btn ${peek ? 'on' : ''}`}
          onClick={() => setPeek((v) => !v)}
          title={ceviri('Orijinali göster')}
        >
          🖼
        </button>
        <button
          className="icon-btn"
          onClick={() => refs.current.board?.fitView()}
          title={ceviri('Hepsini göster')}
        >
          ⤢
        </button>
        <button
          className={`icon-btn ${tanitim ? 'on' : ''}`}
          onClick={() => setTanitim(true)}
          title={ceviri('Nasıl oynanır')}
        >
          ?
        </button>
      </div>

      <canvas ref={canvasRef} className="game-canvas" />

      {sesPanel && (
        <SesAyarlari
          sesler={sesler}
          muzik={muzik}
          onSesler={sesleriDegistir}
          onMuzik={muzigiDegistir}
          onKapat={() => setSesPanel(false)}
        />
      )}

      {peek && refs.current.imageDataUrl && (
        <OrijinalPanel
          gorsel={refs.current.imageDataUrl}
          chatAcik={chatAcik}
          onKapat={() => setPeek(false)}
        />
      )}

      {(yerelAkis || uzakAkislar.size > 0) && (
        <VideoPanel
          yerel={yerelAkis}
          uzaklar={uzakAkislar}
          sesAcik={sesAcik}
          kameraAcik={kameraAcik}
          sadeceSes={sadeceSes}
          onSes={sesiDegistir}
          onKamera={kamerayiDegistir}
          onKapat={gorusmeBitir}
        />
      )}

      {bilgi && (
        <ConfirmDialog
          baslik={bilgi.baslik}
          mesaj={bilgi.mesaj}
          tekButon
          onayYazisi="Tamam"
          onIptal={() => setBilgi(null)}
          onOnayla={() => setBilgi(null)}
        />
      )}

      {tanitim && (
        <Tutorial
          rotation={refs.current.rotation}
          odada={roomStatus !== 'idle'}
          hesapVar={!!hesap}
          onKapat={() => setTanitim(false)}
        />
      )}

      {odaPanel && (
        <RoomPanel
          puzzleId={refs.current.remoteId}
          benimId={hesap?.id ?? null}
          bagliOlanlar={[...bagliOlanlar.values()]}
          // Bağlantıyı yalnızca odayı kuran kesebilir (yıldız topolojisi)
          benHost={config.mode === 'local'}
          onKapat={() => setOdaPanel(false)}
          onCikarildi={(uid) => refs.current.room?.send({ t: 'kick', uid })}
          onMisafirCikar={(kimlik) => {
            refs.current.room?.cikar(kimlik)
            setBagliOlanlar((m) => {
              const y = new Map(m)
              for (const [id, k] of y) if (k.kimlik === kimlik) y.delete(id)
              return y
            })
          }}
        />
      )}

      {arkadasPanel && (
        <FriendsPanel davetLinki={inviteLink} onKapat={() => setArkadasPanel(false)} />
      )}

      {chatAcik && (
        <ChatPanel
          satirlar={chat}
          metin={chatMetni}
          bagli={roomStatus === 'connected'}
          onMetin={setChatMetni}
          onGonder={chatGonder}
          onKapat={() => setChatAcik(false)}
        />
      )}

      {phase === 'loading' && !error && (
        <div className="overlay">
          <div className="spinner" />
          <p>{loadText}</p>
        </div>
      )}

      {error && (
        <div className="overlay">
          <p className="overlay-title">{error}</p>

          {test && (
            <div className="test-sonuc">
              <div className={`test-satir ${test.yerel ? 'iyi' : 'kotu'}`}>
                <span>{test.yerel ? '✓' : '✕'}</span> {ceviri('Cihaz adresi')}
              </div>
              <div className={`test-satir ${test.disAdres ? 'iyi' : 'kotu'}`}>
                <span>{test.disAdres ? '✓' : '✕'}</span> {ceviri('Dışarıdan görünen adres')}
              </div>
              <div className={`test-satir ${test.aktarma ? 'iyi' : 'kotu'}`}>
                <span>{test.aktarma ? '✓' : '✕'}</span> {ceviri('Aktarma sunucusu (TURN)')}
              </div>
              <p className="muted test-ozet">{test.ozet}</p>
            </div>
          )}

          <div className="action-row">
            {config.mode === 'guest' && (
              <button className="btn btn-primary" onClick={rejoin}>
                {ceviri('Tekrar dene')}
              </button>
            )}
            <button
              className="btn btn-secondary"
              disabled={testSuruyor}
              onClick={() => {
                setTestSuruyor(true)
                void baglantiTesti()
                  .then((s) => setTest(s))
                  .finally(() => setTestSuruyor(false))
              }}
            >
              {testSuruyor ? ceviri('Deneniyor…') : ceviri('Bağlantıyı test et')}
            </button>
            <button className="btn btn-ghost" onClick={onExit}>
              {ceviri('Geri dön')}
            </button>
          </div>
        </div>
      )}

      {inviteOpen && inviteLink && (
        <div className="game-banner">
          <b>{ceviri('Linki gönder')}</b>
          <code>{inviteLink}</code>
          <div className="action-row">
            <button className="btn btn-primary" onClick={() => void copyInvite()}>
              {copied ? ceviri('Kopyalandı') : ceviri('Kopyala')}
            </button>
            <button className="btn btn-ghost" onClick={() => setInviteOpen(false)}>
              {ceviri('Kapat')}
            </button>
          </div>
          {roomStatus === 'waiting' && (
            <small className="muted">{ceviri('Sen bu sayfadayken bağlanabilirler.')}</small>
          )}
        </div>
      )}

      {phase === 'done' && (
        <Celebration
          surprise={surprise}
          elapsed={elapsed}
          title={title}
          artist={artist}
          parca={refs.current.game?.pieces.length ?? refs.current.pieceCount}
          image={refs.current.imageDataUrl}
          onExit={onExit}
          onSertifika={() => setSertifika(true)}
        />
      )}

      {sertifika && (
        <Certificate
          baslik={title}
          ressam={artist}
          // Odadaki herkes + ben; misafirlerin kendi verdiği adlar da dahil
          kisiler={[benimAdim, ...[...bagliOlanlar.values()].map((k) => k.ad)]}
          saniye={elapsed}
          parca={refs.current.game?.pieces.length ?? refs.current.pieceCount}
          gorsel={refs.current.imageDataUrl}
          onKapat={() => setSertifika(false)}
        />
      )}
    </div>
  )
}

/**
 * Orijinal görselin köşedeki önizlemesi.
 *
 * Eskiden görselin kendisi bir düğmeydi ve tıklayınca kapanıyordu; şimdi
 * taşınabilir olduğu için tıklama ile sürükleme birbirine karışıyordu.
 * Kapatma ayrı bir düğmeye alındı.
 */
function OrijinalPanel({
  gorsel,
  chatAcik,
  onKapat,
}: {
  gorsel: string
  chatAcik: boolean
  onKapat: () => void
}) {
  const { ceviri } = useDil()
  const { kokRef, stil, tutamac, tasindi, sifirla } = useSurukle<HTMLDivElement>('orijinal')
  return (
    <div
      ref={kokRef}
      style={stil}
      // kaydir yalnızca dar ekranda iş görüyor: geniş ekranda sohbet sağ
      // altta, önizleme sol altta duruyor ve çakışmıyorlar
      className={`peek panel-tutamac ${chatAcik && !tasindi ? 'kaydir' : ''}`}
      {...tutamac}
    >
      <img src={gorsel} alt={ceviri('Orijinal')} draggable={false} />
      <div className="peek-araclar">
        {tasindi && (
          <button className="icon-btn" onClick={sifirla} title={ceviri('Yerine döndür')}>
            ↺
          </button>
        )}
        <button className="icon-btn" onClick={onKapat} title={ceviri('Kapat')}>
          ✕
        </button>
      </div>
    </div>
  )
}

const TEPKILER = ['👍', '😄', '❤️', '🤔', '🎉', '😭']

function ChatPanel({
  satirlar,
  metin,
  bagli,
  onMetin,
  onGonder,
  onKapat,
}: {
  satirlar: ChatSatiri[]
  metin: string
  bagli: boolean
  onMetin: (v: string) => void
  onGonder: (v: string) => void
  onKapat: () => void
}) {
  const { ceviri } = useDil()
  const sonRef = useRef<HTMLDivElement>(null)
  const { kokRef, stil, tutamac, tasindi, sifirla } = useSurukle<HTMLElement>('sohbet')
  useEffect(() => {
    sonRef.current?.scrollIntoView({ block: 'end' })
  }, [satirlar.length])

  return (
    <aside ref={kokRef} style={stil} className="chat">
      <header className="chat-head panel-tutamac" {...tutamac}>
        <b>{ceviri('Sohbet')}</b>
        <span className="spacer" />
        {tasindi && (
          <button className="icon-btn" onClick={sifirla} title={ceviri('Yerine döndür')}>
            ↺
          </button>
        )}
        <button className="icon-btn" onClick={onKapat} title={ceviri('Kapat')}>
          ✕
        </button>
      </header>

      <div className="chat-body">
        {satirlar.length === 0 && (
          <p className="muted chat-bos">
            {bagli ? ceviri('Henüz mesaj yok.') : ceviri('Karşı taraf bağlanınca yazabilirsin.')}
          </p>
        )}
        {satirlar.map((s, i) => (
          <div key={i} className={`chat-satir ${s.benMi ? 'ben' : ''}`}>
            {!s.benMi && <small className="chat-ad">{s.ad}</small>}
            <span className="chat-balon">
              <Linkli metin={s.metin} />
            </span>
          </div>
        ))}
        <div ref={sonRef} />
      </div>

      <div className="chat-tepkiler">
        {TEPKILER.map((t) => (
          <button key={t} className="tepki" disabled={!bagli} onClick={() => onGonder(t)}>
            {t}
          </button>
        ))}
      </div>

      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault()
          onGonder(metin)
        }}
      >
        <input
          className="input"
          placeholder={bagli ? ceviri('Bir şeyler yaz…') : ceviri('Bağlantı bekleniyor…')}
          value={metin}
          maxLength={300}
          disabled={!bagli}
          onChange={(e) => onMetin(e.target.value)}
        />
        <button className="btn btn-primary btn-sm" type="submit" disabled={!bagli}>
          {ceviri('Gönder')}
        </button>
      </form>
    </aside>
  )
}

function Celebration({
  surprise,
  elapsed,
  title,
  artist,
  parca,
  image,
  onExit,
  onSertifika,
}: {
  surprise: string
  elapsed: number
  title: string
  /** Hazır eser çözüldüyse ressamın adı */
  artist: string
  parca: number
  image: string
  onExit: () => void
  onSertifika: () => void
}) {
  const { ceviri } = useDil()
  const konfeti = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 2.5,
        dur: 3 + Math.random() * 3,
        en: 7 + Math.random() * 9,
        donme: Math.round(Math.random() * 900 - 450),
        renk: ['#e85d75', '#f2c94c', '#6fcf97', '#56ccf2', '#bb6bd9'][i % 5],
      })),
    [],
  )
  return (
    <>
      <div className="confetti-layer" aria-hidden="true">
        {konfeti.map((c, i) => (
          <span
            key={i}
            className="confetti"
            style={{
              left: `${c.left}%`,
              width: c.en,
              height: c.en * 0.55,
              background: c.renk,
              animationDelay: `${c.delay}s`,
              animationDuration: `${c.dur}s`,
              ['--spin' as string]: `${c.donme}deg`,
            }}
          />
        ))}
      </div>
      <div className="celebration">
        <div className="celebration-card">
          {image && <img className="celebration-img" src={image} alt="" />}
          <h2>{ceviri('Bitti')}</h2>
          {title && <p className="celebration-eser">{title}</p>}
          {artist && <p className="celebration-ressam">{artist}</p>}
          <p className="muted">
            {parca > 0 ? ceviri('{sayi} parça', { sayi: parca }) + ' · ' : ''}
            {formatTime(elapsed)}
          </p>
          {surprise && <blockquote className="surprise">{surprise}</blockquote>}
          <div className="action-row">
            <button className="btn btn-secondary" onClick={onSertifika}>
              🏅 {ceviri('Hatıra kartı')}
            </button>
            <button className="btn btn-primary" onClick={onExit}>
              {ceviri('Tamam')}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
