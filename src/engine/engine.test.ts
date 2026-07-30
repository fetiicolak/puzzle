import { describe, expect, it } from 'vitest'
import { computeGrid, generateCut, mulberry32 } from './cutter'
import {
  canSplit,
  correctPos,
  createGameState,
  dropGroup,
  isCompleted,
  moveGroup,
  nextFreeGroupId,
  progress,
  restore,
  snapshot,
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
