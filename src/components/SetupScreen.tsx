import { useState } from 'react'

const PIECE_OPTIONS = [24, 48, 100, 200, 300, 500]

interface Props {
  imageDataUrl: string
  onStart: (pieceCount: number, message: string, withPartner: boolean) => void
  onBack: () => void
}

export default function SetupScreen({ imageDataUrl, onStart, onBack }: Props) {
  const [pieces, setPieces] = useState(100)
  const [message, setMessage] = useState('')

  return (
    <div className="screen">
      <h1 className="title">Puzzle'ını Ayarla</h1>
      <img className="setup-preview" src={imageDataUrl} alt="Seçilen görsel" />

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
        <button className="btn-secondary" onClick={() => onStart(pieces, message, false)}>
          🧩 Tek Başına Oyna
        </button>
        <button className="btn-primary" onClick={() => onStart(pieces, message, true)}>
          💕 Partnerinle Oyna
        </button>
      </div>
    </div>
  )
}
