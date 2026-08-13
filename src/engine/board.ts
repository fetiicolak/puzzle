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
  type PieceState,
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

/** Ekranda görünen dünya dikdörtgeni (kırpma için) */
interface GorunurAlan {
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * Cihazın zayıf olduğuna dair işaretler.
 *
 * Kesin bir ölçü yok; tarayıcının verdiği iki ipucuna bakıyoruz. `deviceMemory`
 * yalnızca Chrome ailesinde var ve 0.25/0.5/1/2/4/8 diye yuvarlanıyor — orta
 * segment telefonlar 4 diyor. Bilinmiyorsa güçlü varsayılır: yanlış tarafa
 * düşersek görüntü kalitesini boş yere düşürmüş oluruz.
 */
function zayifCihazMi(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number }
  return (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4
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
  /** Bu karede ekrana bir şey basılmalı */
  private dirty = true

  // ---- katmanlı çizim ----
  //
  // Hareket etmeyen her şey (zemin, ızgara, duran parçalar) ayrı bir tuvale
  // bir kez çizilip kare kare oradan kopyalanıyor. Yalnızca sürüklenen /
  // karşı tarafın tuttuğu gruplar ile imleçler her karede yeniden çiziliyor.
  //
  // Sebep: imleç mesajı saniyede ~9-16, hareket mesajı ~20 kez geliyordu ve
  // her biri 300 parçanın tamamını yeniden çizdiriyordu. Zayıf cihazda oyun
  // bu yüzden takılıyordu.

  /** Hareket etmeyen her şeyin durduğu tuval */
  private katman: HTMLCanvasElement
  private kctx: CanvasRenderingContext2D
  /** Statik katman eskidi, yeniden çizilmeli */
  private statikKirli = true
  /** Cihaz sinyallerine göre kısılmış piksel oranı */
  private dpr = 1
  private zayif = false
  /** Pahalı efektler (bulanık gölge) kapalı */
  private hafifMod = false

  /** Diğer katılımcıların imleçleri: kimlik -> konum */
  remoteCursors = new Map<string, RemoteCursor>()
  /**
   * Başkasının tuttuğu gruplar: grup -> katılımcı kimliği.
   *
   * **Dışarıdan doğrudan değiştirme** — `kilitle()` / `kilidiAc()` kullan.
   * Kilitli gruplar statik katmandan çıkarılıp üst katmana taşındığı için,
   * haritayı sessizce değiştirmek parçanın iki katmanda birden (eski ve yeni
   * konumunda) görünmesine yol açar. Toplu temizlik yapıyorsan sonunda
   * `invalidate()` çağır.
   */
  lockedGroups = new Map<number, string>()
  /** Önizleme (hayalet görsel) açık mı */
  showGhost = true
  /** Yalnızca kenar parçalarını öne çıkar */
  edgeOnly = false

  private detachFns: (() => void)[] = []

  /*
    Tanılama sayaçları.

    Zayıf cihazdaki takılma aylarca ölçülemedi: `__puzzle` yalnızca dev
    derlemesinde tanımlı, Android Chrome'da konsol yok ve asıl sorun tam da
    canlıdaki gerçek telefonda yaşanıyor. Sayaç burada tutulup `tani()` ile
    dışarı veriliyor; masrafı kare başına iki `performance.now()` çağrısı.
  */
  private kareSuresi = 0
  private kareSayisi = 0
  private sonOlcum = 0

  /** Cihazda gerçekten ne olduğunu okumak için — tanılama katmanı kullanıyor */
  tani(): {
    dpr: number
    zayif: boolean
    hafifMod: boolean
    parca: number
    ortRender: number
    fps: number
  } {
    const simdi = performance.now()
    const gecen = this.sonOlcum ? simdi - this.sonOlcum : 0
    const ort = this.kareSayisi > 0 ? this.kareSuresi / this.kareSayisi : 0
    const fps = gecen > 0 ? (this.kareSayisi * 1000) / gecen : 0
    // okunduktan sonra sıfırla: gösterilen değer hep son aralığa ait olsun,
    // yoksa oyunun başındaki ağır kareler ortalamayı sonsuza kadar bozuyor
    this.kareSuresi = 0
    this.kareSayisi = 0
    this.sonOlcum = simdi
    return {
      dpr: this.dpr,
      zayif: this.zayif,
      hafifMod: this.hafifMod,
      parca: this.state.pieces.length,
      ortRender: ort,
      fps,
    }
  }

  constructor(
    canvas: HTMLCanvasElement,
    state: GameState,
    bitmaps: PieceBitmap[][],
    callbacks: BoardCallbacks = {},
  ) {
    this.canvas = canvas
    // alpha: false — tuvalin tamamı her karede zeminle doluyor. Saydamlık
    // olmadığını söylemek tarayıcıyı sayfa ile harmanlama işinden kurtarıyor.
    this.ctx = canvas.getContext('2d', { alpha: false })!
    this.state = state
    this.bitmaps = bitmaps
    this.callbacks = callbacks
    this.zayif = zayifCihazMi()
    // Çok parçalı puzzle güçlü cihazı da zorluyor; efektler orada da kısılır
    // ama görüntü keskinliği (dpr) yalnızca cihaz zayıfsa düşürülür.
    this.hafifMod = this.zayif || state.pieces.length >= 200
    this.katman = document.createElement('canvas')
    this.kctx = this.katman.getContext('2d', { alpha: false })!
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

  /** Her şey değişti: statik katman da yeniden çizilecek */
  invalidate(): void {
    this.statikKirli = true
    this.dirty = true
  }

  /** Yalnızca imleçler değişti — parçalara dokunulmadı, statik katman durur */
  imlecDegisti(): void {
    this.dirty = true
  }

  /** Hâlihazırda hareket eden bir grubun konumu değişti — statik katman durur */
  grupTasindi(): void {
    this.dirty = true
  }

  /** Bir grubu karşı taraf tuttu: statik katmandan çıkar, üste al */
  kilitle(grup: number, kim: string): void {
    if (this.lockedGroups.get(grup) !== kim) {
      this.lockedGroups.set(grup, kim)
      // Tutulan parça üstte görünsün; yerel tutuşta da böyle yapılıyor.
      bringToTop(this.state, grup)
      this.statikKirli = true
    }
    this.dirty = true
  }

  /** Karşı taraf grubu bıraktı: statik katmana geri döner */
  kilidiAc(grup: number): void {
    if (this.lockedGroups.delete(grup)) this.statikKirli = true
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
    this.invalidate()
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

  /**
   * Tuval çözünürlüğünü ekrana göre ayarla.
   *
   * Piksel oranına tavan konuyor: 3x bir telefonda tam çözünürlük, kapatılan
   * her karede iki katından fazla piksel demek. 2 (zayıf cihazda 1.5) ile
   * fotoğraf gözle ayırt edilecek kadar bozulmuyor, iş yükü yarıya iniyor.
   */
  private resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    this.dpr = Math.min(window.devicePixelRatio || 1, this.zayif ? 1.5 : 2)
    const w = Math.max(1, Math.round(rect.width * this.dpr))
    const h = Math.max(1, Math.round(rect.height * this.dpr))
    this.canvas.width = w
    this.canvas.height = h
    this.katman.width = w
    this.katman.height = h
    this.invalidate()
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
      // grup statik katmandan çıkıp üst katmana geçiyor
      this.invalidate()
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
      this.grupTasindi()
    } else if (this.panning) {
      this.tx += dx
      this.ty += dy
      // görünüm kaydı: statik katman da yeniden çizilmeli
      this.invalidate()
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
      // grup üst katmandan statik katmana dönüyor
      this.invalidate()
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
    this.invalidate()
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

  /** Hâlen hareket eden gruplar: kendi sürüklediğimiz + karşı tarafın tuttukları */
  private hareketliGruplar(): Set<number> {
    const kume = new Set<number>(this.lockedGroups.keys())
    if (this.dragGroup !== null) kume.add(this.dragGroup)
    return kume
  }

  /**
   * Ekranın kapsadığı dünya dikdörtgeni.
   *
   * Pay, parçanın hücresinin dışına taşabileceği en büyük mesafe: tab çıkıntısı
   * artı, döndürülmüş parçanın merkezi etrafında süpürdüğü yarıçap. Cömert
   * tutuluyor — kenardaki bir parçanın yanlışlıkla elenmesi görünür bir hata,
   * fazladan birkaç parça çizmek değil.
   */
  private gorunurAlan(vw: number, vh: number): GorunurAlan {
    const { cut } = this.state
    const pay = pieceMargin(cut) + Math.max(cut.cellW, cut.cellH)
    return {
      x0: -this.tx / this.scale - pay,
      y0: -this.ty / this.scale - pay,
      x1: (vw - this.tx) / this.scale + pay,
      y1: (vh - this.ty) / this.scale + pay,
    }
  }

  /**
   * Tek bir parçayı çizer. Ekran dışındaysa hiç çizilmez — yakınlaşmışken
   * parçaların çoğu görünmüyor, hepsini çizmek boşa iş.
   */
  private parcaCiz(
    ctx: CanvasRenderingContext2D,
    p: PieceState,
    sahip: string | null,
    alan: GorunurAlan,
    grupYerinde: boolean,
  ): void {
    const { cut } = this.state
    if (
      p.x > alan.x1 || p.x + cut.cellW < alan.x0 ||
      p.y > alan.y1 || p.y + cut.cellH < alan.y0
    ) return

    const bm = this.bitmaps[p.row][p.col]
    // kenar filtresi açıkken iç parçalar soluklaşır
    const solgun = this.edgeOnly && !isEdgePiece(this.state, p) && !grupYerinde
    ctx.save()
    if (solgun) ctx.globalAlpha = 0.16
    if (sahip && !this.hafifMod) {
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
    if (sahip && this.hafifMod) {
      // Bulanık gölge her karede yeniden hesaplanıyor ve zayıf cihazda en
      // pahalı işlerden biri. Yerine parçanın kendi konturu sahibinin
      // rengiyle çiziliyor — aynı bilgi, tek geçiş.
      // Path'ler kesim koordinatında; parçanın bulunduğu yere kaydırılıyor.
      ctx.translate(p.x - p.col * cut.cellW, p.y - p.row * cut.cellH)
      ctx.strokeStyle = peerColor(sahip)
      ctx.lineWidth = 3 / this.scale
      ctx.stroke(this.paths[p.id])
    }
    ctx.restore()
  }

  /** Zemin, çerçeve, ızgara ve duran parçalar — yalnızca değiştiğinde çizilir */
  private statikCiz(hareketli: Set<number>): void {
    const ctx = this.kctx
    const { state } = this
    const vw = this.katman.width / this.dpr
    const vh = this.katman.height / this.dpr

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.save()
    ctx.scale(this.dpr, this.dpr)

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

    // duran parçalar (zOrder alttan üste)
    const alan = this.gorunurAlan(vw, vh)
    for (const gid of state.zOrder) {
      if (hareketli.has(gid)) continue
      const ids = state.groups.get(gid)
      if (!ids) continue
      // grup başına bir kez: parça sayısı arttıkça bu kontrol de birikiyordu
      const yerinde = this.edgeOnly && isGroupPlaced(state, gid)
      for (const id of ids) this.parcaCiz(ctx, state.pieces[id], null, alan, yerinde)
    }

    ctx.restore()
  }

  /**
   * Ekrana basılan kare: statik katmanı kopyala, üstüne hareket edenleri ve
   * imleçleri çiz.
   */
  private render(): void {
    const baslangic = performance.now()
    const { ctx, canvas, state } = this
    const hareketli = this.hareketliGruplar()
    if (this.statikKirli) {
      this.statikKirli = false
      this.statikCiz(hareketli)
    }

    const vw = canvas.width / this.dpr
    const vh = canvas.height / this.dpr
    // katman aygıt pikselinde ve tuvalle aynı boyutta: birebir kopyalanır
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(this.katman, 0, 0)

    ctx.save()
    ctx.scale(this.dpr, this.dpr)
    ctx.translate(this.tx, this.ty)
    ctx.scale(this.scale, this.scale)

    // hareket eden gruplar — her zaman duranların üstünde
    const alan = this.gorunurAlan(vw, vh)
    for (const gid of state.zOrder) {
      if (!hareketli.has(gid)) continue
      const ids = state.groups.get(gid)
      if (!ids) continue
      // parçayı tutan kişinin rengiyle çevrele (kendi tuttuğumuzda renk yok)
      const sahip = this.lockedGroups.get(gid) ?? null
      const yerinde = this.edgeOnly && isGroupPlaced(state, gid)
      for (const id of ids) this.parcaCiz(ctx, state.pieces[id], sahip, alan, yerinde)
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
    this.kareSuresi += performance.now() - baslangic
    this.kareSayisi++
  }
}
