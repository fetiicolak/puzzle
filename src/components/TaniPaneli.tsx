import { useEffect, useState } from 'react'
import type { PuzzleBoard } from '../engine/board'

/**
 * Cihaz tanılama katmanı — adres sonuna `#tani` yazınca çıkar.
 *
 * Neden var: zayıf cihazdaki takılma aylarca ölçülemedi. `__puzzle` yalnızca
 * dev derlemesinde tanımlı, Android Chrome'da konsol yok ve sorun tam da
 * canlıdaki gerçek telefonda yaşanıyor. "Ölçmeden iyileştirme yazma" kuralı
 * ancak ölçmek mümkünse işe yarıyor.
 *
 * Bilerek çirkin ve küçük: geliştirme aracı, ürünün parçası değil. Metin
 * çevrilmiyor — okuyan kişi biziz.
 */
/**
 * Cihazın bildirdiği güvenli alan payları.
 *
 * iPhone'da üst çubuk saatin altına giriyor ama Android'de sorun yok; sebebi
 * ölçmeden bilinemez. `env(safe-area-inset-*)` doğrudan JS'ten okunamıyor,
 * bir öğeye yazdırıp hesaplanmış değerine bakmak gerekiyor.
 */
function guvenliAlan(): string {
  const olcek = document.createElement('div')
  olcek.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;' +
    'top:env(safe-area-inset-top,0px);left:env(safe-area-inset-left,0px);' +
    'bottom:env(safe-area-inset-bottom,0px);right:env(safe-area-inset-right,0px)'
  document.body.appendChild(olcek)
  const h = getComputedStyle(olcek)
  const yuvarla = (d: string) => Math.round(parseFloat(d) || 0)
  const metin = `güvenli alan ü${yuvarla(h.top)} a${yuvarla(h.bottom)} s${yuvarla(h.left)} sğ${yuvarla(h.right)}`
  olcek.remove()
  // Kurulu uygulamada mı, sekmede mi: iOS'ta pay yalnızca kurulu uygulamada gelir
  const kurulu =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  return `${metin} · ${kurulu ? 'kurulu' : 'sekme'}`
}

export default function TaniPaneli({ board }: { board: PuzzleBoard | null }) {
  const [satir, setSatir] = useState('')
  const [alan] = useState(guvenliAlan)

  useEffect(() => {
    if (!board) return
    // Yarım saniye: sayaç okunduğunda sıfırlandığı için değer hep son
    // aralığa ait. Daha sık okumak fps'i gürültülü, daha seyrek okumak
    // takılmanın olduğu anı kaçırır hâle getiriyor.
    const zamanlayici = setInterval(() => {
      const t = board.tani()
      /*
        Boştayken hiç kare çizilmiyor (tasarım gereği: değişen bir şey yok).
        Orada "0.00 ms · 0 fps" yazmak paneli bozuk gösteriyor — ölçüm ancak
        parça sürüklenirken anlamlı. Durumu açıkça söylüyoruz.
      */
      const olcum =
        t.fps > 0
          ? `render ${t.ortRender.toFixed(2)} ms · ${Math.round(t.fps)} fps`
          : 'boşta — ölçmek için parça sürükle'
      setSatir(
        `${t.parca} parça · dpr ${t.dpr} · ${t.zayif ? 'zayıf' : 'normal'} cihaz · ` +
          `hafifMod ${t.hafifMod ? 'açık' : 'kapalı'} · ${olcum}`,
      )
    }, 500)
    return () => clearInterval(zamanlayici)
  }, [board])

  return (
    <div className="tani-paneli" role="status">
      {/* Güvenli alan oyun başlamadan da okunabilsin — tuval kurulmasını beklemez */}
      <div>{alan}</div>
      {satir && <div>{satir}</div>}
    </div>
  )
}
