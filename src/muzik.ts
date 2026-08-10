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
  /**
   * Parçanın kurgusu. Parçaları birbirinden ayıran asıl şey bu — yalnızca
   * akorları değiştirmek üç parçanın da aynı yastığı çalmasına yol açıyordu.
   * - `akor`: akorun notaları aynı anda, uzun yastık hâlinde
   * - `arpej`: akorun notaları sırayla, kısa ve tıngırtılı
   * - `ambiyans`: gürültü zemini (akor listesi boş olabilir)
   */
  tur: 'akor' | 'arpej' | 'ambiyans'
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
  /** `arpej` türünde iki nota arasındaki süre (sn) */
  arpejAraligi?: number
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
    /*
      Piyanonun iki oktav altı. Sine yerine sawtooth: lowpass 300 Hz'in
      altında sinüsün üstüne hiçbir şey eklemiyordu, o yüzden "gece" ile
      "piyano" aynı yastık gibi duyuluyordu. Testere dişinin üst harmonikleri
      filtreyle yontulunca koyu, uğultulu bir zemin çıkıyor.
    */
    akorlar: [
      [55.0, 82.41, 110.0],
      [49.0, 73.42, 98.0],
      [43.65, 65.41, 87.31],
      [51.91, 77.78, 103.83],
    ],
    // iki katı yavaş: akor değişimi fark edilmesin, zemin gibi dursun
    akorSuresi: 14,
    dalga: 'sawtooth',
    filtre: 300,
    padSes: 0.03,
    // çan neredeyse hiç yok; olduğunda da uzun ve pes
    canOlasiligi: 0.2,
    canNotalari: [164.81, 196.0, 220.0],
    canSes: 0.022,
    canSuresi: 6,
  },
  {
    id: 'kutu',
    ad: 'Müzik kutusu',
    simge: '🎵',
    // Asıl fark burada: yastık yok, notalar tek tek çalıyor. Müzik kutusu
    // akor tutmuyor, tıngırdıyor.
    tur: 'arpej',
    akorlar: [
      [1046.5, 1318.51, 1567.98, 2093.0],
      [880.0, 1046.5, 1318.51, 1760.0],
      [987.77, 1174.66, 1479.98, 1975.53],
      [783.99, 1046.5, 1318.51, 1567.98],
    ],
    akorSuresi: 4.5,
    dalga: 'triangle',
    filtre: 6000,
    // arpejde yastık kullanılmıyor
    padSes: 0.02,
    canOlasiligi: 0,
    canNotalari: [],
    canSes: 0.038,
    // kısa sönüm: metal dişin tıngırtısı
    canSuresi: 1.1,
    arpejAraligi: 0.36,
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
    // 1400 Hz altı: gürültü "şşş" değil, "hışırtı" olarak duyuluyor
    filtre: 1400,
    padSes: 0.05,
    canOlasiligi: 0.3,
    canNotalari: [98.0, 110.0, 130.81],
    canSes: 0.03,
    canSuresi: 4,
  },
  {
    id: 'beyaz',
    ad: 'Beyaz gürültü',
    simge: '🌫',
    tur: 'ambiyans',
    /*
      Tanımı gereği düz: nota yok, uğultu yok, değişim yok. Akor listesi
      bilerek boş — yağmurdan farkı da bu (yağmurun altında pes bir drone
      var) ve filtresi neredeyse açık, yani tizler kesilmiyor.
    */
    akorlar: [[]],
    akorSuresi: 8,
    dalga: 'sine',
    filtre: 14000,
    padSes: 0.06,
    canOlasiligi: 0,
    canNotalari: [],
    canSes: 0.03,
    canSuresi: 1,
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

  if (parca.tur === 'arpej') {
    const aralik = parca.arpejAraligi ?? 0.4
    const sayi = Math.max(1, Math.floor(parca.akorSuresi / aralik))
    /*
      Merdiven: 0,1,2,3,2,1,0,1,… Akorun içinde inip çıkıyor. Rastgele nota
      seçmek müzik kutusu değil, telefon tuşu gibi duyuluyordu.
    */
    const n = akor.length
    const donem = n > 1 ? 2 * n - 2 : 1
    for (let i = 0; i < sayi; i++) {
      const basamak = i % donem
      const j = basamak < n ? basamak : donem - basamak
      notalar.push({
        frekans: akor[j],
        gecikme: i * aralik,
        sure: parca.canSuresi,
        // vurgusuz notalar hafif geride: makine gibi durmasın
        ses: parca.canSes * (i % 2 === 0 ? 1 : 0.62),
        tip: parca.dalga,
        filtre: parca.filtre,
        detune: (rng() - 0.5) * 6,
        zarf: 'can',
      })
    }
    return notalar
  }

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
