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

/**
 * Panelden ekranda kalması gereken en küçük parça.
 *
 * Önce 24 px'ti ve panel gerçekten "kaybediliyordu": ekranda kalan şeritte
 * ne başlık çubuğunun tutulacak boşluğu ne de ↺ düğmesi oluyordu, yani
 * kenara itilen panel bir daha geri çekilemiyordu. Tutamağın kavranabilir bir
 * bölümü hep görünür kalmalı; 140 px başlık çubuğunun çift çizgisini ve
 * düğmelerini içeride tutuyor.
 */
const YATAY_PAY = 140
/** Başlık çubuğu en az 40 px; altta o kadarı görünsün ki tutulabilsin */
const DIKEY_PAY = 44

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
  // Dar ekranda panel payın kendisinden dar olabilir; o zaman tamamı görünsün
  const pay = Math.min(YATAY_PAY, en)
  return {
    x: Math.min(Math.max(pay - en, x), window.innerWidth - pay),
    y: Math.min(Math.max(ust, y), window.innerHeight - DIKEY_PAY),
  }
}

/*
  Sürüklemenin başlamadığı yerler.

  Düğme/kutu kendi işini yapmalı; `video` ve `img` üstünde tarayıcının kendi
  sürüklemesi devreye giriyor. `.panel-kaydir` ise panel içindeki kaydırılabilir
  listeler (sohbet gövdesi, oda listesi): orada parmak hareketi kaydırmak
  demek, paneli taşımak değil.
*/
const SURUKLENMEZ = 'button, input, textarea, select, a, video, img, .panel-kaydir'

export interface SurukleDurumu<T extends HTMLElement> {
  /** Panelin kök öğesine verilir */
  kokRef: React.RefObject<T | null>
  /** Panelin kök öğesine verilir; taşınmadıysa boş */
  stil: CSSProperties
  /**
   * Panelin **kök** öğesine yayılır — başlığa değil.
   *
   * Başlık çubuğu tek tutamakken panel sol kenara itildiğinde ekranda kalan
   * şeritte yalnızca kapat/↺ düğmeleri kalıyordu; düğmeler sürüklemeden muaf
   * olduğu için panel bir daha geri çekilemiyordu. Artık panelin her boş yeri
   * tutamak, başlıktaki çift çizgi de "buradan tut" işareti olarak duruyor.
   */
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
    if ((e.target as HTMLElement).closest(SURUKLENMEZ)) return
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
    /*
      `transform: none` şart. Varsayılan yerinde ortalanan panel (`.ses-panel`)
      `translateX(-50%)` ile duruyor; taşındıktan sonra da üstünde kalırsa
      panel bıraktığın yerin yarım panel boyu solunda çiziliyor ve sol sınıra
      dayandığında tamamen ekran dışına çıkıyor — geri çekilemiyordu.

      Önce bunu CSS `[style*='left']` seçicisi yapıyordu ama **hiç
      eşleşmiyordu**: tarayıcı left/top/right/bottom'ı stil özniteliğinde
      `inset:` kısayoluna topluyor, öznitelikte "left" diye bir metin kalmıyor.
      Satır içi stil olarak vermek bu tuzağı tamamen atlıyor.
    */
    stil: konum
      ? { left: konum.x, top: konum.y, right: 'auto', bottom: 'auto', transform: 'none' }
      : {},
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

// --------------------------------------------------------------- yakınlaştırma

/** Görselin en fazla kaç kat büyütülebileceği */
const EN_COK_OLCEK = 6
/** Çift dokunuşun götürdüğü ara kademe */
const CIFT_DOKUNUS_OLCEGI = 2.5

interface Zum {
  olcek: number
  x: number
  y: number
}

const BASLANGIC: Zum = { olcek: 1, x: 0, y: 0 }

export interface YakinlastirDurumu<T extends HTMLElement> {
  /** Görseli saran, taşmayı kesen çerçeveye verilir */
  cerceveRef: React.RefObject<T | null>
  /** Görselin kendisine verilir */
  gorselStil: CSSProperties
  /** Çerçeveye yayılır */
  tutamac: {
    onPointerDown: (e: ReactPointerEvent) => void
    onPointerMove: (e: ReactPointerEvent) => void
    onPointerUp: (e: ReactPointerEvent) => void
    onPointerCancel: (e: ReactPointerEvent) => void
  }
  /** Görsel büyütülmüş durumda mı */
  yakin: boolean
  zumSifirla: () => void
}

/**
 * Panel içindeki görseli yakınlaştırma.
 *
 * Panelin boyu sabit kalıyor, büyüyen görselin kendisi: telefonda iki parmak,
 * farede kaydırma tekerleği, her ikisinde çift dokunuş. Önce paneli köşesinden
 * büyütmeyi denemiştik, kullanışlı bulunmadı — küçük bir pencerede parçayı
 * ayırt etmek için gereken şey panelin büyümesi değil, görselin yakınlaşması.
 *
 * Çerçeve kendi dokunuşlarını tüketiyor (`stopPropagation`), yani görselin
 * üstünden panel taşınmıyor. Panel yalnızca başlık çubuğundan taşınıyor;
 * ikisinin ayrı olması dokunmatikte tek belirsizliği ortadan kaldırıyor.
 */
export function useYakinlastir<T extends HTMLElement>(): YakinlastirDurumu<T> {
  const cerceveRef = useRef<T | null>(null)
  const [zum, setZum] = useState<Zum>(BASLANGIC)
  // aynı anda ekrandaki parmaklar (fare tek "parmak" sayılır)
  const parmaklarRef = useRef(new Map<number, { x: number; y: number }>())
  const kiskacRef = useRef<{ mesafe: number; x: number; y: number } | null>(null)
  const dokunusRef = useRef<{ zaman: number; x: number; y: number } | null>(null)

  /** Görselin çerçeveden dışarı kaçmasını engelle */
  const sinirlaZum = useCallback((z: Zum): Zum => {
    const c = cerceveRef.current
    if (!c) return z
    const r = c.getBoundingClientRect()
    // görsel 1 katta çerçeveyi tam dolduruyor: taşma payı (olcek - 1) kadar
    const enAzX = r.width - r.width * z.olcek
    const enAzY = r.height - r.height * z.olcek
    return {
      olcek: z.olcek,
      x: Math.min(0, Math.max(enAzX, z.x)),
      y: Math.min(0, Math.max(enAzY, z.y)),
    }
  }, [])

  /** İmleç/parmak nerede duruyorsa orayı sabit tutarak ölçekle */
  const noktadaOlcekle = useCallback(
    (px: number, py: number, carpan: number) => {
      setZum((z) => {
        const yeni = Math.min(EN_COK_OLCEK, Math.max(1, z.olcek * carpan))
        const f = yeni / z.olcek
        return sinirlaZum({
          olcek: yeni,
          x: px - (px - z.x) * f,
          y: py - (py - z.y) * f,
        })
      })
    },
    [sinirlaZum],
  )

  /** Olay konumunu çerçevenin sol üstüne göre ver */
  const yerel = useCallback((x: number, y: number) => {
    const c = cerceveRef.current
    if (!c) return { x, y }
    const r = c.getBoundingClientRect()
    return { x: x - r.left, y: y - r.top }
  }, [])

  const zumSifirla = useCallback(() => {
    kiskacRef.current = null
    setZum(BASLANGIC)
  }, [])

  /*
    Tekerlek elle bağlanıyor: React kendi `onWheel` dinleyicisini kök öğeye
    passive olarak takıyor, orada preventDefault çağrılamıyor ve tekerlek
    sayfayı kaydırmaya devam ediyor.
  */
  useEffect(() => {
    const c = cerceveRef.current
    if (!c) return
    const tekerlek = (e: WheelEvent) => {
      e.preventDefault()
      const n = yerel(e.clientX, e.clientY)
      noktadaOlcekle(n.x, n.y, Math.exp(-e.deltaY * 0.0016))
    }
    c.addEventListener('wheel', tekerlek, { passive: false })
    return () => c.removeEventListener('wheel', tekerlek)
  }, [noktadaOlcekle, yerel])

  // Panel/pencere boyu değişince görsel çerçevenin dışında kalmış olabilir
  useEffect(() => {
    const ayarla = () => setZum((z) => sinirlaZum(z))
    window.addEventListener('resize', ayarla)
    return () => window.removeEventListener('resize', ayarla)
  }, [sinirlaZum])

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    parmaklarRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (parmaklarRef.current.size === 2) {
      const [a, b] = [...parmaklarRef.current.values()]
      kiskacRef.current = {
        mesafe: Math.hypot(a.x - b.x, a.y - b.y),
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
      }
    }
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // yakalanamazsa yakınlaştırma yine çalışır
    }
    e.preventDefault()
    // Görselin üstü kendi bölgesi: buradaki dokunuş paneli taşımasın
    e.stopPropagation()
  }, [])

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const parmaklar = parmaklarRef.current
      const onceki = parmaklar.get(e.pointerId)
      if (!onceki) return
      parmaklar.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (parmaklar.size >= 2) {
        const [a, b] = [...parmaklar.values()]
        const mesafe = Math.hypot(a.x - b.x, a.y - b.y)
        const orta = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const k = kiskacRef.current
        kiskacRef.current = { mesafe, ...orta }
        if (!k || k.mesafe <= 0) return
        // iki parmak birlikte kayarsa görsel de kaysın
        const kayma = { x: orta.x - k.x, y: orta.y - k.y }
        const n = yerel(orta.x, orta.y)
        setZum((z) => sinirlaZum({ ...z, x: z.x + kayma.x, y: z.y + kayma.y }))
        noktadaOlcekle(n.x, n.y, mesafe / k.mesafe)
        return
      }

      // tek parmak: yalnızca yakınlaşmışken kaydırmak anlamlı
      setZum((z) =>
        z.olcek <= 1
          ? z
          : sinirlaZum({
              ...z,
              x: z.x + (e.clientX - onceki.x),
              y: z.y + (e.clientY - onceki.y),
            }),
      )
    },
    [noktadaOlcekle, sinirlaZum, yerel],
  )

  const bitir = useCallback(
    (e: ReactPointerEvent) => {
      const parmaklar = parmaklarRef.current
      const bas = parmaklar.get(e.pointerId)
      parmaklar.delete(e.pointerId)
      if (parmaklar.size < 2) kiskacRef.current = null
      if (!bas) return

      /*
        Çift dokunuş elle sayılıyor: `dblclick` dokunmatikte her tarayıcıda
        çıkmıyor. Parmak kaymışsa (kaydırma) dokunuş sayılmıyor.
      */
      const simdi = Date.now()
      const onceki = dokunusRef.current
      const kaydi = Math.hypot(e.clientX - bas.x, e.clientY - bas.y) > 10
      dokunusRef.current = kaydi ? null : { zaman: simdi, x: e.clientX, y: e.clientY }
      if (
        !kaydi &&
        onceki &&
        simdi - onceki.zaman < 320 &&
        Math.hypot(e.clientX - onceki.x, e.clientY - onceki.y) < 24
      ) {
        dokunusRef.current = null
        const n = yerel(e.clientX, e.clientY)
        setZum((z) => {
          if (z.olcek > 1) return BASLANGIC
          const f = CIFT_DOKUNUS_OLCEGI
          return sinirlaZum({ olcek: f, x: n.x - n.x * f, y: n.y - n.y * f })
        })
      }
    },
    [sinirlaZum, yerel],
  )

  return {
    cerceveRef,
    gorselStil: {
      transform: `translate(${zum.x}px, ${zum.y}px) scale(${zum.olcek})`,
      transformOrigin: '0 0',
    },
    tutamac: {
      onPointerDown,
      onPointerMove,
      onPointerUp: bitir,
      onPointerCancel: bitir,
    },
    yakin: zum.olcek > 1,
    zumSifirla,
  }
}
