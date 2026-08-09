import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDil } from '../dil'

interface Props {
  /** Döndürmeli zorluk açık mı — kapalıysa o adım hiç gösterilmez */
  rotation: boolean
  /** Odada mı oynanıyor — tek başınaysa birlikte oynama adımı atlanır */
  odada: boolean
  /** Hesapla mı oynanıyor — misafirde arkadaş düğmesi hiç yok */
  hesapVar: boolean
  onKapat: () => void
}

interface Adim {
  simge: string
  baslik: string
  metin: string
  /** Araç çubuğundaki karşılıkları — varsa alt alta listelenir */
  araclar?: { simge: string; ad: string }[]
}

/** Dokunmatik cihazda mıyız (fare yerine parmak) */
function dokunmatikMi(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
}

function adimlariKur(rotation: boolean, odada: boolean, hesapVar: boolean): Adim[] {
  const dokunmatik = dokunmatikMi()
  const adimlar: Adim[] = [
    {
      simge: '🧩',
      baslik: 'Parçayı sürükle',
      metin: dokunmatik
        ? 'Bir parçaya parmağını koyup sürükle. Doğru yerine yaklaştığında kendiliğinden oturur.'
        : 'Bir parçayı tutup sürükle. Doğru yerine yaklaştığında kendiliğinden oturur.',
    },
    {
      simge: '🔗',
      baslik: 'Birleşenler birlikte gider',
      metin: 'Komşu parçalar yan yana gelince birleşir ve artık tek parça gibi hareket eder.',
    },
    {
      simge: dokunmatik ? '👆' : '🖱',
      baslik: 'Yanlış birleştirdiysen ayır',
      metin: dokunmatik
        ? 'Parçaya basılı tut (yaklaşık yarım saniye), gruptan koparır.'
        : 'Parçaya sağ tıkla, bulunduğu gruptan koparır.',
    },
  ]

  if (rotation) {
    adimlar.push({
      simge: '🔄',
      baslik: 'Parçalar çevrilmiş geldi',
      metin: dokunmatik
        ? 'Bu puzzle döndürmeli. Parçaya iki kez dokunarak çeyrek tur çevir; doğru açıyı bulmadan yerine oturmaz.'
        : 'Bu puzzle döndürmeli. Parçaya çift tıklayarak çeyrek tur çevir; doğru açıyı bulmadan yerine oturmaz.',
    })
  }

  adimlar.push({
    simge: '🔍',
    baslik: 'Yakınlaş, kaydır',
    metin: dokunmatik
      ? 'İki parmakla yakınlaştır, boş bir yerden sürükleyerek tahtayı kaydır.'
      : 'Fare tekerleğiyle yakınlaştır, boş bir yerden sürükleyerek tahtayı kaydır.',
  })

  adimlar.push({
    simge: '🧰',
    baslik: 'Üstteki araçlar',
    metin: 'Takıldığında işini kolaylaştıracak düğmeler:',
    araclar: [
      { simge: '⫴', ad: 'Yerleşmemiş parçaları yanlara diz' },
      { simge: '🔀', ad: 'Parçaları yeniden karıştır' },
      { simge: '⬚', ad: 'Sadece kenar parçalarını öne çıkar' },
      { simge: '🔊', ad: 'Ses efektlerini aç / kapat' },
      { simge: '♪', ad: 'Arka plan müziğini aç / kapat' },
      { simge: '⊞', ad: 'Izgarayı göster / gizle' },
      { simge: '🖼', ad: 'Orijinal görsele bak' },
      { simge: '⤢', ad: 'Hepsini ekrana sığdır' },
    ],
  })

  if (odada) {
    adimlar.push({
      simge: '👥',
      baslik: 'Birlikte oynarken',
      metin: 'Karşı tarafın imleci tahtada görünür; tuttuğu parça renkli çerçeveyle işaretlenir.',
      araclar: [
        { simge: '👥', ad: 'Odadakiler ve yetkiler' },
        // arkadaş düğmesi yalnızca hesapla görünüyor
        ...(hesapVar ? [{ simge: '🤝', ad: 'Arkadaşına mesaj at, odaya davet et' }] : []),
        { simge: '💬', ad: 'Oda içi sohbet' },
        { simge: '📹', ad: 'Görüntülü konuş' },
        { simge: '🎙', ad: 'Yalnızca sesli konuş' },
      ],
    })
  }

  // Panellerin taşınabildiği başka türlü anlaşılmıyor
  adimlar.push({
    simge: '🪟',
    baslik: 'Pencereleri istediğin yere koy',
    metin:
      'Kameralar, sohbet ve orijinal görsel taşınabilir: başlığından tutup istediğin yere sürükle. Bıraktığın yer akılda kalır, ↺ ile eski yerine döner.',
  })

  return adimlar
}

/**
 * "Nasıl oynanır" turu.
 *
 * İlk oyunda kendiliğinden açılır, sonrasında üstteki ? düğmesinden. Adımlar
 * duruma göre kurulur: döndürme kapalıysa o adım, tek başına oynanıyorsa
 * birlikte oynama adımı hiç görünmez. Dokunmatik cihazda sağ tık yerine
 * basılı tutma anlatılır.
 */
export default function Tutorial({ rotation, odada, hesapVar, onKapat }: Props) {
  // Adımlar Türkçe kuruluyor, çeviri çizim sırasında yapılıyor
  const { ceviri } = useDil()
  const adimlar = useMemo(
    () => adimlariKur(rotation, odada, hesapVar),
    [rotation, odada, hesapVar],
  )
  const [i, setI] = useState(0)
  const adim = adimlar[i]
  const sonMu = i === adimlar.length - 1

  const ileri = () => (sonMu ? onKapat() : setI((n) => n + 1))

  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onKapat()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') ileri()
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1))
    }
    window.addEventListener('keydown', tus)
    return () => window.removeEventListener('keydown', tus)
  })

  return createPortal(
    <div className="modal-arka" onClick={onKapat}>
      <div className="dialog tanitim" onClick={(e) => e.stopPropagation()}>
        <div className="tanitim-simge" aria-hidden="true">
          {adim.simge}
        </div>

        <h3>{ceviri(adim.baslik)}</h3>
        <p className="dialog-mesaj">{ceviri(adim.metin)}</p>

        {adim.araclar && (
          <ul className="tanitim-araclar">
            {adim.araclar.map((a) => (
              <li key={a.ad}>
                <span className="tanitim-arac-simge" aria-hidden="true">
                  {a.simge}
                </span>
                {ceviri(a.ad)}
              </li>
            ))}
          </ul>
        )}

        <div className="tanitim-noktalar" aria-hidden="true">
          {adimlar.map((_, n) => (
            <span key={n} className={`nokta ${n === i ? 'aktif' : ''} ${n < i ? 'gecti' : ''}`} />
          ))}
        </div>

        <div className="dialog-butonlar tanitim-butonlar">
          <button className="btn btn-ghost btn-sm" onClick={onKapat}>
            {ceviri('Hepsini atla')}
          </button>
          <span className="spacer" />
          {i > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setI((n) => n - 1)}>
              {ceviri('Geri')}
            </button>
          )}
          <button className="btn btn-primary" onClick={ileri}>
            {sonMu ? ceviri('Başla') : ceviri('Atla')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
