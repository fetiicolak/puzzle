import { useEffect, useMemo, useRef, useState } from 'react'
import { PuzzleBoard } from '../engine/board'
import { generateCut, renderPieceBitmaps } from '../engine/cutter'
import {
  canSplit,
  createGameState,
  dropGroup,
  nextFreeGroupId,
  progress,
  restore,
  setGroupPos,
  snapshot,
  splitPiece,
  type GameState,
  type StateSnapshot,
} from '../engine/state'
import { Room, type RoomStatus } from '../net/peer'
import { chunkDataUrl, type Msg } from '../net/protocol'
import { loadImage, savePuzzle, urlToDataUrl } from '../storage'
import { useAuth } from '../supabase/auth'
import {
  createRemotePuzzle,
  joinRemotePuzzle,
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
  lastRemoteSave: number
  lastMoveSent: number
  lastCursorSent: number
  elapsed: number
  completed: boolean
  destroyed: boolean
}

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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState<'loading' | 'playing' | 'done'>('loading')
  const [loadText, setLoadText] = useState(
    config.mode === 'guest' ? 'Odaya bağlanılıyor' : 'Parçalar kesiliyor',
  )
  const [error, setError] = useState<string | null>(null)
  const [roomStatus, setRoomStatus] = useState<RoomStatus>('idle')
  const [statusDetail, setStatusDetail] = useState('')
  const [playerCount, setPlayerCount] = useState(1)
  const [roomCode, setRoomCode] = useState(config.roomCode ?? '')
  /** Orijinal görseli köşede göster */
  const [peek, setPeek] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [elapsed, setElapsed] = useState(config.elapsed ?? 0)
  const [prog, setProg] = useState(0)
  const [ghost, setGhost] = useState(true)
  const [surprise, setSurprise] = useState(config.message ?? '')
  const [title, setTitle] = useState(config.title ?? '')

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
    lastRemoteSave: 0,
    lastMoveSent: 0,
    lastCursorSent: 0,
    elapsed: config.elapsed ?? 0,
    completed: false,
    destroyed: false,
  })

  // Oda kodu kimlik çakışmasında değişebilir; link her zaman güncel kodu
  // göstermeli, yoksa paylaşılan davet ölü bir odaya işaret eder.
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
    setLoadText('Parçalar kesiliyor')
    const img = await loadImage(imageDataUrl)
    if (r.destroyed || !canvasRef.current) return
    const cut = generateCut(img.naturalWidth, img.naturalHeight, pieceCount, seed)
    const bitmaps = renderPieceBitmaps(img, cut)
    const game = createGameState(cut, seed + 1)
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
        afterStateChange(res.completed)
      },
      onCursor: (x, y) => {
        const now = performance.now()
        if (now - r.lastCursorSent > 60) {
          r.lastCursorSent = now
          r.room?.send({ t: 'cursor', x, y })
        }
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
          afterStateChange(false)
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

  const afterStateChange = (completed: boolean) => {
    const r = refs.current
    if (!r.game || !r.board) return
    // birleşmelerde geçersiz kalan kilitleri temizle
    for (const g of [...r.board.lockedGroups.keys()]) {
      if (!r.game.groups.has(g)) r.board.lockedGroups.delete(g)
    }
    r.board.invalidate()
    setProg(progress(r.game))
    if (completed && !r.completed) {
      r.completed = true
      setPhase('done')
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
        r.imgChunks = []
        r.imgTotal = msg.imgChunks
        setLoadText('Fotoğraf geliyor')
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
        r.board?.lockedGroups.set(msg.g, from)
        r.board?.invalidate()
        break
      }
      case 'release': {
        r.board?.lockedGroups.delete(msg.g)
        r.board?.invalidate()
        break
      }
      case 'move': {
        if (!r.game) break
        r.board?.lockedGroups.set(msg.g, from)
        setGroupPos(r.game, msg.g, msg.anchor, msg.x, msg.y)
        r.board?.invalidate()
        break
      }
      case 'drop': {
        if (!r.game) break
        setGroupPos(r.game, msg.g, msg.anchor, msg.x, msg.y)
        r.board?.lockedGroups.delete(msg.g)
        const res = dropGroup(r.game, msg.g)
        afterStateChange(res.completed)
        break
      }
      case 'cursor': {
        if (r.board) {
          r.board.remoteCursors.set(from, { x: msg.x, y: msg.y, at: Date.now() })
          r.board.invalidate()
        }
        break
      }
      case 'split': {
        if (!r.game) break
        splitPiece(r.game, msg.piece, msg.group, msg.x, msg.y)
        afterStateChange(false)
        break
      }
    }
  }

  const roomEvents = {
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
      setInviteOpen(false)
      setPlayerCount(r.room?.playerCount ?? 1)
    },
    onPeerLeft: (id: string) => {
      const r = refs.current
      if (r.destroyed) return
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
              ? 'Oda kapalı. Karşı tarafın sayfası hâlâ açık mı?'
              : 'Bağlanamadık. Bazı ağlar bu tür bağlantıyı engelliyor.',
          )
        }
      }
      if (status === 'connected' && config.mode === 'guest') {
        r.lastChunkAt = Date.now()
        if (!r.game) setLoadText('Puzzle bekleniyor')
      }
      // oda kodu kesinleştiğinde sunucuya kaydet
      if (config.mode === 'local' && (status === 'waiting' || status === 'connected')) {
        void registerRemoteRoom()
      }
      setPlayerCount(r.room?.playerCount ?? 1)
    },
    onMessage: handleMsg,
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
      message: surpriseRef.current,
      imgChunks: chunks.length,
      elapsed: r.elapsed,
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
    if (!auth.user || r.remoteId || !kod || !r.imageDataUrl) return
    try {
      const uzak = await createRemotePuzzle({
        roomCode: kod,
        title: titleRef.current,
        imageDataUrl: r.imageDataUrl,
        seed: r.seed,
        pieceCount: r.pieceCount,
        message: surpriseRef.current,
        maxPlayers: config.maxPlayers ?? 2,
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
    setLoadText('Odaya bağlanılıyor')
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
    if (auth.user) {
      try {
        setLoadText('Puzzle getiriliyor')
        const uzak = await joinRemotePuzzle(kod)
        if (uzak && !r.destroyed) {
          const url = await puzzleImageUrl(uzak.image_path)
          if (url && !r.destroyed) {
            const dataUrl = await urlToDataUrl(url)
            r.remoteId = uzak.id
            r.elapsed = uzak.elapsed
            r.pendingSnap = uzak.state
            setElapsed(uzak.elapsed)
            setTitle(uzak.title)
            setSurprise(uzak.message)
            await build(dataUrl, uzak.piece_count, uzak.seed)
          }
        }
      } catch {
        // sunucudan alınamadıysa odadan gelmesini bekleriz
      }
    }
    if (r.destroyed) return
    if (!r.game) setLoadText('Odaya bağlanılıyor')
    r.room = Room.join(kod, roomEvents)
  }

  /** Ortak geçmişten devam: fotoğrafı depodan indirip kur */
  const initRemote = async () => {
    const r = refs.current
    try {
      setLoadText('Fotoğraf getiriliyor')
      const url = await puzzleImageUrl(config.imagePath!)
      if (!url) throw new Error('Fotoğrafa erişilemedi')
      const dataUrl = await urlToDataUrl(url)
      if (r.destroyed) return
      await build(dataUrl, config.pieceCount!, config.seed!)
    } catch {
      if (!r.destroyed) {
        setError('Fotoğrafa ulaşamadık. Bağlantını kontrol et.')
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
      r.board?.destroy()
      r.room?.close()
      r.board = null
      r.room = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        setError('Bağlandık ama puzzle gelmedi. Karşı taraf sayfayı öne alsın.')
      }
    }, 2000)
    return () => clearInterval(id)
  }, [config.mode, phase, roomStatus])

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
    <div className="game-root">
      <div className="game-topbar">
        <button className="icon-btn" onClick={onExit} title="Çık">
          ←
        </button>
        {title && (
          <span className="game-title" title={title}>
            {title}
          </span>
        )}
        <span className="stat tabular">{formatTime(elapsed)}</span>

        <div className="progress" title={`%${Math.round(prog * 100)} tamam`}>
          <div className="progress-fill" style={{ width: `${Math.round(prog * 100)}%` }} />
          <span className="progress-text tabular">%{Math.round(prog * 100)}</span>
        </div>

        <span className="spacer" />

        {roomStatus !== 'idle' && (
          <span
            className="stat"
            title={
              statusDetail
                ? `${STATUS_TEXT[roomStatus]} (${statusDetail})`
                : STATUS_TEXT[roomStatus]
            }
          >
            <span className="status-dot" style={{ background: STATUS_COLOR[roomStatus] }} />
            <span className="status-text">{STATUS_TEXT[roomStatus]}</span>
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
            Bağlan
          </button>
        )}
        {config.mode !== 'guest' && (
          <button className="btn btn-sm btn-secondary" onClick={createRoom}>
            Davet
          </button>
        )}
        <button
          className={`icon-btn ${peek ? 'on' : ''}`}
          onClick={() => setPeek((v) => !v)}
          title="Orijinali göster"
        >
          🖼
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
          title="Izgara"
        >
          ⊞
        </button>
        <button
          className="icon-btn"
          onClick={() => refs.current.board?.fitView()}
          title="Hepsini göster"
        >
          ⤢
        </button>
      </div>

      <canvas ref={canvasRef} className="game-canvas" />

      {peek && refs.current.imageDataUrl && (
        <button className="peek" onClick={() => setPeek(false)} title="Kapat">
          <img src={refs.current.imageDataUrl} alt="Orijinal" />
        </button>
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
          <div className="action-row">
            {config.mode === 'guest' && (
              <button className="btn btn-primary" onClick={rejoin}>
                Tekrar dene
              </button>
            )}
            <button className="btn btn-secondary" onClick={onExit}>
              Geri dön
            </button>
          </div>
        </div>
      )}

      {inviteOpen && inviteLink && (
        <div className="game-banner">
          <b>Linki gönder</b>
          <code>{inviteLink}</code>
          <div className="action-row">
            <button className="btn btn-primary" onClick={() => void copyInvite()}>
              {copied ? 'Kopyalandı' : 'Kopyala'}
            </button>
            <button className="btn btn-ghost" onClick={() => setInviteOpen(false)}>
              Kapat
            </button>
          </div>
          {roomStatus === 'waiting' && (
            <small className="muted">Sen bu sayfadayken bağlanabilirler.</small>
          )}
        </div>
      )}

      {phase === 'done' && (
        <Celebration
          surprise={surprise}
          elapsed={elapsed}
          title={title}
          image={refs.current.imageDataUrl}
          onExit={onExit}
        />
      )}
    </div>
  )
}

function Celebration({
  surprise,
  elapsed,
  title,
  image,
  onExit,
}: {
  surprise: string
  elapsed: number
  title: string
  image: string
  onExit: () => void
}) {
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
          <h2>Bitti</h2>
          <p className="muted">
            {title ? `${title} · ` : ''}
            {formatTime(elapsed)}
          </p>
          {surprise && <blockquote className="surprise">{surprise}</blockquote>}
          <button className="btn btn-primary" onClick={onExit}>
            Tamam
          </button>
        </div>
      </div>
    </>
  )
}
