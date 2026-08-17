import { describe, expect, it } from 'vitest'
import { VARSAYILAN_PALET, paletCikar } from './palet'

/** Tek renkten oluşan sahte bir ImageData.data üret */
function duz(r: number, g: number, b: number, adet = 400): Uint8ClampedArray {
  const dizi = new Uint8ClampedArray(adet * 4)
  for (let i = 0; i < adet; i++) {
    dizi[i * 4] = r
    dizi[i * 4 + 1] = g
    dizi[i * 4 + 2] = b
    dizi[i * 4 + 3] = 255
  }
  return dizi
}

/** İki rengi yarı yarıya karıştıran piksel dizisi */
function karisik(a: number[], b: number[], adet = 400): Uint8ClampedArray {
  const dizi = new Uint8ClampedArray(adet * 4)
  for (let i = 0; i < adet; i++) {
    const renk = i % 2 === 0 ? a : b
    dizi[i * 4] = renk[0]
    dizi[i * 4 + 1] = renk[1]
    dizi[i * 4 + 2] = renk[2]
    dizi[i * 4 + 3] = 255
  }
  return dizi
}

/** '#rrggbb' -> WCAG bağıl parlaklık */
function parlaklik(hex: string): number {
  const kanal = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b)
}

function kontrast(a: number, b: number): number {
  return a > b ? (a + 0.05) / (b + 0.05) : (b + 0.05) / (a + 0.05)
}

describe('paletCikar', () => {
  it('geçerli bir renk döndürür', () => {
    const p = paletCikar(duz(120, 90, 60))
    expect(p.zemin).toMatch(/^#[0-9a-f]{6}$/)
    expect(p.cerceve).toMatch(/^rgba\(/)
    expect(p.kenar).toMatch(/^rgba\(/)
    expect(p.cizgi).toMatch(/^rgba\(/)
  })

  it('koyu fotoğrafta zemini açar — asıl şikâyet buydu', () => {
    // Eski sabit zemin (#1a1426) bu fotoğrafla 1,2 kontrast veriyordu:
    // tepsideki parça zeminin içinde kayboluyordu.
    const p = paletCikar(duz(18, 14, 26))
    expect(kontrast(parlaklik(p.zemin), parlaklik('#120e1a'))).toBeGreaterThan(2.4)
    expect(kontrast(parlaklik(p.zemin), parlaklik('#1a1426'))).toBeGreaterThan(2.4)
  })

  it('açık fotoğrafta zemin koyu kalır', () => {
    const p = paletCikar(duz(238, 232, 220))
    expect(parlaklik(p.zemin)).toBeLessThan(0.05)
    expect(kontrast(parlaklik(p.zemin), parlaklik('#eee8dc'))).toBeGreaterThan(3)
  })

  it('hem koyu hem açık bölgesi olan fotoğrafta iki uca da mesafe bırakır', () => {
    // Uçlardan biri seçilirse fotoğrafın yarısı kayboluyor. Orta ton
    // ikisiyle birden idare ediyor; ortalamaya bakan bir yöntem burada
    // yine orta tonu bulurdu ama yanlış sebeple — tek renkli koyu
    // fotoğrafta da orta tonu seçerdi.
    const p = paletCikar(karisik([12, 12, 14], [246, 246, 240]))
    const y = parlaklik(p.zemin)
    expect(kontrast(y, parlaklik('#0c0c0e'))).toBeGreaterThan(2.4)
    expect(kontrast(y, parlaklik('#f6f6f0'))).toBeGreaterThan(2.4)
  })

  it('açık zeminde üst katman siyaha döner', () => {
    // Koyu ile orta arasında gezinen fotoğraf zemini 0,5'in üstüne itiyor;
    // beyaz çerçeve çizgisi orada görünmez oluyor.
    const acik = paletCikar(karisik([10, 8, 14], [110, 100, 120]))
    expect(acik.acik).toBe(true)
    expect(acik.cerceve).toBe('rgba(0,0,0,0.05)')
    expect(acik.kontur).not.toContain('255,255,255')

    const koyu = paletCikar(duz(238, 232, 220))
    expect(koyu.acik).toBe(false)
    expect(koyu.cerceve).toBe('rgba(255,255,255,0.05)')
    expect(koyu.kontur).toBe('rgba(255,255,255,0.9)')
  })

  it('aynı piksellerde aynı paleti verir — iki oyuncu aynı zemini görmeli', () => {
    const veri = karisik([30, 90, 60], [200, 120, 40])
    expect(paletCikar(veri)).toEqual(paletCikar(veri))
  })

  it('renkli fotoğrafta zemin fotoğrafın tonunda değil', () => {
    // Yeşil bir fotoğrafın zemini de yeşil olursa parça zemine karışıyor
    const p = paletCikar(duz(40, 120, 60))
    const r = parseInt(p.zemin.slice(1, 3), 16)
    const g = parseInt(p.zemin.slice(3, 5), 16)
    const b = parseInt(p.zemin.slice(5, 7), 16)
    expect(g).toBeLessThanOrEqual(Math.max(r, b))
  })

  it('piksel yoksa varsayılan palete düşer', () => {
    expect(paletCikar(new Uint8ClampedArray(0))).toEqual(VARSAYILAN_PALET)
    // tamamı saydam: fotoğrafın rengi hakkında bilgi vermiyor
    expect(paletCikar(new Uint8ClampedArray(40))).toEqual(VARSAYILAN_PALET)
  })
})
