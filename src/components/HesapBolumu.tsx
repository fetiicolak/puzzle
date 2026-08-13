import { useState } from 'react'
import SifreKutusu from './SifreKutusu'
import { useDil } from '../dil'
import { useAuth } from '../supabase/auth'

/**
 * Profil penceresindeki hesap ayarları: e-posta ve şifre değiştirme.
 *
 * İki form da kapalı başlıyor. Profil penceresi zaten uzun; hesabına
 * yılda bir dokunan kişi bunları hep açık görmemeli. Açılan form kendi
 * içinde kaydediyor — pencerenin altındaki "Kaydet" düğmesi profil
 * alanlarına ait ve buraya karışmıyor, karışsaydı "adımı değiştirdim,
 * şifrem de mi değişti" belirsizliği çıkardı.
 */
export default function HesapBolumu() {
  const { ceviri } = useDil()
  const { user, epostayiDegistir, sifreyiGuncelle } = useAuth()

  const [acik, setAcik] = useState<'eposta' | 'sifre' | null>(null)
  const [yeniEposta, setYeniEposta] = useState('')
  const [mevcutSifre, setMevcutSifre] = useState('')
  const [yeniSifre, setYeniSifre] = useState('')
  const [tekrar, setTekrar] = useState('')
  const [bekle, setBekle] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [bilgi, setBilgi] = useState<string | null>(null)

  const sifirla = () => {
    setYeniEposta('')
    setMevcutSifre('')
    setYeniSifre('')
    setTekrar('')
    setHata(null)
  }

  const ac = (hangi: 'eposta' | 'sifre') => {
    sifirla()
    setBilgi(null)
    setAcik((o) => (o === hangi ? null : hangi))
  }

  const epostaGonder = async (e: React.FormEvent) => {
    e.preventDefault()
    setHata(null)
    setBekle(true)
    try {
      const sonuc = await epostayiDegistir(yeniEposta)
      if (sonuc) setHata(sonuc)
      else {
        setBilgi(
          ceviri(
            'Onay bağlantısı {eposta} adresine gönderildi. Bağlantıya tıklayana kadar eski adresinle giriş yapmaya devam et.',
            { eposta: yeniEposta.trim() },
          ),
        )
        setAcik(null)
        sifirla()
      }
    } finally {
      setBekle(false)
    }
  }

  const sifreGonder = async (e: React.FormEvent) => {
    e.preventDefault()
    setHata(null)
    setBekle(true)
    try {
      const sonuc = await sifreyiGuncelle(mevcutSifre, yeniSifre)
      if (sonuc) setHata(sonuc)
      else {
        setBilgi(ceviri('Şifren değiştirildi.'))
        setAcik(null)
        sifirla()
      }
    } finally {
      setBekle(false)
    }
  }

  const sifreGecerli = yeniSifre.length >= 6 && yeniSifre === tekrar && mevcutSifre.length > 0

  return (
    <div className="profil-bolum">
      <b>{ceviri('Hesap')}</b>
      <small className="muted">
        {ceviri('Giriş adresin: {eposta}', { eposta: user?.email ?? '—' })}
      </small>

      <div className="hesap-butonlar">
        <button
          className="btn btn-secondary btn-sm"
          aria-expanded={acik === 'eposta'}
          onClick={() => ac('eposta')}
        >
          {ceviri('E-postamı değiştir')}
        </button>
        <button
          className="btn btn-secondary btn-sm"
          aria-expanded={acik === 'sifre'}
          onClick={() => ac('sifre')}
        >
          {ceviri('Şifremi değiştir')}
        </button>
      </div>

      {acik === 'eposta' && (
        <form className="hesap-form" onSubmit={(e) => void epostaGonder(e)}>
          <input
            className="input"
            type="email"
            autoComplete="email"
            placeholder={ceviri('Yeni e-posta adresin')}
            value={yeniEposta}
            required
            autoFocus
            onChange={(e) => setYeniEposta(e.target.value)}
          />
          <small className="muted">
            {ceviri(
              'Yeni adrese bir onay bağlantısı gönderilir; adres ancak tıklandıktan sonra değişir.',
            )}
          </small>
          {hata && <div className="form-error">{hata}</div>}
          <button
            className="btn btn-primary btn-sm"
            type="submit"
            disabled={bekle || !yeniEposta.trim()}
          >
            {bekle ? ceviri('Gönderiliyor…') : ceviri('Onay bağlantısı gönder')}
          </button>
        </form>
      )}

      {acik === 'sifre' && (
        <form className="hesap-form" onSubmit={(e) => void sifreGonder(e)}>
          <SifreKutusu
            autoComplete="current-password"
            placeholder={ceviri('Mevcut şifren')}
            value={mevcutSifre}
            autoFocus
            onChange={setMevcutSifre}
          />
          <SifreKutusu
            autoComplete="new-password"
            placeholder={ceviri('Yeni şifre (en az 6 karakter)')}
            value={yeniSifre}
            onChange={setYeniSifre}
          />
          <SifreKutusu
            autoComplete="new-password"
            placeholder={ceviri('Yeni şifre (tekrar)')}
            value={tekrar}
            onChange={setTekrar}
          />
          {tekrar.length > 0 && yeniSifre !== tekrar && (
            <div className="form-error">{ceviri('Şifreler aynı değil.')}</div>
          )}
          {hata && <div className="form-error">{hata}</div>}
          <button
            className="btn btn-primary btn-sm"
            type="submit"
            disabled={bekle || !sifreGecerli}
          >
            {bekle ? ceviri('Kaydediliyor…') : ceviri('Şifreyi değiştir')}
          </button>
        </form>
      )}

      {bilgi && <small className="hesap-bilgi">{bilgi}</small>}
    </div>
  )
}
