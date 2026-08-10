import { describe, expect, it } from 'vitest'
import { PARCALAR, VARSAYILAN_PARCA, notalariPlanla, parcaBul } from './muzik'
import { MUZIK_TAVAN } from './audio'

describe('parcaBul', () => {
  it('bilinen kimliği bulur', () => {
    expect(parcaBul('gece').id).toBe('gece')
  })

  it('bilinmeyen kimlik varsayılana düşer', () => {
    // karşı taraf bizim kodumuzu çalıştırmak zorunda değil
    expect(parcaBul('yok-boyle-bir-sey').id).toBe(VARSAYILAN_PARCA)
    expect(parcaBul('').id).toBe(VARSAYILAN_PARCA)
  })

  it('varsayılan parça listenin ilk sırasında', () => {
    expect(PARCALAR[0].id).toBe(VARSAYILAN_PARCA)
  })

  it('kimlikler benzersiz ve protokol sınırının altında', () => {
    const idler = PARCALAR.map((p) => p.id)
    expect(new Set(idler).size).toBe(idler.length)
    for (const id of idler) expect(id.length).toBeLessThanOrEqual(24)
  })
})

describe('notalariPlanla', () => {
  const parca = parcaBul('piyano')

  it('aynı tohum ve adım birebir aynı diziyi verir', () => {
    // odadaki iki taraf aynı ezgiyi duysun diye bu şart
    const a = notalariPlanla(parca, 12345, 3)
    const b = notalariPlanla(parca, 12345, 3)
    expect(a).toEqual(b)
  })

  it('farklı tohum farklı dizi verir', () => {
    const a = notalariPlanla(parca, 1, 0)
    const b = notalariPlanla(parca, 2, 0)
    expect(a).not.toEqual(b)
  })

  it('akorlar sırayla dönüyor', () => {
    const frekanslar = (adim: number) =>
      notalariPlanla(parca, 7, adim)
        .filter((n) => n.zarf === 'pad')
        .map((n) => n.frekans)
    expect(frekanslar(0)).toEqual(parca.akorlar[0])
    expect(frekanslar(1)).toEqual(parca.akorlar[1])
    // dördüncüden sonra başa dönüyor
    expect(frekanslar(4)).toEqual(parca.akorlar[0])
    expect(frekanslar(9)).toEqual(parca.akorlar[1])
  })

  it('ardışık adımlar aynı diziyi tekrarlamıyor', () => {
    // adım tohuma karıştırılmasa mulberry32 benzer diziler üretiyordu
    const a = notalariPlanla(parca, 99, 0)
    const b = notalariPlanla(parca, 99, 1)
    expect(a).not.toEqual(b)
  })

  it('çan bazen çıkıyor bazen çıkmıyor', () => {
    let canli = 0
    for (let adim = 0; adim < 200; adim++) {
      if (notalariPlanla(parca, 5, adim).some((n) => n.zarf === 'can')) canli++
    }
    // olasılık 0.6; 200 adımda uçlara yapışmamalı
    expect(canli).toBeGreaterThan(80)
    expect(canli).toBeLessThan(160)
  })

  it('ambiyans parçası kesintisiz gürültü üretiyor', () => {
    const yagmur = parcaBul('yagmur')
    const notalar = notalariPlanla(yagmur, 3, 0)
    const gurultu = notalar.filter((n) => n.gurultu)
    expect(gurultu).toHaveLength(1)
    expect(gurultu[0].zarf).toBe('duz')
    // adımdan uzun sürüyor ki ardışık adımlar üst üste binsin
    expect(gurultu[0].sure).toBeGreaterThan(yagmur.akorSuresi)
  })

  it('arpej parçası akorun notalarını sırayla çalıyor', () => {
    // müzik kutusunun diğerlerinden asıl farkı bu: yastık yok, tek tek nota
    const kutu = parcaBul('kutu')
    const notalar = notalariPlanla(kutu, 11, 0)
    expect(notalar.every((n) => n.zarf === 'can')).toBe(true)
    expect(notalar.length).toBeGreaterThan(5)
    // gecikmeler artan ve eşit aralıklı
    const araliklar = notalar.slice(1).map((n, i) => +(n.gecikme - notalar[i].gecikme).toFixed(6))
    expect(new Set(araliklar).size).toBe(1)
    // merdiven: akorun içinde inip çıkıyor, rastgele atlamıyor
    const indeksler = notalar.map((n) => kutu.akorlar[0].indexOf(n.frekans))
    expect(indeksler.slice(0, 6)).toEqual([0, 1, 2, 3, 2, 1])
  })

  it('beyaz gürültü yalnızca gürültü, nota yok', () => {
    // yağmurdan farkı: altında drone da yok
    const notalar = notalariPlanla(parcaBul('beyaz'), 8, 2)
    expect(notalar).toHaveLength(1)
    expect(notalar[0].gurultu).toBe(true)
  })

  it('parçalar birbirinden ayırt edilebilir', () => {
    // "üçü de birbirine benziyor" hatası buradan çıkmıştı: parçaları ayıran
    // şey akorlar değil, kurgu + tını + tempo
    const kimlik = (id: string) => {
      const p = parcaBul(id)
      return `${p.tur}/${p.dalga}/${p.akorSuresi}`
    }
    const kimlikler = PARCALAR.map((p) => kimlik(p.id))
    expect(new Set(kimlikler).size).toBe(PARCALAR.length)
  })

  it('bütün parçalar makul notalar üretiyor', () => {
    for (const p of PARCALAR) {
      for (let adim = 0; adim < 12; adim++) {
        const notalar = notalariPlanla(p, 4242, adim)
        expect(notalar.length).toBeGreaterThan(0)
        for (const n of notalar) {
          expect(Number.isFinite(n.frekans)).toBe(true)
          if (!n.gurultu) {
            expect(n.frekans).toBeGreaterThan(20)
            expect(n.frekans).toBeLessThan(20000)
          }
          expect(n.sure).toBeGreaterThan(0)
          expect(n.ses).toBeGreaterThan(0)
          // kazanç toplamı hoparlörü kırpacak kadar yüksek olmasın
          expect(n.ses).toBeLessThan(0.2)
          expect(n.gecikme).toBeGreaterThanOrEqual(0)
          // çan bir sonraki adıma sarkmasın
          expect(n.gecikme).toBeLessThan(p.akorSuresi)
          expect(n.filtre).toBeGreaterThan(0)
        }
      }
    }
  })
})

describe('müzik yolunun tepe kazancı', () => {
  /*
    Müzik yolu 1'den büyük bir çarpanla çalıyor (MUZIK_TAVAN) — küçük
    hoparlörlerde pes yastıklar hiç duyulmuyordu. Çarpan büyütülürken
    kırpılmaya gitmediğimizi burada ölçüyoruz: aynı anda çalan bütün
    notaların tepe kazançları toplanıp çarpanla çarpılıyor.

    Zarf sadeleştirmesi bilerek kötümser: nota, süresi boyunca hep tepede
    sayılıyor. Gerçekte açılıp sönüyor, yani asıl toplam bundan küçük.
  */
  function tepe(parca: (typeof PARCALAR)[number]): number {
    const adimlar = 12
    const notalar = Array.from({ length: adimlar }, (_, a) =>
      notalariPlanla(parca, 12345, a).map((n) => ({
        bas: a * parca.akorSuresi + n.gecikme,
        son: a * parca.akorSuresi + n.gecikme + n.sure,
        ses: n.ses,
      })),
    ).flat()
    let enYuksek = 0
    const bitis = adimlar * parca.akorSuresi
    for (let t = 0; t < bitis; t += 0.02) {
      let toplam = 0
      for (const n of notalar) if (t >= n.bas && t <= n.son) toplam += n.ses
      if (toplam > enYuksek) enYuksek = toplam
    }
    return enYuksek
  }

  for (const parca of PARCALAR) {
    it(`${parca.id}: efektlere yer bırakacak kadar altta`, () => {
      /*
        Efektlerle aynı anda toplanıyorlar. Efekt yolunun tavanı 0,9 ama
        oradan geçen en yüksek ses kutlama arpeji: dört nota 0,11 sn arayla,
        tepesi ~0,21 × 0,9 ≈ 0,19. Müziğe 0,7 bırakmak toplamı 1'in altında
        tutuyor. Bugünkü en yükseği piyano: 0,525.
      */
      expect(tepe(parca) * MUZIK_TAVAN).toBeLessThan(0.7)
    })
  }

  it('çarpan 1den büyük — yoksa tablette müzik duyulmuyor', () => {
    expect(MUZIK_TAVAN).toBeGreaterThan(1)
  })
})
