import { useState } from 'react'
import { useAuth } from '../supabase/auth'

interface Props {
  /** Şifre değiştirildikten sonra uygulamaya devam */
  onBitti: () => void
  /** Vazgeçip normal girişe dön */
  onVazgec: () => void
}

/**
 * E-postadaki sıfırlama bağlantısına tıklayınca açılan ekran.
 *
 * Buraya gelindiğinde Supabase oturumu kurtarma jetonuyla zaten açılmış
 * oluyor (bkz. App.tsx), yani eski şifreyi sormaya gerek yok.
 */
export default function NewPasswordScreen({ onBitti, onVazgec }: Props) {
  const { sifreyiDegistir } = useAuth()
  const [sifre, setSifre] = useState('')
  const [tekrar, setTekrar] = useState('')
  const [hata, setHata] = useState<string | null>(null)
  const [bekle, setBekle] = useState(false)

  const uyusmuyor = tekrar.length > 0 && sifre !== tekrar
  const gecerli = sifre.length >= 6 && sifre === tekrar

  const gonder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!gecerli) return
    setHata(null)
    setBekle(true)
    try {
      const sonuc = await sifreyiDegistir(sifre)
      if (sonuc) setHata(sonuc)
      else onBitti()
    } finally {
      setBekle(false)
    }
  }

  return (
    <div className="screen screen-center">
      <header className="hero">
        <h1 className="title">
          Yeni <span>şifre</span>
        </h1>
        <p className="subtitle">Hesabın için yeni bir şifre belirle.</p>
      </header>

      <form className="auth-form" onSubmit={gonder}>
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          placeholder="Yeni şifre (en az 6 karakter)"
          value={sifre}
          minLength={6}
          required
          autoFocus
          onChange={(e) => setSifre(e.target.value)}
        />
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          placeholder="Yeni şifre (tekrar)"
          value={tekrar}
          required
          onChange={(e) => setTekrar(e.target.value)}
        />

        {uyusmuyor && <div className="form-error">Şifreler aynı değil.</div>}
        {hata && <div className="form-error">{hata}</div>}

        <button className="btn btn-primary btn-lg" type="submit" disabled={bekle || !gecerli}>
          {bekle ? 'Kaydediliyor…' : 'Şifreyi değiştir'}
        </button>
      </form>

      <button className="btn btn-ghost" onClick={onVazgec}>
        Vazgeç
      </button>
    </div>
  )
}
