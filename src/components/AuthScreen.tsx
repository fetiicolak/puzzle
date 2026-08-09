import { useState } from 'react'
import DilSecici from './DilSecici'
import { useDil } from '../dil'
import { beniHatirla, beniHatirlaAyarla, hatirlananEposta } from '../supabase/client'
import { useAuth } from '../supabase/auth'

interface Props {
  /** Girişi atlayıp misafir olarak devam et */
  onSkip: () => void
  baslik?: React.ReactNode
  altYazi?: string
  /** Atlama düğmesinin yazısı */
  atlaYazisi?: string
  /** Giriş başarılı olduğunda (davet akışında odaya geçmek için) */
  onBasarili?: () => void
  /**
   * Zaten açık bir oturum varken şifre sormadan devam etme seçeneği.
   * Verilmezse gösterilmez.
   */
  mevcutHesap?: string | null
  onMevcutlaDevam?: () => void
}

export default function AuthScreen({
  onSkip,
  baslik,
  altYazi,
  atlaYazisi = 'Misafir olarak devam et',
  onBasarili,
  mevcutHesap,
  onMevcutlaDevam,
}: Props) {
  const { signIn, signUp, sifreSifirla } = useAuth()
  const { dil, ceviri } = useDil()
  const [mod, setMod] = useState<'giris' | 'kayit' | 'sifirla'>('giris')
  // "Beni hatırla" e-postayı hatırlar; şifre her girişte istenir
  const [email, setEmail] = useState(hatirlananEposta)
  const [sifre, setSifre] = useState('')
  const [ad, setAd] = useState('')
  const [hata, setHata] = useState<string | null>(null)
  const [bilgi, setBilgi] = useState<string | null>(null)
  const [bekle, setBekle] = useState(false)
  const [hatirla, setHatirla] = useState(beniHatirla)

  const gonder = async (e: React.FormEvent) => {
    e.preventDefault()
    setHata(null)
    setBilgi(null)
    setBekle(true)
    // oturum yazılmadan önce nereye kaydedileceği belli olmalı
    beniHatirlaAyarla(hatirla)
    try {
      if (mod === 'sifirla') {
        const sonuc = await sifreSifirla(email)
        if (sonuc) setHata(sonuc)
        else {
          setBilgi(
            ceviri(
              'Sıfırlama bağlantısı e-postana gönderildi. Gelen kutunu (ve gereksiz klasörünü) kontrol et.',
            ),
          )
        }
        return
      }
      const sonuc =
        mod === 'giris' ? await signIn(email, sifre) : await signUp(email, sifre, ad)
      if (sonuc) {
        setHata(sonuc)
      } else if (mod === 'kayit') {
        setBilgi(ceviri('Hesap açıldı. Şimdi giriş yapabilirsin.'))
        setMod('giris')
      } else {
        onBasarili?.()
      }
    } finally {
      setBekle(false)
    }
  }

  return (
    <div className="screen screen-center">
      <header className="hero">
        <h1 className="title">
          {baslik ?? (
            <>
              Birlikte <span>Puzzle</span>
            </>
          )}
        </h1>
        <p className="subtitle">
          {altYazi
            ? ceviri(altYazi)
            : ceviri('Tabloların kaybolmasın, beraber çözdüklerin ikinizde de dursun.')}
        </p>
        <DilSecici />
      </header>

      {mevcutHesap && onMevcutlaDevam && (
        <button className="btn btn-secondary" onClick={onMevcutlaDevam}>
          {ceviri('{ad} olarak devam et', { ad: mevcutHesap })}
        </button>
      )}

      <div className="tabs">
        <button
          className={`tab ${mod === 'giris' ? 'active' : ''}`}
          onClick={() => {
            setMod('giris')
            setHata(null)
          }}
        >
          {ceviri('Giriş')}
        </button>
        <button
          className={`tab ${mod === 'kayit' ? 'active' : ''}`}
          onClick={() => {
            setMod('kayit')
            setHata(null)
          }}
        >
          {ceviri('Kayıt')}
        </button>
      </div>

      <form className="auth-form" onSubmit={gonder}>
        {mod === 'kayit' && (
          <input
            className="input"
            placeholder={ceviri('Adın')}
            value={ad}
            maxLength={40}
            required
            onChange={(e) => setAd(e.target.value)}
          />
        )}
        <input
          className="input"
          type="email"
          autoComplete="email"
          placeholder={ceviri('E-posta')}
          value={email}
          required
          onChange={(e) => setEmail(e.target.value)}
        />
        {mod !== 'sifirla' && (
          <input
            className="input"
            type="password"
            autoComplete={mod === 'giris' ? 'current-password' : 'new-password'}
            placeholder={ceviri('Şifre')}
            value={sifre}
            minLength={6}
            required
            onChange={(e) => setSifre(e.target.value)}
          />
        )}

        {mod === 'sifirla' && (
          <small className="muted sifirla-not">
            {ceviri(
              'E-postanı yaz, sana yeni şifre belirleyebileceğin bir bağlantı gönderelim.',
            )}
          </small>
        )}

        {mod === 'giris' && (
          <button
            type="button"
            className="baglanti-dugme"
            onClick={() => {
              setMod('sifirla')
              setHata(null)
              setBilgi(null)
            }}
          >
            {ceviri('Şifremi unuttum')}
          </button>
        )}

        {mod === 'sifirla' && (
          <button
            type="button"
            className="baglanti-dugme"
            onClick={() => {
              setMod('giris')
              setHata(null)
              setBilgi(null)
            }}
          >
            ← {ceviri('Girişe dön')}
          </button>
        )}

        <label className="checkbox" hidden={mod === 'sifirla'}>
          <input
            type="checkbox"
            checked={hatirla}
            onChange={(e) => {
              setHatirla(e.target.checked)
              beniHatirlaAyarla(e.target.checked)
            }}
          />
          <span>
            {ceviri('Beni hatırla')}
            <em className="field-hint"> {ceviri('e-postan hazır gelsin')}</em>
          </span>
        </label>

        {hata && <div className="form-error">{hata}</div>}
        {bilgi && <div className="form-info">{bilgi}</div>}

        <button className="btn btn-primary btn-lg" type="submit" disabled={bekle}>
          {bekle
            ? ceviri('Bir saniye…')
            : mod === 'giris'
              ? ceviri('Giriş yap')
              : mod === 'kayit'
                ? ceviri('Hesap aç')
                : ceviri('Sıfırlama bağlantısı gönder')}
        </button>
      </form>

      <button className="btn btn-ghost" onClick={onSkip}>
        {ceviri(atlaYazisi)}
      </button>

      {/*
        Cümle iki dilde ayrı yazılıyor: Türkçede bağlantıdan sonra ek geliyor
        ("Koşulları'nı"), İngilizcede gelmiyor. Tek şablonla ikisi de düzgün
        çıkmıyor.
      */}
      <small className="yasal-satir muted">
        {dil === 'tr' ? (
          <>
            Devam ederek{' '}
            <a href="./kosullar.html" target="_blank" rel="noreferrer">
              Kullanım Koşulları
            </a>
            'nı ve{' '}
            <a href="./gizlilik.html" target="_blank" rel="noreferrer">
              Gizlilik Politikası
            </a>
            'nı kabul etmiş olursun.
          </>
        ) : (
          <>
            By continuing you agree to the{' '}
            <a href="./terms.html" target="_blank" rel="noreferrer">
              Terms of Use
            </a>{' '}
            and the{' '}
            <a href="./privacy.html" target="_blank" rel="noreferrer">
              Privacy Policy
            </a>
            .
          </>
        )}
      </small>
    </div>
  )
}
