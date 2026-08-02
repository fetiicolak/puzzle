import { useEffect, useRef } from 'react'

interface Props {
  yerel: MediaStream | null
  uzaklar: Map<string, MediaStream>
  sesAcik: boolean
  kameraAcik: boolean
  onSes: () => void
  onKamera: () => void
  onKapat: () => void
}

function Video({ akis, sessiz }: { akis: MediaStream; sessiz?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = akis
  }, [akis])
  return <video ref={ref} autoPlay playsInline muted={sessiz} />
}

/** Oyun sırasında küçük görüntülü görüşme penceresi */
export default function VideoPanel({
  yerel,
  uzaklar,
  sesAcik,
  kameraAcik,
  onSes,
  onKamera,
  onKapat,
}: Props) {
  return (
    <aside className="video-panel">
      <div className="video-grid">
        {[...uzaklar.entries()].map(([id, akis]) => (
          <div key={id} className="video-kutu">
            <Video akis={akis} />
          </div>
        ))}
        {yerel && (
          <div className="video-kutu ben">
            {/* kendi sesimizi duymayalım diye sessiz */}
            <Video akis={yerel} sessiz />
            <span className="video-etiket">sen</span>
          </div>
        )}
        {uzaklar.size === 0 && (
          <p className="muted video-bos">Karşı taraf kamerasını açınca burada görünecek.</p>
        )}
      </div>

      <div className="video-araclar">
        <button
          className={`icon-btn ${kameraAcik ? 'on' : ''}`}
          onClick={onKamera}
          title={kameraAcik ? 'Kamerayı kapat' : 'Kamerayı aç'}
        >
          {kameraAcik ? '📹' : '🚫'}
        </button>
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
