import { useEffect, useMemo, useRef, useState } from 'react'
import { PuzzleBoard } from '../engine/board'
import { generateCut, renderPieceBitmaps } from '../engine/cutter'
import {
  createGameState,
  dropGroup,
  progress,
  restore,
  setGroupPos,
  snapshot,
  type GameState,
  type StateSnapshot,
} from '../engine/state'
import { Room, type RoomStatus } from '../net/peer'
import { chunkDataUrl, type Msg } from '../net/protocol'
import { loadImage, savePuzzle } from '../storage'

export interface GameConfig {
  puzzleId: string
  mode: 'local' | 'guest'
  /** guest: katılınacak oda kodu */
  roomCode?: string
  /** local: oyun açılır açılmaz oda kur ve daveti göster */
  autoHost?: boolean
  imageDataUrl?: string
  seed?: number
  pieceCount?: number
  message?: string
  elapsed?: number
  snap?: StateSnapshot | null
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
  connecting: 'Bağlanıyor…',
  waiting: 'Partner bekleniyor',
  connected: 'Partner bağlı',
  disconnected: 'Bağlantı koptu',
  error: 'Bağlantı hatası',
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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState<'loading' | 'playing' | 'done'>('loading')
  const [loadText, setLoadText] = useState(
    config.mode === 'guest' ? 'Odaya bağlanılıyor…' : 'Parçalar kesiliyor…',
  )
  const [error, setError] = useState<string | null>(null)
  const [roomStatus, setRoomStatus] = useState<RoomStatus>('idle')
  const [statusDetail, setStatusDetail] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [elapsed, setElapsed] = useState(config.elapsed ?? 0)
  const [prog, setProg] = useState(0)
  const [ghost, setGhost] = useState(true)
  const [surprise, setSurprise] = useState(config.message ?? '')

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
    lastMoveSent: 0,
    lastCursorSent: 0,
    elapsed: config.elapsed ?? 0,
    completed: false,
    destroyed: false,
  })

  const inviteLink = useMemo(() => {
    const code = refs.current.room?.code ?? config.roomCode
    return code
      ? `${location.origin}${location.pathname}#room=${code}`
      : ''
  }, [roomStatus, config.roomCode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- kayıt ----
  const save = () => {
    const r = refs.current
    if (!r.game || !r.imageDataUrl) return
    savePuzzle({
      id: config.puzzleId,
      imageDataUrl: r.imageDataUrl,
      seed: r.seed,
      pieceCount: r.pieceCount,
      snap: snapshot(r.game),
      elapsed: r.elapsed,
      message: surpriseRef.current,
      completed: r.completed,
      updatedAt: Date.now(),
    })
  }
  const surpriseRef = useRef(surprise)
  surpriseRef.current = surprise

  // ---- motor kurulumu ----
  const build = async (imageDataUrl: string, pieceCount: number, seed: number) => {
    const r = refs.current
    setLoadText('Parçalar kesiliyor…')
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
    })
    r.board = board
    if (import.meta.env.DEV) {
      // dev'de konsoldan/testten erişim için
      ;(window as unknown as Record<string, unknown>).__puzzle = { game, board, refs: r }
    }
    setProg(progress(game))
    setPhase(game.pieces.length > 0 && progressDone(game) ? 'done' : 'playing')
  }

  const progressDone = (game: GameState) => progress(game) >= 1

  const afterStateChange = (completed: boolean) => {
    const r = refs.current
    if (!r.game || !r.board) return
    // birleşmelerde geçersiz kalan kilitleri temizle
    for (const g of [...r.board.lockedGroups]) {
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
  const handleMsg = (msg: Msg) => {
    const r = refs.current
    switch (msg.t) {
      case 'meta': {
        r.seed = msg.seed
        r.pieceCount = msg.pieceCount
        r.elapsed = msg.elapsed
        setElapsed(msg.elapsed)
        setSurprise(msg.message)
        r.imgChunks = []
        r.imgTotal = msg.imgChunks
        setLoadText('Fotoğraf alınıyor…')
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
            setLoadText(`Fotoğraf alınıyor… %${Math.round((got / r.imgTotal) * 100)}`)
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
        r.board?.lockedGroups.add(msg.g)
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
        r.board?.lockedGroups.add(msg.g)
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
          r.board.remoteCursor = { x: msg.x, y: msg.y, visible: true }
          r.board.invalidate()
        }
        break
      }
    }
  }

  const roomEvents = {
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
              ? 'Oda bulunamadı. Partnerinin oyun ekranı hâlâ açık mı? Oda linki yalnızca o sekme açıkken çalışır.'
              : 'Bağlantı kurulamadı. İki taraf da internete bağlıysa tekrar deneyin; bazı kurumsal/mobil ağlar doğrudan bağlantıyı engelleyebiliyor.',
          )
        }
      }
      if (status === 'connected' && config.mode === 'local') {
        // partner bağlandı: her şeyi gönder
        sendFullSync()
        setInviteOpen(false)
      }
      if (status === 'connected' && config.mode === 'guest') {
        r.lastChunkAt = Date.now()
        setLoadText('Puzzle bilgisi bekleniyor…')
      }
    },
    onMessage: handleMsg,
  }

  const sendFullSync = () => {
    const r = refs.current
    if (!r.room || !r.game || !r.imageDataUrl) return
    const chunks = chunkDataUrl(r.imageDataUrl)
    r.room.send({
      t: 'meta',
      seed: r.seed,
      pieceCount: r.pieceCount,
      message: surpriseRef.current,
      imgChunks: chunks.length,
      elapsed: r.elapsed,
    })
    chunks.forEach((data, i) => r.room!.send({ t: 'img', i, data }))
    r.room.send({ t: 'state', snap: snapshot(r.game) })
  }

  const createRoom = () => {
    const r = refs.current
    if (r.room) {
      setInviteOpen(true)
      return
    }
    r.room = Room.host(roomEvents)
    setInviteOpen(true)
  }

  const rejoin = () => {
    const r = refs.current
    if (config.mode !== 'guest' || !config.roomCode) return
    setError(null)
    r.imgChunks = []
    r.imgTotal = -1
    setLoadText('Odaya bağlanılıyor…')
    // Yeni bir Room kurmak yerine mevcut olanı sıfırla: eskisi arka planda
    // yaşamaya devam edip çakışan ikinci bir bağlantı açıyordu.
    if (r.room) r.room.retry()
    else r.room = Room.join(config.roomCode, roomEvents)
  }

  // ---- yaşam döngüsü ----
  useEffect(() => {
    const r = refs.current
    r.destroyed = false

    if (config.mode === 'local') {
      void build(config.imageDataUrl!, config.pieceCount!, config.seed!).then(() => {
        if (!r.destroyed && config.autoHost) createRoom()
      })
    } else {
      r.room = Room.join(config.roomCode!, roomEvents)
    }

    const onUnload = () => save()
    window.addEventListener('beforeunload', onUnload)

    return () => {
      r.destroyed = true
      window.removeEventListener('beforeunload', onUnload)
      save()
      r.board?.destroy()
      r.room?.close()
      r.board = null
      r.room = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // süre sayacı
  useEffect(() => {
    if (phase !== 'playing') return
    const id = setInterval(() => {
      refs.current.elapsed += 1
      setElapsed(refs.current.elapsed)
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
        setError(
          'Bağlantı kuruldu ama puzzle verisi gelmedi. Partnerinin sekmesi arka planda ' +
            'olabilir; ekranı açık tutmasını isteyip tekrar deneyin.',
        )
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
        <button onClick={onExit} title="Ana sayfa">←</button>
        <span className="stat">⏱ {formatTime(elapsed)}</span>
        <span className="stat">{Math.round(prog * 100)}%</span>
        <span className="spacer" />
        {roomStatus !== 'idle' && (
          <span
            className="stat"
            title={statusDetail ? `${STATUS_TEXT[roomStatus]} (${statusDetail})` : STATUS_TEXT[roomStatus]}
          >
            <span className="status-dot" style={{ background: STATUS_COLOR[roomStatus] }} />
            <span className="status-text">{STATUS_TEXT[roomStatus]}</span>
          </span>
        )}
        {config.mode === 'guest' && (roomStatus === 'disconnected' || roomStatus === 'error') && (
          <button onClick={rejoin}>🔄 Yeniden Bağlan</button>
        )}
        {config.mode === 'local' && (
          <button onClick={createRoom} title="Partnerini davet et">💌 Davet</button>
        )}
        <button
          onClick={() => {
            const b = refs.current.board
            if (b) {
              b.showGhost = !b.showGhost
              setGhost(b.showGhost)
              b.invalidate()
            }
          }}
          title="Izgara ipucu"
        >
          {ghost ? '👁' : '🙈'}
        </button>
        <button onClick={() => refs.current.board?.fitView()} title="Görünümü sığdır">⛶</button>
      </div>

      <canvas ref={canvasRef} className="game-canvas" />

      {phase === 'loading' && !error && (
        <div className="loading">
          <div className="spinner" />
          <div>{loadText}</div>
        </div>
      )}

      {error && (
        <div className="loading">
          <div>😔 {error}</div>
          <div className="action-row">
            {config.mode === 'guest' && (
              <button className="btn-primary" onClick={rejoin}>Tekrar Dene</button>
            )}
            <button className="btn-secondary" onClick={onExit}>Ana Sayfa</button>
          </div>
        </div>
      )}

      {inviteOpen && inviteLink && (
        <div className="game-banner">
          <b>💌 Partnerini davet et</b>
          <code>{inviteLink}</code>
          <div className="action-row">
            <button className="btn-primary" onClick={() => void copyInvite()}>
              {copied ? '✓ Kopyalandı' : 'Linki Kopyala'}
            </button>
            <button className="btn-secondary" onClick={() => setInviteOpen(false)}>
              Kapat
            </button>
          </div>
          {roomStatus === 'waiting' && (
            <small style={{ color: 'var(--muted)' }}>
              Link partnerinde açık kaldığı sürece bağlanabilir.
            </small>
          )}
        </div>
      )}

      {phase === 'done' && <Celebration surprise={surprise} elapsed={elapsed} onExit={onExit} />}
    </div>
  )
}

function Celebration({
  surprise,
  elapsed,
  onExit,
}: {
  surprise: string
  elapsed: number
  onExit: () => void
}) {
  const confetti = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 2,
        dur: 2.5 + Math.random() * 2.5,
        emoji: ['🎉', '💖', '✨', '🧩', '💫'][i % 5],
      })),
    [],
  )
  return (
    <>
      {confetti.map((c, i) => (
        <span
          key={i}
          className="confetti"
          style={{
            left: `${c.left}vw`,
            animationDelay: `${c.delay}s`,
            animationDuration: `${c.dur}s`,
          }}
        >
          {c.emoji}
        </span>
      ))}
      <div className="celebration">
        <h2>Tamamlandı! 🎉</h2>
        <div className="time">Süre: {formatTime(elapsed)}</div>
        {surprise && <div className="surprise">{surprise}</div>}
        <button className="btn-primary" onClick={onExit}>
          Ana Sayfa
        </button>
      </div>
    </>
  )
}
