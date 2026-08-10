// Baş harfler ve oda kodu. İkisi de saf; tarayıcı gerekmiyor
// (crypto.getRandomValues Node 20+ içinde global).

import { describe, expect, it } from 'vitest'
import { basHarfler } from './ad'
import { randomRoomCode } from './net/odakodu'

describe('basHarfler', () => {
  it('tek kelimede tek harf', () => {
    expect(basHarfler('Feti')).toBe('F')
  })

  it('iki kelimede ilk ve son', () => {
    expect(basHarfler('Feti Çolak')).toBe('FÇ')
  })

  it('üç kelimede ortadaki atlanır', () => {
    expect(basHarfler('Ayşe Nur Yıldız')).toBe('AY')
  })

  it('Türkçe büyütme kuralı: i -> İ', () => {
    // toUpperCase() bunu 'I' yapıyor ve baş harf yanlış çıkıyordu
    expect(basHarfler('ipek')).toBe('İ')
    expect(basHarfler('ismail kaya')).toBe('İK')
  })

  it('boş ya da yalnızca boşluk için soru işareti', () => {
    expect(basHarfler('')).toBe('?')
    expect(basHarfler('   ')).toBe('?')
    expect(basHarfler(null)).toBe('?')
    expect(basHarfler(undefined)).toBe('?')
  })

  it('fazladan boşluklar sorun çıkarmaz', () => {
    expect(basHarfler('  Feti   Çolak  ')).toBe('FÇ')
  })
})

describe('randomRoomCode', () => {
  it('sekiz karakter üretir', () => {
    expect(randomRoomCode()).toHaveLength(8)
  })

  it('yalnızca karışması zor harf ve rakamlar kullanır', () => {
    // i/l/1 ve o/0 bilerek dışarıda: kod elle yazılırken karışmasın
    for (let i = 0; i < 200; i++) {
      expect(randomRoomCode()).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/)
    }
  })

  it('ardışık çağrılar aynı kodu vermiyor', () => {
    const kodlar = new Set(Array.from({ length: 100 }, () => randomRoomCode()))
    expect(kodlar.size).toBe(100)
  })
})
