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
export default function TaniPaneli({ board }: { board: PuzzleBoard | null }) {
  const [satir, setSatir] = useState('')

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

  if (!satir) return null
  return (
    <div className="tani-paneli" role="status">
      {satir}
    </div>
  )
}
