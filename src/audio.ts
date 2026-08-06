// Ses: parça efektleri ve arka plan atmosferi.
//
// Hazır ses dosyası ya da dış servis yok; her şey Web Audio ile üretiliyor.
// Sebepleri: indirilecek dosya yok (paket büyümüyor), telif sorunu yok,
// çevrimdışı da çalışıyor ve sesler oyunun temposuna göre ayarlanabiliyor.
//
// Tarayıcılar kullanıcı bir şeye dokunmadan ses açtırmaz; bu yüzden
// AudioContext ilk etkileşimde kuruluyor ve gerekirse resume ediliyor.

const SES_ANAHTARI = 'puzzle:ses'
const MUZIK_ANAHTARI = 'puzzle:muzik'

let ctx: AudioContext | null = null
let anaKazanc: GainNode | null = null
/** Efektler ve müzik ayrı yollardan geçer ki biri kapatılınca diğeri kalsın */
let efektKazanc: GainNode | null = null
let muzikKazanc: GainNode | null = null

function ayarOku(anahtar: string): boolean {
  try {
    return localStorage.getItem(anahtar) !== '0'
  } catch {
    return true
  }
}

function ayarYaz(anahtar: string, deger: boolean): void {
  try {
    localStorage.setItem(anahtar, deger ? '1' : '0')
  } catch {
    // yoksay
  }
}

export function sesAcikMi(): boolean {
  return ayarOku(SES_ANAHTARI)
}

export function muzikAcikMi(): boolean {
  return ayarOku(MUZIK_ANAHTARI) && sesAcikMi()
}

/** AudioContext'i kur (yalnızca kullanıcı etkileşiminden sonra çağrılmalı) */
function kur(): AudioContext | null {
  if (ctx) return ctx
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    anaKazanc = ctx.createGain()
    anaKazanc.gain.value = 1
    anaKazanc.connect(ctx.destination)

    efektKazanc = ctx.createGain()
    efektKazanc.gain.value = sesAcikMi() ? 0.9 : 0
    efektKazanc.connect(anaKazanc)

    muzikKazanc = ctx.createGain()
    muzikKazanc.gain.value = 0 // müzik her zaman sessizden açılır
    muzikKazanc.connect(anaKazanc)
    return ctx
  } catch {
    return null
  }
}

/** Sekme arka plandan dönünce bağlam askıya alınmış olabilir */
async function uyandir(): Promise<AudioContext | null> {
  const c = kur()
  if (!c) return null
  if (c.state === 'suspended') {
    try {
      await c.resume()
    } catch {
      return null
    }
  }
  return c
}

// ----------------------------------------------------------------- efektler

/**
 * Tek bir notayı çal.
 * Zarf (attack/decay) elle çiziliyor — aniden başlayıp biten sesler
 * hoparlörde "çıt" diye patlıyor.
 */
function nota(
  frekans: number,
  sure: number,
  tip: OscillatorType,
  ses: number,
  gecikme = 0,
): void {
  const c = ctx
  if (!c || !efektKazanc) return
  const t = c.currentTime + gecikme
  const osc = c.createOscillator()
  const kzn = c.createGain()
  const filtre = c.createBiquadFilter()

  osc.type = tip
  osc.frequency.setValueAtTime(frekans, t)
  filtre.type = 'lowpass'
  filtre.frequency.setValueAtTime(Math.max(800, frekans * 4), t)

  kzn.gain.setValueAtTime(0.0001, t)
  kzn.gain.exponentialRampToValueAtTime(ses, t + 0.008)
  kzn.gain.exponentialRampToValueAtTime(0.0001, t + sure)

  osc.connect(filtre)
  filtre.connect(kzn)
  kzn.connect(efektKazanc)
  osc.start(t)
  osc.stop(t + sure + 0.05)
}

/** Parça çerçeveye oturdu: kısa, yumuşak bir "tık" */
export function tik(): void {
  if (!sesAcikMi()) return
  void uyandir().then(() => nota(660, 0.09, 'triangle', 0.14))
}

/** İki parça birleşti: tıktan biraz daha tatlı, iki notalı */
export function birlesme(): void {
  if (!sesAcikMi()) return
  void uyandir().then(() => {
    nota(587.33, 0.11, 'triangle', 0.13)
    nota(880, 0.16, 'sine', 0.1, 0.055)
  })
}

/** Puzzle bitti: küçük bir kutlama ezgisi */
export function kutlama(): void {
  if (!sesAcikMi()) return
  void uyandir().then(() => {
    // Do-Mi-Sol-Do (majör arpej), yukarı doğru
    const notalar = [523.25, 659.25, 783.99, 1046.5]
    notalar.forEach((f, i) => nota(f, 0.5, 'triangle', 0.13, i * 0.11))
    nota(1318.51, 0.9, 'sine', 0.08, 0.46)
  })
}

// ------------------------------------------------------------------- müzik

let muzikCalisiyor = false
let zamanlayici: ReturnType<typeof setInterval> | null = null
let sonrakiAdim = 0
let adimSayaci = 0

/**
 * Sakin bir akor döngüsü: Am - F - C - G.
 * Her akor iki oktavda birkaç nota; üstüne ara sıra tek bir çan sesi.
 * Ritim yok — bilerek: tempo, parça ararken rahatsız ediyor.
 */
const AKORLAR = [
  [220.0, 261.63, 329.63], // Am
  [174.61, 220.0, 261.63], // F
  [130.81, 196.0, 261.63], // C
  [196.0, 246.94, 293.66], // G
]

/** Çan için pentatonik notalar — hangisi çalarsa çalsın uyumlu durur */
const CAN_NOTALARI = [523.25, 587.33, 659.25, 783.99, 880.0]

function pad(frekanslar: number[], baslangic: number, sure: number): void {
  const c = ctx
  if (!c || !muzikKazanc) return
  for (const f of frekanslar) {
    const osc = c.createOscillator()
    const kzn = c.createGain()
    const filtre = c.createBiquadFilter()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(f, baslangic)
    // hafif detune: tek osilatör fazla "dijital" duruyor
    osc.detune.setValueAtTime((Math.random() - 0.5) * 8, baslangic)

    filtre.type = 'lowpass'
    filtre.frequency.setValueAtTime(900, baslangic)

    kzn.gain.setValueAtTime(0.0001, baslangic)
    kzn.gain.exponentialRampToValueAtTime(0.055, baslangic + sure * 0.35)
    kzn.gain.exponentialRampToValueAtTime(0.0001, baslangic + sure)

    osc.connect(filtre)
    filtre.connect(kzn)
    kzn.connect(muzikKazanc)
    osc.start(baslangic)
    osc.stop(baslangic + sure + 0.1)
  }
}

function can(baslangic: number): void {
  const c = ctx
  if (!c || !muzikKazanc) return
  const f = CAN_NOTALARI[Math.floor(Math.random() * CAN_NOTALARI.length)]
  const osc = c.createOscillator()
  const kzn = c.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(f, baslangic)
  kzn.gain.setValueAtTime(0.0001, baslangic)
  kzn.gain.exponentialRampToValueAtTime(0.045, baslangic + 0.02)
  kzn.gain.exponentialRampToValueAtTime(0.0001, baslangic + 2.2)
  osc.connect(kzn)
  kzn.connect(muzikKazanc)
  osc.start(baslangic)
  osc.stop(baslangic + 2.4)
}

/** Her akor bu kadar sürer */
const AKOR_SURESI = 6

/**
 * İleriye dönük planlayıcı.
 * setInterval'in kendisi ses için yeterince kesin değil; ileriyi görüp
 * notaları AudioContext'in kendi saatine göre planlıyoruz.
 */
function planla(): void {
  const c = ctx
  if (!c) return
  while (sonrakiAdim < c.currentTime + 2) {
    const akor = AKORLAR[adimSayaci % AKORLAR.length]
    pad(akor, sonrakiAdim, AKOR_SURESI)
    // her akorda %60 ihtimalle bir çan, akorun ortalarında
    if (Math.random() < 0.6) can(sonrakiAdim + 1.5 + Math.random() * 2.5)
    sonrakiAdim += AKOR_SURESI
    adimSayaci++
  }
}

export async function muzigiBaslat(): Promise<boolean> {
  const c = await uyandir()
  if (!c || !muzikKazanc) return false
  if (muzikCalisiyor) return true
  muzikCalisiyor = true
  sonrakiAdim = c.currentTime + 0.1
  adimSayaci = 0
  // yavaşça aç, kulağa aniden girmesin
  muzikKazanc.gain.cancelScheduledValues(c.currentTime)
  muzikKazanc.gain.setValueAtTime(0.0001, c.currentTime)
  muzikKazanc.gain.linearRampToValueAtTime(1, c.currentTime + 2.5)
  planla()
  zamanlayici = setInterval(planla, 800)
  ayarYaz(MUZIK_ANAHTARI, true)
  return true
}

export function muzigiDurdur(): void {
  const c = ctx
  if (zamanlayici) {
    clearInterval(zamanlayici)
    zamanlayici = null
  }
  muzikCalisiyor = false
  if (c && muzikKazanc) {
    // planlanmış notalar sönerken sesi kıs
    muzikKazanc.gain.cancelScheduledValues(c.currentTime)
    muzikKazanc.gain.setValueAtTime(muzikKazanc.gain.value, c.currentTime)
    muzikKazanc.gain.linearRampToValueAtTime(0.0001, c.currentTime + 1.2)
  }
  ayarYaz(MUZIK_ANAHTARI, false)
}

export function muzikCaliyorMu(): boolean {
  return muzikCalisiyor
}

/** Tüm sesi aç/kapat (efektler dahil) */
export function sesiAyarla(acik: boolean): void {
  ayarYaz(SES_ANAHTARI, acik)
  const c = ctx
  if (c && efektKazanc) {
    efektKazanc.gain.setTargetAtTime(acik ? 0.9 : 0, c.currentTime, 0.05)
  }
  if (!acik) muzigiDurdur()
}

/** Oyundan çıkarken her şeyi kapat */
export function sesiKapat(): void {
  muzigiDurdur()
  if (zamanlayici) {
    clearInterval(zamanlayici)
    zamanlayici = null
  }
}
