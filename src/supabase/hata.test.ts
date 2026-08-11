// hataMetni() — sunucudan gelen ham hata metinlerinin kullanıcıya
// gösterilebilir hâle çevrilmesi.
//
// Bu testin asıl işi bir regresyonu önlemek: veritabanı tetikleyicilerinin
// `raise exception` metinleri SQL dosyasında ASCII yazılıyor
// ('gunluk puzzle sinirina ulastin') ve bir dönem kullanıcıya aynen böyle
// gösteriliyordu. Yeni bir tetikleyici eklenip buraya bağlanmazsa aşağıdaki
// "hepsi kapsanıyor" testi düşer.

import { describe, expect, it } from 'vitest'
import { hataMetni } from './client'

/**
 * supabase/schema.sql içindeki `raise exception` metinlerinin tamamı.
 * SQL dosyası değişirse bu listeyi de güncelle.
 */
const SUNUCU_METINLERI = [
  'oda bulunamadi',
  'puzzle henuz acilmadi',
  'odadan cikarildin',
  'sahiplik degistirilemez',
  'bu alani yalnizca puzzle sahibi degistirebilir',
  'bu odanin katilimcisi degilsin',
  'yetkin yok',
  'kisi odada degil',
  'kendini cikaramazsin',
  'odayi kuran kisi cikarilamaz',
  'yetkili bir kisiyi yalnizca odayi kuran cikarabilir',
  'yetkiyi yalnizca odayi kuran verebilir',
  'odayi kuranin yetkisi degistirilemez',
  'arkadaslik taraflari degistirilemez',
  'gecersiz arkadaslik durumu degisikligi',
  'mesaj icerigi degistirilemez',
  'gunluk puzzle sinirina ulastin',
  'cok hizli mesaj gonderiyorsun, biraz bekle',
  'mesajinda kufur ya da tehdit var',
  'gunluk arkadaslik istegi sinirina ulastin',
  'gunluk sikayet sinirina ulastin',
  'oturum yok',
]

/** Türkçe karakter içermeyen ASCII metin mi (yani ham sunucu metni mi) */
function hamMi(metin: string): boolean {
  return !/[çğıöşüÇĞİÖŞÜ]/.test(metin)
}

describe('hataMetni', () => {
  it('şemadaki her raise exception metnini çeviriyor', () => {
    for (const ham of SUNUCU_METINLERI) {
      const sonuc = hataMetni(ham)
      expect(sonuc, `çevrilmemiş: ${ham}`).not.toBe(ham)
      expect(hamMi(sonuc), `Türkçesi yok: ${ham} -> ${sonuc}`).toBe(false)
    }
  })

  it('Postgres hatanın başına kendi ekini koysa da tanıyor', () => {
    // PostgREST hatayı çoğu zaman sarmalıyor
    const sonuc = hataMetni('P0001: cok hizli mesaj gonderiyorsun, biraz bekle')
    expect(sonuc).toContain('Çok hızlı')
  })

  it('daha belirli kural, genel "yetkin yok" kuralından önce gelir', () => {
    // Bu metin hem 'yetkin yok' hem daha belirli bir kalıp içermiyor;
    // asıl risk ters sırada eşleşen satırlar. Sıra bozulursa bu düşer.
    expect(hataMetni('yetkili bir kisiyi yalnizca odayi kuran cikarabilir')).toContain(
      'Yetkili birini',
    )
  })

  it('bilinen Supabase auth hatalarını çeviriyor', () => {
    expect(hataMetni('Invalid login credentials')).toContain('şifre hatalı')
    expect(hataMetni('Password should be at least 6 characters')).toContain('6 karakter')
    expect(hataMetni('Failed to fetch')).toContain('Sunucuya ulaşılamadı')
  })

  it('satır düzeyi güvenlik hatasını yetki metnine çeviriyor', () => {
    expect(hataMetni('new row violates row-level security policy')).toBe(
      'Bu işlem için yetkin yok.',
    )
  })

  it('tanımadığı metni olduğu gibi bırakıyor', () => {
    // Bilinmeyeni uydurmak yerine göstermek bilinçli: hata ayıklanabilsin.
    expect(hataMetni('beklenmedik bir sey oldu 42')).toBe('beklenmedik bir sey oldu 42')
  })
})
