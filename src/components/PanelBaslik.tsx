import type { ReactNode } from 'react'
import type { SurukleDurumu } from './surukle'

interface Props {
  baslik: ReactNode
  /** `useSurukle`'den gelen tutamak */
  tutamac: SurukleDurumu<HTMLElement>['tutamac']
  /** Başlığın sağına dizilen düğmeler */
  children?: ReactNode
}

/**
 * Yüzen panellerin başlık çubuğu — aynı zamanda taşıma tutamağı.
 *
 * Neden ayrı bir çubuk: panelin tamamı tutamak yapılmıştı ama sürükleme
 * düğme, video ve kutu üstünden başlamıyor. Görüşme penceresi baştan aşağı
 * `<video>` + düğme, orijinal görsel de baştan aşağı `<img>`; dokunmatikte
 * tutulacak yer kalmıyordu. Soldaki çizgiler "buradan tut" demenin en kısa
 * yolu, çubuğun boyu da parmağa göre.
 */
export default function PanelBaslik({ baslik, tutamac, children }: Props) {
  return (
    <header className="panel-baslik panel-tutamac" {...tutamac}>
      <span className="panel-tut" aria-hidden="true" />
      <b className="panel-baslik-ad">{baslik}</b>
      <span className="spacer" />
      {children}
    </header>
  )
}
