import { useState } from 'react'
import { nextUntitledName } from '../storage'

const PIECE_OPTIONS = [24, 48, 100, 200, 300, 500]
const PLAYER_OPTIONS = [2, 3, 4, 6, 8]

export interface StartOptions {
  title: string
  pieceCount: number
  message: string
  withPartner: boolean
  maxPlayers: number
}

interface Props {
  imageDataUrl: string
  /** Hazır eser seçildiyse adı gelir, kendi fotoğrafında boştur */
  defaultTitle: string
  onStart: (opts: StartOptions) => void
  onBack: () => void
}

export default function SetupScreen({ imageDataUrl, defaultTitle, onStart, onBack }: Props) {
  const [title, setTitle] = useState(defaultTitle)
  const [pieces, setPieces] = useState(100)
  const [message, setMessage] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(2)

  const start = (withPartner: boolean) =>
    onStart({
      // isim verilmediyse "İsimsiz N" atanır
      title: title.trim() || nextUntitledName(),
      pieceCount: pieces,
      message,
      withPartner,
      maxPlayers,
    })

  return (
    <div className="screen">
      <h1 className="title">Puzzle'ını Ayarla</h1>
      <img className="setup-preview" src={imageDataUrl} alt="Seçilen görsel" />

      <div className="section-label">Puzzle Adı</div>
      <input
        className="message-input title-input"
        placeholder={nextUntitledName()}
        value={title}
        maxLength={60}
        onChange={(e) => setTitle(e.target.value)}
      />

      <div className="section-label">Parça Sayısı</div>
      <div className="chip-row">
        {PIECE_OPTIONS.map((n) => (
          <button
            key={n}
            className={`chip ${n === pieces ? 'active' : ''}`}
            onClick={() => setPieces(n)}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="section-label">Kaç Kişi Oynayacak</div>
      <div className="chip-row">
        {PLAYER_OPTIONS.map((n) => (
          <button
            key={n}
            className={`chip ${n === maxPlayers ? 'active' : ''}`}
            onClick={() => setMaxPlayers(n)}
          >
            {n} kişi
          </button>
        ))}
      </div>
      <small style={{ color: 'var(--muted)', marginTop: -12 }}>
        Sen dahil toplam kişi sayısı. Davet linkiyle {maxPlayers - 1} kişi katılabilir.
      </small>

      <div className="section-label">Sürpriz Mesaj (isteğe bağlı)</div>
      <textarea
        className="message-input"
        placeholder="Puzzle tamamlanınca açılacak bir not bırak… 💌"
        value={message}
        maxLength={500}
        onChange={(e) => setMessage(e.target.value)}
      />

      <div className="action-row">
        <button className="btn-secondary" onClick={onBack}>
          ← Geri
        </button>
        <button className="btn-secondary" onClick={() => start(false)}>
          🧩 Tek Başına Oyna
        </button>
        <button className="btn-primary" onClick={() => start(true)}>
          💕 Birlikte Oyna
        </button>
      </div>
    </div>
  )
}
