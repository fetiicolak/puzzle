// Oyun ekranındaki yüzen panelleri (kameralar, sohbet, orijinal görsel,
// odadakiler) kullanıcının istediği yere taşıyabilmesi için ortak kanca.
//
// Neden sabit yerleşim yetmiyor: aynı anda açık panel sayısı 0 ile 4 arasında
// değişiyor, boyları içeriğe göre büyüyor ve ekran 320 px'den 1600 px'e kadar
// her şey olabiliyor. Hangi varsayılanı seçersek seçelim bir birleşimde
// çakışıyor — daha önce "sohbet açıksa önizlemeyi sola kaydır" diye tek bir
// çakışmaya yama yazılmış, o da yenisini doğurmuştu.
//
// Varsayılan yerler CSS'te duruyor. Panel taşınana kadar hiçbir satır içi stil
// verilmiyor; böylece duyarlı kurallar (media query) olduğu gibi çalışıyor.
// Taşındığı anda left/top'a geçiliyor ve yeri tarayıcıda saklanıyor.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'

interface Konum {
  x: number
  y: number
}

const anahtar = (ad: string) => `puzzle:panel:${ad}`

/** Panelin ekran dışında kalmasını engelleyecek en küçük görünür pay */
const PAY = 24

function oku(ad: string): Konum | null {
  try {
    const ham = localStorage.getItem(anahtar(ad))
    if (!ham) return null
    const k = JSON.parse(ham) as Konum
    return Number.isFinite(k?.x) && Number.isFinite(k?.y) ? k : null
  } catch {
    // bozuk kayıt varsayılan yeri kullandırsın, oyunu bozmasın
    return null
  }
}

function yaz(ad: string, k: Konum | null): void {
  try {
    if (k) localStorage.setItem(anahtar(ad), JSON.stringify(k))
    else localStorage.removeItem(anahtar(ad))
  } catch {
    // depolama kapalıysa yer bu oturumda tutulur, kalıcı olmaz
  }
}

/** Üst çubuk panelin altında kalmasın */
function ustSinir(): number {
  const cubuk = document.querySelector('.game-topbar')
  return cubuk ? cubuk.getBoundingClientRect().height : 56
}

/**
 * Paneli ekranda tutar: en az PAY kadarı görünür kalır. Yüksekliği gerekmiyor —
 * üstte üst çubuk, altta pencere kenarı zaten sınır.
 */
function sinirla(x: number, y: number, en: number): Konum {
  const ust = ustSinir()
  return {
    x: Math.min(Math.max(PAY - en, x), window.innerWidth - PAY),
    y: Math.min(Math.max(ust, y), window.innerHeight - PAY),
  }
}

export interface SurukleDurumu<T extends HTMLElement> {
  /** Panelin kök öğesine verilir */
  kokRef: React.RefObject<T | null>
  /** Panelin kök öğesine verilir; taşınmadıysa boş */
  stil: CSSProperties
  /** Tutamağa (başlık ya da panelin tamamı) yayılır */
  tutamac: {
    onPointerDown: (e: ReactPointerEvent) => void
    onPointerMove: (e: ReactPointerEvent) => void
    onPointerUp: (e: ReactPointerEvent) => void
    onPointerCancel: (e: ReactPointerEvent) => void
  }
  /** Panel varsayılan yerinden taşındı mı (geri döndür düğmesi buna bakar) */
  tasindi: boolean
  /** Varsayılan yere geri döndür */
  sifirla: () => void
}

/**
 * @param ad Panelin depolama anahtarı; her panel için ayrı olmalı.
 */
export function useSurukle<T extends HTMLElement>(ad: string): SurukleDurumu<T> {
  const kokRef = useRef<T | null>(null)
  const [konum, setKonum] = useState<Konum | null>(() => oku(ad))
  // sürükleme sırasında imlecin panel içindeki sapması
  const kavramaRef = useRef<{ dx: number; dy: number } | null>(null)

  // Saklanan yer, ekran o zamandan beri küçüldüyse dışarıda kalmış olabilir:
  // ilk yerleşimden sonra bir kez sınırların içine çek.
  useLayoutEffect(() => {
    const kok = kokRef.current
    if (!konum || !kok) return
    const r = kok.getBoundingClientRect()
    const d = sinirla(konum.x, konum.y, r.width)
    if (d.x !== konum.x || d.y !== konum.y) setKonum(d)
    // yalnızca açılışta: sonraki değişiklikleri sürükleme kendisi sınırlıyor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ekran döndürülünce ya da pencere küçülünce panel dışarıda kalmasın
  useEffect(() => {
    const ayarla = () => {
      const kok = kokRef.current
      if (!kok) return
      setKonum((k) => {
        if (!k) return k
        const r = kok.getBoundingClientRect()
        return sinirla(k.x, k.y, r.width)
      })
    }
    window.addEventListener('resize', ayarla)
    return () => window.removeEventListener('resize', ayarla)
  }, [])

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    const kok = kokRef.current
    if (!kok) return
    // Düğme, kutu ve yazı alanlarının üstünden sürükleme başlamasın; oradaki
    // dokunuş kendi işini yapmalı.
    if ((e.target as HTMLElement).closest('button, input, textarea, select, a, video')) return
    const r = kok.getBoundingClientRect()
    kavramaRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top }
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // yakalanamazsa sürükleme yine çalışır, yalnızca öğeden çıkınca kopar
    }
    // dokunmatikte sayfanın kaymasını ve metin seçimini engelle
    e.preventDefault()
  }, [])

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const kavrama = kavramaRef.current
    const kok = kokRef.current
    if (!kavrama || !kok) return
    const r = kok.getBoundingClientRect()
    setKonum(sinirla(e.clientX - kavrama.dx, e.clientY - kavrama.dy, r.width))
  }, [])

  const bitir = useCallback(() => {
    if (!kavramaRef.current) return
    kavramaRef.current = null
    // sürükleme bitince yaz: her karede localStorage'a yazmak gereksiz
    setKonum((k) => {
      yaz(ad, k)
      return k
    })
  }, [ad])

  const sifirla = useCallback(() => {
    kavramaRef.current = null
    setKonum(null)
    yaz(ad, null)
  }, [ad])

  return {
    kokRef,
    stil: konum ? { left: konum.x, top: konum.y, right: 'auto', bottom: 'auto' } : {},
    tutamac: {
      onPointerDown,
      onPointerMove,
      onPointerUp: bitir,
      onPointerCancel: bitir,
    },
    tasindi: konum !== null,
    sifirla,
  }
}
