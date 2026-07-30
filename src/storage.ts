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
