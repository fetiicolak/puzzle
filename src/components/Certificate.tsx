import { useEffect, useRef, useState } from 'react'

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

function sureMetni(sn: number): string {
  const saat = Math.floor(sn / 3600)
  const dk = Math.floor((sn % 3600) / 60)
  const s = sn % 60
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
  const tuvalRef = useRef<HTMLCanvasElement>(null)
  const [hazir, setHazir] = useState(false)

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
      // zemin
      const zemin = c.createLinearGradient(0, 0, G, Y)
      zemin.addColorStop(0, '#221a35')
      zemin.addColorStop(1, '#140f20')
      c.fillStyle = zemin
      c.fillRect(0, 0, G, Y)

      // köşedeki sıcak ışık
      const isik = c.createRadialGradient(G - 120, 90, 30, G - 120, 90, 520)
      isik.addColorStop(0, 'rgba(255,93,125,0.22)')
      isik.addColorStop(1, 'rgba(255,93,125,0)')
      c.fillStyle = isik
      c.fillRect(0, 0, G, Y)

      // ince çerçeve
      c.strokeStyle = 'rgba(255,210,220,0.35)'
      c.lineWidth = 2
      yuvarlakDikdortgen(c, 28, 28, G - 56, Y - 56, 18)
      c.stroke()
      c.strokeStyle = 'rgba(255,210,220,0.14)'
      c.lineWidth = 1
      yuvarlakDikdortgen(c, 38, 38, G - 76, Y - 76, 12)
      c.stroke()

      c.textAlign = 'center'

      // üst başlık
      c.fillStyle = '#ff8fa6'
      c.font = '600 17px ui-sans-serif, system-ui, Segoe UI, sans-serif'
      c.fillText('BİRLİKTE ÇÖZÜLDÜ', G / 2, 84)

      // görsel
      if (resim) {
        const gg = 250
        const gy = 165
        const gx = (G - gg) / 2
        const gyTop = 106
        c.save()
        yuvarlakDikdortgen(c, gx, gyTop, gg, gy, 12)
        c.clip()
        // en-boy oranını koruyarak kırp
        const oran = Math.max(gg / resim.naturalWidth, gy / resim.naturalHeight)
        const rg = resim.naturalWidth * oran
        const ry = resim.naturalHeight * oran
        c.drawImage(resim, gx + (gg - rg) / 2, gyTop + (gy - ry) / 2, rg, ry)
        c.restore()
        c.strokeStyle = 'rgba(255,255,255,0.18)'
        c.lineWidth = 1
        yuvarlakDikdortgen(c, gx, gyTop, gg, gy, 12)
        c.stroke()
      }

      // eser adı — kenarlara 90'ar piksel pay bırakılıyor
      c.fillStyle = '#ffffff'
      const adSonuc = sigdir(
        c,
        baslik || 'İsimsiz',
        G - 180,
        (b) => `700 ${b}px ui-sans-serif, system-ui, Segoe UI, sans-serif`,
        40,
        26,
      )
      c.font = adSonuc.font
      c.fillText(adSonuc.yazi, G / 2, 340)

      if (ressam) {
        c.fillStyle = '#cfc4da'
        const rSonuc = sigdir(
          c,
          ressam,
          G - 200,
          (b) => `italic ${b}px ui-sans-serif, system-ui, Segoe UI, sans-serif`,
          22,
          16,
        )
        c.font = rSonuc.font
        c.fillText(rSonuc.yazi, G / 2, 372)
      }

      // kişiler
      c.fillStyle = '#8d8299'
      c.font = '500 16px ui-sans-serif, system-ui, Segoe UI, sans-serif'
      c.fillText('ÇÖZENLER', G / 2, 428)

      c.fillStyle = '#ffd2dc'
      const kisiMetni = kisiler.length > 0 ? kisiler.join('  ·  ') : 'Sen'
      const kSonuc = sigdir(
        c,
        kisiMetni,
        G - 200,
        (b) => `600 ${b}px ui-sans-serif, system-ui, Segoe UI, sans-serif`,
        27,
        17,
      )
      c.font = kSonuc.font
      c.fillText(kSonuc.yazi, G / 2, 460)

      // alt bilgiler: süre / parça / tarih
      const kutu = (x: number, ust: string, alt: string) => {
        c.fillStyle = '#8d8299'
        c.font = '500 14px ui-sans-serif, system-ui, Segoe UI, sans-serif'
        c.fillText(ust, x, 540)
        c.fillStyle = '#efe7f5'
        c.font = '700 23px ui-sans-serif, system-ui, Segoe UI, sans-serif'
        c.fillText(alt, x, 572)
      }
      kutu(G / 2 - 250, 'SÜRE', sureMetni(saniye))
      kutu(G / 2, 'PARÇA', String(parca))
      kutu(
        G / 2 + 250,
        'TARİH',
        new Date().toLocaleDateString('tr-TR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      )

      // ayraç
      c.strokeStyle = 'rgba(255,255,255,0.10)'
      c.lineWidth = 1
      c.beginPath()
      c.moveTo(G / 2 - 300, 612)
      c.lineTo(G / 2 + 300, 612)
      c.stroke()

      c.fillStyle = '#6f6580'
      c.font = '500 15px ui-sans-serif, system-ui, Segoe UI, sans-serif'
      c.fillText('Birlikte Puzzle', G / 2, 642)

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
  }, [baslik, ressam, kisiler, saniye, parca, gorsel])

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

  const paylas = async () => {
    const tuval = tuvalRef.current
    if (!tuval) return
    tuval.toBlob(async (blob) => {
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
            text: `${baslik} — ${sureMetni(saniye)}`,
          })
        }
      } catch {
        // kullanıcı vazgeçtiyse ya da desteklenmiyorsa indirme zaten var
      }
    }, 'image/png')
  }

  const paylasilabilir =
    typeof navigator !== 'undefined' &&
    'canShare' in navigator &&
    'share' in navigator

  return (
    <div className="modal-arka" onClick={onKapat}>
      <div className="sertifika-kutu" onClick={(e) => e.stopPropagation()}>
        <canvas ref={tuvalRef} className="sertifika-tuval" />
        <div className="dialog-butonlar sertifika-butonlar">
          <button className="btn btn-ghost" onClick={onKapat}>
            Kapat
          </button>
          {paylasilabilir && (
            <button className="btn btn-secondary" disabled={!hazir} onClick={() => void paylas()}>
              Paylaş
            </button>
          )}
          <button className="btn btn-primary" disabled={!hazir} onClick={indir}>
            İndir
          </button>
        </div>
      </div>
    </div>
  )
}
