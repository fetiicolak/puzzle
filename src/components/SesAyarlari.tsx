import { useState } from 'react'
import { useDil } from '../dil'
import {
  efektSeviyesi,
  efektSeviyesiAyarla,
  muzikSeviyesi,
  muzikSeviyesiAyarla,
} from '../audio'
import { PARCALAR } from '../muzik'
import PanelBaslik from './PanelBaslik'
import Select from './Select'
import { useSurukle } from './surukle'

interface Props {
  /** Ses efektleri açık mı (üst çubuktaki 🔊 ile ortak durum) */
  sesler: boolean
  muzik: boolean
  /** Seçili müzik parçasının kimliği */
  parca: string
  onSesler: () => void
  onMuzik: () => void
  onParca: (id: string) => void
  onKapat: () => void
}

/**
 * Ses ayarları penceresi.
 *
 * Aç/kapat düğmeleri üst çubukta da var — burada ikisi bir arada dursun diye
 * tekrar ediliyor, durum aynı state'ten geliyor. Kaydırıcılar yalnızca burada.
 *
 * Seviye localStorage'da; audio.ts kaydırıcı hareket ettikçe kazancı
 * yumuşatarak izliyor, böylece sürüklerken sonucu anında duyuyorsun.
 */
export default function SesAyarlari({
  sesler,
  muzik,
  parca,
  onSesler,
  onMuzik,
  onParca,
  onKapat,
}: Props) {
  const { ceviri } = useDil()
  const { kokRef, stil, tutamac, tasindi, sifirla } = useSurukle<HTMLElement>('ses')
  const [efekt, setEfekt] = useState(() => Math.round(efektSeviyesi() * 100))
  const [muzikSes, setMuzikSes] = useState(() => Math.round(muzikSeviyesi() * 100))

  return (
    <aside ref={kokRef} style={stil} className="ses-panel">
      <PanelBaslik baslik={ceviri('Ses')} tutamac={tutamac}>
        {tasindi && (
          <button className="icon-btn" onClick={sifirla} title={ceviri('Yerine döndür')}>
            ↺
          </button>
        )}
        <button className="icon-btn" onClick={onKapat} title={ceviri('Kapat')}>
          ✕
        </button>
      </PanelBaslik>

      <div className="ses-satir">
        <button
          className={`icon-btn ${sesler ? 'on' : ''}`}
          onClick={onSesler}
          title={sesler ? ceviri('Ses efektlerini kapat') : ceviri('Ses efektlerini aç')}
        >
          {sesler ? '🔊' : '🔈'}
        </button>
        <label className="ses-etiket" htmlFor="ses-efekt">
          {ceviri('Ses efektleri')}
        </label>
        <span className="ses-yuzde">%{efekt}</span>
        <input
          id="ses-efekt"
          className="ses-kaydirici"
          type="range"
          min={0}
          max={100}
          value={efekt}
          disabled={!sesler}
          onChange={(e) => {
            const v = Number(e.target.value)
            setEfekt(v)
            efektSeviyesiAyarla(v / 100)
          }}
        />
      </div>

      <div className="ses-satir">
        <button
          className={`icon-btn ${muzik ? 'on' : ''}`}
          onClick={onMuzik}
          title={muzik ? ceviri('Müziği kapat') : ceviri('Sakin arka plan müziği')}
        >
          ♪
        </button>
        <label className="ses-etiket" htmlFor="ses-muzik">
          {ceviri('Müzik')}
        </label>
        <span className="ses-yuzde">%{muzikSes}</span>
        <input
          id="ses-muzik"
          className="ses-kaydirici"
          type="range"
          min={0}
          max={100}
          value={muzikSes}
          onChange={(e) => {
            const v = Number(e.target.value)
            setMuzikSes(v)
            muzikSeviyesiAyarla(v / 100)
          }}
        />
        {/*
          Liste müzik kapalıyken de açık: parça seçmek müziği başlatıyor.
          Kullanıcı bir parça seçtiğinde çalmasını bekliyor.
        */}
        <div className="ses-parca">
          <Select
            deger={parca}
            secenekler={PARCALAR.map((p) => ({
              deger: p.id,
              etiket: `${p.simge}  ${ceviri(p.ad)}`,
            }))}
            onDegis={onParca}
            etiket={ceviri('Müzik parçası')}
          />
        </div>
      </div>

      {!sesler && (
        <small className="muted ses-not">
          {ceviri('Ses kapalı. Efektleri duymak için 🔊 düğmesini aç.')}
        </small>
      )}
      {/* Müziği açıp hiçbir şey duymamak bozukluk gibi görünüyor */}
      {sesler && muzik && muzikSes === 0 && (
        <small className="muted ses-not">{ceviri('Müzik açık ama sesi tamamen kısık.')}</small>
      )}
    </aside>
  )
}
