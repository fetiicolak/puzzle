// Küfür süzgeci. İki iş görüyor: süzgecin kendisi doğru mu, ve istemcideki
// sözlük ile `supabase/schema.sql`'deki `kaba_mi()` sözlüğü aynı mı.
//
// İkincisi bir regresyona karşı: aynı liste iki dosyada duruyor (sohbet P2P
// olduğu için istemcide, mesajlaşma sunucudan geçtiği için SQL'de). Biri
// güncellenip öteki unutulursa iki uçta iki farklı kural işler.

import { describe, expect, it } from 'vitest'
import sema from '../supabase/schema.sql?raw'
import { KUFUR_KALIPLARI, kabaMi } from './kufur'

describe('kabaMi', () => {
  it('hakaret içeren cümleyi yakalıyor', () => {
    expect(kabaMi('sen tam bir orospusun')).toBe(true)
    expect(kabaMi('siktir git')).toBe(true)
    expect(kabaMi('what the fuck')).toBe(true)
  })

  it('tehdit içeren cümleyi yakalıyor', () => {
    expect(kabaMi('seni öldüreceğim')).toBe(true)
    expect(kabaMi('gebertirim seni')).toBe(true)
    expect(kabaMi('i will kill you')).toBe(true)
  })

  it('Türkçe karakterle başlayan kalıp cümlenin ortasında da yakalanıyor', () => {
    // `\b` kullanıldığında bunlar kaçıyordu: JavaScript'te 'ö' de boşluk da
    // \w sayılmadığı için ikisinin arasında kelime sınırı yok.
    expect(kabaMi('bak sana şerefsiz diyorum')).toBe(true)
    expect(kabaMi('resmen yavşaklık')).toBe(true)
  })

  it('büyük harf ve cümle içi konum fark etmiyor', () => {
    expect(kabaMi('SİKTİR')).toBe(true)
    expect(kabaMi('dedi ki: Orospu çocuğu')).toBe(true)
  })

  it('masum cümleleri elemiyor', () => {
    // Asıl risk bu: yanlış pozitif, kaçırılan küfürden pahalı
    const masum = [
      'bu parçayı götürmek zorundayım',
      'çok sıkıntılı bir gün oldu',
      'şikayet etmek istemem ama',
      'sıcaktan geberiyorum', // 'geber' yalnızca tek başınayken tehdit sayılıyor
      'kilo vermek istiyorum',
      'bu tabloyu birlikte bitirelim',
      'sıkışan parçayı çıkarabilir misin',
      'asık suratlı görünüyor',
    ]
    for (const cumle of masum) {
      expect(kabaMi(cumle), `yanlış pozitif: ${cumle}`).toBe(false)
    }
  })

  it('boş ve bozuk girdide patlamıyor', () => {
    expect(kabaMi('')).toBe(false)
    expect(kabaMi(undefined as unknown as string)).toBe(false)
  })
})

describe('sözlük SQL ile aynı', () => {
  it('kaba_mi() ile birebir aynı kalıpları içeriyor', () => {
    const govde = /create or replace function public\.kaba_mi[\s\S]*?\$\$;/.exec(sema)?.[0]
    expect(govde, 'kaba_mi() şemada bulunamadı').toBeTruthy()

    // '\m(' ile ')' arasındaki alternatifler; SQL dizeleri || ile ekleniyor
    const parcalar = [...govde!.matchAll(/'([^']*)'/g)].map((m) => m[1]).join('')
    const icerik = /\\m\((.*)\)/.exec(parcalar)?.[1]
    expect(icerik, 'kalıp listesi ayrıştırılamadı').toBeTruthy()

    const sqlKaliplar = icerik!.split('|').filter(Boolean)
    expect(sqlKaliplar).toEqual(KUFUR_KALIPLARI.map((k) => k.replace(/\\\\/g, '\\')))
  })
})
