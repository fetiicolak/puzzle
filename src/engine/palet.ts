/*
  Zemin paleti — tuvalin arka plan rengi fotoğraftan türetilir.

  Sabit koyu mor zemin (#1a1426) koyu fotoğraflarda parçaları yutuyordu:
  tepside duran koyu bir parça ile zemin arasında kontrast kalmadığı için
  parça kaybolmuş gibi görünüyor, kullanıcı elindekini bulamıyordu.

  Seçim **saf ve belirlenimci**: aynı fotoğraf her cihazda aynı zemini verir.
  Palet ağdan gönderilmiyor, iki taraf da aynı hesabı kendisi yapıyor — oda
  ortağıyla farklı renk görmemenin yolu bu.
*/

export interface Palet {
  /** Tuvalin tamamını dolduran zemin */
  zemin: string
  /** Çerçeve alanının hafif dolgusu */
  cerceve: string
  /** Çerçevenin kenar çizgisi */
  kenar: string
  /** Tepsi ayracı ve hayalet ızgara */
  cizgi: string
  /** Zeminin üstünde okunması gereken ince kontur (imleç oku) */
  kontur: string
  /** Zemin açık renk mi — üst katman siyaha mı beyaza mı dönecek */
  acik: boolean
}

/** Fotoğraf okunamadığında kullanılan, eskiden beri sabit olan renkler */
export const VARSAYILAN_PALET: Palet = {
  zemin: '#1a1426',
  cerceve: 'rgba(255,255,255,0.05)',
  kenar: 'rgba(255,255,255,0.35)',
  cizgi: 'rgba(255,255,255,0.07)',
  kontur: 'rgba(255,255,255,0.9)',
  acik: false,
}

/** Parlaklık dağılımının kaç kovaya bölüneceği */
const KOVA = 32
/**
 * Bu orandan düşük kontrastta parça zemine kaynıyor sayılır.
 *
 * WCAG'ın grafik eşiği 3; burada 2,5 seçildi. 14 hazır eser üzerinde
 * ölçüldü (ölçüt: kontrastı 1,5'in altında kalan parça sayısı, 4.200 parça):
 * eski sabit zemin 956, eşik 2 → 136, eşik 2,5 → 107, eşik 3 → 107.
 * 3'ün 2,5'e getirdiği bir kazanç yok; buna karşılık iki eserde daha
 * (Çığlık, Kedi) zemini boş yere ağartıyordu.
 */
const ESIK = 2.5
/**
 * Eşit derecede okunur iki aday varsa koyu olan seçilsin — uygulamanın
 * teması koyu, zemini gereksiz yere ağartmak oyunun görüntüsünü bozuyor.
 */
const KOYU_EGILIM = 0.2
/** Aday zemin açıklıkları; uçlar bilerek dışarıda (saf siyah/beyaz olmasın) */
const EN_KOYU = 0.08
const EN_ACIK = 0.86
const ADIM = 0.02
/** Renksiz fotoğraf için temanın kendi moru */
const TEMA_TONU = 260

/** sRGB kanalını ışık şiddetine çevir (WCAG) */
function kanal(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** WCAG bağıl parlaklık, 0-1 */
function parlaklik(r: number, g: number, b: number): number {
  return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b)
}

/**
 * Işık şiddetini algısal eksene (sRGB gri karşılığı) taşı.
 *
 * Kovalar bu eksende ayrılıyor, çünkü ışık şiddeti koyu uçta çok sıkışık:
 * eşit aralıklı 32 kovanın ilki 0-0.031'i tek başına kaplıyor ve içine düşen
 * karanlık fotoğraf kova ortasıyla temsil edilince kontrast 3 sanılıp
 * gerçekte 2,8 çıkıyordu.
 */
function algisal(y: number): number {
  return y <= 0.0031308 ? y * 12.92 : 1.055 * y ** (1 / 2.4) - 0.055
}

/** İki bağıl parlaklık arasındaki kontrast oranı, 1-21 */
function kontrast(a: number, b: number): number {
  return a > b ? (a + 0.05) / (b + 0.05) : (b + 0.05) / (a + 0.05)
}

/** RGB (0-255) -> [ton 0-360, doygunluk 0-1, açıklık 0-1] */
function hsl(r: number, g: number, b: number): [number, number, number] {
  const kr = r / 255
  const kg = g / 255
  const kb = b / 255
  const enBuyuk = Math.max(kr, kg, kb)
  const enKucuk = Math.min(kr, kg, kb)
  const fark = enBuyuk - enKucuk
  const l = (enBuyuk + enKucuk) / 2
  if (fark === 0) return [0, 0, l]
  const s = fark / (1 - Math.abs(2 * l - 1))
  let h: number
  if (enBuyuk === kr) h = ((kg - kb) / fark) % 6
  else if (enBuyuk === kg) h = (kb - kr) / fark + 2
  else h = (kr - kg) / fark + 4
  h *= 60
  return [(h + 360) % 360, s, l]
}

/** [ton 0-360, doygunluk 0-1, açıklık 0-1] -> RGB (0-255) */
function hslRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ]
}

function onaltilik(r: number, g: number, b: number): string {
  const iki = (v: number) => v.toString(16).padStart(2, '0')
  return `#${iki(r)}${iki(g)}${iki(b)}`
}

/**
 * Örneklenmiş piksellerden zemin paleti üret.
 *
 * `rgba` bir `ImageData.data`: dörtlü gruplar hâlinde R,G,B,A.
 *
 * Yöntem: fotoğrafın parlaklık dağılımı kovalara ayrılıyor, sonra her aday
 * zemin için "bu zeminde kaç örnek kaynardı" cezası hesaplanıp en az ceza
 * alan seçiliyor. Ortalama parlaklığa bakmak yetmiyordu — yarısı gökyüzü
 * yarısı gölge olan fotoğrafın ortalaması orta griyi işaret ediyor ve orta
 * gri **iki** uca da yakın çıkabiliyor. Dağılıma bakınca aynı fotoğrafta
 * gerçekten de orta ton kazanıyor, ama bu sefer haklı sebeple.
 */
export function paletCikar(rgba: Uint8ClampedArray): Palet {
  const kova = new Float64Array(KOVA)
  let toplam = 0
  // Ton ortalaması açısal alınmalı: 350° ile 10°yi toplayıp ikiye bölmek
  // 180° (tam ters renk) veriyor. Vektör toplamı bu tuzağa düşmüyor.
  let tonX = 0
  let tonY = 0
  let doygunlukToplam = 0

  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 8) continue // saydam piksel fotoğrafın rengi değil
    const r = rgba[i]
    const g = rgba[i + 1]
    const b = rgba[i + 2]
    const y = parlaklik(r, g, b)
    kova[Math.min(KOVA - 1, Math.floor(algisal(y) * KOVA))]++
    toplam++
    const [ton, doygunluk] = hsl(r, g, b)
    const rad = (ton * Math.PI) / 180
    tonX += Math.cos(rad) * doygunluk
    tonY += Math.sin(rad) * doygunluk
    doygunlukToplam += doygunluk
  }

  if (toplam === 0) return VARSAYILAN_PALET

  // Baskın ton yeterince belirginse zemin onun **tersi** oluyor: fotoğrafın
  // kendi tonunda bir zemin, parça ile arka planı aynı aileye sokuyor.
  const renkGucu = Math.hypot(tonX, tonY) / toplam
  const renkli = renkGucu > 0.04 && doygunlukToplam / toplam > 0.08
  const ton = renkli
    ? (((Math.atan2(tonY, tonX) * 180) / Math.PI + 540) % 360)
    : TEMA_TONU
  // Doygunluk bilerek düşük: zemin "renkli" değil, hafifçe tonlanmış nötr
  // olsun. 0,16'da tam ters ton bir olive/mor lekeye dönüşüp fotoğrafla
  // yarışıyordu.
  const doygunluk = renkli ? 0.11 : 0.12

  // Kovaların ışık şiddeti karşılığı: kova ortası algısal eksende, kontrast
  // hesabı ise ışık şiddetinde yapılıyor.
  const kovaParlaklik = new Float64Array(KOVA)
  for (let k = 0; k < KOVA; k++) kovaParlaklik[k] = kanal((((k + 0.5) / KOVA) * 255))

  let enIyi = EN_KOYU
  let enIyiCeza = Infinity
  for (let acik = EN_KOYU; acik <= EN_ACIK + 1e-9; acik += ADIM) {
    const [r, g, b] = hslRgb(ton, doygunluk, acik)
    const y = parlaklik(r, g, b)
    let ceza = toplam * KOYU_EGILIM * acik
    for (let k = 0; k < KOVA; k++) {
      if (kova[k] === 0) continue
      const oran = kontrast(y, kovaParlaklik[k])
      if (oran < ESIK) ceza += kova[k] * (ESIK - oran) ** 2
    }
    if (ceza < enIyiCeza) {
      enIyiCeza = ceza
      enIyi = acik
    }
  }

  const [r, g, b] = hslRgb(ton, doygunluk, enIyi)
  const acikZemin = enIyi > 0.5
  // Çerçeve, tepsi ve ızgara zeminin üstüne saydam basılıyor; açık zeminde
  // beyaz katman görünmez oluyor, siyaha dönüyorlar.
  const ust = acikZemin ? '0,0,0' : '255,255,255'
  return {
    zemin: onaltilik(r, g, b),
    cerceve: `rgba(${ust},0.05)`,
    kenar: `rgba(${ust},0.35)`,
    cizgi: `rgba(${ust},0.08)`,
    kontur: acikZemin ? 'rgba(26,16,32,0.9)' : 'rgba(255,255,255,0.9)',
    acik: acikZemin,
  }
}

/** Örnekleme ızgarasının sınırları */
const EN_AZ_ORNEK = 6
const EN_COK_ORNEK = 40

/**
 * Fotoğrafı **parça kabalığında** küçültüp paletini çıkar.
 *
 * `sutun`/`satir` kesim ızgarasıdır: her örnek piksel kabaca bir parçanın
 * ortalama rengi oluyor. Görünürlüğü belirleyen de bu — parçanın en koyu
 * birkaç pikseli zemine karışsa bile parçanın kendisi görünür kalıyor.
 * Tam çözünürlükte örneklenince tek bir koyu gölge bütün zemini
 * ağartabiliyordu (Mona Lisa'da zemin bembeyaz çıkıyordu).
 */
export function gorseldenPalet(gorsel: CanvasImageSource, sutun = 16, satir = 16): Palet {
  try {
    const en = Math.min(EN_COK_ORNEK, Math.max(EN_AZ_ORNEK, Math.round(sutun)))
    const boy = Math.min(EN_COK_ORNEK, Math.max(EN_AZ_ORNEK, Math.round(satir)))
    const tuval = document.createElement('canvas')
    tuval.width = en
    tuval.height = boy
    const ctx = tuval.getContext('2d', { willReadFrequently: true })
    if (!ctx) return VARSAYILAN_PALET
    ctx.drawImage(gorsel, 0, 0, en, boy)
    return paletCikar(ctx.getImageData(0, 0, en, boy).data)
  } catch {
    // Başka kökenden gelen görsel tuvali kirletiyor ve getImageData atıyor.
    // Bugün her yol dataURL veriyor, yine de zemin yüzünden oyun açılmasın.
    return VARSAYILAN_PALET
  }
}
