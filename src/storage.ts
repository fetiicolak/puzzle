// localStorage kayıt/devam katmanı.
// Görsel, localStorage limitine sığması için küçültülmüş JPEG dataURL olarak saklanır.

import type { StateSnapshot } from './engine/state'

export interface SavedPuzzle {
  id: string
  /** Kullanıcının verdiği ad; boş bırakılırsa "İsimsiz N" atanır */
  title: string
  imageDataUrl: string
  seed: number
  pieceCount: number
  snap: StateSnapshot | null
  elapsed: number
  message: string
  completed: boolean
  updatedAt: number
  /** Doluysa bu tarihe kadar açılamaz (özel gün) */
  unlockAt?: string | null
}

/** Kayıt hâlâ kilitli mi */
export function yerelKilitliMi(p: { unlockAt?: string | null }): boolean {
  return !!p.unlockAt && new Date(p.unlockAt).getTime() > Date.now()
}

const MISAFIR_KIMLIK = 'puzzle:misafir-kimlik'
const MISAFIR_AD = 'puzzle:misafir-ad'

/**
 * Misafirin cihazına yazılan kalıcı kimlik. Hesabı olmayan biri odaya
 * yeniden katıldığında host'un "bu aynı kişi" diyip eski bağlantısını
 * kapatabilmesi için gerekiyor.
 */
export function misafirKimligi(): string {
  let k = localStorage.getItem(MISAFIR_KIMLIK)
  if (!k) {
    k = 'g-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem(MISAFIR_KIMLIK, k)
  }
  return k
}

/** Misafirin kendine verdiği ad (odada bu görünür) */
export function misafirAdi(): string {
  return localStorage.getItem(MISAFIR_AD) ?? ''
}

export function misafirAdiKaydet(ad: string): void {
  const temiz = ad.trim().slice(0, 24)
  if (temiz) localStorage.setItem(MISAFIR_AD, temiz)
  else localStorage.removeItem(MISAFIR_AD)
}

const TANITIM_ANAHTARI = 'puzzle:tanitim-gorundu'

/** Nasıl oynanır turu daha önce gösterildi mi */
export function tanitimGorulduMu(): boolean {
  try {
    return localStorage.getItem(TANITIM_ANAHTARI) === '1'
  } catch {
    // depolama kapalıysa her seferinde göstermek yerine hiç gösterme
    return true
  }
}

export function tanitimiIsaretle(): void {
  try {
    localStorage.setItem(TANITIM_ANAHTARI, '1')
  } catch {
    // yoksay
  }
}

const INDEX_KEY = 'puzzle:index'
const keyOf = (id: string) => `puzzle:${id}`

function readIndex(): string[] {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

function writeIndex(ids: string[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(ids))
}

export function savePuzzle(save: SavedPuzzle): void {
  try {
    localStorage.setItem(keyOf(save.id), JSON.stringify(save))
    const idx = readIndex()
    if (!idx.includes(save.id)) {
      idx.unshift(save.id)
      // en fazla 8 kayıt tut — localStorage kotası için
      while (idx.length > 8) {
        const removed = idx.pop()!
        localStorage.removeItem(keyOf(removed))
      }
      writeIndex(idx)
    }
  } catch {
    // kota dolduysa sessizce geç — oyun oynanabilir kalmalı
  }
}

/**
 * Çıkış yaparken bu cihazdaki oyun verisini sil.
 *
 * Kayıtlar fotoğrafın tamamını (dataURL) ve gizli notu içeriyor. Çıkış
 * yapılsa bile duruyorlardı; ortak bir bilgisayarda sıradaki kişi "Devam et"
 * listesinde önceki kişinin fotoğraflarını ve sürpriz notlarını görüyordu.
 *
 * Tercihler (beni hatırla, misafir adı, tanıtım turu görüldü) korunur —
 * onlar kişisel içerik değil.
 */
export function oturumVerisiniTemizle(): void {
  try {
    for (const id of readIndex()) localStorage.removeItem(keyOf(id))
    localStorage.removeItem(INDEX_KEY)
  } catch {
    // depolama kapalıysa yapacak bir şey yok
  }
}

export function loadPuzzle(id: string): SavedPuzzle | null {
  try {
    const raw = localStorage.getItem(keyOf(id))
    return raw ? (JSON.parse(raw) as SavedPuzzle) : null
  } catch {
    return null
  }
}

export function listPuzzles(): SavedPuzzle[] {
  return readIndex()
    .map(loadPuzzle)
    .filter((p): p is SavedPuzzle => p !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function removePuzzle(id: string): void {
  localStorage.removeItem(keyOf(id))
  writeIndex(readIndex().filter((x) => x !== id))
}

export function newPuzzleId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * İsim verilmeden başlanan puzzle'lar için sıradaki ad: "İsimsiz 1", "İsimsiz 2"…
 * Daha önce kullanılmış en büyük numaranın bir fazlası seçilir.
 */
export function nextUntitledName(mevcutBasliklar?: string[]): string {
  const basliklar = mevcutBasliklar ?? listPuzzles().map((p) => p.title)
  let enBuyuk = 0
  for (const b of basliklar) {
    const m = /^İsimsiz\s+(\d+)$/.exec((b ?? '').trim())
    if (m) enBuyuk = Math.max(enBuyuk, Number(m[1]))
  }
  return `İsimsiz ${enBuyuk + 1}`
}

/** Dosyayı/URL'i yükleyip en fazla maxDim piksele küçültülmüş JPEG dataURL döndürür */
export async function toPuzzleImage(src: File | string, maxDim = 1600): Promise<string> {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src)
  try {
    const img = await loadImage(url)
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.round(img.naturalWidth * scale)
    const h = Math.round(img.naturalHeight * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    if (typeof src !== 'string') URL.revokeObjectURL(url)
  }
}

/** Uzak adresteki görseli, yeniden kodlamadan dataURL'e çevir */
export async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Görsel indirilemedi')
  const blob = await res.blob()
  return await new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = () => reject(new Error('Görsel okunamadı'))
    fr.readAsDataURL(blob)
  })
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Görsel yüklenemedi'))
    img.src = url
  })
}
