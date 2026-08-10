import { useEffect, useRef, useState } from 'react'
import { useDil, type Dil } from '../dil'
import { useModalErisim } from '../erisim'

interface Props {
  baslik: string
  ressam: string
  /** Puzzle'ı birlikte çözenlerin adları (sen dahil) */
  kisiler: string[]
  saniye: number
  parca: number
  /** Çözülen görselin dataURL'i — sertifikanın üstünde küçük görünür */
  gorsel: string
  onKapat: () => void
}

function sureMetni(sn: number, dil: Dil): string {
  const saat = Math.floor(sn / 3600)
  const dk = Math.floor((sn % 3600) / 60)
  const s = sn % 60
  if (dil === 'en') {
    if (saat > 0) return `${saat} h ${dk} min`
    if (dk > 0) return `${dk} min ${s} s`
    return `${s} s`
  }
  if (saat > 0) return `${saat} saat ${dk} dakika`
  if (dk > 0) return `${dk} dakika ${s} saniye`
  return `${s} saniye`
}

/**
 * Metni verilen genişliğe sığdır.
 *
 * Karakter saymak yetmiyor: "İİİİ" ile "iiii" aynı sayıda harf ama çok farklı
 * genişlikte. Önce yazı tipini kademeli küçültüyoruz, hâlâ sığmıyorsa sonunu
 * kırpıyoruz.
 */
function sigdir(
  c: CanvasRenderingContext2D,
  yazi: string,
  enFazlaGenislik: number,
  fontKur: (boyut: number) => string,
  baslangicBoyutu: number,
  enKucukBoyut: number,
): { yazi: string; font: string } {
  let boyut = baslangicBoyutu
  while (boyut > enKucukBoyut) {
    c.font = fontKur(boyut)
    if (c.measureText(yazi).width <= enFazlaGenislik) return { yazi, font: c.font }
    boyut -= 2
  }
  c.font = fontKur(enKucukBoyut)
  let kisa = yazi
  while (kisa.length > 1 && c.measureText(kisa + '…').width > enFazlaGenislik) {
    kisa = kisa.slice(0, -1)
  }
  return { yazi: kisa === yazi ? yazi : kisa + '…', font: c.font }
}

/** Yuvarlak köşeli dikdörtgen (eski Safari'de roundRect yok) */
function yuvarlakDikdortgen(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  g: number,
  yuk: number,
  r: number,
): void {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + g, y, x + g, y + yuk, r)
  c.arcTo(x + g, y + yuk, x, y + yuk, r)
  c.arcTo(x, y + yuk, x, y, r)
  c.arcTo(x, y, x + g, y, r)
  c.closePath()
}

/**
 * Köşe süsü: iki kısa çizgi ve uçlarında birer nokta.
 *
 * `yon` ile dört köşeye de aynı çizim döndürülerek uygulanıyor; her köşe için
 * ayrı koordinat yazmak yerine bağlamı döndürmek hem kısa hem hatasız.
 */
function koseSusu(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  aci: number,
  renk: string,
): void {
  c.save()
  c.translate(x, y)
  c.rotate(aci)
  c.strokeStyle = renk
  c.fillStyle = renk
  c.lineWidth = 1.4
  c.beginPath()
  c.moveTo(0, 26)
  c.lineTo(0, 6)
  c.arcTo(0, 0, 6, 0, 6)
  c.lineTo(26, 0)
  c.stroke()
  c.beginPath()
  c.arc(32, 0, 2, 0, Math.PI * 2)
  c.fill()
  c.beginPath()
  c.arc(0, 32, 2, 0, Math.PI * 2)
  c.fill()
  c.restore()
}

/** Küçük yapboz parçası silueti — köşelerdeki ve mühürdeki motif */
function yapbozParcasi(c: CanvasRenderingContext2D, x: number, y: number, b: number): void {
  const t = b * 0.22 // tırnak yarıçapı
  c.beginPath()
  c.moveTo(x, y)
  c.lineTo(x + b * 0.38, y)
  c.arc(x + b * 0.5, y, t, Math.PI, 0, true)
  c.lineTo(x + b, y)
  c.lineTo(x + b, y + b * 0.38)
  c.arc(x + b, y + b * 0.5, t, -Math.PI / 2, Math.PI / 2, false)
  c.lineTo(x + b, y + b)
  c.lineTo(x, y + b)
  c.closePath()
}

/** Ortadaki mühür: halka, yapboz motifi ve çevresinde ışık */
function muhur(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const isik = c.createRadialGradient(x, y, 2, x, y, r * 1.9)
  isik.addColorStop(0, 'rgba(255,196,120,0.30)')
  isik.addColorStop(1, 'rgba(255,196,120,0)')
  c.fillStyle = isik
  c.beginPath()
  c.arc(x, y, r * 1.9, 0, Math.PI * 2)
  c.fill()

  c.strokeStyle = 'rgba(255,210,150,0.75)'
  c.lineWidth = 1.6
  c.beginPath()
  c.arc(x, y, r, 0, Math.PI * 2)
  c.stroke()

  c.strokeStyle = 'rgba(255,210,150,0.30)'
  c.lineWidth = 1
  c.beginPath()
  c.arc(x, y, r - 5, 0, Math.PI * 2)
  c.stroke()

  // çevresine küçük ışınlar
  c.strokeStyle = 'rgba(255,210,150,0.45)'
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    c.beginPath()
    c.moveTo(x + Math.cos(a) * (r + 4), y + Math.sin(a) * (r + 4))
    c.lineTo(x + Math.cos(a) * (r + 8), y + Math.sin(a) * (r + 8))
    c.stroke()
  }

  c.fillStyle = 'rgba(255,214,160,0.9)'
  yapbozParcasi(c, x - 9, y - 9, 18)
  c.fill()
}

/**
 * Hatıra kartı.
 *
 * Canvas'a çiziliyor, çünkü indirilebilir olması gerekiyor: ekran görüntüsü
 * yerine gerçek bir PNG. Ölçüler 2x çizilip yarıya gösteriliyor ki
 * telefonlarda da net görünsün.
 */
export default function Certificate({
  baslik,
  ressam,
  kisiler,
  saniye,
  parca,
  gorsel,
  onKapat,
}: Props) {
  const { dil, ceviri } = useDil()
  const tuvalRef = useRef<HTMLCanvasElement>(null)
  const [hazir, setHazir] = useState(false)
  const kutuRef = useModalErisim(onKapat)

  useEffect(() => {
    const tuval = tuvalRef.current
    if (!tuval) return
    const G = 1000
    const Y = 700
    const O = 2 // ölçek
    tuval.width = G * O
    tuval.height = Y * O
    const c = tuval.getContext('2d')
    if (!c) return
    c.scale(O, O)

    const ciz = (resim: HTMLImageElement | null) => {
      // ---- zemin
      const zemin = c.createLinearGradient(0, 0, G, Y)
      zemin.addColorStop(0, '#251c3a')
      zemin.addColorStop(0.55, '#191227')
      zemin.addColorStop(1, '#120d1c')
      c.fillStyle = zemin
      c.fillRect(0, 0, G, Y)

      // iki köşeden gelen sıcak ışık
      const isikSag = c.createRadialGradient(G - 110, 70, 20, G - 110, 70, 560)
      isikSag.addColorStop(0, 'rgba(255,93,125,0.26)')
      isikSag.addColorStop(1, 'rgba(255,93,125,0)')
      c.fillStyle = isikSag
      c.fillRect(0, 0, G, Y)
      const isikSol = c.createRadialGradient(90, Y - 60, 20, 90, Y - 60, 460)
      isikSol.addColorStop(0, 'rgba(120,140,255,0.20)')
      isikSol.addColorStop(1, 'rgba(120,140,255,0)')
      c.fillStyle = isikSol
      c.fillRect(0, 0, G, Y)

      // arka planda soluk yapboz parçaları — kâğıt dokusu yerine geçiyor
      c.fillStyle = 'rgba(255,255,255,0.022)'
      const dagilim: [number, number, number, number][] = [
        [70, 120, 90, -0.3],
        [860, 470, 70, 0.5],
        [140, 520, 60, 0.9],
        [790, 130, 54, -0.8],
        [480, 610, 46, 0.2],
      ]
      for (const [px, py, pb, pa] of dagilim) {
        c.save()
        c.translate(px, py)
        c.rotate(pa)
        yapbozParcasi(c, -pb / 2, -pb / 2, pb)
        c.fill()
        c.restore()
      }

      // ---- çerçeveler
      c.strokeStyle = 'rgba(255,214,160,0.42)'
      c.lineWidth = 2
      yuvarlakDikdortgen(c, 26, 26, G - 52, Y - 52, 20)
      c.stroke()
      c.strokeStyle = 'rgba(255,214,160,0.16)'
      c.lineWidth = 1
      yuvarlakDikdortgen(c, 36, 36, G - 72, Y - 72, 14)
      c.stroke()

      const susRengi = 'rgba(255,214,160,0.55)'
      koseSusu(c, 48, 48, 0, susRengi)
      koseSusu(c, G - 48, 48, Math.PI / 2, susRengi)
      koseSusu(c, G - 48, Y - 48, Math.PI, susRengi)
      koseSusu(c, 48, Y - 48, -Math.PI / 2, susRengi)

      c.textAlign = 'center'

      // ---- üst başlık
      c.fillStyle = '#ffb0a0'
      c.font = '700 15px ui-sans-serif, system-ui, Segoe UI, sans-serif'
      const ustBaslik = dil === 'en' ? 'SOLVED TOGETHER' : 'BİRLİKTE ÇÖZÜLDÜ'
      // harfler arası boşluk: canvas'ta letter-spacing yok, elle yazılıyor
      const harfAra = 4
      const harfler = [...ustBaslik]
      const toplam =
        harfler.reduce((t, h) => t + c.measureText(h).width, 0) + harfAra * (harfler.length - 1)
      let hx = G / 2 - toplam / 2
      c.textAlign = 'left'
      for (const h of harfler) {
        c.fillText(h, hx, 76)
        hx += c.measureText(h).width + harfAra
      }
      c.textAlign = 'center'

      // başlığın iki yanına ince çizgi
      c.strokeStyle = 'rgba(255,176,160,0.35)'
      c.lineWidth = 1
      c.beginPath()
      c.moveTo(G / 2 - toplam / 2 - 60, 71)
      c.lineTo(G / 2 - toplam / 2 - 16, 71)
      c.moveTo(G / 2 + toplam / 2 + 16, 71)
      c.lineTo(G / 2 + toplam / 2 + 60, 71)
      c.stroke()

      // ---- görsel
      const gg = 240
      const gy = 158
      const gx = (G - gg) / 2
      const gyTop = 100
      if (resim) {
        // altında yumuşak gölge
        c.save()
        c.shadowColor = 'rgba(0,0,0,0.5)'
        c.shadowBlur = 26
        c.shadowOffsetY = 10
        c.fillStyle = '#000'
        yuvarlakDikdortgen(c, gx, gyTop, gg, gy, 12)
        c.fill()
        c.restore()

        c.save()
        yuvarlakDikdortgen(c, gx, gyTop, gg, gy, 12)
        c.clip()
        // en-boy oranını koruyarak kırp
        const oran = Math.max(gg / resim.naturalWidth, gy / resim.naturalHeight)
        const rg = resim.naturalWidth * oran
        const ry = resim.naturalHeight * oran
        c.drawImage(resim, gx + (gg - rg) / 2, gyTop + (gy - ry) / 2, rg, ry)
        c.restore()
        c.strokeStyle = 'rgba(255,214,160,0.5)'
        c.lineWidth = 1.5
        yuvarlakDikdortgen(c, gx, gyTop, gg, gy, 12)
        c.stroke()
      } else {
        // Görsel gelmediyse (eski kayıt, indirilemeyen dosya) yerinde boşluk
        // kalmasın: aynı çerçeveye üç yapboz parçasından bir madalyon çiziliyor.
        c.fillStyle = 'rgba(255,255,255,0.03)'
        yuvarlakDikdortgen(c, gx, gyTop, gg, gy, 12)
        c.fill()
        c.strokeStyle = 'rgba(255,214,160,0.28)'
        c.lineWidth = 1.5
        yuvarlakDikdortgen(c, gx, gyTop, gg, gy, 12)
        c.stroke()
        const mx = G / 2
        const my = gyTop + gy / 2
        const desen: [number, number, number, number][] = [
          [mx - 34, my - 4, 42, -0.12],
          [mx + 12, my - 26, 34, 0.34],
          [mx + 20, my + 20, 30, -0.5],
        ]
        for (const [px, py, pb, pa] of desen) {
          c.save()
          c.translate(px, py)
          c.rotate(pa)
          c.fillStyle = 'rgba(255,214,160,0.16)'
          yapbozParcasi(c, -pb / 2, -pb / 2, pb)
          c.fill()
          c.strokeStyle = 'rgba(255,214,160,0.30)'
          c.lineWidth = 1
          c.stroke()
          c.restore()
        }
      }

      // ---- eser adı — kenarlara 90'ar piksel pay bırakılıyor
      c.fillStyle = '#ffffff'
      const adSonuc = sigdir(
        c,
        baslik || ceviri('İsimsiz'),
        G - 180,
        (b) => `700 ${b}px ui-serif, Georgia, Cambria, Times New Roman, serif`,
        42,
        26,
      )
      c.font = adSonuc.font
      c.fillText(adSonuc.yazi, G / 2, 318)

      if (ressam) {
        c.fillStyle = '#d6c9e2'
        const rSonuc = sigdir(
          c,
          ressam,
          G - 200,
          (b) => `italic ${b}px ui-serif, Georgia, Cambria, Times New Roman, serif`,
          22,
          16,
        )
        c.font = rSonuc.font
        c.fillText(rSonuc.yazi, G / 2, 350)
      }

      // adın altına küçük süs: çizgi — elmas — çizgi
      const susY = ressam ? 376 : 348
      c.strokeStyle = 'rgba(255,214,160,0.34)'
      c.lineWidth = 1
      c.beginPath()
      c.moveTo(G / 2 - 110, susY)
      c.lineTo(G / 2 - 12, susY)
      c.moveTo(G / 2 + 12, susY)
      c.lineTo(G / 2 + 110, susY)
      c.stroke()
      c.fillStyle = 'rgba(255,214,160,0.6)'
      c.save()
      c.translate(G / 2, susY)
      c.rotate(Math.PI / 4)
      c.fillRect(-3.5, -3.5, 7, 7)
      c.restore()

      // ---- çözenler
      c.fillStyle = '#9b8ea8'
      c.font = '600 13px ui-sans-serif, system-ui, Segoe UI, sans-serif'
      c.fillText(dil === 'en' ? 'SOLVED BY' : 'ÇÖZENLER', G / 2, 416)

      c.fillStyle = '#ffd2dc'
      const kisiMetni =
        kisiler.length > 0 ? kisiler.join('  ·  ') : dil === 'en' ? 'You' : 'Sen'
      const kSonuc = sigdir(
        c,
        kisiMetni,
        G - 200,
        (b) => `600 ${b}px ui-sans-serif, system-ui, Segoe UI, sans-serif`,
        28,
        17,
      )
      c.font = kSonuc.font
      c.fillText(kSonuc.yazi, G / 2, 450)

      // ---- alt bilgiler: çerçeveli üç kutu
      const kutu = (merkezX: number, ust: string, alt: string) => {
        const kg = 200
        const ky = 74
        const kx = merkezX - kg / 2
        const kyTop = 486
        c.fillStyle = 'rgba(255,255,255,0.035)'
        yuvarlakDikdortgen(c, kx, kyTop, kg, ky, 12)
        c.fill()
        c.strokeStyle = 'rgba(255,214,160,0.20)'
        c.lineWidth = 1
        yuvarlakDikdortgen(c, kx, kyTop, kg, ky, 12)
        c.stroke()

        c.fillStyle = '#9b8ea8'
        c.font = '600 12px ui-sans-serif, system-ui, Segoe UI, sans-serif'
        c.fillText(ust, merkezX, kyTop + 26)
        c.fillStyle = '#f3ecf8'
        const d = sigdir(
          c,
          alt,
          kg - 24,
          (b) => `700 ${b}px ui-sans-serif, system-ui, Segoe UI, sans-serif`,
          22,
          13,
        )
        c.font = d.font
        c.fillText(d.yazi, merkezX, kyTop + 55)
      }
      kutu(G / 2 - 215, dil === 'en' ? 'TIME' : 'SÜRE', sureMetni(saniye, dil))
      kutu(G / 2, dil === 'en' ? 'PIECES' : 'PARÇA', String(parca))
      kutu(
        G / 2 + 215,
        dil === 'en' ? 'DATE' : 'TARİH',
        new Date().toLocaleDateString(dil === 'en' ? 'en-GB' : 'tr-TR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      )

      // ---- mühür ve alt yazı
      //
      // İç çerçeve y=664'te bitiyor; mühür ışınlarıyla birlikte 628'i,
      // yazı da 654'ü geçmemeli. Önceki ölçülerde ikisi çakışıyordu.
      muhur(c, G / 2, 596, 22)

      c.fillStyle = '#8a7f9c'
      c.font = '600 13px ui-sans-serif, system-ui, Segoe UI, sans-serif'
      c.fillText('Birlikte Puzzle', G / 2, 648)

      setHazir(true)
    }

    if (!gorsel) {
      ciz(null)
      return
    }
    const img = new Image()
    img.onload = () => ciz(img)
    img.onerror = () => ciz(null)
    img.src = gorsel
  }, [baslik, ressam, kisiler, saniye, parca, gorsel, dil, ceviri])

  const indir = () => {
    const tuval = tuvalRef.current
    if (!tuval) return
    tuval.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const temizAd = (baslik || 'puzzle').replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()
      a.href = url
      a.download = `birlikte-puzzle-${temizAd}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, 'image/png')
  }

  const paylas = () => {
    const tuval = tuvalRef.current
    if (!tuval) return
    // toBlob geri çağrısı void bekliyor: async gövde ayrı bir fonksiyona
    // alınıp `void` ile başlatılıyor, yoksa dönen söz kimsenin izlemediği
    // bir yerde kalıyor.
    tuval.toBlob((blob) => void paylasimiAc(blob), 'image/png')
  }

  const paylasimiAc = async (blob: Blob | null) => {
    if (!blob) return
    const dosya = new File([blob], 'birlikte-puzzle.png', { type: 'image/png' })
    try {
      const nav = navigator as Navigator & {
        canShare?: (d: { files: File[] }) => boolean
        share?: (d: { files: File[]; title?: string; text?: string }) => Promise<void>
      }
      if (nav.canShare?.({ files: [dosya] }) && nav.share) {
        await nav.share({
          files: [dosya],
          title: 'Birlikte Puzzle',
          text: `${baslik} — ${sureMetni(saniye, dil)}`,
        })
      }
    } catch {
      // kullanıcı vazgeçtiyse ya da desteklenmiyorsa indirme zaten var
    }
  }

  const paylasilabilir =
    typeof navigator !== 'undefined' && 'canShare' in navigator && 'share' in navigator

  return (
    <div className="modal-arka" onClick={onKapat}>
      <div
        className="sertifika-kutu"
        ref={kutuRef}
        role="dialog"
        aria-modal="true"
        aria-label={ceviri('Tamamlama sertifikası')}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tuvalin içeriği metin değil; okuyucu için başlık aria-label'da */}
        <canvas ref={tuvalRef} className="sertifika-tuval" />
        <div className="dialog-butonlar sertifika-butonlar">
          <button className="btn btn-ghost" onClick={onKapat}>
            {ceviri('Kapat')}
          </button>
          {paylasilabilir && (
            <button className="btn btn-secondary" disabled={!hazir} onClick={paylas}>
              {ceviri('Paylaş')}
            </button>
          )}
          <button className="btn btn-primary" disabled={!hazir} onClick={indir}>
            {ceviri('İndir')}
          </button>
        </div>
      </div>
    </div>
  )
}
