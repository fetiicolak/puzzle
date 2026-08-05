import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  baslik: string
  /** Açıklama metni — ne olacağını net anlatmalı */
  mesaj: string
  /** Onay düğmesinin yazısı */
  onayYazisi?: string
  /** Geri alınamayan işlemlerde onay düğmesi kırmızı olur */
  tehlikeli?: boolean
  /**
   * Bilgi/hata kutusu: yalnızca tek bir "Tamam" düğmesi çıkar.
   * Tarayıcının alert() kutusunun yerini alır.
   */
  tekButon?: boolean
  onOnayla: () => Promise<void> | void
  onIptal: () => void
}

/**
 * Onay penceresi. Tarayıcının kendi confirm kutusu yerine uygulamanın
 * içinde, sitenin tasarımıyla açılır.
 */
export default function ConfirmDialog({
  baslik,
  mesaj,
  onayYazisi = 'Tamam',
  tehlikeli = false,
  tekButon = false,
  onOnayla,
  onIptal,
}: Props) {
  const [calisiyor, setCalisiyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !calisiyor) onIptal()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onIptal, calisiyor])

  const onayla = async () => {
    setCalisiyor(true)
    setHata(null)
    try {
      await onOnayla()
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'İşlem yapılamadı')
      setCalisiyor(false)
    }
  }

  /*
    Pencere doğrudan sayfanın köküne çiziliyor.

    İçinde açıldığı kutu backdrop-filter kullanıyorsa (oda paneli gibi), sabit
    konumlu öğe ekrana değil o kutuya göre yerleşiyor ve kenarından taşıyordu.
    Kökte çizilince nerede kullanılırsa kullanılsın ekranın ortasında durur.
  */
  return createPortal(
    <div className="modal-arka" onClick={() => !calisiyor && onIptal()}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{baslik}</h3>
        <p className="dialog-mesaj">{mesaj}</p>

        {hata && <div className="form-error">{hata}</div>}

        <div className="dialog-butonlar">
          {!tekButon && (
            <button className="btn btn-ghost" disabled={calisiyor} onClick={onIptal}>
              İptal
            </button>
          )}
          <button
            className={`btn ${tehlikeli ? 'btn-danger' : 'btn-primary'}`}
            disabled={calisiyor}
            onClick={() => void onayla()}
          >
            {calisiyor ? 'Bekle…' : onayYazisi}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
