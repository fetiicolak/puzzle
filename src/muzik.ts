// Arka plan müziğinin tarifi.
//
// Burada ses yok — yalnızca "hangi notalar, ne zaman, ne kadar" hesabı var.
// Web Audio'ya hiç dokunmadığı için testte doğrudan çalışıyor (jsdom'da
// AudioContext yok) ve odadaki iki taraf aynı tohumla aynı diziyi üretiyor.
//
// Odaya sesi değil tarifi gönderiyoruz: ~30 baytlık bir mesaj (parça + tohum)
// iki tarafta da aynı ezgiyi doğuruyor. Telif yok, indirilecek dosya yok,
// çevrimdışı çalışıyor.

import { mulberry32 } from './engine/cutter'

/** Notanın kazanç zarfı */
export type Zarf =
  /** yavaş açılıp kapanan yastık */
  | 'pad'
  /** ani vurup uzun sönen çan */
  | 'can'
  /** açılıp sabit kalan, sonunda kapanan (ambiyans) */
  | 'duz'

export interface Nota {
  /** Hz — gürültü kaynağında kullanılmaz */
  frekans: number
  /** adımın başlangıcına göre saniye */
  gecikme: number
  sure: number
  /** tepe kazanç */
  ses: number
  tip: OscillatorType
  /** lowpass kesim frekansı */
  filtre: number
  /** ince akort sapması (cent) */
  detune: number
  zarf: Zarf
  /** osilatör yerine gürültü kaynağı kullanılsın */
  gurultu?: boolean
}

export interface MuzikParcasi {
  id: string
  /** Sözlük anahtarı — arayüzde `ceviri(ad)` ile basılır */
  ad: string
  simge: string
  /** akor: akor döngüsü · ambiyans: gürültü + seyrek drone */
  tur: 'akor' | 'ambiyans'
  /** Sırayla çalınan akorlar (Hz) */
  akorlar: number[][]
  /** Bir akor kaç saniye sürer */
  akorSuresi: number
  dalga: OscillatorType
  /** Yastık için lowpass kesimi */
  filtre: number
  padSes: number
  /** Bir adımda çan çalma olasılığı */
  canOlasiligi: number
  canNotalari: number[]
  canSes: number
  canSuresi: number
}

/*
  piyano bugüne kadarki tek müziğin birebir aynısı — varsayılan o. Ayarına
  dokunmayan kullanıcı için hiçbir şey değişmiyor.
*/
export const PARCALAR: readonly MuzikParcasi[] = [
  {
    id: 'piyano',
    ad: 'Sakin piyano',
    simge: '🎹',
    tur: 'akor',
    // Am - F - C - G
    akorlar: [
      [220.0, 261.63, 329.63],
      [174.61, 220.0, 261.63],
      [130.81, 196.0, 261.63],
      [196.0, 246.94, 293.66],
    ],
    akorSuresi: 6,
    dalga: 'sine',
    filtre: 900,
    padSes: 0.055,
    canOlasiligi: 0.6,
    // pentatonik: hangisi çalarsa çalsın uyumlu durur
    canNotalari: [523.25, 587.33, 659.25, 783.99, 880.0],
    canSes: 0.045,
    canSuresi: 2.2,
  },
  {
    id: 'gece',
    ad: 'Gece',
    simge: '🌙',
    tur: 'akor',
    // Dm7 - Gm7 - Cmaj7 - Fmaj7, bir oktav pesten ve yavaş
    akorlar: [
      [146.83, 174.61, 220.0, 261.63],
      [98.0, 116.54, 146.83, 174.61],
      [130.81, 164.81, 196.0, 246.94],
      [87.31, 110.0, 130.81, 164.81],
    ],
    akorSuresi: 8,
    dalga: 'sine',
    filtre: 700,
    padSes: 0.05,
    canOlasiligi: 0.35,
    canNotalari: [392.0, 440.0, 523.25, 587.33],
    canSes: 0.032,
    canSuresi: 3,
  },
  {
    id: 'kutu',
    ad: 'Müzik kutusu',
    simge: '🎵',
    tur: 'akor',
    // piyanonun bir oktav tizi; yastık geride, çanlar önde
    akorlar: [
      [440.0, 523.25, 659.25],
      [349.23, 440.0, 523.25],
      [261.63, 392.0, 523.25],
      [392.0, 493.88, 587.33],
    ],
    akorSuresi: 4,
    dalga: 'triangle',
    filtre: 2600,
    padSes: 0.028,
    canOlasiligi: 0.85,
    canNotalari: [1046.5, 1174.66, 1318.51, 1567.98, 1760.0],
    canSes: 0.05,
    canSuresi: 1.4,
  },
  {
    id: 'yagmur',
    ad: 'Yağmur',
    simge: '🌧',
    tur: 'ambiyans',
    // duyulur bir ezgi yok; akorlar çok pes bir uğultu olarak geçiyor
    akorlar: [[65.41], [73.42], [61.74], [69.3]],
    akorSuresi: 6,
    dalga: 'sine',
    filtre: 1400,
    padSes: 0.05,
    canOlasiligi: 0.3,
    canNotalari: [98.0, 110.0, 130.81],
    canSes: 0.03,
    canSuresi: 4,
  },
]

export const VARSAYILAN_PARCA = 'piyano'

/** Bilinmeyen kimlik varsayılana düşer — karşı taraf ne gönderirse göndersin */
export function parcaBul(id: string): MuzikParcasi {
  return PARCALAR.find((p) => p.id === id) ?? PARCALAR[0]
}

/**
 * Bir adımın notalarını hesapla.
 *
 * Aynı tohum + aynı adım her cihazda aynı diziyi verir; odadaki iki taraf
 * böylece aynı ezgiyi duyar. Adım tohuma karıştırılıyor, yoksa ardışık
 * adımlar mulberry32'de birbirine çok benzer diziler üretiyor.
 */
export function notalariPlanla(parca: MuzikParcasi, tohum: number, adim: number): Nota[] {
  const rng = mulberry32((tohum + adim * 0x9e3779b1) >>> 0)
  const akor = parca.akorlar[adim % parca.akorlar.length]
  const notalar: Nota[] = []

  if (parca.tur === 'ambiyans') {
    /*
      Gürültü adımdan uzun sürüyor ve zarfı düz: ardışık adımlar üst üste
      binince yağmur kesintisiz akıyor. Adım başına yeniden zarflansaydı
      nefes alıp verir gibi atardı.
    */
    notalar.push({
      frekans: 0,
      gecikme: 0,
      sure: parca.akorSuresi + 1.2,
      ses: parca.padSes,
      tip: parca.dalga,
      filtre: parca.filtre,
      detune: 0,
      zarf: 'duz',
      gurultu: true,
    })
  }

  for (const f of akor) {
    notalar.push({
      frekans: f,
      gecikme: 0,
      sure: parca.akorSuresi,
      // ambiyansta uğultu yalnızca zemin; öne çıkmasın
      ses: parca.tur === 'ambiyans' ? parca.padSes * 0.35 : parca.padSes,
      tip: parca.dalga,
      filtre: parca.filtre,
      // tek osilatör fazla "dijital" duruyor; hafif detune canlandırıyor
      detune: (rng() - 0.5) * 8,
      zarf: 'pad',
    })
  }

  if (rng() < parca.canOlasiligi) {
    const f = parca.canNotalari[Math.floor(rng() * parca.canNotalari.length)]
    notalar.push({
      frekans: f,
      // akorun ortalarına denk gelsin
      gecikme: parca.akorSuresi * 0.25 + rng() * parca.akorSuresi * 0.42,
      sure: parca.canSuresi,
      ses: parca.canSes,
      tip: 'sine',
      // çan filtresiz: tizleri kalsın
      filtre: 20000,
      detune: 0,
      zarf: 'can',
    })
  }

  return notalar
}
