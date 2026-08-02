import { useEffect, useRef, useState } from 'react'

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
  const ref = useRef<HTMLVideoElement>(null)
  const [dokunGerek, setDokunGerek] = useState(false)

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

  return (
    <>
      <video ref={ref} autoPlay playsInline muted={sessiz} />
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
          ▶ Dokun
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
  return (
    <aside className={`video-panel ${sadeceSes ? 'sesli' : ''}`}>
      <div className="video-grid">
        {[...uzaklar.entries()].map(([id, akis]) => (
          <div key={id} className="video-kutu">
            {goruntuVar(akis) ? (
              <Video akis={akis} />
            ) : (
              <>
                {/* Kamerasız görüşmede sesin çalması için yine de öğe gerekli */}
                <Video akis={akis} />
                <span className="video-sesli-rozet">🎙 sesli</span>
              </>
            )}
          </div>
        ))}
        {yerel && !sadeceSes && (
          <div className="video-kutu ben">
            {/* kendi sesimizi duymayalım diye sessiz — yankının ilk kaynağı bu */}
            <Video akis={yerel} sessiz />
            <span className="video-etiket">sen</span>
          </div>
        )}
        {uzaklar.size === 0 && (
          <p className="muted video-bos">
            {sadeceSes
              ? 'Mikrofonun açık. Karşı taraf katılınca sesini duyacaksın.'
              : 'Karşı taraf kamerasını açınca burada görünecek.'}
          </p>
        )}
      </div>

      <div className="video-araclar">
        {!sadeceSes && (
          <button
            className={`icon-btn ${kameraAcik ? 'on' : ''}`}
            onClick={onKamera}
            title={kameraAcik ? 'Kamerayı kapat' : 'Kamerayı aç'}
          >
            {kameraAcik ? '📹' : '🚫'}
          </button>
        )}
        <button
          className={`icon-btn ${sesAcik ? 'on' : ''}`}
          onClick={onSes}
          title={sesAcik ? 'Mikrofonu kapat' : 'Mikrofonu aç'}
        >
          {sesAcik ? '🎤' : '🔇'}
        </button>
        <button className="icon-btn" onClick={onKapat} title="Görüşmeyi bitir">
          ✕
        </button>
      </div>
    </aside>
  )
}
