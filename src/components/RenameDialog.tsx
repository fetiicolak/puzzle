import { useEffect, useRef, useState } from 'react'
import { useDil } from '../dil'

interface Props {
  /** Şu anki ad — alan bununla dolu açılır */
  mevcutAd: string
  onKaydet: (yeniAd: string) => Promise<void> | void
  onIptal: () => void
}

/**
 * Puzzle adını değiştirme penceresi.
 * Tarayıcının kendi prompt kutusu yerine uygulamanın içinde açılır.
 */
export default function RenameDialog({ mevcutAd, onKaydet, onIptal }: Props) {
  const { ceviri } = useDil()
  const [ad, setAd] = useState(mevcutAd)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // açılır açılmaz yazmaya başlanabilsin, metin de seçili gelsin
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onIptal()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onIptal])

  const temiz = ad.trim()
  const kaydedilebilir = temiz.length > 0 && temiz !== mevcutAd && !kaydediliyor

  const gonder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!kaydedilebilir) return
    setKaydediliyor(true)
    setHata(null)
    try {
      await onKaydet(temiz)
    } catch (err) {
      setHata(err instanceof Error ? err.message : ceviri('Kaydedilemedi'))
      setKaydediliyor(false)
    }
  }

  return (
    <div className="modal-arka" onClick={onIptal}>
      <form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={gonder}>
        <h3>{ceviri('Adı değiştir')}</h3>

        <input
          ref={inputRef}
          className="input"
          value={ad}
          maxLength={60}
          placeholder={ceviri('Puzzle adı')}
          onChange={(e) => setAd(e.target.value)}
        />

        {hata && <div className="form-error">{hata}</div>}

        <div className="dialog-butonlar">
          <button type="button" className="btn btn-ghost" onClick={onIptal}>
            {ceviri('İptal')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!kaydedilebilir}>
            {kaydediliyor ? ceviri('Kaydediliyor…') : ceviri('Kaydet')}
          </button>
        </div>
      </form>
    </div>
  )
}
