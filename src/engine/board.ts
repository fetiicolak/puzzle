// Canvas tahtası: render, pan/zoom, pointer etkileşimi.
// React'ten bağımsız; GameState'i çizer ve kullanıcı eylemlerini callback'lerle bildirir.

import { pieceMargin, piecePath, type PieceBitmap } from './cutter'
import {
  bringToTop,
  isEdgePiece,
  isGroupPlaced,
  moveGroup,
  rotateVec,
  type GameState,
} from './state'

export interface BoardCallbacks {
  /** Kullanıcı bir grubu tutmak istedi. false dönerse (örn. partner kilitlemiş) engellenir. */
  onGrab?: (groupId: number) => boolean
  /** Sürükleme sırasında (throttle edilmez — çağıran throttle'lar) */
  onMove?: (groupId: number, anchorId: number, x: number, y: number) => void
  /** Grup bırakıldı */
  onDrop?: (groupId: number) => void
  /** İmleç dünya koordinatında hareket etti */
  onCursor?: (x: number, y: number) => void
  /** Parçayı grubundan koparma isteği (sağ tık / uzun basma) */
  onSplit?: (pieceId: number) => void
  /** Grubu çeyrek tur döndürme isteği (döndürmeli modda çift tık) */
  onRotate?: (groupId: number) => void
}

export interface RemoteCursor {
  x: number
  y: number
  /** Son hareket zamanı */
  at: number
  /** Katılımcının görünen adı (imlecin yanında yazar) */
  ad?: string
}

/** Katılımcı kimliğinden sabit bir renk üret (herkeste aynı renk görünür) */
export function peerColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  const renkler = ['#e85d75', '#f2c94c', '#6fcf97', '#56ccf2', '#bb6bd9', '#f2994a', '#5e9cea']
  return renkler[h % renkler.length]
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

  /** Diğer katılımcıların imleçleri: kimlik -> konum */
  remoteCursors = new Map<string, RemoteCursor>()
  /** Başkasının tuttuğu gruplar: grup -> katılımcı kimliği */
  lockedGroups = new Map<number, string>()
  /** Önizleme (hayalet görsel) açık mı */
  showGhost = true
  /** Yalnızca kenar parçalarını öne çıkar */
  edgeOnly = false

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
    this.cancelLongPress()
    for (const fn of this.detachFns) fn()
  }

  invalidate(): void {
    this.dirty = true
  }

  /**
   * Görünümü çerçeveyi VE parçaların bulunduğu her yeri kapsayacak şekilde ayarla.
   * Sabit bir pay yerine gerçek konumlardan sınırlayıcı kutu hesaplanır; aksi halde
   * uzağa sürüklenmiş parçalar "sığdır" sonrası ekran dışında kalıyordu.
   */
  fitView(): void {
    const rect = this.canvas.getBoundingClientRect()
    // canvas henüz yerleşmediyse (genişlik 0) bir sonraki karede tekrar dene
    if (rect.width < 1 || rect.height < 1) {
      requestAnimationFrame(() => this.fitView())
      return
    }
    const { cut } = this.state
    let minX = 0
    let minY = 0
    let maxX = cut.cols * cut.cellW
    let maxY = cut.rows * cut.cellH
    for (const p of this.state.pieces) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x + cut.cellW > maxX) maxX = p.x + cut.cellW
      if (p.y + cut.cellH > maxY) maxY = p.y + cut.cellH
    }
    // tab çıkıntıları hücre sınırının dışına taşar
    const tab = pieceMargin(cut)
    minX -= tab
    minY -= tab
    maxX += tab
    maxY += tab

    const pad = 16 // ekran pikselinde kenar boşluğu
    const scaleX = (rect.width - pad * 2) / (maxX - minX)
    const scaleY = (rect.height - pad * 2) / (maxY - minY)
    this.scale = Math.max(0.02, Math.min(scaleX, scaleY))
    this.tx = rect.width / 2 - ((minX + maxX) / 2) * this.scale
    this.ty = rect.height / 2 - ((minY + maxY) / 2) * this.scale
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
    on('contextmenu', (e) => {
      e.preventDefault()
      const [sx, sy] = this.local(e as unknown as PointerEvent)
      const hit = this.hitTest(...this.screenToWorld(sx, sy))
      if (hit !== null) this.requestSplit(hit)
    })
    // döndürmeli modda çift tık grubu çeyrek tur çevirir
    on('dblclick', (e) => {
      if (!this.state.rotation) return
      const [sx, sy] = this.local(e as unknown as PointerEvent)
      const hit = this.hitTest(...this.screenToWorld(sx, sy))
      if (hit === null) return
      const g = this.state.pieces[hit].group
      if (this.lockedGroups.has(g)) return
      this.callbacks.onRotate?.(g)
    })

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
      // dokunmatikte sağ tık yok: yerinde uzun basma parçayı koparır
      if (e.pointerType === 'touch') this.startLongPress(hit, sx, sy)
    } else {
      this.panning = true
    }
  }

  // ---- uzun basma (mobilde parça ayırma) ----

  private longPressTimer: ReturnType<typeof setTimeout> | null = null
  private longPressOrigin: [number, number] = [0, 0]

  private startLongPress(pieceId: number, sx: number, sy: number): void {
    this.cancelLongPress()
    this.longPressOrigin = [sx, sy]
    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null
      // basılı tutarken sürüklenmediyse ayır
      if (this.dragGroup !== null) {
        this.endDrag()
        this.requestSplit(pieceId)
      }
    }, 550)
  }

  private cancelLongPress(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer)
      this.longPressTimer = null
    }
  }

  private requestSplit(pieceId: number): void {
    const groupId = this.state.pieces[pieceId]?.group
    if (groupId === undefined || this.lockedGroups.has(groupId)) return
    this.callbacks.onSplit?.(pieceId)
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
      // parmak kaydıysa bu bir sürükleme, uzun basma değil
      if (
        this.longPressTimer &&
        Math.hypot(sx - this.longPressOrigin[0], sy - this.longPressOrigin[1]) > 8
      ) {
        this.cancelLongPress()
      }
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
    this.cancelLongPress()
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
        const { cellW, cellH } = state.cut
        // Dünya noktasını parçanın yerel (kesim) koordinatına çevir.
        // Parça döndürülmüşse, önce kendi merkezi etrafında ters yönde döndür.
        let dx = wx - (p.x + cellW / 2)
        let dy = wy - (p.y + cellH / 2)
        if (p.rot) {
          const r = rotateVec(dx, dy, -p.rot)
          dx = r.x
          dy = r.y
        }
        const bx = p.col * cellW
        const by = p.row * cellH
        const lx = bx + cellW / 2 + dx
        const ly = by + cellH / 2 + dy
        if (
          lx < bx - margin || lx > bx + cellW + margin ||
          ly < by - margin || ly > by + cellH + margin
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
    ctx.fillStyle = '#1a1426'
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

    // tepsi bölgeleri: çerçevenin iki yanı
    {
      const pay = Math.max(cut.cellW, cut.cellH) * 0.35
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'
      ctx.setLineDash([12 / this.scale, 10 / this.scale])
      ctx.lineWidth = 1.5 / this.scale
      ctx.beginPath()
      ctx.moveTo(-pay, -pay)
      ctx.lineTo(-pay, H + pay)
      ctx.moveTo(W + pay, -pay)
      ctx.lineTo(W + pay, H + pay)
      ctx.stroke()
      ctx.setLineDash([])
    }

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
      // parçayı tutan kişinin rengiyle çevrele
      const sahip = this.lockedGroups.get(gid)
      for (const id of ids) {
        const p = state.pieces[id]
        const bm = this.bitmaps[p.row][p.col]
        // kenar filtresi açıkken iç parçalar soluklaşır
        const solgun = this.edgeOnly && !isEdgePiece(state, p) && !isGroupPlaced(state, gid)
        ctx.save()
        if (solgun) ctx.globalAlpha = 0.16
        if (sahip) {
          ctx.shadowColor = peerColor(sahip)
          ctx.shadowBlur = 12 / this.scale
        }
        if (p.rot) {
          // parça kendi merkezi etrafında döner
          const cx = p.x + cut.cellW / 2
          const cy = p.y + cut.cellH / 2
          ctx.translate(cx, cy)
          ctx.rotate((p.rot * Math.PI) / 2)
          ctx.translate(-cx, -cy)
        }
        ctx.drawImage(bm.canvas, p.x + bm.offsetX, p.y + bm.offsetY)
        ctx.restore()
      }
    }

    // Diğer katılımcıların imleçleri. Bağlantı sürdüğü sürece görünür
    // kalırlar: parça tutulmasa, hatta bir süre kıpırdanmasa bile karşı
    // tarafın nereye baktığını görmek işe yarıyor.
    for (const [id, cur] of this.remoteCursors) {
      const { x, y } = cur
      const s = 11 / this.scale
      const renk = peerColor(id)
      ctx.save()
      // ok
      ctx.fillStyle = renk
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + s * 0.9, y + s * 1.3)
      ctx.lineTo(x + s * 0.35, y + s * 1.25)
      ctx.lineTo(x + s * 0.55, y + s * 1.9)
      ctx.lineTo(x + s * 0.3, y + s * 2)
      ctx.lineTo(x + s * 0.1, y + s * 1.35)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 1.4 / this.scale
      ctx.stroke()

      // ad etiketi — kimin imleci olduğu belli olsun
      if (cur.ad) {
        const yazi = cur.ad.slice(0, 14)
        ctx.font = `${12 / this.scale}px ui-sans-serif, system-ui, sans-serif`
        const w = ctx.measureText(yazi).width
        const px = x + s * 1.1
        const py = y + s * 2.1
        const yuk = 17 / this.scale
        ctx.fillStyle = renk
        ctx.beginPath()
        ctx.roundRect(px, py, w + 10 / this.scale, yuk, 6 / this.scale)
        ctx.fill()
        ctx.fillStyle = '#1a1020'
        ctx.textBaseline = 'middle'
        ctx.fillText(yazi, px + 5 / this.scale, py + yuk / 2)
      }
      ctx.restore()
    }

    ctx.restore()
  }
}
