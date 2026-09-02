// Sunucu kaydı üzerinde çalışan saf işlevler. Ağ yok: hepsi düz veri alıyor.

import { describe, expect, it } from 'vitest'
import {
  gercektenBitti,
  ilerlemeOlcusu,
  istatistikCikar,
  kilitliMi,
  type RemotePuzzle,
} from './puzzles'
import { cevrimiciMi } from './friends'

/** Testte okunabilir kalsın diye yalnızca ilgili alanlar veriliyor */
function puzzle(alanlar: Partial<RemotePuzzle>): RemotePuzzle {
  return {
    id: 'p1',
    owner: 'ben',
    room_code: 'abc',
    title: '',
    artist: '',
    image_path: '',
    seed: 1,
    piece_count: 100,
    message: '',
    max_players: 1,
    rotation: false,
    unlock_at: null,
    state: null,
    elapsed: 0,
    completed: false,
    created_at: '',
    updated_at: '',
    ...alanlar,
  }
}

describe('kilitliMi', () => {
  it('tarih gelecekteyse kilitli', () => {
    const yarin = new Date(Date.now() + 86_400_000).toISOString()
    expect(kilitliMi({ unlock_at: yarin })).toBe(true)
  })

  it('tarih geçtiyse açık', () => {
    const dun = new Date(Date.now() - 86_400_000).toISOString()
    expect(kilitliMi({ unlock_at: dun })).toBe(false)
  })

  it('tarih yoksa açık', () => {
    expect(kilitliMi({ unlock_at: null })).toBe(false)
  })
})

describe('gercektenBitti', () => {
  it('bayrak açıksa bitmiş sayar', () => {
    expect(gercektenBitti(puzzle({ completed: true }))).toBe(true)
  })

  it('bayrak kapalı ve durum yoksa bitmemiş sayar', () => {
    expect(gercektenBitti(puzzle({ completed: false, state: null }))).toBe(false)
  })
})

describe('istatistikCikar', () => {
  const liste = [
    puzzle({ id: '1', completed: true, elapsed: 300, piece_count: 100 }),
    puzzle({ id: '2', completed: true, elapsed: 120, piece_count: 50 }),
    puzzle({ id: '3', completed: false, elapsed: 60, piece_count: 500 }),
  ]

  it('biten sayısı yalnızca bitmişleri sayar', () => {
    expect(istatistikCikar(liste, 'ben').bitenPuzzle).toBe(2)
    expect(istatistikCikar(liste, 'ben').toplamPuzzle).toBe(3)
  })

  it('toplam süre hepsini, toplam parça yalnızca bitenleri toplar', () => {
    const s = istatistikCikar(liste, 'ben')
    expect(s.toplamSure).toBe(480)
    // 500 parçalık yarım kalan sayılmıyor
    expect(s.toplamParca).toBe(150)
  })

  it('en hızlı, bitenlerin en küçük süresidir', () => {
    expect(istatistikCikar(liste, 'ben').enHizli?.elapsed).toBe(120)
  })

  it('süresi sıfır olan kayıt "en hızlı" sayılmaz', () => {
    // Yeni açılmış ama hiç oynanmamış bir kayıt rekoru 0 saniyeye düşürüyordu
    const s = istatistikCikar([...liste, puzzle({ id: '4', completed: true, elapsed: 0 })], 'ben')
    expect(s.enHizli?.elapsed).toBe(120)
  })

  it('hiç biten yoksa en hızlı boş', () => {
    expect(istatistikCikar([puzzle({ completed: false })], 'ben').enHizli).toBeNull()
  })

  it('birlikte çözülen: başkasının odası ya da çok kişilik olanlar', () => {
    const s = istatistikCikar(
      [
        puzzle({ id: '1', owner: 'ben', max_players: 1 }), // tek başına
        puzzle({ id: '2', owner: 'ben', max_players: 2 }), // birlikte
        puzzle({ id: '3', owner: 'baskasi', max_players: 1 }), // birlikte
      ],
      'ben',
    )
    expect(s.birlikteCozulen).toBe(2)
  })
})

describe('cevrimiciMi', () => {
  it('damga yoksa çevrimdışı', () => {
    expect(cevrimiciMi(null)).toBe(false)
    expect(cevrimiciMi(undefined)).toBe(false)
  })

  it('damga bir dakikalıksa çevrimiçi', () => {
    expect(cevrimiciMi(new Date(Date.now() - 60_000).toISOString())).toBe(true)
  })

  it('iki dakikayı geçen damga çevrimdışı', () => {
    expect(cevrimiciMi(new Date(Date.now() - 3 * 60_000).toISOString())).toBe(false)
  })

  it('gelecekteki damga çevrimdışı sayılır', () => {
    // Saati ileri alınmış bir cihaz kendini sonsuza kadar çevrimiçi
    // gösterebilirdi; fark negatifse güvenmiyoruz.
    expect(cevrimiciMi(new Date(Date.now() + 10 * 60_000).toISOString())).toBe(false)
  })
})

describe('ilerlemeOlcusu', () => {
  /** Verilen grup numaralarından bir snapshot kur */
  const snap = (gruplar: number[]) => ({
    positions: gruplar.map((group) => ({ x: 0, y: 0, group })),
  })

  it('hiç birleşme yoksa sıfır', () => {
    expect(ilerlemeOlcusu(snap([0, 1, 2, 3]))).toBe(0)
  })

  it('birleşen her parça ölçüyü bir artırır', () => {
    expect(ilerlemeOlcusu(snap([0, 0, 2, 3]))).toBe(1)
    expect(ilerlemeOlcusu(snap([0, 0, 0, 3]))).toBe(2)
  })

  it('tamamlanmış puzzle en yüksek değeri verir', () => {
    expect(ilerlemeOlcusu(snap([7, 7, 7, 7]))).toBe(3)
  })

  it('daha ileri olanı ayırt eder — çakışma kararı buna dayanıyor', () => {
    const bizim = snap([0, 0, 2, 3, 4])
    const onlarin = snap([0, 0, 0, 0, 4])
    expect(ilerlemeOlcusu(onlarin)).toBeGreaterThan(ilerlemeOlcusu(bizim))
  })

  it('parça gruptan çıkarılınca ölçü düşer — tek yönlü değil', () => {
    // state.ts parçayı gruptan ayırabiliyor; ölçü o anki dizilimi anlatmalı,
    // yapılmış en iyi dizilimi değil.
    expect(ilerlemeOlcusu(snap([0, 0, 0]))).toBe(2)
    expect(ilerlemeOlcusu(snap([0, 0, 5]))).toBe(1)
  })

  it('boş ya da eksik kayıtta sıfır', () => {
    expect(ilerlemeOlcusu(null)).toBe(0)
    expect(ilerlemeOlcusu(undefined)).toBe(0)
    expect(ilerlemeOlcusu({ positions: [] })).toBe(0)
  })
})
