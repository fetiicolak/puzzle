import { useState } from 'react'
import { beniHatirla, beniHatirlaAyarla } from '../supabase/client'
import { useAuth } from '../supabase/auth'

interface Props {
  /** Girişi atlayıp misafir olarak devam et */
  onSkip: () => void
}

export default function AuthScreen({ onSkip }: Props) {
  const { signIn, signUp } = useAuth()
  const [mod, setMod] = useState<'giris' | 'kayit'>('giris')
  const [email, setEmail] = useState('')
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
      const sonuc =
        mod === 'giris' ? await signIn(email, sifre) : await signUp(email, sifre, ad)
      if (sonuc) {
        setHata(sonuc)
      } else if (mod === 'kayit') {
        setBilgi('Hesap açıldı. Şimdi giriş yapabilirsin.')
        setMod('giris')
      }
    } finally {
      setBekle(false)
    }
  }

  return (
    <div className="screen screen-center">
      <header className="hero">
        <h1 className="title">
          Birlikte <span>Puzzle</span>
        </h1>
        <p className="subtitle">Tabloların kaybolmasın, beraber çözdüklerin ikinizde de dursun.</p>
      </header>

      <div className="tabs">
        <button
          className={`tab ${mod === 'giris' ? 'active' : ''}`}
          onClick={() => {
            setMod('giris')
            setHata(null)
          }}
        >
          Giriş
        </button>
        <button
          className={`tab ${mod === 'kayit' ? 'active' : ''}`}
          onClick={() => {
            setMod('kayit')
            setHata(null)
          }}
        >
          Kayıt
        </button>
      </div>

      <form className="auth-form" onSubmit={gonder}>
        {mod === 'kayit' && (
          <input
            className="input"
            placeholder="Adın"
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
          placeholder="E-posta"
          value={email}
          required
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="input"
          type="password"
          autoComplete={mod === 'giris' ? 'current-password' : 'new-password'}
          placeholder="Şifre"
          value={sifre}
          minLength={6}
          required
          onChange={(e) => setSifre(e.target.value)}
        />

        <label className="checkbox">
          <input
            type="checkbox"
            checked={hatirla}
            onChange={(e) => {
              setHatirla(e.target.checked)
              beniHatirlaAyarla(e.target.checked)
            }}
          />
          <span>Beni hatırla</span>
        </label>

        {hata && <div className="form-error">{hata}</div>}
        {bilgi && <div className="form-info">{bilgi}</div>}

        <button className="btn btn-primary btn-lg" type="submit" disabled={bekle}>
          {bekle ? 'Bir saniye…' : mod === 'giris' ? 'Giriş yap' : 'Hesap aç'}
        </button>
      </form>

      <button className="btn btn-ghost" onClick={onSkip}>
        Misafir olarak devam et
      </button>
    </div>
  )
}
