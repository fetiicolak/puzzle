import { describe, expect, it } from 'vitest'
import { computeGrid, generateCut, mulberry32 } from './cutter'
import {
  arrangeTray,
  canSplit,
  correctPos,
  createGameState,
  dropGroup,
  isCompleted,
  isEdgePiece,
  moveGroup,
  nextFreeGroupId,
  progress,
  restore,
  rotateGroup,
  rotateVec,
  shufflePieces,
  snapshot,
  snapshotTamamlanmis,
  splitPiece,
} from './state'

describe('mulberry32', () => {
  it('aynı seed aynı diziyi üretir', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 100; i++) expect(a()).toBe(b())
  })
  it('0..1 aralığında değer üretir', () => {
    const r = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('computeGrid', () => {
  it('kare görselde hedefe yakın parça sayısı verir', () => {
    const { rows, cols } = computeGrid(1000, 1000, 100)
    expect(rows * cols).toBeGreaterThanOrEqual(80)
    expect(rows * cols).toBeLessThanOrEqual(120)
    expect(Math.abs(rows - cols)).toBeLessThanOrEqual(1)
  })
  it('geniş görselde sütun sayısı satırdan fazladır', () => {
    const { rows, cols } = computeGrid(2000, 1000, 100)
    expect(cols).toBeGreaterThan(rows)
  })
  it('hücreler kareye yakındır', () => {
    const { rows, cols } = computeGrid(1600, 900, 300)
    const cellAspect = 1600 / cols / (900 / rows)
    expect(cellAspect).toBeGreaterThan(0.7)
    expect(cellAspect).toBeLessThan(1.4)
  })
})

describe('generateCut', () => {
  it('aynı seed birebir aynı kesimi üretir (multiplayer determinizmi)', () => {
    const a = generateCut(1200, 800, 100, 12345)
    const b = generateCut(1200, 800, 100, 12345)
    expect(a).toEqual(b)
  })
  it('farklı seed farklı kesim üretir', () => {
    const a = generateCut(1200, 800, 100, 1)
    const b = generateCut(1200, 800, 100, 2)
    expect(a).not.toEqual(b)
  })
  it('dış kenarlar düzdür, iç kenarlar tab içerir', () => {
    const cut = generateCut(1000, 1000, 25, 7)
    for (let c = 0; c < cut.cols; c++) {
      expect(cut.horizontal[0][c].sign).toBe(0)
      expect(cut.horizontal[cut.rows][c].sign).toBe(0)
    }
    for (let r = 0; r < cut.rows; r++) {
      expect(cut.vertical[r][0].sign).toBe(0)
      expect(cut.vertical[r][cut.cols].sign).toBe(0)
    }
    expect(cut.horizontal[1][0].sign).not.toBe(0)
    expect(cut.vertical[0][1].sign).not.toBe(0)
  })
})

function makeState(seed = 99) {
  const cut = generateCut(400, 400, 16, seed)
  return createGameState(cut, seed + 1)
}

describe('createGameState', () => {
  it('parçalar çerçeve dışına dağıtılır, her parça kendi grubundadır', () => {
    const s = makeState()
    expect(s.pieces.length).toBe(s.cut.rows * s.cut.cols)
    expect(s.groups.size).toBe(s.pieces.length)
    expect(isCompleted(s)).toBe(false)
  })
  it('aynı seed aynı dağılımı üretir', () => {
    const a = makeState(5)
    const b = makeState(5)
    expect(a.pieces.map((p) => [p.x, p.y])).toEqual(b.pieces.map((p) => [p.x, p.y]))
  })
})

describe('dropGroup', () => {
  it('doğru konuma yakın bırakılan parça çerçeveye oturur', () => {
    const s = makeState()
    const p = s.pieces[0]
    const cp = correctPos(s.cut, p)
    moveGroup(s, p.group, cp.x + 5 - p.x, cp.y - 3 - p.y)
    const res = dropGroup(s, p.group)
    expect(res.snappedToFrame).toBe(true)
    expect(p.x).toBeCloseTo(cp.x)
    expect(p.y).toBeCloseTo(cp.y)
  })
  it('uzağa bırakılan parça oturmaz', () => {
    const s = makeState()
    const p = s.pieces[0]
    const cp = correctPos(s.cut, p)
    moveGroup(s, p.group, cp.x + 200 - p.x, cp.y + 200 - p.y)
    const res = dropGroup(s, p.group)
    expect(res.snappedToFrame).toBe(false)
  })
  it('komşusuna doğru göreli konumda bırakılan parça grubuyla birleşir', () => {
    const s = makeState()
    const a = s.pieces[0] // (0,0)
    const b = s.pieces[1] // (0,1)
    // a'yı serbest bir yere koy
    moveGroup(s, a.group, 1000 - a.x, 1000 - a.y)
    // b'yi a'nın sağına, beklenen göreli konuma yakın bırak
    moveGroup(s, b.group, a.x + s.cut.cellW + 4 - b.x, a.y + 2 - b.y)
    const res = dropGroup(s, b.group)
    expect(res.merges).toBe(1)
    expect(a.group).toBe(b.group)
    // birleşince hizalanır
    expect(b.x - a.x).toBeCloseTo(s.cut.cellW)
    expect(b.y - a.y).toBeCloseTo(0)
  })
  it('zincirleme birleşme: iki grubun arasına oturan parça hepsini birleştirir', () => {
    const s = makeState()
    const a = s.pieces[0] // (0,0)
    const b = s.pieces[1] // (0,1)
    const c = s.pieces[2] // (0,2)
    moveGroup(s, a.group, 1000 - a.x, 1000 - a.y)
    moveGroup(s, c.group, a.x + 2 * s.cut.cellW - c.x, a.y - c.y)
    // b tam ortaya bırakılır → hem a hem c ile birleşmeli
    moveGroup(s, b.group, a.x + s.cut.cellW + 3 - b.x, a.y - 2 - b.y)
    const res = dropGroup(s, b.group)
    expect(res.merges).toBe(2)
    expect(new Set([a.group, b.group, c.group]).size).toBe(1)
  })
  it('tüm parçalar yerine oturunca tamamlanır', () => {
    const s = makeState()
    for (const p of s.pieces) {
      const cp = correctPos(s.cut, p)
      moveGroup(s, p.group, cp.x - p.x, cp.y - p.y)
      dropGroup(s, p.group)
    }
    expect(isCompleted(s)).toBe(true)
    expect(progress(s)).toBe(1)
  })
})

describe('splitPiece', () => {
  function birlesmisGrup() {
    const s = makeState()
    const a = s.pieces[0]
    const b = s.pieces[1]
    moveGroup(s, a.group, 800 - a.x, 800 - a.y)
    moveGroup(s, b.group, a.x + s.cut.cellW - b.x, a.y - b.y)
    dropGroup(s, b.group)
    return { s, a, b }
  }

  it('birleşmiş gruptan parça koparır', () => {
    const { s, a, b } = birlesmisGrup()
    expect(a.group).toBe(b.group)
    expect(canSplit(s, b.id)).toBe(true)

    const yeni = nextFreeGroupId(s)
    const ok = splitPiece(s, b.id, yeni, 1500, 1500)
    expect(ok).toBe(true)
    expect(b.group).toBe(yeni)
    expect(b.group).not.toBe(a.group)
    expect(b.x).toBe(1500)
    expect(s.groups.get(yeni)).toEqual([b.id])
    expect(s.groups.get(a.group)).toEqual([a.id])
  })

  it('tek parçalık grupta bir şey yapmaz', () => {
    const s = makeState()
    expect(canSplit(s, 0)).toBe(false)
    expect(splitPiece(s, 0, nextFreeGroupId(s), 10, 10)).toBe(false)
  })

  it('ayrılan parça tekrar birleşebilir', () => {
    const { s, a, b } = birlesmisGrup()
    splitPiece(s, b.id, nextFreeGroupId(s), 1500, 1500)
    // b'yi tekrar a'nın sağına getir
    moveGroup(s, b.group, a.x + s.cut.cellW - b.x, a.y - b.y)
    const res = dropGroup(s, b.group)
    expect(res.merges).toBe(1)
    expect(a.group).toBe(b.group)
  })

  it('nextFreeGroupId kullanımdaki kimliği vermez', () => {
    const s = makeState()
    const id = nextFreeGroupId(s)
    expect(s.groups.has(id)).toBe(false)
  })
})

describe('döndürme', () => {
  it('rotateVec çeyrek turları doğru uygular', () => {
    expect(rotateVec(10, 0, 0)).toEqual({ x: 10, y: 0 })
    expect(rotateVec(10, 0, 1)).toEqual({ x: -0, y: 10 })
    expect(rotateVec(10, 0, 2)).toEqual({ x: -10, y: -0 })
    expect(rotateVec(10, 0, 3)).toEqual({ x: 0, y: -10 })
    // 4 tur başa döner
    expect(rotateVec(7, -3, 4)).toEqual({ x: 7, y: -3 })
  })

  it('döndürmeli modda parçalar rastgele açıyla başlar', () => {
    const cut = generateCut(400, 400, 16, 5)
    const s = createGameState(cut, 6, true)
    expect(s.rotation).toBe(true)
    expect(s.pieces.some((p) => p.rot !== 0)).toBe(true)
  })

  it('düz modda tüm parçalar düz başlar', () => {
    const s = makeState()
    expect(s.pieces.every((p) => p.rot === 0)).toBe(true)
  })

  it('grup döndürünce açı değişir, 4 turda başa döner', () => {
    const s = makeState()
    const p = s.pieces[0]
    const bas = { x: p.x, y: p.y }
    rotateGroup(s, p.group, 1)
    expect(p.rot).toBe(1)
    rotateGroup(s, p.group, 3)
    expect(p.rot).toBe(0)
    // tek parçalık grupta konum da yerine döner
    expect(p.x).toBeCloseTo(bas.x)
    expect(p.y).toBeCloseTo(bas.y)
  })

  it('çevrilmiş parça çerçeveye oturmaz, düzeltilince oturur', () => {
    const cut = generateCut(400, 400, 16, 5)
    const s = createGameState(cut, 6, true)
    const p = s.pieces[0]
    // doğru konuma getir ama çevrili bırak
    const cp = correctPos(s.cut, p)
    moveGroup(s, p.group, cp.x - p.x, cp.y - p.y)
    p.rot = 1
    expect(dropGroup(s, p.group).snappedToFrame).toBe(false)

    p.rot = 0
    moveGroup(s, p.group, cp.x - p.x, cp.y - p.y)
    expect(dropGroup(s, p.group).snappedToFrame).toBe(true)
  })

  it('açıları farklı komşular birleşmez', () => {
    const s = makeState()
    const a = s.pieces[0]
    const b = s.pieces[1]
    moveGroup(s, a.group, 900 - a.x, 900 - a.y)
    moveGroup(s, b.group, a.x + s.cut.cellW - b.x, a.y - b.y)
    b.rot = 2 // açı uyuşmuyor
    expect(dropGroup(s, b.group).merges).toBe(0)
    expect(a.group).not.toBe(b.group)
  })

  it('döndürülmüş grup komşusuyla döndürülmüş hizada birleşir', () => {
    const s = makeState()
    const a = s.pieces[0] // (0,0)
    const b = s.pieces[1] // (0,1) — normalde a'nın sağında
    moveGroup(s, a.group, 900 - a.x, 900 - a.y)
    a.rot = 1
    b.rot = 1
    // 1 çeyrek tur dönmüşse komşu sağda değil, altta beklenir
    const v = rotateVec(s.cut.cellW, 0, 1)
    moveGroup(s, b.group, a.x + v.x + 3 - b.x, a.y + v.y - 2 - b.y)
    const res = dropGroup(s, b.group)
    expect(res.merges).toBe(1)
    expect(a.group).toBe(b.group)
  })

  it('çevrili parça tamamlanmış sayılmaz', () => {
    const s = makeState()
    for (const p of s.pieces) {
      const cp = correctPos(s.cut, p)
      moveGroup(s, p.group, cp.x - p.x, cp.y - p.y)
      dropGroup(s, p.group)
    }
    expect(isCompleted(s)).toBe(true)
    s.pieces[3].rot = 1
    expect(isCompleted(s)).toBe(false)
  })
})

describe('kenar parçaları ve tepsi', () => {
  it('kenar parçaları doğru tespit edilir', () => {
    const s = makeState()
    const { rows, cols } = s.cut
    for (const p of s.pieces) {
      const beklenen = p.row === 0 || p.col === 0 || p.row === rows - 1 || p.col === cols - 1
      expect(isEdgePiece(s, p)).toBe(beklenen)
    }
    // ortadaki bir parça kenar olmamalı (grid en az 3x3 ise)
    if (rows > 2 && cols > 2) {
      expect(isEdgePiece(s, s.pieces[cols + 1])).toBe(false)
    }
  })

  it('tepsiye dizince yerleşmemiş parçalar çerçevenin iki yanına gider', () => {
    const s = makeState()
    const W = s.cut.cols * s.cut.cellW
    arrangeTray(s)
    // her parça ya solda ya sağda; çerçevenin üzerine binmemeli
    for (const p of s.pieces) {
      const sagKenar = p.x + s.cut.cellW
      expect(sagKenar < 0 || p.x > W).toBe(true)
    }
    // iki taraf da kullanılmalı, hepsi tek yana yığılmamalı
    expect(s.pieces.some((p) => p.x < 0)).toBe(true)
    expect(s.pieces.some((p) => p.x > W)).toBe(true)
  })

  it('tepsiye dizilen parçalar çerçeve yüksekliğini aşmaz', () => {
    const s = makeState()
    const H = s.cut.rows * s.cut.cellH
    arrangeTray(s)
    // dikeyde çerçeveyle aynı hizada kalsınlar ki ekranı kaydırmak gerekmesin
    for (const p of s.pieces) {
      expect(p.y).toBeGreaterThanOrEqual(-s.cut.cellH)
      expect(p.y).toBeLessThan(H + s.cut.cellH)
    }
  })

  it('tepsiye dizmek yerleşmiş parçaları bozmaz', () => {
    const s = makeState()
    const p = s.pieces[0]
    const cp = correctPos(s.cut, p)
    moveGroup(s, p.group, cp.x - p.x, cp.y - p.y)
    dropGroup(s, p.group)
    arrangeTray(s)
    expect(p.x).toBeCloseTo(cp.x)
    expect(p.y).toBeCloseTo(cp.y)
  })

  it('karıştırınca parçalar yer değiştirir, yerleşmişler korunur', () => {
    const s = makeState()
    const sabit = s.pieces[0]
    const cp = correctPos(s.cut, sabit)
    moveGroup(s, sabit.group, cp.x - sabit.x, cp.y - sabit.y)
    dropGroup(s, sabit.group)

    const oncekiler = s.pieces.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)
    shufflePieces(s, 1234)
    const sonrakiler = s.pieces.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)

    // yerleşmiş parça yerinde kaldı
    expect(sabit.x).toBeCloseTo(cp.x)
    expect(sabit.y).toBeCloseTo(cp.y)
    // diğerlerinin çoğu yer değiştirdi
    const degisen = oncekiler.filter((v, i) => v !== sonrakiler[i]).length
    expect(degisen).toBeGreaterThan(s.pieces.length / 2)
  })

  it('aynı seed aynı karışımı verir (ağ senkronu)', () => {
    const a = makeState()
    const b = makeState()
    shufflePieces(a, 777)
    shufflePieces(b, 777)
    expect(a.pieces.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual(
      b.pieces.map((p) => [Math.round(p.x), Math.round(p.y)]),
    )
  })

  it('tepsiye dizmek birleşmiş grubu dağıtmaz', () => {
    const s = makeState()
    const a = s.pieces[0]
    const b = s.pieces[1]
    moveGroup(s, a.group, 900 - a.x, 900 - a.y)
    moveGroup(s, b.group, a.x + s.cut.cellW - b.x, a.y - b.y)
    dropGroup(s, b.group)
    expect(a.group).toBe(b.group)
    arrangeTray(s)
    expect(a.group).toBe(b.group)
    expect(b.x - a.x).toBeCloseTo(s.cut.cellW)
    expect(b.y - a.y).toBeCloseTo(0)
  })
})

describe('kayıttan tamamlanmışlık çıkarma', () => {
  function bitmisState() {
    const s = makeState()
    for (const p of s.pieces) {
      const cp = correctPos(s.cut, p)
      moveGroup(s, p.group, cp.x - p.x, cp.y - p.y)
      dropGroup(s, p.group)
    }
    return s
  }

  it('tamamlanmış puzzle bitmiş olarak tanınır', () => {
    const s = bitmisState()
    expect(isCompleted(s)).toBe(true)
    expect(snapshotTamamlanmis(snapshot(s))).toBe(true)
  })

  it('yarım kalmış puzzle bitmiş sayılmaz', () => {
    const s = makeState()
    const p = s.pieces[0]
    const cp = correctPos(s.cut, p)
    moveGroup(s, p.group, cp.x - p.x, cp.y - p.y)
    dropGroup(s, p.group)
    expect(snapshotTamamlanmis(snapshot(s))).toBe(false)
  })

  it('tüm parçalar birleşmiş ama çerçeveye oturmamışsa bitmiş sayılmaz', () => {
    const s = bitmisState()
    // hepsini birlikte kaydır: dizilim doğru ama yerinde değil
    moveGroup(s, s.pieces[0].group, 500, 500)
    expect(snapshotTamamlanmis(snapshot(s))).toBe(false)
  })

  it('bir parça çevriliyse bitmiş sayılmaz', () => {
    const s = bitmisState()
    const snap = snapshot(s)
    snap.positions[2].rot = 1
    expect(snapshotTamamlanmis(snap)).toBe(false)
  })

  it('boş veya eksik kayıt bitmiş sayılmaz', () => {
    expect(snapshotTamamlanmis(null)).toBe(false)
    expect(snapshotTamamlanmis(undefined)).toBe(false)
    expect(snapshotTamamlanmis({ positions: [] })).toBe(false)
  })

  it('eski kayıtlarda rot alanı yoksa da çalışır', () => {
    const s = bitmisState()
    const snap = snapshot(s)
    // eski sürüm rot yazmıyordu
    snap.positions.forEach((p) => delete p.rot)
    expect(snapshotTamamlanmis(snap)).toBe(true)
  })
})

describe('snapshot/restore', () => {
  it('kaydedilen durum geri yüklenir', () => {
    const s = makeState()
    const a = s.pieces[0]
    const b = s.pieces[1]
    moveGroup(s, a.group, 500 - a.x, 500 - a.y)
    moveGroup(s, b.group, a.x + s.cut.cellW - b.x, a.y - b.y)
    dropGroup(s, b.group)
    const snap = snapshot(s)

    const s2 = makeState()
    restore(s2, snap)
    expect(s2.pieces.map((p) => [p.x, p.y, p.group])).toEqual(
      s.pieces.map((p) => [p.x, p.y, p.group]),
    )
    expect(s2.groups.get(s2.pieces[0].group)!.length).toBe(2)
  })
})
