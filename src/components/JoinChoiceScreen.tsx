import { useState } from 'react'
import { useDil } from '../dil'
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
  const { ceviri } = useDil()
  const [ad, setAd] = useState(misafirAdi)

  const misafirDevam = () => {
    misafirAdiKaydet(ad)
    onMisafir()
  }

  return (
    <div className="screen screen-center">
      <header className="hero">
        <h1 className="title">
          {ceviri('Puzzle')} <span>{ceviri('daveti')}</span>
        </h1>
        <p className="subtitle">
          {ceviri('Biri seni birlikte puzzle çözmeye çağırdı. Nasıl devam etmek istersin?')}
        </p>
        <code className="oda-kodu">
          {ceviri('oda')}: {roomCode}
        </code>
      </header>

      <div className="join-secenekler">
        <button className="join-kart" onClick={onGiris}>
          <b>{ceviri('Hesabımla gireyim')}</b>
          <small>
            {ceviri(
              'Çözdüğünüz tablo geçmişine kaydedilir, sonra kaldığın yerden devam edebilirsin. Arkadaş ekleyebilirsin. Seni çağıran kişi çevrimdışıyken de girip tek başına ilerleyebilirsin.',
            )}
          </small>
        </button>

        <div className="join-kart sade misafir-kart">
          <b>{ceviri('Misafir olarak devam et')}</b>
          <small>
            {ceviri(
              'Hemen oyuna girersin. Tablo kaydedilmez, geçmişinde görünmez. Bu yolda seni çağıran kişinin sayfası açık olmalı — puzzle ondan geliyor.',
            )}
          </small>
          {/* Odadakiler listesinde "Misafir" yerine kendi adı görünsün */}
          <label className="field misafir-ad">
            <span className="field-label">
              {ceviri('Sana ne diyelim?')}{' '}
              <em className="field-hint">{ceviri('isteğe bağlı')}</em>
            </span>
            <input
              className="input"
              placeholder={ceviri('Adın')}
              value={ad}
              maxLength={24}
              onChange={(e) => setAd(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') misafirDevam()
              }}
            />
          </label>
          <button className="btn btn-secondary" onClick={misafirDevam}>
            {ceviri('Misafir olarak gir')}
          </button>
        </div>
      </div>

      {auth.user && (
        <small className="muted">
          {ceviri('Bu cihazda {ad} olarak girişlisin.', { ad: auth.displayName })}{' '}
          {ceviri(
            '"Hesabımla gireyim" seçersen istersen o hesapla devam eder, istersen başka bir hesapla girersin.',
          )}
        </small>
      )}
    </div>
  )
}
