import { describe, expect, it } from 'vitest'
import {
  chunkDataUrl,
  dogrula,
  CHUNK_BOYUTU,
  HOST_YETKILI,
  MAX_IMG_CHUNKS,
} from './protocol'

/** Misafir tarafı, mesaj doğrudan host'tan geldi */
const misafirDogrudan = (v: unknown) => dogrula(v, false, true)
/** Misafir tarafı, mesaj host tarafından yansıtıldı (başka bir misafirden) */
const misafirYansitilmis = (v: unknown) => dogrula(v, false, false)
/** Host tarafı, mesaj bir misafirden geldi */
const hostta = (v: unknown) => dogrula(v, true, true)

describe('chunkDataUrl', () => {
  it('boş girdide boş dizi döner', () => {
    expect(chunkDataUrl('')).toEqual([])
  })

  it('parçaları birleştirince orijinali verir', () => {
    const veri = 'x'.repeat(CHUNK_BOYUTU * 2 + 137)
    const parcalar = chunkDataUrl(veri)
    expect(parcalar).toHaveLength(3)
    expect(parcalar.join('')).toBe(veri)
  })

  it('hiçbir parça sınırı aşmaz', () => {
    for (const p of chunkDataUrl('y'.repeat(50_000))) {
      expect(p.length).toBeLessThanOrEqual(CHUNK_BOYUTU)
    }
  })
})

describe('dogrula — yetki', () => {
  const hostMesajlari = [
    { t: 'meta', seed: 1, pieceCount: 24, title: 'a', message: '', imgChunks: 2, elapsed: 0 },
    { t: 'img', i: 0, data: 'abc' },
    { t: 'state', snap: { positions: [] } },
    { t: 'full' },
    { t: 'kick', uid: 'birisi' },
  ]

  it('host yetkili mesajlar doğrudan host\'tan gelince kabul edilir', () => {
    for (const m of hostMesajlari) {
      expect(misafirDogrudan(m), `${m.t} kabul edilmeliydi`).not.toBeNull()
    }
  })

  it('host yetkili mesajlar yansıtılmışsa reddedilir', () => {
    // Başka bir misafirin gönderdiği, host'un yansıttığı mesaj
    for (const m of hostMesajlari) {
      expect(misafirYansitilmis(m), `${m.t} reddedilmeliydi`).toBeNull()
    }
  })

  it('host, misafirden gelen host yetkili mesajı kabul etmez', () => {
    for (const m of hostMesajlari) {
      expect(hostta(m), `${m.t} host'ta reddedilmeliydi`).toBeNull()
    }
  })

  it('bir misafir kick gönderip başkasını attıramaz', () => {
    const kotu = { t: 'kick', uid: 'kurban' }
    expect(hostta(kotu)).toBeNull()
    expect(misafirYansitilmis(kotu)).toBeNull()
  })

  it('oyun mesajları her yönden kabul edilir', () => {
    const oyun = [
      { t: 'grab', g: 3 },
      { t: 'release', g: 3 },
      { t: 'move', g: 1, anchor: 0, x: 10, y: -20 },
      { t: 'drop', g: 1, anchor: 0, x: 10, y: -20 },
      { t: 'cursor', x: 5, y: 5, ad: 'Ali' },
      { t: 'split', piece: 2, group: 9, x: 1, y: 1 },
      { t: 'rot', g: 1, d: 1 },
      { t: 'chat', ad: 'Ali', metin: 'selam', ts: 1 },
      { t: 'hello', ad: 'Ali', uid: null, kimlik: 'g-1' },
    ]
    for (const m of oyun) {
      expect(misafirDogrudan(m), `${m.t}`).not.toBeNull()
      expect(misafirYansitilmis(m), `${m.t} yansıtılmış`).not.toBeNull()
      expect(hostta(m), `${m.t} hostta`).not.toBeNull()
    }
  })

  it('ayrılma bildirimi her yönden kabul edilir', () => {
    // Herkes yalnızca kendi ayrılışını bildirir; host yetkili değil
    expect(HOST_YETKILI.has('bye')).toBe(false)
    expect(misafirDogrudan({ t: 'bye' })).not.toBeNull()
    expect(misafirYansitilmis({ t: 'bye' })).not.toBeNull()
    expect(hostta({ t: 'bye' })).not.toBeNull()
  })

  it('tepsi ve karıştır misafirden de kabul edilir', () => {
    // İş birliğine dayalı düğmeler; bilerek host yetkili değiller
    expect(HOST_YETKILI.has('tray')).toBe(false)
    expect(HOST_YETKILI.has('shuffle')).toBe(false)
    expect(hostta({ t: 'tray', seed: 5 })).not.toBeNull()
    expect(hostta({ t: 'shuffle', seed: 5 })).not.toBeNull()
  })
})

describe('dogrula — biçim', () => {
  it('nesne olmayanları reddeder', () => {
    for (const v of [null, undefined, 42, 'merhaba', true, []]) {
      expect(misafirDogrudan(v)).toBeNull()
    }
  })

  it('bilinmeyen mesaj tipini reddeder', () => {
    expect(misafirDogrudan({ t: 'bilinmeyen', x: 1 })).toBeNull()
    expect(misafirDogrudan({ x: 1 })).toBeNull()
  })

  it('NaN ve Infinity reddedilir', () => {
    expect(misafirDogrudan({ t: 'move', g: 1, anchor: 0, x: NaN, y: 0 })).toBeNull()
    expect(misafirDogrudan({ t: 'move', g: 1, anchor: 0, x: Infinity, y: 0 })).toBeNull()
    expect(misafirDogrudan({ t: 'cursor', x: 0, y: -Infinity })).toBeNull()
  })

  it('eksik alanlar reddedilir', () => {
    expect(misafirDogrudan({ t: 'move', g: 1, anchor: 0, x: 5 })).toBeNull()
    expect(misafirDogrudan({ t: 'chat', ad: 'Ali', metin: 'selam' })).toBeNull()
    expect(misafirDogrudan({ t: 'rot', g: 1 })).toBeNull()
  })

  it('yanlış tipteki alanlar reddedilir', () => {
    expect(misafirDogrudan({ t: 'grab', g: '3' })).toBeNull()
    expect(misafirDogrudan({ t: 'chat', ad: 5, metin: 'a', ts: 1 })).toBeNull()
    expect(misafirDogrudan({ t: 'state', snap: 'metin' })).toBeNull()
  })

  it('konum sınırları uygulanır', () => {
    expect(misafirDogrudan({ t: 'move', g: 1, anchor: 0, x: 1e9, y: 0 })).toBeNull()
    expect(misafirDogrudan({ t: 'move', g: 1, anchor: 0, x: -1e9, y: 0 })).toBeNull()
    expect(misafirDogrudan({ t: 'move', g: 1, anchor: 0, x: 999_999, y: 0 })).not.toBeNull()
  })

  it('metin uzunlukları sınırlanır', () => {
    const uzun = 'a'.repeat(2001)
    expect(misafirDogrudan({ t: 'chat', ad: 'Ali', metin: uzun, ts: 1 })).toBeNull()
    expect(misafirDogrudan({ t: 'chat', ad: uzun, metin: 'a', ts: 1 })).toBeNull()
    expect(misafirDogrudan({ t: 'hello', ad: uzun, uid: null })).toBeNull()
  })

  it('döndürme yalnızca çeyrek tur aralığında', () => {
    expect(misafirDogrudan({ t: 'rot', g: 1, d: 1 })).not.toBeNull()
    expect(misafirDogrudan({ t: 'rot', g: 1, d: -3 })).not.toBeNull()
    expect(misafirDogrudan({ t: 'rot', g: 1, d: 99 })).toBeNull()
    expect(misafirDogrudan({ t: 'rot', g: 1, d: 1.5 })).toBeNull()
  })
})

describe('dogrula — fotoğraf aktarımı sınırları', () => {
  it('parça sayısı tavanı aşılamaz', () => {
    const temel = { t: 'meta', seed: 1, pieceCount: 24, title: '', message: '', elapsed: 0 }
    expect(misafirDogrudan({ ...temel, imgChunks: MAX_IMG_CHUNKS })).not.toBeNull()
    expect(misafirDogrudan({ ...temel, imgChunks: MAX_IMG_CHUNKS + 1 })).toBeNull()
    expect(misafirDogrudan({ ...temel, imgChunks: 0 })).toBeNull()
    expect(misafirDogrudan({ ...temel, imgChunks: -5 })).toBeNull()
  })

  it('parça dizini seyrek dizi patlatacak kadar büyük olamaz', () => {
    expect(misafirDogrudan({ t: 'img', i: 0, data: 'a' })).not.toBeNull()
    expect(misafirDogrudan({ t: 'img', i: MAX_IMG_CHUNKS, data: 'a' })).toBeNull()
    expect(misafirDogrudan({ t: 'img', i: 1e9, data: 'a' })).toBeNull()
    expect(misafirDogrudan({ t: 'img', i: -1, data: 'a' })).toBeNull()
  })

  it('tek parça chunk boyutunu aşamaz', () => {
    expect(misafirDogrudan({ t: 'img', i: 0, data: 'a'.repeat(CHUNK_BOYUTU) })).not.toBeNull()
    expect(misafirDogrudan({ t: 'img', i: 0, data: 'a'.repeat(CHUNK_BOYUTU + 1) })).toBeNull()
  })

  it('en fazla bellek tüketimi sınırlı kalır', () => {
    // 1024 parça × 16 KB ≈ 16 MB — kabul edilebilir bir tavan
    expect(MAX_IMG_CHUNKS * CHUNK_BOYUTU).toBeLessThanOrEqual(20 * 1024 * 1024)
  })

  it('parça sayısı 24 parçalık gerçek bir fotoğrafı taşımaya yeter', () => {
    // 10 MB kova sınırı, base64 ~1,37 kat
    const gerekli = Math.ceil((10 * 1024 * 1024 * 1.37) / CHUNK_BOYUTU)
    expect(MAX_IMG_CHUNKS).toBeGreaterThanOrEqual(gerekli)
  })
})
