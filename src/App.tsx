import { useState } from 'react'
import AuthScreen from './components/AuthScreen'
import GameScreen, { type GameConfig } from './components/GameScreen'
import HomeScreen from './components/HomeScreen'
import SetupScreen from './components/SetupScreen'
import { newPuzzleId, type SavedPuzzle } from './storage'
import { useAuth } from './supabase/auth'

type Screen =
  | { s: 'home' }
  | { s: 'setup'; imageDataUrl: string; defaultTitle: string }
  | { s: 'game'; config: GameConfig }

function initialScreen(): Screen {
  // davet linki ile mi açıldı? (#room=abc123)
  const m = location.hash.match(/room=([a-z0-9]+)/)
  if (m) {
    return {
      s: 'game',
      config: { puzzleId: `oda-${m[1]}`, mode: 'guest', roomCode: m[1] },
    }
  }
  return { s: 'home' }
}

export default function App() {
  const auth = useAuth()
  const [screen, setScreen] = useState<Screen>(initialScreen)
  // Davet linkiyle gelen kişiyi giriş duvarına takma: oyun hemen açılsın.
  // (Girişi ana ekrandaki "Giriş Yap" ile yapabilir; tablo o zaman geçmişine düşer.)
  const [misafirDevam, setMisafirDevam] = useState(() => initialScreen().s === 'game')

  const goHome = () => {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search)
    setScreen({ s: 'home' })
  }

  if (auth.enabled && auth.loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <div>Oturum kontrol ediliyor…</div>
      </div>
    )
  }

  if (auth.enabled && !auth.user && !misafirDevam) {
    return <AuthScreen onSkip={() => setMisafirDevam(true)} />
  }

  switch (screen.s) {
    case 'home':
      return (
        <HomeScreen
          onPickImage={(imageDataUrl, defaultTitle) =>
            setScreen({ s: 'setup', imageDataUrl, defaultTitle })
          }
          onResume={(saved: SavedPuzzle) =>
            setScreen({
              s: 'game',
              config: {
                puzzleId: saved.id,
                mode: 'local',
                title: saved.title,
                imageDataUrl: saved.imageDataUrl,
                seed: saved.seed,
                pieceCount: saved.pieceCount,
                message: saved.message,
                elapsed: saved.elapsed,
                snap: saved.snap,
              },
            })
          }
          onResumeRemote={(p) =>
            setScreen({
              s: 'game',
              config: {
                puzzleId: `uzak-${p.id}`,
                mode: 'remote',
                remoteId: p.id,
                roomCode: p.room_code,
                title: p.title,
                imagePath: p.image_path,
                seed: p.seed,
                pieceCount: p.piece_count,
                message: p.message,
                maxPlayers: p.max_players,
                elapsed: p.elapsed,
                snap: p.state,
              },
            })
          }
          onSignIn={() => setMisafirDevam(false)}
        />
      )
    case 'setup':
      return (
        <SetupScreen
          imageDataUrl={screen.imageDataUrl}
          defaultTitle={screen.defaultTitle}
          onBack={goHome}
          onStart={(opts) =>
            setScreen({
              s: 'game',
              config: {
                puzzleId: newPuzzleId(),
                mode: 'local',
                autoHost: opts.withPartner,
                title: opts.title,
                imageDataUrl: screen.imageDataUrl,
                seed: (Math.random() * 0xffffffff) >>> 0,
                pieceCount: opts.pieceCount,
                message: opts.message,
                maxPlayers: opts.maxPlayers,
                elapsed: 0,
                snap: null,
              },
            })
          }
        />
      )
    case 'game':
      return <GameScreen key={screen.config.puzzleId} config={screen.config} onExit={goHome} />
  }
}
