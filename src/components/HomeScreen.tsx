import { useRef, useState } from 'react'
import { listPuzzles, removePuzzle, toPuzzleImage, type SavedPuzzle } from '../storage'

const SAMPLES = [
  { url: 'samples/gunbatimi.svg', name: 'Gün Batımı' },
  { url: 'samples/kalpler.svg', name: 'Kalpler' },
  { url: 'samples/gece.svg', name: 'Yıldızlı Gece' },
  { url: 'samples/mozaik.svg', name: 'Mozaik' },
]

interface Props {
  onPickImage: (imageDataUrl: string) => void
  onResume: (saved: SavedPuzzle) => void
}

export default function HomeScreen({ onPickImage, onResume }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [saved, setSaved] = useState<SavedPuzzle[]>(listPuzzles)
  const [busy, setBusy] = useState(false)

  const pick = async (src: File | string) => {
    setBusy(true)
    try {
      onPickImage(await toPuzzleImage(src))
    } catch {
      alert('Görsel yüklenemedi. Başka bir dosya dener misin?')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <h1 className="title">
        Birlikte <span>Puzzle</span> 🧩
      </h1>
      <p className="subtitle">
        Bir fotoğraf seç, parça sayısını belirle ve sevdiğinle aynı puzzle'ı
        gerçek zamanlı birlikte çöz.
      </p>

      <button
        className="btn-primary"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        📷 Fotoğraf Yükle
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void pick(f)
          e.target.value = ''
        }}
      />

      <div className="section-label">Hazır Puzzle'lar</div>
      <div className="sample-grid">
        {SAMPLES.map((s) => (
          <button key={s.url} onClick={() => void pick(s.url)} title={s.name}>
            <img src={s.url} alt={s.name} />
          </button>
        ))}
      </div>

      {saved.length > 0 && (
        <>
          <div className="section-label">Devam Et</div>
          <div className="resume-list">
            {saved.map((p) => (
              <div key={p.id} className="resume-card" role="button" onClick={() => onResume(p)}>
                <img src={p.imageDataUrl} alt="" />
                <div className="info">
                  <b>
                    {p.pieceCount} parça {p.completed ? '· tamamlandı 🎉' : ''}
                  </b>
                  <small>{new Date(p.updatedAt).toLocaleString('tr-TR')}</small>
                </div>
                <button
                  className="del"
                  title="Sil"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm('Bu kayıt silinsin mi?')) {
                      removePuzzle(p.id)
                      setSaved(listPuzzles())
                    }
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
