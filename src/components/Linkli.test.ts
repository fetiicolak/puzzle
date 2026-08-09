import { describe, expect, it } from 'vitest'
import { parcala } from './Linkli'

/** Kısayol: yalnızca adres olarak ayrılan parçalar */
const adresler = (s: string) =>
  parcala(s)
    .filter((p) => p.tur === 'adres')
    .map((p) => p.deger)

describe('parcala', () => {
  it('adres yoksa metni bölmez', () => {
    expect(parcala('merhaba dünya')).toEqual([{ tur: 'yazi', deger: 'merhaba dünya' }])
  })

  it('boş metin boş liste verir', () => {
    expect(parcala('')).toEqual([])
  })

  it('davet linkini ayırır', () => {
    const link = 'https://feti.github.io/puzzle/#room=a1b2c3'
    expect(parcala(`Birlikte puzzle çözelim mi? ${link}`)).toEqual([
      { tur: 'yazi', deger: 'Birlikte puzzle çözelim mi? ' },
      { tur: 'adres', deger: link },
    ])
  })

  it('birden çok adresi ayrı ayrı bulur', () => {
    expect(adresler('http://a.com ve https://b.com/x')).toEqual(['http://a.com', 'https://b.com/x'])
  })

  it('cümle sonundaki noktayı adrese katmaz', () => {
    const p = parcala('şuraya bak: https://ornek.com/sayfa.')
    expect(adresler('şuraya bak: https://ornek.com/sayfa.')).toEqual(['https://ornek.com/sayfa'])
    expect(p[p.length - 1]).toEqual({ tur: 'yazi', deger: '.' })
  })

  it('eşi olmayan kapanış parantezini adrese katmaz', () => {
    expect(adresler('(bak https://ornek.com)')).toEqual(['https://ornek.com'])
  })

  it('adresin kendi parantezini korur', () => {
    expect(adresler('https://tr.wikipedia.org/wiki/Puzzle_(oyun)')).toEqual([
      'https://tr.wikipedia.org/wiki/Puzzle_(oyun)',
    ])
  })

  // Mesajı yazan başkası olabilir: yalnızca http/https bağlantıya dönüşmeli
  it('javascript: şemasını bağlantı yapmaz', () => {
    expect(adresler('javascript:alert(1)')).toEqual([])
  })

  it('data: ve dosya şemalarını bağlantı yapmaz', () => {
    expect(adresler('data:text/html,<b>x</b> file:///C:/gizli')).toEqual([])
  })

  it('metnin içine gömülü şemayı yakalamaz', () => {
    expect(adresler('birhttps://x.com')).toEqual(['https://x.com'])
  })

  it('yalnızca şemadan ibaret metni adres saymaz', () => {
    expect(adresler('https://')).toEqual([])
  })

  it('parçaların birleşimi özgün metni verir', () => {
    const metin = 'gel: https://a.com/#room=xy, sonra https://b.com. tamam'
    expect(
      parcala(metin)
        .map((p) => p.deger)
        .join(''),
    ).toBe(metin)
  })
})
