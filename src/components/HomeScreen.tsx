import { useEffect, useRef, useState } from 'react'
import FriendsSection from './FriendsSection'
import { SAMPLES, sampleThumbUrl, sampleUrl, type Sample } from '../samples'
import { listPuzzles, removePuzzle, toPuzzleImage, type SavedPuzzle } from '../storage'
import { useAuth } from '../supabase/auth'
import {
  deleteRemotePuzzle,
  listRemotePuzzles,
  puzzleImageUrl,
  type RemotePuzzle,
} from '../supabase/puzzles'

interface Props {
  /** title: hazır eser seçildiyse adı, kendi fotoğrafında boş */
  onPickImage: (imageDataUrl: string, title: string) => void
  onResume: (saved: SavedPuzzle) => void
  onResumeRemote: (p: RemotePuzzle) => void
  /** Misafir olarak devam edilmişken giriş ekranına dön */
  onSignIn: () => void
}

function tarih(s: string | number): string {
  const d = new Date(s)
  const fark = (Date.now() - d.getTime()) / 86400000
  if (fark < 1) return 'bugün'
  if (fark < 2) return 'dün'
  if (fark < 7) return `${Math.floor(fark)} gün önce`
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })
}

export default function HomeScreen({ onPickImage, onResume, onResumeRemote, onSignIn }: Props) {
  const auth = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [saved, setSaved] = useState<SavedPuzzle[]>(listPuzzles)
  const [busy, setBusy] = useState(false)
  const [uzak, setUzak] = useState<RemotePuzzle[]>([])
  const [uzakYukleniyor, setUzakYukleniyor] = useState(false)
  const [kapaklar, setKapaklar] = useState<Record<string, string>>({})
  const [siliniyor, setSiliniyor] = useState<string | null>(null)

  // Liste render sırasında okunuyor; oyundan çıkarken yazılan son kayıt bundan
  // sonra düşüyor. Bağlandıktan sonra bir kez daha oku.
  useEffect(() => {
    setSaved(listPuzzles())
  }, [])

  useEffect(() => {
    if (!auth.user) {
      setUzak([])
      return
    }
    let iptal = false
    setUzakYukleniyor(true)
    listRemotePuzzles()
      .then(async (liste) => {
        if (iptal) return
        setUzak(liste)
        // kapak görsellerini getir
        const girisler = await Promise.all(
          liste.map(async (p) => [p.id, await puzzleImageUrl(p.image_path)] as const),
        )
        if (!iptal) {
          setKapaklar(Object.fromEntries(girisler.filter(([, u]) => u) as [string, string][]))
        }
      })
      .finally(() => {
        if (!iptal) setUzakYukleniyor(false)
      })
    return () => {
      iptal = true
    }
  }, [auth.user])

  // Sunucuya kaydedilmiş bir puzzle hem "Tablolarım"da hem "Bu cihazda"
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
      alert('Bu görsel açılamadı, başka bir tane dene.')
    } finally {
      setBusy(false)
    }
  }

  // Önce sunucudan sil, sonra listeden çıkar. Tersi olursa silinmemiş bir
  // kayıt silinmiş gibi görünüp sayfa yenilenince geri geliyor.
  const uzakSil = async (p: RemotePuzzle) => {
    if (!confirm(`"${p.title || 'İsimsiz'}" silinsin mi?`)) return
    setSiliniyor(p.id)
    try {
      await deleteRemotePuzzle(p.id, p.image_path)
      setUzak((l) => l.filter((x) => x.id !== p.id))
      // yerel kopyayı da at, yoksa tekilleştirme kalkınca listede geri belirir
      removePuzzle(p.room_code)
      setSaved(listPuzzles())
    } catch {
      alert('Silinemedi. Bağlantını kontrol edip tekrar dene.')
    } finally {
      setSiliniyor(null)
    }
  }

  return (
    <div className="screen">
      {auth.enabled && (
        <div className="account-bar">
          {auth.user ? (
            <>
              <span className="avatar">{(auth.displayName[0] ?? '?').toUpperCase()}</span>
              <span>{auth.displayName}</span>
              <span className="spacer" />
              <button className="btn btn-ghost btn-sm" onClick={() => void auth.signOut()}>
                Çıkış
              </button>
            </>
          ) : (
            <>
              <span className="muted">Misafirsin</span>
              <span className="spacer" />
              <button className="btn btn-ghost btn-sm" onClick={onSignIn}>
                Giriş yap
              </button>
            </>
          )}
        </div>
      )}

      <header className="hero">
        <h1 className="title">
          Birlikte <span>Puzzle</span>
        </h1>
        <p className="subtitle">Fotoğrafını seç, linki gönder, aynı puzzle'ı beraber çözün.</p>
      </header>

      <button className="btn btn-primary btn-lg" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? 'Hazırlanıyor…' : 'Fotoğraf yükle'}
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

      {auth.user && <FriendsSection />}

      {auth.user && (uzak.length > 0 || uzakYukleniyor) && (
        <section className="block">
          <h2 className="section-label">Tablolarım</h2>
          {uzakYukleniyor && uzak.length === 0 ? (
            <div className="skeleton-list">
              <div className="skeleton" />
              <div className="skeleton" />
            </div>
          ) : (
            <div className="resume-list">
              {uzak.map((p) => (
                <article key={p.id} className="resume-card" onClick={() => onResumeRemote(p)}>
                  {kapaklar[p.id] ? (
                    <img src={kapaklar[p.id]} alt="" />
                  ) : (
                    <div className="cover-fallback" />
                  )}
                  <div className="info">
                    <b>{p.title || 'İsimsiz'}</b>
                    <small>
                      {p.completed ? 'bitti · ' : ''}
                      {p.piece_count} parça · {tarih(p.updated_at)}
                      {p.owner !== auth.user?.id ? ' · beraber' : ''}
                    </small>
                  </div>
                  <button
                    className="del"
                    title="Sil"
                    disabled={siliniyor === p.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      void uzakSil(p)
                    }}
                  >
                    {siliniyor === p.id ? '…' : '✕'}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {yalnizcaYerel.length > 0 && (
        <section className="block">
          <h2 className="section-label">
            Bu cihazda
            {auth.enabled && !auth.user && <em className="field-hint">giriş yaparsan kaybolmaz</em>}
          </h2>
          <div className="resume-list">
            {yalnizcaYerel.map((p) => (
              <article key={p.id} className="resume-card" onClick={() => onResume(p)}>
                <img src={p.imageDataUrl} alt="" />
                <div className="info">
                  <b>{p.title || 'İsimsiz'}</b>
                  <small>
                    {p.completed ? 'bitti · ' : ''}
                    {p.pieceCount} parça · {tarih(p.updatedAt)}
                  </small>
                </div>
                <button
                  className="del"
                  title="Sil"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`"${p.title || 'İsimsiz'}" silinsin mi?`)) {
                      removePuzzle(p.id)
                      setSaved(listPuzzles())
                    }
                  }}
                >
                  ✕
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="block">
        <h2 className="section-label">Hazır olanlar</h2>
        <div className="sample-grid">
          {SAMPLES.map((s) => (
            <button
              key={s.file}
              className="sample"
              onClick={() => void pick(s)}
              disabled={busy}
              title={s.artist ? `${s.title} — ${s.artist}` : s.title}
            >
              <img src={sampleThumbUrl(s)} alt={s.title} />
              <span className="sample-caption">
                <b>{s.title}</b>
                {s.artist && <small>{s.artist}</small>}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
