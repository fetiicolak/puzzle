import { useState } from 'react'
import { misafirAdi, misafirAdiKaydet } from '../storage'
import { useAuth } from '../supabase/auth'

interface Props {
  /** Davet edilen oda kodu — kullanıcıya gösterilir */
  roomCode: string
  onGiris: () => void
  onMisafir: () => void
}

/**
 * Davet linkiyle gelen kişiye sorulan ekran. Doğrudan odaya atmak yerine
 * seçim sunuyoruz: giriş yaparsa çözdüğünüz tablo onun geçmişine de düşer.
 */
export default function JoinChoiceScreen({ roomCode, onGiris, onMisafir }: Props) {
  const auth = useAuth()
  const [ad, setAd] = useState(misafirAdi)

  const misafirDevam = () => {
    misafirAdiKaydet(ad)
    onMisafir()
  }

  return (
    <div className="screen screen-center">
      <header className="hero">
        <h1 className="title">
          Puzzle <span>daveti</span>
        </h1>
        <p className="subtitle">
          Biri seni birlikte puzzle çözmeye çağırdı. Nasıl devam etmek istersin?
        </p>
        <code className="oda-kodu">oda: {roomCode}</code>
      </header>

      <div className="join-secenekler">
        <button className="join-kart" onClick={onGiris}>
          <b>Hesabımla gireyim</b>
          <small>
            Çözdüğünüz tablo geçmişine kaydedilir, sonra kaldığın yerden devam
            edebilirsin. Arkadaş ekleyebilirsin.
          </small>
        </button>

        <div className="join-kart sade misafir-kart">
          <b>Misafir olarak devam et</b>
          <small>Hemen oyuna girersin. Tablo kaydedilmez, geçmişinde görünmez.</small>
          {/* Odadakiler listesinde "Misafir" yerine kendi adı görünsün */}
          <label className="field misafir-ad">
            <span className="field-label">
              Sana ne diyelim? <em className="field-hint">isteğe bağlı</em>
            </span>
            <input
              className="input"
              placeholder="Adın"
              value={ad}
              maxLength={24}
              onChange={(e) => setAd(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') misafirDevam()
              }}
            />
          </label>
          <button className="btn btn-secondary" onClick={misafirDevam}>
            Misafir olarak gir
          </button>
        </div>
      </div>

      {auth.user && (
        <small className="muted">
          Bu cihazda <b>{auth.displayName}</b> olarak girişlisin. "Hesabımla gireyim"
          seçersen istersen o hesapla devam eder, istersen başka bir hesapla girersin.
        </small>
      )}
    </div>
  )
}
