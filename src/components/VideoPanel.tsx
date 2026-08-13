import { useEffect, useRef, useState } from 'react'
import { useDil } from '../dil'
import PanelBaslik from './PanelBaslik'
import { useSurukle } from './surukle'

interface Props {
  yerel: MediaStream | null
  uzaklar: Map<string, MediaStream>
  sesAcik: boolean
  kameraAcik: boolean
  /** Görüşme kamerasız başlatıldı */
  sadeceSes?: boolean
  onSes: () => void
  onKamera: () => void
  onKapat: () => void
}

/**
 * Akışı bir video öğesine bağlar.
 *
 * iOS/iPadOS'ta autoplay tek başına yetmiyor: srcObject verildikten sonra
 * play() elle çağrılmalı, yoksa görüntü siyah kalıyor. Tarayıcı sesli
 * oynatmayı reddederse kullanıcıya dokunması için bir düğme gösteriyoruz.
 */
function Video({ akis, sessiz }: { akis: MediaStream; sessiz?: boolean }) {
  const { ceviri } = useDil()
  const ref = useRef<HTMLVideoElement>(null)
  const [dokunGerek, setDokunGerek] = useState(false)
  const [takildi, setTakildi] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    try {
      el.srcObject = akis
    } catch {
      // akış bağlanamadıysa yalnızca bu kutu boş kalsın, oyun sürsün
      return
    }
    setDokunGerek(false)
    el.play().catch(() => setDokunGerek(true))
  }, [akis])

  /**
   * Donma nöbetçisi.
   *
   * Akış canlı görünürken görüntünün saatinin ilerlemediği oluyor (ağda kısa
   * bir kopma, sekmenin arka plana atılması, kod çözücünün takılması). Tarayıcı
   * bunu kendiliğinden toparlamıyor; öğe sessizce son karede kalıyor. İki
   * saniye ilerleme yoksa önce play(), sürerse akışı yeniden bağlıyoruz.
   */
  useEffect(() => {
    const el = ref.current
    if (!el || sessiz) return
    let sonZaman = -1
    let takiliSayac = 0

    const id = setInterval(() => {
      const canli = akis.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted)
      if (!canli) {
        setTakildi(false)
        takiliSayac = 0
        return
      }
      if (el.currentTime === sonZaman && !el.paused) {
        takiliSayac++
        if (takiliSayac === 2) {
          setTakildi(true)
          el.play().catch(() => {})
        } else if (takiliSayac >= 4) {
          // hâlâ duruyorsa akışı yeniden bağla
          takiliSayac = 0
          try {
            el.srcObject = null
            el.srcObject = akis
            void el.play()
          } catch {
            // yapılamadıysa bir sonraki turda tekrar denenir
          }
        }
      } else {
        if (takiliSayac > 0) setTakildi(false)
        takiliSayac = 0
      }
      sonZaman = el.currentTime
    }, 1000)

    return () => clearInterval(id)
  }, [akis, sessiz])

  return (
    <>
      <video ref={ref} autoPlay playsInline muted={sessiz} />
      {takildi && !dokunGerek && (
        <span className="video-takildi">{ceviri('görüntü takıldı…')}</span>
      )}
      {dokunGerek && (
        <button
          className="video-dokun"
          onClick={() => {
            ref.current?.play().then(
              () => setDokunGerek(false),
              () => {},
            )
          }}
        >
          ▶ {ceviri('Dokun')}
        </button>
      )}
    </>
  )
}

/** Akışta görüntü var mı (yalnızca sesli görüşmede yok) */
function goruntuVar(akis: MediaStream): boolean {
  return akis.getVideoTracks().some((t) => t.readyState === 'live')
}

/** Oyun sırasında küçük görüşme penceresi */
export default function VideoPanel({
  yerel,
  uzaklar,
  sesAcik,
  kameraAcik,
  sadeceSes = false,
  onSes,
  onKamera,
  onKapat,
}: Props) {
  const { ceviri } = useDil()
  /*
    Panel başlık çubuğundan taşınıyor. Önce panelin tamamı tutamaktı ama
    sürükleme <video> ve düğme üstünden başlamıyor; iki kamera açıkken panelde
    tutulacak boş yer kalmıyordu, dokunmatikte hiç taşınamıyordu.
  */
  const { kokRef, stil, tutamac, tasindi, sifirla } = useSurukle<HTMLElement>('video')
  return (
    <aside
      ref={kokRef}
      style={stil}
      className={`video-panel panel-tasinabilir ${sadeceSes ? 'sesli' : ''}`}
      {...tutamac}
    >
      <PanelBaslik baslik={ceviri('Görüşme')}>
        {tasindi && (
          <button
            className="icon-btn"
            onClick={sifirla}
            aria-label={ceviri('Yerine döndür')}
            title={ceviri('Yerine döndür')}
          >
            ↺
          </button>
        )}
        <button
          className="icon-btn"
          onClick={onKapat}
          aria-label={ceviri('Görüşmeyi bitir')}
          title={ceviri('Görüşmeyi bitir')}
        >
          ✕
        </button>
      </PanelBaslik>

      <div className="video-grid">
        {[...uzaklar.entries()].map(([id, akis]) => (
          <div key={id} className="video-kutu">
            {goruntuVar(akis) ? (
              <Video akis={akis} />
            ) : (
              <>
                {/* Kamerasız görüşmede sesin çalması için yine de öğe gerekli */}
                <Video akis={akis} />
                <span className="video-sesli-rozet">🎙 {ceviri('sesli')}</span>
              </>
            )}
          </div>
        ))}
        {yerel && !sadeceSes && (
          <div className="video-kutu ben">
            {/* kendi sesimizi duymayalım diye sessiz — yankının ilk kaynağı bu */}
            <Video akis={yerel} sessiz />
            <span className="video-etiket">{ceviri('sen')}</span>
          </div>
        )}
        {uzaklar.size === 0 && (
          <p className="muted video-bos">
            {sadeceSes
              ? ceviri('Mikrofonun açık. Karşı taraf katılınca sesini duyacaksın.')
              : ceviri('Karşı taraf kamerasını açınca burada görünecek.')}
          </p>
        )}
      </div>

      <div className="video-araclar">
        {!sadeceSes && (
          <button
            className={`icon-btn ${kameraAcik ? 'on' : ''}`}
            onClick={onKamera}
            aria-label={kameraAcik ? ceviri('Kamerayı kapat') : ceviri('Kamerayı aç')}
            title={kameraAcik ? ceviri('Kamerayı kapat') : ceviri('Kamerayı aç')}
          >
            {kameraAcik ? '📹' : '🚫'}
          </button>
        )}
        <button
          className={`icon-btn ${sesAcik ? 'on' : ''}`}
          onClick={onSes}
          aria-label={sesAcik ? ceviri('Mikrofonu kapat') : ceviri('Mikrofonu aç')}
          title={sesAcik ? ceviri('Mikrofonu kapat') : ceviri('Mikrofonu aç')}
        >
          {sesAcik ? '🎤' : '🔇'}
        </button>
      </div>
    </aside>
  )
}
