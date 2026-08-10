import { useEffect, useId, useRef, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import Select from './Select'
import { basHarfler } from '../ad'
import { useDil } from '../dil'
import { useModalErisim } from '../erisim'
import {
  hesabiSil,
  avatarHazirla,
  avatarSil,
  avatarUrl,
  avatarYukle,
  profilKaydet,
  profilimiGetir,
  yas,
  CINSIYET_ADI,
  type Cinsiyet,
  type Profil,
} from '../supabase/profile'

interface Props {
  onKapat: () => void
  /** Kaydedilen ad üst çubukta da güncellensin diye */
  onKaydedildi?: (ad: string) => void
}

const SIMDIKI_YIL = new Date().getFullYear()

/** Kendi profilini düzenleme penceresi */
export default function ProfileDialog({ onKapat, onKaydedildi }: Props) {
  const { ceviri } = useDil()
  const [profil, setProfil] = useState<Profil | null>(null)
  const [ad, setAd] = useState('')
  const [dogumYili, setDogumYili] = useState('')
  const [cinsiyet, setCinsiyet] = useState<Cinsiyet | ''>('')
  const [onizleme, setOnizleme] = useState<string | null>(null)
  /** Henüz yüklenmemiş, kaydete basınca gidecek fotoğraf */
  const [yeniFoto, setYeniFoto] = useState<Blob | null>(null)
  const [fotoSilinsin, setFotoSilinsin] = useState(false)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [silmeOnayi, setSilmeOnayi] = useState(false)
  const dosyaRef = useRef<HTMLInputElement>(null)
  const baslikId = useId()
  const kutuRef = useModalErisim(onKapat, !kaydediliyor)

  useEffect(() => {
    let iptal = false
    void profilimiGetir()
      .then(async (p) => {
        if (iptal || !p) return
        setProfil(p)
        setAd(p.ad === 'İsimsiz' ? '' : p.ad)
        setDogumYili(p.dogumYili ? String(p.dogumYili) : '')
        setCinsiyet(p.cinsiyet ?? '')
        const u = await avatarUrl(p.avatarPath)
        if (!iptal) setOnizleme(u)
      })
      .finally(() => {
        if (!iptal) setYukleniyor(false)
      })
    return () => {
      iptal = true
    }
  }, [])

  const fotoSec = async (dosya: File) => {
    setHata(null)
    try {
      const blob = await avatarHazirla(dosya)
      setYeniFoto(blob)
      setFotoSilinsin(false)
      setOnizleme(URL.createObjectURL(blob))
    } catch {
      setHata(ceviri('Bu görsel açılamadı, başka bir tane dene.'))
    }
  }

  const yilGecerli = (() => {
    if (!dogumYili) return true
    const n = Number(dogumYili)
    return Number.isInteger(n) && n >= 1900 && n <= SIMDIKI_YIL
  })()

  const kaydet = async () => {
    if (!yilGecerli) {
      setHata(ceviri('Doğum yılı 1900 ile {yil} arasında olmalı.', { yil: SIMDIKI_YIL }))
      return
    }
    setKaydediliyor(true)
    setHata(null)
    try {
      let avatarPath: string | null | undefined
      if (yeniFoto) {
        avatarPath = await avatarYukle(yeniFoto, profil?.avatarPath)
      } else if (fotoSilinsin) {
        await avatarSil(profil?.avatarPath ?? null)
        avatarPath = null
      }
      const temizAd = ad.trim()
      await profilKaydet({
        ad: temizAd,
        dogumYili: dogumYili ? Number(dogumYili) : null,
        cinsiyet: cinsiyet || null,
        ...(avatarPath !== undefined ? { avatarPath } : {}),
      })
      onKaydedildi?.(temizAd)
      onKapat()
    } catch (e) {
      setHata(e instanceof Error ? e.message : ceviri('Kaydedilemedi'))
      setKaydediliyor(false)
    }
  }

  const bas = basHarfler(ad)
  const yasi = yas(dogumYili ? Number(dogumYili) : null)

  if (silmeOnayi) {
    return (
      <ConfirmDialog
        baslik="Hesabını sil"
        mesaj="Hesabın, çözdüğün tablolar, yüklediğin fotoğraflar, arkadaşlıkların ve mesajların kalıcı olarak silinecek. Bu işlem geri alınamaz."
        onayYazisi="Hesabımı sil"
        tehlikeli
        onIptal={() => setSilmeOnayi(false)}
        onOnayla={async () => {
          await hesabiSil()
          onKapat()
        }}
      />
    )
  }

  return (
    <div className="modal-arka" onClick={() => !kaydediliyor && onKapat()}>
      <div
        className="dialog dialog-genis"
        ref={kutuRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={baslikId}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={baslikId}>{ceviri('Profilim')}</h3>

        {yukleniyor ? (
          <p className="dialog-mesaj">{ceviri('Yükleniyor…')}</p>
        ) : (
          <>
            <div className="profil-foto-satir">
              <button
                className="avatar buyuk"
                onClick={() => dosyaRef.current?.click()}
                aria-label={ceviri('Fotoğraf seç')}
                title={ceviri('Fotoğraf seç')}
              >
                {onizleme ? <img src={onizleme} alt="" /> : bas}
              </button>
              <div className="profil-foto-butonlar">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => dosyaRef.current?.click()}
                >
                  {onizleme ? ceviri('Değiştir') : ceviri('Fotoğraf seç')}
                </button>
                {onizleme && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setOnizleme(null)
                      setYeniFoto(null)
                      setFotoSilinsin(true)
                    }}
                  >
                    {ceviri('Kaldır')}
                  </button>
                )}
                <small className="muted">
                  {ceviri('Kare kırpılır, 256 piksele küçültülür.')}
                </small>
              </div>
              <input
                ref={dosyaRef}
                type="file"
                accept="image/*"
                className="dosya-girisi"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void fotoSec(f)
                  e.target.value = ''
                }}
              />
            </div>

            <label className="field">
              <span className="field-label">{ceviri('Adın')}</span>
              <input
                className="input"
                value={ad}
                maxLength={40}
                placeholder={ceviri('Görünecek adın')}
                onChange={(e) => setAd(e.target.value)}
              />
            </label>

            <label className="field">
              <span className="field-label">
                {ceviri('Doğum yılı')}
                <em className="field-hint">
                  {yasi !== null
                    ? ceviri('{yas} yaşındasın', { yas: yasi })
                    : ceviri('isteğe bağlı')}
                </em>
              </span>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={1900}
                max={SIMDIKI_YIL}
                placeholder={ceviri('örn. 1998')}
                value={dogumYili}
                onChange={(e) => setDogumYili(e.target.value)}
              />
            </label>

            <label className="field">
              <span className="field-label">
                {ceviri('Cinsiyet')} <em className="field-hint">{ceviri('isteğe bağlı')}</em>
              </span>
              <Select
                etiket={ceviri('Cinsiyet')}
                deger={cinsiyet}
                onDegis={(v) => setCinsiyet(v)}
                secenekler={[
                  { deger: '', etiket: ceviri('Seçilmedi') },
                  ...(Object.keys(CINSIYET_ADI) as Cinsiyet[]).map((c) => ({
                    deger: c,
                    etiket: ceviri(CINSIYET_ADI[c]),
                  })),
                ]}
              />
            </label>

            <small className="muted">
              {ceviri(
                'Bu bilgileri yalnızca birlikte puzzle çözdüğün ve arkadaş olduğun kişiler görebilir.',
              )}
            </small>

            <div className="tehlike-bolge">
              <b>{ceviri('Hesabı sil')}</b>
              <small className="muted">
                {ceviri(
                  'Tablolarını, fotoğraflarını, mesajlarını ve hesabını kalıcı olarak siler. Geri alınamaz.',
                )}
              </small>
              <button
                className="btn btn-danger btn-sm"
                disabled={kaydediliyor}
                onClick={() => setSilmeOnayi(true)}
              >
                {ceviri('Hesabımı sil')}
              </button>
            </div>
          </>
        )}

        {hata && <div className="form-error">{hata}</div>}

        <div className="dialog-butonlar">
          <button className="btn btn-ghost" disabled={kaydediliyor} onClick={onKapat}>
            {ceviri('İptal')}
          </button>
          <button
            className="btn btn-primary"
            disabled={kaydediliyor || yukleniyor}
            onClick={() => void kaydet()}
          >
            {kaydediliyor ? ceviri('Kaydediliyor…') : ceviri('Kaydet')}
          </button>
        </div>
      </div>
    </div>
  )
}
