import { useState } from 'react'
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

  const gonder = async (e: React.FormEvent) => {
    e.preventDefault()
    setHata(null)
    setBilgi(null)
    setBekle(true)
    try {
      const sonuc =
        mod === 'giris' ? await signIn(email, sifre) : await signUp(email, sifre, ad)
      if (sonuc) {
        setHata(sonuc)
      } else if (mod === 'kayit') {
        // E-posta doğrulaması açıksa oturum hemen açılmaz
        setBilgi(
          'Kayıt alındı. E-posta doğrulaması açıksa gelen kutunu kontrol et, ' +
            'sonra giriş yap.',
        )
        setMod('giris')
      }
    } finally {
      setBekle(false)
    }
  }

  return (
    <div className="screen">
      <h1 className="title">
        Birlikte <span>Puzzle</span> 🧩
      </h1>
      <p className="subtitle">
        Giriş yaparsan çözdüğün tablolar hesabına kaydedilir ve birlikte oynadığın
        kişilerin geçmişinde de görünür.
      </p>

      <div className="chip-row">
        <button
          className={`chip ${mod === 'giris' ? 'active' : ''}`}
          onClick={() => { setMod('giris'); setHata(null) }}
        >
          Giriş Yap
        </button>
        <button
          className={`chip ${mod === 'kayit' ? 'active' : ''}`}
          onClick={() => { setMod('kayit'); setHata(null) }}
        >
          Kayıt Ol
        </button>
      </div>

      <form className="auth-form" onSubmit={gonder}>
        {mod === 'kayit' && (
          <input
            className="message-input title-input"
            placeholder="Görünecek adın"
            value={ad}
            maxLength={40}
            required
            onChange={(e) => setAd(e.target.value)}
          />
        )}
        <input
          className="message-input title-input"
          type="email"
          autoComplete="email"
          placeholder="E-posta"
          value={email}
          required
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="message-input title-input"
          type="password"
          autoComplete={mod === 'giris' ? 'current-password' : 'new-password'}
          placeholder="Şifre (en az 6 karakter)"
          value={sifre}
          minLength={6}
          required
          onChange={(e) => setSifre(e.target.value)}
        />

        {hata && <div className="form-error">⚠ {hata}</div>}
        {bilgi && <div className="form-info">✓ {bilgi}</div>}

        <button className="btn-primary" type="submit" disabled={bekle}>
          {bekle ? 'Bekle…' : mod === 'giris' ? 'Giriş Yap' : 'Kayıt Ol'}
        </button>
      </form>

      <button className="btn-secondary" onClick={onSkip}>
        Girmeden devam et
      </button>
      <small style={{ color: 'var(--muted)', textAlign: 'center', maxWidth: 380 }}>
        Girmeden oynayabilirsin; bu durumda tablolar yalnızca bu cihazda saklanır.
      </small>
    </div>
  )
}
