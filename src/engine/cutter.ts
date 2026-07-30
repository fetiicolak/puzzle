// Puzzle kesim motoru: seed tabanlı deterministik jigsaw kenar üretimi.
// Aynı seed + aynı görsel boyutu → her cihazda birebir aynı kesim (multiplayer şartı).

export interface GridSpec {
  rows: number
  cols: number
}

export interface EdgeSpec {
  /** Çıkıntı yönü: 1 = pozitif eksene doğru, -1 = negatif, 0 = düz (dış kenar) */
  sign: 1 | -1 | 0
  /** Tab şekli varyasyonu için küçük rastgele sapmalar */
  a: number
  b: number
  c: number
  d: number
}

export interface CutSpec {
  rows: number
  cols: number
  /** Kaynak görsel pikselinde hücre boyutu */
  cellW: number
  cellH: number
  /** Yatay kenar çizgileri: [rows+1][cols] — satır r'nin üst kenarı horizontal[r][c] */
  horizontal: EdgeSpec[][]
  /** Dikey kenar çizgileri: [rows][cols+1] — sütun c'nin sol kenarı vertical[r][c] */
  vertical: EdgeSpec[][]
}

/** Deterministik PRNG (mulberry32) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Hedef parça sayısına en yakın, hücreleri kareye yakın grid'i seç */
export function computeGrid(imgW: number, imgH: number, target: number): GridSpec {
  const aspect = imgW / imgH
  let best: GridSpec = { rows: 1, cols: 1 }
  let bestScore = Infinity
  for (let rows = 1; rows <= Math.ceil(Math.sqrt(target * 4)); rows++) {
    const cols = Math.max(1, Math.round(target / rows))
    const count = rows * cols
    const cellAspect = (imgW / cols) / (imgH / rows)
    // parça sayısı sapması + hücre kare olmaktan sapması
    const score =
      Math.abs(count - target) / target + Math.abs(Math.log(cellAspect)) * 0.7
    if (score < bestScore) {
      bestScore = score
      best = { rows, cols }
    }
  }
  void aspect
  return best
}

/** Seed'den tam kesim spesifikasyonu üret */
export function generateCut(
  imgW: number,
  imgH: number,
  target: number,
  seed: number,
): CutSpec {
  const { rows, cols } = computeGrid(imgW, imgH, target)
  const rng = mulberry32(seed)
  const jitter = () => (rng() - 0.5) * 0.12

  const makeEdge = (flat: boolean): EdgeSpec =>
    flat
      ? { sign: 0, a: 0, b: 0, c: 0, d: 0 }
      : {
          sign: rng() < 0.5 ? 1 : -1,
          a: jitter(),
          b: jitter(),
          c: jitter(),
          d: jitter(),
        }

  const horizontal: EdgeSpec[][] = []
  for (let r = 0; r <= rows; r++) {
    const line: EdgeSpec[] = []
    for (let c = 0; c < cols; c++) line.push(makeEdge(r === 0 || r === rows))
    horizontal.push(line)
  }
  const vertical: EdgeSpec[][] = []
  for (let r = 0; r < rows; r++) {
    const line: EdgeSpec[] = []
    for (let c = 0; c <= cols; c++) line.push(makeEdge(c === 0 || c === cols))
    vertical.push(line)
  }

  return { rows, cols, cellW: imgW / cols, cellH: imgH / rows, horizontal, vertical }
}

/** Tab yüksekliğinin kenar uzunluğuna oranı (draradech parametreleştirmesi) */
const T = 0.09

/**
 * Bir jigsaw kenarını path'e ekler. (x0,y0)→(x1,y1) eksene paralel olmalı.
 * perp: çıkıntının +1 sign için işaret edeceği birim dik vektör.
 */
function addEdge(
  path: Path2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  edge: EdgeSpec,
  reverse: boolean,
): void {
  if (edge.sign === 0) {
    path.lineTo(x1, y1)
    return
  }
  const dx = x1 - x0
  const dy = y1 - y0
  // dik birim vektör (kenar yönüne göre sola döner); sign ile çarpılır
  const len = Math.hypot(dx, dy)
  let px = -dy / len
  let py = dx / len
  let { a, b, c, d } = edge
  let sign = edge.sign
  if (reverse) {
    // aynı fiziksel kenar iki komşu parçada zıt yönde çizilir;
    // şeklin birebir örtüşmesi için parametreler aynalanır
    b = -b
    d = -d
    sign = -sign as 1 | -1
  }
  px *= sign
  py *= sign

  const t = T
  // normalize koordinatlar: (u, v) → dünya: P = P0 + u*(dx,dy) + v*len*(px,py)
  const pt = (u: number, v: number): [number, number] => [
    x0 + u * dx + v * len * px,
    y0 + u * dy + v * len * py,
  ]

  const c1 = pt(0.2, a)
  const c2 = pt(0.5 + b + d, -t + c)
  const p3 = pt(0.5 - t + b, t + c)
  const c4 = pt(0.5 - 2 * t + b - d, 3 * t + c)
  const c5 = pt(0.5 + 2 * t + b - d, 3 * t + c)
  const p6 = pt(0.5 + t + b, t + c)
  const c7 = pt(0.5 + b + d, -t + c)
  const c8 = pt(0.8, a)

  path.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p3[0], p3[1])
  path.bezierCurveTo(c4[0], c4[1], c5[0], c5[1], p6[0], p6[1])
  path.bezierCurveTo(c7[0], c7[1], c8[0], c8[1], x1, y1)
}

/**
 * (row, col) parçasının path'ini üretir — koordinatlar kaynak görsel pikselinde,
 * hücrenin sol-üst köşesi (col*cellW, row*cellH).
 */
export function piecePath(cut: CutSpec, row: number, col: number): Path2D {
  const { cellW, cellH } = cut
  const x = col * cellW
  const y = row * cellH
  const path = new Path2D()
  path.moveTo(x, y)
  // üst kenar (soldan sağa): horizontal[row][col], +sign yukarı bakmalı → perp (0,-1)
  // addEdge'te perp kenar yönüne göre sola döner: (1,0) yönünde sol = (0,-1) ✓
  addEdge(path, x, y, x + cellW, y, cut.horizontal[row][col], false)
  // sağ kenar (yukarıdan aşağı): vertical[row][col+1]; (0,1) yönünde sol = (1,0) → +sign sağa ✓
  addEdge(path, x + cellW, y, x + cellW, y + cellH, cut.vertical[row][col + 1], false)
  // alt kenar (sağdan sola): horizontal[row+1][col] ters yönde
  addEdge(path, x + cellW, y + cellH, x, y + cellH, cut.horizontal[row + 1][col], true)
  // sol kenar (aşağıdan yukarı): vertical[row][col] ters yönde
  addEdge(path, x, y + cellH, x, y, cut.vertical[row][col], true)
  path.closePath()
  return path
}

/** Parça bitmap'inin hücre etrafında taşan pay (tab çıkıntıları için) */
export function pieceMargin(cut: CutSpec): number {
  return Math.ceil(Math.max(cut.cellW, cut.cellH) * 0.34)
}

export interface PieceBitmap {
  canvas: HTMLCanvasElement
  /** Bitmap'in sol üst köşesinin, hücre sol-üst köşesine göre ofseti (negatif) */
  offsetX: number
  offsetY: number
}

/** Her parçayı bir kez offscreen canvas'a çizip cache'ler */
export function renderPieceBitmaps(
  img: CanvasImageSource,
  cut: CutSpec,
): PieceBitmap[][] {
  const margin = pieceMargin(cut)
  const out: PieceBitmap[][] = []
  for (let r = 0; r < cut.rows; r++) {
    const rowArr: PieceBitmap[] = []
    for (let c = 0; c < cut.cols; c++) {
      const w = Math.ceil(cut.cellW) + margin * 2
      const h = Math.ceil(cut.cellH) + margin * 2
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      const path = piecePath(cut, r, c)
      const ox = c * cut.cellW - margin
      const oy = r * cut.cellH - margin
      ctx.translate(-ox, -oy)
      ctx.save()
      ctx.clip(path)
      ctx.drawImage(img, 0, 0)
      ctx.restore()
      // parça kenarı: hafif koyu kontur — parçaların birbirinden seçilmesi için
      ctx.lineWidth = Math.max(1, cut.cellW * 0.008)
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'
      ctx.stroke(path)
      rowArr.push({ canvas, offsetX: -margin, offsetY: -margin })
    }
    out.push(rowArr)
  }
  return out
}
