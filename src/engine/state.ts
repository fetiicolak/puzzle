// Oyun durumu: parça konumları, gruplar, snap ve birleştirme mantığı.
// Bu mantık deterministiktir — multiplayer'da her iki taraf aynı drop
// mesajından aynı sonucu üretir.

import { mulberry32, type CutSpec } from './cutter'

export interface PieceState {
  id: number
  row: number
  col: number
  /** Dünya koordinatında parçanın hücre sol-üst köşesi */
  x: number
  y: number
  group: number
}

export interface GameState {
  cut: CutSpec
  pieces: PieceState[]
  /** groupId → pieceId listesi */
  groups: Map<number, number[]>
  /** Çizim sırası: gruplar alttan üste */
  zOrder: number[]
}

export function pieceId(cut: CutSpec, row: number, col: number): number {
  return row * cut.cols + col
}

/** Doğru (çözülmüş) konum — çerçevenin sol üstü dünya (0,0) kabul edilir */
export function correctPos(cut: CutSpec, p: { row: number; col: number }) {
  return { x: p.col * cut.cellW, y: p.row * cut.cellH }
}

/**
 * Başlangıç durumu: parçalar çerçevenin etrafına seed'e göre deterministik dağıtılır.
 * Her iki oyuncu aynı seed'i kullanır → aynı dağılım.
 */
export function createGameState(cut: CutSpec, scatterSeed: number): GameState {
  const rng = mulberry32(scatterSeed)
  const W = cut.cols * cut.cellW
  const H = cut.rows * cut.cellH
  const margin = Math.max(cut.cellW, cut.cellH) * 1.2
  const pieces: PieceState[] = []
  const groups = new Map<number, number[]>()
  const zOrder: number[] = []

  for (let r = 0; r < cut.rows; r++) {
    for (let c = 0; c < cut.cols; c++) {
      const id = r * cut.cols + c
      // çerçevenin çevresindeki halka içinde rastgele konum
      const side = Math.floor(rng() * 4)
      let x: number
      let y: number
      if (side === 0) {
        x = rng() * W
        y = -margin - rng() * margin
      } else if (side === 1) {
        x = rng() * W
        y = H + margin * 0.2 + rng() * margin
      } else if (side === 2) {
        x = -margin - rng() * margin * 0.6
        y = rng() * H
      } else {
        x = W + margin * 0.2 + rng() * margin * 0.6
        y = rng() * H
      }
      pieces.push({ id, row: r, col: c, x, y, group: id })
      groups.set(id, [id])
      zOrder.push(id)
    }
  }
  return { cut, pieces, groups, zOrder }
}

/** Grubu z-sıralamasında en üste getir */
export function bringToTop(state: GameState, groupId: number): void {
  const i = state.zOrder.indexOf(groupId)
  if (i >= 0) state.zOrder.splice(i, 1)
  state.zOrder.push(groupId)
}

/** Grubu delta kadar taşı */
export function moveGroup(state: GameState, groupId: number, dx: number, dy: number): void {
  const ids = state.groups.get(groupId)
  if (!ids) return
  for (const id of ids) {
    const p = state.pieces[id]
    p.x += dx
    p.y += dy
  }
}

/** Grubu, içindeki bir parçanın mutlak konumuna göre hizala (ağ senkronu için) */
export function setGroupPos(
  state: GameState,
  groupId: number,
  anchorId: number,
  x: number,
  y: number,
): void {
  const anchor = state.pieces[anchorId]
  moveGroup(state, groupId, x - anchor.x, y - anchor.y)
}

function snapTolerance(cut: CutSpec): number {
  return Math.min(cut.cellW, cut.cellH) * 0.25
}

/** İki grubu birleştir: b, a'nın içine katılır ve a'nın hizasına çekilir */
function mergeInto(state: GameState, a: number, b: number): void {
  if (a === b) return
  const aIds = state.groups.get(a)!
  const bIds = state.groups.get(b)!
  // a grubunun delta'sı (gerçek konum - doğru konum)
  const ref = state.pieces[aIds[0]]
  const refCorrect = correctPos(state.cut, ref)
  const dx = ref.x - refCorrect.x
  const dy = ref.y - refCorrect.y
  for (const id of bIds) {
    const p = state.pieces[id]
    const cp = correctPos(state.cut, p)
    p.x = cp.x + dx
    p.y = cp.y + dy
    p.group = a
    aIds.push(id)
  }
  state.groups.delete(b)
  const zi = state.zOrder.indexOf(b)
  if (zi >= 0) state.zOrder.splice(zi, 1)
}

export interface DropResult {
  /** Drop sonrası grubun (birleşmeler dahil) son groupId'si */
  groupId: number
  /** Çerçeveye oturdu mu (mutlak snap) */
  snappedToFrame: boolean
  /** Birleşen grup sayısı */
  merges: number
  /** Puzzle tamamlandı mı */
  completed: boolean
}

/**
 * Grup bırakıldığında: önce çerçeveye mutlak snap dene, sonra komşu
 * gruplarla birleşmeyi dene. Deterministik — her iki uçta aynı sonucu verir.
 */
export function dropGroup(state: GameState, groupId: number): DropResult {
  const { cut } = state
  const tol = snapTolerance(cut)
  let ids = state.groups.get(groupId)
  if (!ids) return { groupId, snappedToFrame: false, merges: 0, completed: isCompleted(state) }

  // 1) çerçeveye mutlak snap
  let snappedToFrame = false
  {
    const p = state.pieces[ids[0]]
    const cp = correctPos(cut, p)
    const dx = p.x - cp.x
    const dy = p.y - cp.y
    if (Math.hypot(dx, dy) < tol) {
      moveGroup(state, groupId, -dx, -dy)
      snappedToFrame = true
    }
  }

  // 2) komşu birleştirme — birleşme zinciri için tekrar tara
  let merges = 0
  let merged = true
  while (merged) {
    merged = false
    ids = state.groups.get(groupId)!
    for (const id of ids) {
      const p = state.pieces[id]
      const neighbors = [
        { r: p.row - 1, c: p.col },
        { r: p.row + 1, c: p.col },
        { r: p.row, c: p.col - 1 },
        { r: p.row, c: p.col + 1 },
      ]
      for (const n of neighbors) {
        if (n.r < 0 || n.r >= cut.rows || n.c < 0 || n.c >= cut.cols) continue
        const q = state.pieces[n.r * cut.cols + n.c]
        if (q.group === groupId) continue
        // beklenen göreli vektör (doğru dizilimde)
        const ex = (n.c - p.col) * cut.cellW
        const ey = (n.r - p.row) * cut.cellH
        const ax = q.x - p.x
        const ay = q.y - p.y
        if (Math.hypot(ax - ex, ay - ey) < tol) {
          // hedef grubun hizasına katıl: q'nun grubu kalır, bizimki ona uyar
          const target = q.group
          mergeInto(state, target, groupId)
          groupId = target
          merges++
          merged = true
          break
        }
      }
      if (merged) break
    }
  }

  if (snappedToFrame || merges > 0) {
    // çerçeveye oturan/birleşen grup zorlukla üstte durmasın
    const zi = state.zOrder.indexOf(groupId)
    if (zi >= 0 && isGroupPlaced(state, groupId)) {
      state.zOrder.splice(zi, 1)
      state.zOrder.unshift(groupId)
    }
  }

  return { groupId, snappedToFrame, merges, completed: isCompleted(state) }
}

/** Bir sonraki kullanılmamış grup kimliği */
export function nextFreeGroupId(state: GameState): number {
  let id = state.pieces.length
  while (state.groups.has(id)) id++
  return id
}

/**
 * Parçayı içinde bulunduğu gruptan koparır (sağ tık / uzun basma).
 * Tek parçalık gruplarda bir şey yapmaz. Ağ senkronu için yeni grup kimliği
 * ve hedef konum dışarıdan verilir, böylece iki uç aynı sonuca ulaşır.
 */
export function splitPiece(
  state: GameState,
  pieceId: number,
  newGroupId: number,
  x: number,
  y: number,
): boolean {
  const p = state.pieces[pieceId]
  if (!p) return false
  const ids = state.groups.get(p.group)
  if (!ids || ids.length < 2) return false

  const i = ids.indexOf(pieceId)
  if (i < 0) return false
  ids.splice(i, 1)

  p.group = newGroupId
  p.x = x
  p.y = y
  state.groups.set(newGroupId, [pieceId])
  state.zOrder.push(newGroupId)
  return true
}

/** Parça birleşmiş bir grubun parçası mı (ayrılabilir mi) */
export function canSplit(state: GameState, pieceId: number): boolean {
  const p = state.pieces[pieceId]
  if (!p) return false
  const ids = state.groups.get(p.group)
  return !!ids && ids.length > 1
}

export function isGroupPlaced(state: GameState, groupId: number): boolean {
  const ids = state.groups.get(groupId)
  if (!ids) return false
  const p = state.pieces[ids[0]]
  const cp = correctPos(state.cut, p)
  return Math.hypot(p.x - cp.x, p.y - cp.y) < 0.5
}

export function isCompleted(state: GameState): boolean {
  return state.pieces.every((p) => {
    const cp = correctPos(state.cut, p)
    return Math.hypot(p.x - cp.x, p.y - cp.y) < 0.5
  })
}

/** Doğru yerine oturmuş parça oranı (ilerleme göstergesi) */
export function progress(state: GameState): number {
  let placed = 0
  for (const p of state.pieces) {
    const cp = correctPos(state.cut, p)
    if (Math.hypot(p.x - cp.x, p.y - cp.y) < 0.5) placed++
  }
  return placed / state.pieces.length
}

/** Kayıt/yükleme için düz snapshot */
export interface StateSnapshot {
  positions: { x: number; y: number; group: number }[]
}

export function snapshot(state: GameState): StateSnapshot {
  return {
    positions: state.pieces.map((p) => ({ x: p.x, y: p.y, group: p.group })),
  }
}

export function restore(state: GameState, snap: StateSnapshot): void {
  if (snap.positions.length !== state.pieces.length) return
  state.groups.clear()
  state.zOrder.length = 0
  const seen = new Set<number>()
  snap.positions.forEach((pos, i) => {
    const p = state.pieces[i]
    p.x = pos.x
    p.y = pos.y
    p.group = pos.group
    let ids = state.groups.get(pos.group)
    if (!ids) {
      ids = []
      state.groups.set(pos.group, ids)
    }
    ids.push(i)
    if (!seen.has(pos.group)) {
      seen.add(pos.group)
      state.zOrder.push(pos.group)
    }
  })
  // yerleşmiş gruplar en alta
  state.zOrder.sort((a, b) => Number(isGroupPlaced(state, b)) - Number(isGroupPlaced(state, a)))
}
