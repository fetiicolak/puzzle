import type { ReactNode } from 'react'

interface Props {
  baslik: ReactNode
  /** Başlığın sağına dizilen düğmeler */
  children?: ReactNode
}

/**
 * Yüzen panellerin başlık çubuğu.
 *
 * Taşıma artık panelin **tamamından** yapılıyor (`useSurukle`'nin tutamağı
 * panelin kök öğesine bağlı, olay buraya da oradan ulaşıyor). Bu çubuk yine
 * de duruyor: soldaki çift çizgi "buradan tut" demenin en kısa yolu ve
 * kapat/↺ düğmelerinin içeriğe binmeyen bir yeri oluyor.
 *
 * Tek tutamak burasıyken panel sol kenara itildiğinde ekranda kalan şeritte
 * yalnızca düğmeler kalıyordu; düğmeler sürüklemeden muaf olduğu için panel
 * bir daha geri çekilemiyordu.
 */
export default function PanelBaslik({ baslik, children }: Props) {
  return (
    <header className="panel-baslik">
      <span className="panel-tut" aria-hidden="true" />
      <b className="panel-baslik-ad">{baslik}</b>
      <span className="spacer" />
      {children}
    </header>
  )
}
