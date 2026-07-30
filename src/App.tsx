import { useState } from 'react'
import GameScreen, { type GameConfig } from './components/GameScreen'
import HomeScreen from './components/HomeScreen'
import SetupScreen from './components/SetupScreen'
import { newPuzzleId, type SavedPuzzle } from './storage'

type Screen =
  | { s: 'home' }
  | { s: 'setup'; imageDataUrl: string }
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
  const [screen, setScreen] = useState<Screen>(initialScreen)

  const goHome = () => {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search)
    setScreen({ s: 'home' })
  }

  switch (screen.s) {
    case 'home':
      return (
        <HomeScreen
          onPickImage={(imageDataUrl) => setScreen({ s: 'setup', imageDataUrl })}
          onResume={(saved: SavedPuzzle) =>
            setScreen({
              s: 'game',
              config: {
                puzzleId: saved.id,
                mode: 'local',
                imageDataUrl: saved.imageDataUrl,
                seed: saved.seed,
                pieceCount: saved.pieceCount,
                message: saved.message,
                elapsed: saved.elapsed,
                snap: saved.snap,
              },
            })
          }
        />
      )
    case 'setup':
      return (
        <SetupScreen
          imageDataUrl={screen.imageDataUrl}
          onBack={goHome}
          onStart={(pieceCount, message, withPartner) =>
            setScreen({
              s: 'game',
              config: {
                puzzleId: newPuzzleId(),
                mode: 'local',
                autoHost: withPartner,
                imageDataUrl: screen.imageDataUrl,
                seed: (Math.random() * 0xffffffff) >>> 0,
                pieceCount,
                message,
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
