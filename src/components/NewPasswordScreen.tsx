import { useState } from 'react'
import SifreKutusu from './SifreKutusu'
import { useDil } from '../dil'
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
  const { ceviri } = useDil()
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
          {ceviri('Yeni')} <span>{ceviri('şifre')}</span>
        </h1>
        <p className="subtitle">{ceviri('Hesabın için yeni bir şifre belirle.')}</p>
      </header>

      <form className="auth-form" onSubmit={gonder}>
        <SifreKutusu
          autoComplete="new-password"
          placeholder={ceviri('Yeni şifre (en az 6 karakter)')}
          value={sifre}
          autoFocus
          onChange={setSifre}
        />
        <SifreKutusu
          autoComplete="new-password"
          placeholder={ceviri('Yeni şifre (tekrar)')}
          value={tekrar}
          onChange={setTekrar}
        />

        {uyusmuyor && <div className="form-error">{ceviri('Şifreler aynı değil.')}</div>}
        {hata && <div className="form-error">{hata}</div>}

        <button className="btn btn-primary btn-lg" type="submit" disabled={bekle || !gecerli}>
          {bekle ? ceviri('Kaydediliyor…') : ceviri('Şifreyi değiştir')}
        </button>
      </form>

      <button className="btn btn-ghost" onClick={onVazgec}>
        {ceviri('Vazgeç')}
      </button>
    </div>
  )
}
