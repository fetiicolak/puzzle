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
  /** Parçalar rastgele açıyla başlasın */
  rotation: boolean
  /** Belirtilirse puzzle bu tarihe kadar kilitli kalır (ISO) */
  unlockAt: string | null
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
  const [rotation, setRotation] = useState(false)
  const [ozelGun, setOzelGun] = useState(false)
  const [tarih, setTarih] = useState('')
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

  // Özel gün seçiliyken tarih doğrulaması: boş ya da geçmiş bir tarihle
  // başlanırsa puzzle ya hiç kilitlenmiyor ya da anında açılmış oluyordu.
  const tarihMs = tarih ? new Date(tarih).getTime() : NaN
  const tarihGecerli = Number.isFinite(tarihMs) && tarihMs > Date.now() + 30_000
  const tarihHatasi = !ozelGun
    ? null
    : !tarih
      ? 'Açılacağı tarihi ve saati seç.'
      : !Number.isFinite(tarihMs)
        ? 'Bu tarih okunamadı, yeniden seç.'
        : !tarihGecerli
          ? 'Tarih ileride bir zaman olmalı.'
          : null

  const start = (withPartner: boolean) => {
    if (ozelGun && !tarihGecerli) return
    onStart({
      title: title.trim() || nextUntitledName(),
      pieceCount: pieces,
      message,
      withPartner,
      maxPlayers,
      rotation,
      unlockAt: ozelGun ? new Date(tarihMs).toISOString() : null,
    })
  }

  /** datetime-local en az bir dakika sonrasını kabul etsin */
  const enErken = new Date(Date.now() + 60_000 - new Date().getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)

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

      <div className="field">
        <span className="field-label">Zorluk</span>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={rotation}
            onChange={(e) => setRotation(e.target.checked)}
          />
          <span>
            Parçalar çevrilmiş gelsin
            <em className="field-hint"> çift tıkla döndürürsün</em>
          </span>
        </label>
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

      <div className="field">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={ozelGun}
            onChange={(e) => setOzelGun(e.target.checked)}
          />
          <span>
            Özel gün için sakla
            <em className="field-hint"> o tarihe kadar kilitli kalır</em>
          </span>
        </label>
        {ozelGun && (
          <label className="field ozel-gun-alan">
            <span className="field-label">
              Açılacağı tarih ve saat
              {tarihGecerli && (
                <em className="field-hint">
                  {new Date(tarihMs).toLocaleString('tr-TR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </em>
              )}
            </span>
            <input
              className="input input-tarih"
              type="datetime-local"
              value={tarih}
              min={enErken}
              required
              onChange={(e) => setTarih(e.target.value)}
            />
            {tarihHatasi && <small className="form-error">{tarihHatasi}</small>}
          </label>
        )}
      </div>

      <div className="action-row">
        <button className="btn btn-ghost" onClick={onBack}>
          Geri
        </button>
        <button
          className="btn btn-secondary"
          disabled={!!tarihHatasi}
          onClick={() => start(false)}
        >
          Tek başıma
        </button>
        <button
          className="btn btn-primary"
          disabled={!!tarihHatasi}
          onClick={() => start(true)}
        >
          {ozelGun ? 'Sakla' : 'Birlikte oyna'}
        </button>
      </div>
    </div>
  )
}
