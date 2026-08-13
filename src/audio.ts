// Ses: parça efektleri ve arka plan atmosferi.
//
// Hazır ses dosyası ya da dış servis yok; her şey Web Audio ile üretiliyor.
// Sebepleri: indirilecek dosya yok (paket büyümüyor), telif sorunu yok,
// çevrimdışı da çalışıyor ve sesler oyunun temposuna göre ayarlanabiliyor.
//
// Tarayıcılar kullanıcı bir şeye dokunmadan ses açtırmaz; bu yüzden
// AudioContext ilk etkileşimde kuruluyor ve gerekirse resume ediliyor.

import { VARSAYILAN_PARCA, notalariPlanla, parcaBul, type Nota } from './muzik'

const SES_ANAHTARI = 'puzzle:ses'
const MUZIK_ANAHTARI = 'puzzle:muzik'
const EFEKT_SEVIYE_ANAHTARI = 'puzzle:ses-seviye'
const MUZIK_SEVIYE_ANAHTARI = 'puzzle:muzik-seviye'
const MUZIK_PARCA_ANAHTARI = 'puzzle:muzik-parca'

/**
 * Efekt yolunun tam açıkken kazancı. Seviye bunun üstüne çarpan olarak biniyor,
 * yani seviye 1 iken ses eskisiyle birebir aynı.
 */
const EFEKT_TAVAN = 0.9

/**
 * Müzik yolunun tam açıkken kazancı.
 *
 * Efektlerin tersine 1'den büyük: notaların kendi tepe kazançları çok küçük
 * (`muzik.ts`'te yastık 0,03-0,06) ve hepsi pes — piyanoda 130-330 Hz, gecede
 * 49-110 Hz. Küçük hoparlörler bu bandı sertçe kesiyor, tablette müzik hiç
 * duyulmuyordu; efektler duyuluyordu çünkü onlar 590-1300 Hz'de ve iki katı
 * yüksek. Aynı anda çalan en yüksek birleşim (piyano: üç yastık + çan)
 * 0,21 × 2,5 ≈ 0,53 — efektlerle toplamı bile 1'in altında, kırpılma yok.
 */
export const MUZIK_TAVAN = 2.5

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

/** Kayıtlı ses seviyesi (0-1). Bozuk ya da eksik kayıtta tam açık. */
function seviyeOku(anahtar: string): number {
  try {
    const ham = localStorage.getItem(anahtar)
    if (ham === null) return 1
    const s = Number(ham)
    return Number.isFinite(s) ? Math.min(1, Math.max(0, s)) : 1
  } catch {
    return 1
  }
}

function seviyeYaz(anahtar: string, deger: number): void {
  try {
    localStorage.setItem(anahtar, String(deger))
  } catch {
    // yoksay
  }
}

function metinOku(anahtar: string, varsayilan: string): string {
  try {
    return localStorage.getItem(anahtar) ?? varsayilan
  } catch {
    return varsayilan
  }
}

function metinYaz(anahtar: string, deger: string): void {
  try {
    localStorage.setItem(anahtar, deger)
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

export function efektSeviyesi(): number {
  return seviyeOku(EFEKT_SEVIYE_ANAHTARI)
}

export function muzikSeviyesi(): number {
  return seviyeOku(MUZIK_SEVIYE_ANAHTARI)
}

/** Efekt yolunun o an olması gereken kazancı: kapalıysa 0, açıksa seviye kadar */
function efektHedef(): number {
  return sesAcikMi() ? EFEKT_TAVAN * efektSeviyesi() : 0
}

/** Müzik yolunun o an olması gereken kazancı (çalıyorken) */
function muzikHedef(): number {
  return MUZIK_TAVAN * muzikSeviyesi()
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
    efektKazanc.gain.value = efektHedef()
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
  /*
    Uygulama arka plandayken sesi geri açma. Tek başına `suspend` yetmiyordu:
    karşı taraf oynamaya devam ediyor ve gelen her `tik`/`birlesme` burada
    bağlamı yeniden uyandırıp sesi geri getiriyordu.
  */
  if (arkaPlandaMi()) return null
  if (c.state === 'suspended') {
    try {
      await c.resume()
    } catch {
      return null
    }
  }
  return c
}

// ------------------------------------------------- arka planda sus

/**
 * Uygulama arka plana alınınca sesi kes.
 *
 * Web Audio kendiliğinden susmuyor: kurulu uygulamada ana ekrana dönüldüğünde
 * (ve telefon kilitlendiğinde) müzik çalmaya devam ediyordu. Tarayıcı sekmesi
 * bazen askıya alıyor, kurulu uygulama almıyor — davranışa güvenilemez, elle
 * yönetiliyor.
 *
 * Ayara **dokunulmuyor**: kullanıcı müziği kapatmadı, uygulamadan çıktı.
 * Bütün bağlam askıya alındığı için efektler de susuyor ve planlayıcı
 * kendiliğinden boşa düşüyor — `planla()` `currentTime`a bakıyor, o da
 * askıdayken ilerlemiyor.
 */
function arkaPlandaMi(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

/** Askıya alan biz miyiz: geri dönünce yalnızca kendi askımızı çözüyoruz */
let arkaPlandaAskida = false

function arkaPlanaGec(): void {
  const c = ctx
  if (!c || c.state !== 'running') return
  arkaPlandaAskida = true
  void c.suspend().catch(() => {
    arkaPlandaAskida = false
  })
}

function oneGel(): void {
  const c = ctx
  if (!c || !arkaPlandaAskida) return
  arkaPlandaAskida = false
  void c.resume().catch(() => {
    // Safari askıdan çıkmak için kullanıcı hareketi isteyebiliyor;
    // ilk dokunuşta bir kez daha dene.
    window.addEventListener(
      'pointerdown',
      () => {
        void c.resume().catch(() => {
          // yoksay
        })
      },
      { once: true },
    )
  })
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (arkaPlandaMi()) arkaPlanaGec()
    else oneGel()
  })
  // iOS uygulamayı arka plana atarken visibilitychange yerine yalnızca
  // pagehide gönderebiliyor; ikisi de aynı işi yapıyor, ikinci çağrı zararsız.
  window.addEventListener('pagehide', arkaPlanaGec)
  window.addEventListener('pageshow', oneGel)
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

/*
  Efektlerde `uyandir()`in **döndürdüğü değere bakmak zorunlu**. Önce
  `.then(() => nota(...))` yazıyordu ve sonucu yok sayıyordu: bağlam
  uyandırılamasa bile notalar yine planlanıyordu. Uygulama arka plandayken
  bunun bedeli somut — karşı taraf oynamaya devam ediyor, gelen her hamle
  donmuş saate nota yazıyor ve hepsi öne dönüldüğü anda birden çalıyordu.
  Ölçüldü: arka planda 16 osilatör kuruluyordu, şimdi 0.
*/

/** Parça çerçeveye oturdu: kısa, yumuşak bir "tık" */
export function tik(): void {
  if (!sesAcikMi()) return
  void uyandir().then((c) => {
    if (c) nota(660, 0.09, 'triangle', 0.14)
  })
}

/** İki parça birleşti: tıktan biraz daha tatlı, iki notalı */
export function birlesme(): void {
  if (!sesAcikMi()) return
  void uyandir().then((c) => {
    if (!c) return
    nota(587.33, 0.11, 'triangle', 0.13)
    nota(880, 0.16, 'sine', 0.1, 0.055)
  })
}

/** Puzzle bitti: küçük bir kutlama ezgisi */
export function kutlama(): void {
  if (!sesAcikMi()) return
  void uyandir().then((c) => {
    if (!c) return
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
/** O an seçili parça (bkz. muzik.ts) */
let seciliParca = parcaBul(metinOku(MUZIK_PARCA_ANAHTARI, VARSAYILAN_PARCA)).id
/**
 * Çalan varyasyonun tohumu — odadaki iki taraf aynısını kullanır.
 * Açılışta üretiliyor ki her oturum aynı ezgiyi tekrarlamasın.
 */
let tohum = 0
/**
 * Planlanmış ses kaynakları. Parça değiştirirken eskiyi susturmak için
 * tutuluyor; yoksa yeni parça açılırken eskisinin son notaları üstüne biniyor.
 */
let aktifKaynaklar: AudioScheduledSourceNode[] = []
/** Gürültü tamponu bir kez üretilip yeniden kullanılıyor */
let gurultuTamponu: AudioBuffer | null = null
/**
 * Oyun oturumu sayacı. `sesiKapat` her çağrıldığında artıyor; uçmakta olan
 * `muzigiBaslat` sözleri böylece geçersizleşiyor. Bkz. `sesiKapat`.
 */
let oturum = 0

function yeniTohum(): number {
  try {
    const a = new Uint32Array(1)
    crypto.getRandomValues(a)
    return a[0] || 1
  } catch {
    return Math.floor(Math.random() * 0xffffffff) || 1
  }
}

tohum = yeniTohum()

function beyazGurultu(c: AudioContext): AudioBuffer {
  if (gurultuTamponu) return gurultuTamponu
  // 4 sn: döngü daha kısa olursa saf beyaz gürültüde tekrar duyuluyor
  // (yağmurda drone maskeliyordu, "Beyaz gürültü"de maskeleyen bir şey yok)
  const uzunluk = Math.floor(c.sampleRate * 4)
  const tampon = c.createBuffer(1, uzunluk, c.sampleRate)
  const veri = tampon.getChannelData(0)
  for (let i = 0; i < uzunluk; i++) veri[i] = Math.random() * 2 - 1
  gurultuTamponu = tampon
  return tampon
}

/** Tek bir planlanmış notayı çal */
function notaCal(n: Nota, adimBasi: number): void {
  const c = ctx
  if (!c || !muzikKazanc) return
  const t = adimBasi + n.gecikme
  const kzn = c.createGain()
  const filtre = c.createBiquadFilter()
  filtre.type = 'lowpass'
  filtre.frequency.setValueAtTime(n.filtre, t)

  let kaynak: AudioScheduledSourceNode
  if (n.gurultu) {
    const src = c.createBufferSource()
    src.buffer = beyazGurultu(c)
    src.loop = true
    kaynak = src
  } else {
    const osc = c.createOscillator()
    osc.type = n.tip
    osc.frequency.setValueAtTime(n.frekans, t)
    osc.detune.setValueAtTime(n.detune, t)
    kaynak = osc
  }

  // Zarf elle çiziliyor: aniden başlayıp biten ses hoparlörde "çıt" diye
  // patlıyor. exponentialRamp sıfıra inemiyor, 0.0001 kullanılıyor.
  kzn.gain.setValueAtTime(0.0001, t)
  if (n.zarf === 'pad') {
    kzn.gain.exponentialRampToValueAtTime(n.ses, t + n.sure * 0.35)
    kzn.gain.exponentialRampToValueAtTime(0.0001, t + n.sure)
  } else if (n.zarf === 'can') {
    kzn.gain.exponentialRampToValueAtTime(n.ses, t + 0.02)
    kzn.gain.exponentialRampToValueAtTime(0.0001, t + n.sure)
  } else {
    // düz: açılıp sabit kalıyor, sonunda kapanıyor
    kzn.gain.linearRampToValueAtTime(n.ses, t + 0.6)
    kzn.gain.setValueAtTime(n.ses, t + Math.max(0.7, n.sure - 0.6))
    kzn.gain.linearRampToValueAtTime(0.0001, t + n.sure)
  }

  kaynak.connect(filtre)
  filtre.connect(kzn)
  kzn.connect(muzikKazanc)
  kaynak.start(t)
  kaynak.stop(t + n.sure + 0.15)

  aktifKaynaklar.push(kaynak)
  kaynak.onended = () => {
    const i = aktifKaynaklar.indexOf(kaynak)
    if (i >= 0) aktifKaynaklar.splice(i, 1)
  }
}

/** Planlanmış her şeyi sustur (parça değişiminde) */
function kaynaklariSustur(): void {
  const c = ctx
  if (!c) return
  for (const k of aktifKaynaklar) {
    try {
      k.stop(c.currentTime)
    } catch {
      // zaten durmuşsa sorun değil
    }
  }
  aktifKaynaklar = []
}

/**
 * İleriye dönük planlayıcı.
 * setInterval'in kendisi ses için yeterince kesin değil; ileriyi görüp
 * notaları AudioContext'in kendi saatine göre planlıyoruz.
 */
function planla(): void {
  const c = ctx
  if (!c) return
  const parca = parcaBul(seciliParca)
  while (sonrakiAdim < c.currentTime + 2) {
    for (const n of notalariPlanla(parca, tohum, adimSayaci)) notaCal(n, sonrakiAdim)
    sonrakiAdim += parca.akorSuresi
    adimSayaci++
  }
}

/** Planlamayı sıfırdan başlat (parça değişince de kullanılıyor) */
function calmayaBasla(c: AudioContext): void {
  sonrakiAdim = c.currentTime + 0.1
  adimSayaci = 0
  planla()
  if (zamanlayici) clearInterval(zamanlayici)
  zamanlayici = setInterval(planla, 800)
}

export async function muzigiBaslat(): Promise<boolean> {
  const benimOturum = oturum
  const c = await uyandir()
  // Beklerken oyundan çıkılmış olabilir: çıkış düğmesine basmak da bir
  // pointerdown ve "ilk dokunuşta başlat" dinleyicisini tetikliyor. Kontrol
  // olmadan bu söz temizlikten sonra tamamlanıp müziği ana ekranda açıyordu.
  if (oturum !== benimOturum) return false
  if (!c || !muzikKazanc) return false
  if (muzikCalisiyor) return true
  muzikCalisiyor = true
  // yavaşça aç, kulağa aniden girmesin
  muzikKazanc.gain.cancelScheduledValues(c.currentTime)
  muzikKazanc.gain.setValueAtTime(0.0001, c.currentTime)
  muzikKazanc.gain.linearRampToValueAtTime(muzikHedef(), c.currentTime + 2.5)
  calmayaBasla(c)
  ayarYaz(MUZIK_ANAHTARI, true)
  return true
}

/**
 * @param ayariYaz Kullanıcı gerçekten kapattıysa true. Parça değiştirirken
 *   ve oyundan çıkarken false — yoksa "müzik kapalı" diye kaydedilip bir
 *   daha açılmıyor.
 * @param sonus Kısılma süresi (sn). Oyundan çıkarken kısa olmalı.
 */
function durdur(ayariYaz: boolean, sonus = 1.2): void {
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
    muzikKazanc.gain.linearRampToValueAtTime(0.0001, c.currentTime + sonus)
  }
  if (ayariYaz) ayarYaz(MUZIK_ANAHTARI, false)
}

export function muzigiDurdur(): void {
  durdur(true)
}

/** Kayıtlı parça seçimi */
export function muzikParcasi(): string {
  return parcaBul(metinOku(MUZIK_PARCA_ANAHTARI, VARSAYILAN_PARCA)).id
}

/**
 * Parçayı değiştir.
 *
 * Müzik çalıyorsa yumuşak geçişle yeni parçaya döner; çalmıyorsa yalnızca
 * hatırlar — kazanca dokunmaz. Odadan gelen seçim kimsenin sesini açmasın
 * diye bu ayrım şart.
 *
 * @param disTohum Odadan geldiyse karşı tarafın tohumu; yoksa yenisi üretilir.
 * @returns Geçerli olan tohum — odaya gönderilecek değer budur.
 */
export function parcaSec(id: string, disTohum?: number): number {
  const parca = parcaBul(id)
  // Tohum yalnızca odadan gelirse değişiyor; yerel seçimde eskisi korunuyor.
  // Her seçimde yenilenseydi aynı parçayı yeniden seçmek ezgiyi de değiştirirdi.
  const yeniT = disTohum !== undefined ? disTohum >>> 0 : tohum
  const degisti = parca.id !== seciliParca || yeniT !== tohum
  seciliParca = parca.id
  metinYaz(MUZIK_PARCA_ANAHTARI, parca.id)
  tohum = yeniT
  if (!degisti) return tohum

  const c = ctx
  if (muzikCalisiyor && c && muzikKazanc) {
    // Eskiyi söndür, sustur, yeniyi aç. Kazanca doğrudan değer atanmıyor —
    // atanırsa hoparlörde "çıt" oluyor.
    const simdi = c.currentTime
    muzikKazanc.gain.cancelScheduledValues(simdi)
    muzikKazanc.gain.setValueAtTime(muzikKazanc.gain.value, simdi)
    muzikKazanc.gain.linearRampToValueAtTime(0.0001, simdi + 0.5)
    if (zamanlayici) {
      clearInterval(zamanlayici)
      zamanlayici = null
    }
    window.setTimeout(() => {
      const c2 = ctx
      if (!c2 || !muzikKazanc || !muzikCalisiyor) return
      kaynaklariSustur()
      muzikKazanc.gain.cancelScheduledValues(c2.currentTime)
      muzikKazanc.gain.setValueAtTime(0.0001, c2.currentTime)
      muzikKazanc.gain.linearRampToValueAtTime(muzikHedef(), c2.currentTime + 1)
      calmayaBasla(c2)
    }, 520)
  }
  return tohum
}

export function muzikCaliyorMu(): boolean {
  return muzikCalisiyor
}

/** Tüm sesi aç/kapat (efektler dahil) */
export function sesiAyarla(acik: boolean): void {
  ayarYaz(SES_ANAHTARI, acik)
  const c = ctx
  if (c && efektKazanc) {
    efektKazanc.gain.setTargetAtTime(efektHedef(), c.currentTime, 0.05)
  }
  if (!acik) muzigiDurdur()
}

/**
 * Efekt seviyesini ayarla (0-1).
 *
 * Kaydırıcı sürüklenirken saniyede onlarca kez çağrılıyor; bu yüzden
 * setTargetAtTime ile yumuşatılıyor. Doğrudan değer ataması her adımda
 * "çıt" sesi çıkarıyor.
 */
export function efektSeviyesiAyarla(seviye: number): void {
  const s = Math.min(1, Math.max(0, seviye))
  seviyeYaz(EFEKT_SEVIYE_ANAHTARI, s)
  const c = ctx
  if (c && efektKazanc) efektKazanc.gain.setTargetAtTime(efektHedef(), c.currentTime, 0.03)
}

/** Müzik seviyesini ayarla (0-1) */
export function muzikSeviyesiAyarla(seviye: number): void {
  const s = Math.min(1, Math.max(0, seviye))
  seviyeYaz(MUZIK_SEVIYE_ANAHTARI, s)
  const c = ctx
  // Müzik çalmıyorken kazanç 0; buraya dokunursak durdurulmuş müzik
  // yeniden duyulmaya başlar. Yeni seviye bir sonraki başlatmada uygulanır.
  if (c && muzikKazanc && muzikCalisiyor) {
    muzikKazanc.gain.cancelScheduledValues(c.currentTime)
    muzikKazanc.gain.setValueAtTime(muzikKazanc.gain.value, c.currentTime)
    muzikKazanc.gain.setTargetAtTime(muzikHedef(), c.currentTime, 0.05)
  }
}

/**
 * Oyundan çıkarken her şeyi kapat. Müzik yalnızca oyun içinde çalar.
 *
 * `muzigiDurdur`dan iki farkı var:
 * - **Ayara dokunmuyor.** Kullanıcı müziği kapatmadı, oyundan çıktı; tercihi
 *   bir sonraki oyunda geçerli kalmalı.
 * - **Uçmakta olan başlatmaları geçersiz kılıyor** (`oturum`). Çıkış düğmesine
 *   basmak da bir pointerdown; "ilk dokunuşta başlat" dinleyicisi tetikleniyor,
 *   async başlatma temizlikten sonra tamamlanıp müziği ana ekranda açıyordu —
 *   hesaptan çıkınca bile susmuyordu.
 *
 * Kısılma kısa (0,25 sn) ve arkasından planlanmış kaynaklar da susturuluyor:
 * ekran kapandıktan sonra sessizce de olsa zamanlayıcı işletmenin anlamı yok.
 */
export function sesiKapat(): void {
  oturum++
  durdur(false, 0.25)
  if (zamanlayici) {
    clearInterval(zamanlayici)
    zamanlayici = null
  }
  // Kısılma bitmeden kesersek hoparlörde "çıt" oluyor. Bu arada yeni bir
  // oyun başlayıp müziği açtıysa dokunma.
  window.setTimeout(() => {
    if (!muzikCalisiyor) kaynaklariSustur()
  }, 300)
}
