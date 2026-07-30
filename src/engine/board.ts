// Canvas tahtası: render, pan/zoom, pointer etkileşimi.
// React'ten bağımsız; GameState'i çizer ve kullanıcı eylemlerini callback'lerle bildirir.

import { piecePath, type PieceBitmap } from './cutter'
import { bringToTop, moveGroup, type GameState } from './state'

export interface BoardCallbacks {
  /** Kullanıcı bir grubu tutmak istedi. false dönerse (örn. partner kilitlemiş) engellenir. */
  onGrab?: (groupId: number) => boolean
  /** Sürükleme sırasında (throttle edilmez — çağıran throttle'lar) */
  onMove?: (groupId: number, anchorId: number, x: number, y: number) => void
  /** Grup bırakıldı */
  onDrop?: (groupId: number) => void
  /** İmleç dünya koordinatında hareket etti */
  onCursor?: (x: number, y: number) => void
}

export interface RemoteCursor {
  x: number
  y: number
  visible: boolean
}

interface PointerInfo {
  id: number
  x: number
  y: number
}

export class PuzzleBoard {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private state: GameState
  private bitmaps: PieceBitmap[][]
  private paths: Path2D[] = []
  private callbacks: BoardCallbacks

  // viewport
  private scale = 1
  private tx = 0
  private ty = 0

  // etkileşim
  private pointers: PointerInfo[] = []
  private dragGroup: number | null = null
  private dragAnchor = 0
  private panning = false
  private lastPinchDist = 0
  private raf = 0
  private dirty = true

  /** Partnerin imleci (dünya koordinatı) */
  remoteCursor: RemoteCursor = { x: 0, y: 0, visible: false }
  /** Partnerin kilitlediği gruplar */
  lockedGroups = new Set<number>()
  /** Önizleme (hayalet görsel) açık mı */
  showGhost = true

  private detachFns: (() => void)[] = []

  constructor(
    canvas: HTMLCanvasElement,
    state: GameState,
    bitmaps: PieceBitmap[][],
    callbacks: BoardCallbacks = {},
  ) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.state = state
    this.bitmaps = bitmaps
    this.callbacks = callbacks
    for (const p of state.pieces) this.paths[p.id] = piecePath(state.cut, p.row, p.col)
    this.attach()
    this.fitView()
    this.loop()
  }

  destroy(): void {
    cancelAnimationFrame(this.raf)
    for (const fn of this.detachFns) fn()
  }

  invalidate(): void {
    this.dirty = true
  }

  /** Görünümü çerçeve + dağılmış parçaları kapsayacak şekilde ayarla */
  fitView(): void {
    const { cut } = this.state
    const W = cut.cols * cut.cellW
    const H = cut.rows * cut.cellH
    const pad = Math.max(cut.cellW, cut.cellH) * 2.6
    const rect = this.canvas.getBoundingClientRect()
    const sx = rect.width / (W + pad * 2)
    const sy = rect.height / (H + pad * 2)
    this.scale = Math.min(sx, sy)
    this.tx = rect.width / 2 - (W / 2) * this.scale
    this.ty = rect.height / 2 - (H / 2) * this.scale
    this.dirty = true
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.tx) / this.scale, (sy - this.ty) / this.scale]
  }

  // ---- etkileşim ----

  private attach(): void {
    const c = this.canvas
    const on = <K extends keyof HTMLElementEventMap>(
      ev: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      c.addEventListener(ev, fn as EventListener, opts)
      this.detachFns.push(() => c.removeEventListener(ev, fn as EventListener))
    }

    on('pointerdown', (e) => this.pointerDown(e))
    on('pointermove', (e) => this.pointerMove(e))
    on('pointerup', (e) => this.pointerUp(e))
    on('pointercancel', (e) => this.pointerUp(e))
    on('wheel', (e) => this.wheel(e), { passive: false })

    const ro = new ResizeObserver(() => {
      this.resize()
    })
    ro.observe(c)
    this.detachFns.push(() => ro.disconnect())
    this.resize()
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr))
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr))
    this.dirty = true
  }

  private local(e: PointerEvent | WheelEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top]
  }

  private pointerDown(e: PointerEvent): void {
    try {
      this.canvas.setPointerCapture(e.pointerId)
    } catch {
      // sentetik/sonlanmış pointer id'lerinde capture alınamayabilir — sürükleme yine çalışır
    }
    const [sx, sy] = this.local(e)
    this.pointers.push({ id: e.pointerId, x: sx, y: sy })

    if (this.pointers.length === 2) {
      // pinch başladı — sürüklemeyi bırak
      if (this.dragGroup !== null) this.endDrag()
      this.panning = false
      this.lastPinchDist = this.pinchDist()
      return
    }
    if (this.pointers.length > 2) return

    const [wx, wy] = this.screenToWorld(sx, sy)
    const hit = this.hitTest(wx, wy)
    if (hit !== null) {
      const groupId = this.state.pieces[hit].group
      if (this.lockedGroups.has(groupId)) return
      if (this.callbacks.onGrab && !this.callbacks.onGrab(groupId)) return
      this.dragGroup = groupId
      this.dragAnchor = hit
      bringToTop(this.state, groupId)
      this.dirty = true
    } else {
      this.panning = true
    }
  }

  private pointerMove(e: PointerEvent): void {
    const [sx, sy] = this.local(e)
    const p = this.pointers.find((p) => p.id === e.pointerId)
    const [wx, wy] = this.screenToWorld(sx, sy)
    this.callbacks.onCursor?.(wx, wy)
    if (!p) return
    const dx = sx - p.x
    const dy = sy - p.y
    p.x = sx
    p.y = sy

    if (this.pointers.length === 2) {
      // pinch zoom + iki parmak pan
      const dist = this.pinchDist()
      if (this.lastPinchDist > 0) {
        const cx = (this.pointers[0].x + this.pointers[1].x) / 2
        const cy = (this.pointers[0].y + this.pointers[1].y) / 2
        this.zoomAt(cx, cy, dist / this.lastPinchDist)
        this.tx += dx / 2
        this.ty += dy / 2
      }
      this.lastPinchDist = dist
      return
    }

    if (this.dragGroup !== null) {
      moveGroup(this.state, this.dragGroup, dx / this.scale, dy / this.scale)
      const anchor = this.state.pieces[this.dragAnchor]
      this.callbacks.onMove?.(this.dragGroup, this.dragAnchor, anchor.x, anchor.y)
      this.dirty = true
    } else if (this.panning) {
      this.tx += dx
      this.ty += dy
      this.dirty = true
    }
  }

  private pointerUp(e: PointerEvent): void {
    this.pointers = this.pointers.filter((p) => p.id !== e.pointerId)
    if (this.pointers.length < 2) this.lastPinchDist = 0
    if (this.dragGroup !== null && this.pointers.length === 0) this.endDrag()
    if (this.pointers.length === 0) this.panning = false
  }

  private endDrag(): void {
    const g = this.dragGroup
    this.dragGroup = null
    if (g !== null) {
      this.callbacks.onDrop?.(g)
      this.dirty = true
    }
  }

  private pinchDist(): number {
    const [a, b] = this.pointers
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault()
    const [sx, sy] = this.local(e)
    const factor = Math.exp(-e.deltaY * 0.0012)
    this.zoomAt(sx, sy, factor)
  }

  private zoomAt(sx: number, sy: number, factor: number): void {
    const newScale = Math.min(4, Math.max(0.05, this.scale * factor))
    const f = newScale / this.scale
    this.tx = sx - (sx - this.tx) * f
    this.ty = sy - (sy - this.ty) * f
    this.scale = newScale
    this.dirty = true
  }

  /** En üstteki parçayı bul (zOrder tersinden) */
  private hitTest(wx: number, wy: number): number | null {
    const { state } = this
    const margin = Math.max(state.cut.cellW, state.cut.cellH) * 0.35
    for (let zi = state.zOrder.length - 1; zi >= 0; zi--) {
      const ids = state.groups.get(state.zOrder[zi])
      if (!ids) continue
      for (const id of ids) {
        const p = state.pieces[id]
        // dünya → parça yerel (görsel koordinatı): path hücre mutlak konumunda tanımlı
        const lx = wx - p.x + p.col * state.cut.cellW
        const ly = wy - p.y + p.row * state.cut.cellH
        const bx = p.col * state.cut.cellW
        const by = p.row * state.cut.cellH
        if (
          lx < bx - margin || lx > bx + state.cut.cellW + margin ||
          ly < by - margin || ly > by + state.cut.cellH + margin
        ) continue
        if (this.ctx.isPointInPath(this.paths[id], lx, ly)) return id
      }
    }
    return null
  }

  // ---- render ----

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop)
    if (!this.dirty) return
    this.dirty = false
    this.render()
  }

  private render(): void {
    const { ctx, canvas, state } = this
    const dpr = window.devicePixelRatio || 1
    ctx.save()
    ctx.scale(dpr, dpr)
    const vw = canvas.width / dpr
    const vh = canvas.height / dpr

    // arka plan
    ctx.fillStyle = '#241b2e'
    ctx.fillRect(0, 0, vw, vh)

    ctx.translate(this.tx, this.ty)
    ctx.scale(this.scale, this.scale)

    const { cut } = state
    const W = cut.cols * cut.cellW
    const H = cut.rows * cut.cellH

    // çerçeve alanı
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 2 / this.scale
    ctx.strokeRect(0, 0, W, H)

    // hayalet önizleme (grid çizgileri)
    if (this.showGhost) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'
      ctx.lineWidth = 1 / this.scale
      for (let c = 1; c < cut.cols; c++) {
        ctx.beginPath()
        ctx.moveTo(c * cut.cellW, 0)
        ctx.lineTo(c * cut.cellW, H)
        ctx.stroke()
      }
      for (let r = 1; r < cut.rows; r++) {
        ctx.beginPath()
        ctx.moveTo(0, r * cut.cellH)
        ctx.lineTo(W, r * cut.cellH)
        ctx.stroke()
      }
    }

    // parçalar (zOrder alttan üste)
    for (const gid of state.zOrder) {
      const ids = state.groups.get(gid)
      if (!ids) continue
      const locked = this.lockedGroups.has(gid)
      for (const id of ids) {
        const p = state.pieces[id]
        const bm = this.bitmaps[p.row][p.col]
        if (locked) {
          ctx.save()
          ctx.shadowColor = '#e85d75'
          ctx.shadowBlur = 12 / this.scale
        }
        ctx.drawImage(bm.canvas, p.x + bm.offsetX, p.y + bm.offsetY)
        if (locked) ctx.restore()
      }
    }

    // partner imleci
    if (this.remoteCursor.visible) {
      const { x, y } = this.remoteCursor
      const s = 10 / this.scale
      ctx.fillStyle = '#e85d75'
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + s * 0.9, y + s * 1.3)
      ctx.lineTo(x + s * 0.35, y + s * 1.25)
      ctx.lineTo(x + s * 0.55, y + s * 1.9)
      ctx.lineTo(x + s * 0.3, y + s * 2)
      ctx.lineTo(x + s * 0.1, y + s * 1.35)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5 / this.scale
      ctx.stroke()
    }

    ctx.restore()
  }
}
