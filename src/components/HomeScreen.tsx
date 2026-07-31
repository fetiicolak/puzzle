import { useEffect, useRef, useState } from 'react'
import { SAMPLES, sampleThumbUrl, sampleUrl, type Sample } from '../samples'
import { listPuzzles, removePuzzle, toPuzzleImage, type SavedPuzzle } from '../storage'
import { useAuth } from '../supabase/auth'
import { listRemotePuzzles, type RemotePuzzle } from '../supabase/puzzles'

interface Props {
  /** title: hazır eser seçildiyse adı, kendi fotoğrafında boş */
  onPickImage: (imageDataUrl: string, title: string) => void
  onResume: (saved: SavedPuzzle) => void
  onResumeRemote: (p: RemotePuzzle) => void
  /** Misafir olarak devam edilmişken giriş ekranına dön */
  onSignIn: () => void
}

export default function HomeScreen({ onPickImage, onResume, onResumeRemote, onSignIn }: Props) {
  const auth = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [saved, setSaved] = useState<SavedPuzzle[]>(listPuzzles)
  const [busy, setBusy] = useState(false)

  // Liste render sırasında okunuyor; oyundan çıkarken yazılan son kayıt bundan
  // sonra düşüyor. Bağlandıktan sonra bir kez daha oku, yoksa hemen "devam et"
  // denince son saniyeler/hamleler eksik geliyordu.
  useEffect(() => {
    setSaved(listPuzzles())
  }, [])
  const [uzak, setUzak] = useState<RemotePuzzle[]>([])
  const [uzakYukleniyor, setUzakYukleniyor] = useState(false)

  // giriş yapılmışsa ortak tabloları getir
  useEffect(() => {
    if (!auth.user) {
      setUzak([])
      return
    }
    let iptal = false
    setUzakYukleniyor(true)
    listRemotePuzzles()
      .then((liste) => {
        if (!iptal) setUzak(liste)
      })
      .finally(() => {
        if (!iptal) setUzakYukleniyor(false)
      })
    return () => {
      iptal = true
    }
  }, [auth.user])

  // Sunucuya kaydedilmiş bir puzzle hem "Tablolarım"da hem "Bu Cihazda"
  // görünmesin; yerel kayıt kimliği oda koduyla aynı olduğu için eşleşiyor.
  const uzakKodlar = new Set(uzak.map((p) => p.room_code))
  const yalnizcaYerel = saved.filter((p) => !uzakKodlar.has(p.id))

  const pick = async (src: File | Sample) => {
    setBusy(true)
    try {
      const isSample = !(src instanceof File)
      const url = isSample ? sampleUrl(src) : src
      onPickImage(await toPuzzleImage(url), isSample ? src.title : '')
    } catch {
      alert('Görsel yüklenemedi. Başka bir dosya dener misin?')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      {auth.enabled && (
        <div className="account-bar">
          {auth.user ? (
            <>
              <span>
                Merhaba, <b>{auth.displayName}</b>
              </span>
              <span className="spacer" />
              <button onClick={() => void auth.signOut()}>Çıkış</button>
            </>
          ) : (
            <>
              <span>Misafir olarak geziyorsun</span>
              <span className="spacer" />
              <button onClick={onSignIn}>Giriş Yap</button>
            </>
          )}
        </div>
      )}

      <h1 className="title">
        Birlikte <span>Puzzle</span> 🧩
      </h1>
      <p className="subtitle">
        Bir fotoğraf seç, parça sayısını belirle ve sevdiklerinle aynı puzzle'ı
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
          <button
            key={s.file}
            onClick={() => void pick(s)}
            disabled={busy}
            title={s.artist ? `${s.title} — ${s.artist}` : s.title}
          >
            <img src={sampleThumbUrl(s)} alt={s.title} />
            <span className="sample-caption">
              <b>{s.title}</b>
              {s.artist && (
                <small>
                  {s.artist}
                  {s.year ? `, ${s.year}` : ''}
                </small>
              )}
            </span>
          </button>
        ))}
      </div>

      {auth.user && (uzak.length > 0 || uzakYukleniyor) && (
        <>
          <div className="section-label">Tablolarım</div>
          {uzakYukleniyor && uzak.length === 0 ? (
            <small style={{ color: 'var(--muted)' }}>Yükleniyor…</small>
          ) : (
            <div className="resume-list">
              {uzak.map((p) => (
                <div
                  key={p.id}
                  className="resume-card"
                  role="button"
                  onClick={() => onResumeRemote(p)}
                >
                  <div className="info">
                    <b>{p.title || 'İsimsiz'}</b>
                    <small>
                      {p.piece_count} parça {p.completed ? '· tamamlandı 🎉' : ''} ·{' '}
                      {new Date(p.updated_at).toLocaleDateString('tr-TR')}
                      {p.owner !== auth.user?.id ? ' · birlikte oynandı' : ''}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {yalnizcaYerel.length > 0 && (
        <>
          <div className="section-label">Bu Cihazda</div>
          <div className="resume-list">
            {yalnizcaYerel.map((p) => (
              <div key={p.id} className="resume-card" role="button" onClick={() => onResume(p)}>
                <img src={p.imageDataUrl} alt="" />
                <div className="info">
                  <b>{p.title || 'İsimsiz'}</b>
                  <small>
                    {p.pieceCount} parça {p.completed ? '· tamamlandı 🎉' : ''} ·{' '}
                    {new Date(p.updatedAt).toLocaleDateString('tr-TR')}
                  </small>
                </div>
                <button
                  className="del"
                  title="Sil"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`"${p.title || 'İsimsiz'}" kaydı silinsin mi?`)) {
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
