import { useEffect, useState } from 'react'
import type { PuzzleBoard } from '../engine/board'

/**
 * Cihaz tanılama katmanı — adres sonuna `?tani` yazınca çıkar.
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
 * Cihazın bildirdiği güvenli alan payları ve üst çubuğun bunu uygulayıp
 * uygulamadığı.
 *
 * İki sayı birden gerekiyor, çünkü iki ayrı arıza aynı belirtiyi veriyor:
 * cihaz payı hiç bildirmiyorsa `ü` sıfır çıkar, bildirip de dolgu
 * uygulanmıyorsa `ü` doluyken `çubuk` küçük kalır. Bir kez tam olarak ikincisi
 * oldu: dar ekran kuralı `.game-topbar` dolgusunu kısayolla eziyordu.
 *
 * Paylar `--guvenli-*` değişkenlerinden okunuyor, doğrudan `env()`'den değil —
 * düzenin gerçekten kullandığı değer bu, ayrıca değişken masaüstünde elle
 * ayarlanıp sınanabiliyor.
 */
function guvenliAlan(): string {
  const olcek = document.createElement('div')
  olcek.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;' +
    'top:var(--guvenli-ust);left:var(--guvenli-sol);' +
    'bottom:var(--guvenli-alt);right:var(--guvenli-sag)'
  document.body.appendChild(olcek)
  const h = getComputedStyle(olcek)
  const yuvarla = (d: string | undefined) => Math.round(parseFloat(d ?? '') || 0)
  const metin = `güvenli alan ü${yuvarla(h.top)} a${yuvarla(h.bottom)} s${yuvarla(h.left)} sğ${yuvarla(h.right)}`
  olcek.remove()

  const cubuk = document.querySelector('.game-topbar')
  const dolgu = cubuk ? yuvarla(getComputedStyle(cubuk).paddingTop) : null

  // Kurulu uygulamada mı, sekmede mi: iOS'ta pay yalnızca kurulu uygulamada gelir
  const kurulu =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  return `${metin} · çubuk ${dolgu === null ? '—' : `${dolgu}px`} · ${kurulu ? 'kurulu' : 'sekme'}`
}

export default function TaniPaneli({ board }: { board: PuzzleBoard | null }) {
  const [satir, setSatir] = useState('')
  // Üst çubuk gecikmeli çiziliyor ve ekran döndürülünce paylar değişiyor;
  // tek seferlik ölçüm ikisini de kaçırıyordu.
  const [alan, setAlan] = useState(guvenliAlan)

  useEffect(() => {
    // Yarım saniye: sayaç okunduğunda sıfırlandığı için değer hep son
    // aralığa ait. Daha sık okumak fps'i gürültülü, daha seyrek okumak
    // takılmanın olduğu anı kaçırır hâle getiriyor.
    const zamanlayici = setInterval(() => {
      setAlan(guvenliAlan())
      if (!board) return
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
