import { describe, expect, it } from 'vitest'
import { PARCALAR, VARSAYILAN_PARCA, notalariPlanla, parcaBul } from './muzik'

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
