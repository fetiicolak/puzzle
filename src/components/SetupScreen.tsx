import { useEffect, useState } from 'react'
import { computeGrid } from '../engine/cutter'
import { loadImage, nextUntitledName } from '../storage'

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
  const [olculer, setOlculer] = useState<{ w: number; h: number } | null>(null)

  // Seçilen sayı yaklaşıktır: ızgara, hücreler kareye yakın olacak şekilde
  // kurulur. Gerçekte kaç parça çıkacağını göstermek daha dürüst.
  useEffect(() => {
    let iptal = false
    loadImage(imageDataUrl)
      .then((img) => {
        if (!iptal) setOlculer({ w: img.naturalWidth, h: img.naturalHeight })
      })
      .catch(() => {})
    return () => {
      iptal = true
    }
  }, [imageDataUrl])

  const izgara = olculer ? computeGrid(olculer.w, olculer.h, pieces) : null
  const gercekSayi = izgara ? izgara.rows * izgara.cols : pieces

  const start = (withPartner: boolean) =>
    onStart({
      title: title.trim() || nextUntitledName(),
      pieceCount: pieces,
      message,
      withPartner,
      maxPlayers,
    })

  return (
    <div className="screen">
      <h1 className="title">Hazırlık</h1>

      <div className="setup-preview-wrap">
        <img className="setup-preview" src={imageDataUrl} alt="Seçtiğin görsel" />
      </div>

      <label className="field">
        <span className="field-label">Adı</span>
        <input
          className="input"
          placeholder={nextUntitledName()}
          value={title}
          maxLength={60}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      <div className="field">
        <span className="field-label">
          Kaç parça
          {izgara && (
            <em className="field-hint">
              {gercekSayi} parça · {izgara.cols}×{izgara.rows}
            </em>
          )}
        </span>
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
      </div>

      <div className="field">
        <span className="field-label">
          Kaç kişi
          <em className="field-hint">
            {maxPlayers === 2 ? 'ikiniz' : `sen + ${maxPlayers - 1} kişi`}
          </em>
        </span>
        <div className="chip-row">
          {PLAYER_OPTIONS.map((n) => (
            <button
              key={n}
              className={`chip ${n === maxPlayers ? 'active' : ''}`}
              onClick={() => setMaxPlayers(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span className="field-label">
          Gizli not <em className="field-hint">isteğe bağlı</em>
        </span>
        <textarea
          className="input textarea"
          placeholder="Bitince görsün diye bir şeyler yaz…"
          value={message}
          maxLength={500}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>

      <div className="action-row">
        <button className="btn btn-ghost" onClick={onBack}>
          Geri
        </button>
        <button className="btn btn-secondary" onClick={() => start(false)}>
          Tek başıma
        </button>
        <button className="btn btn-primary" onClick={() => start(true)}>
          Birlikte oyna
        </button>
      </div>
    </div>
  )
}
