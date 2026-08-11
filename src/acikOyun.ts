/*
  Açık olan puzzle'ı sayfa yenilendikten sonra da açık tutar.

  Sorun: oyunun ortasında F5'e basmak (ya da telefonda sekmenin arka planda
  atılıp yeniden yüklenmesi) ana ekrana atıyordu. İlerleme kayıptı değildi —
  `savePuzzle` 15 saniyede bir ve sayfa kapanırken yazıyor — ama kullanıcı
  "Devam et" listesinden puzzle'ı elle bulmak zorunda kalıyordu.

  Neden sessionStorage: yenileme aynı sekmede olur, kayıt orada yaşar. Sekme
  kapatılıp site yeniden açıldığında ana ekran gelmeli — yarım kalan bir oyunun
  günler sonra kendiliğinden açılması istenmez.

  Ne saklanıyor: yalnızca oyunun tarifi. Fotoğraf (dataURL, yüzlerce KB) ve
  parça durumu dışarıda; ikisi de `puzzle:<id>` altındaki asıl kayıttan
  okunuyor, üstelik oradaki hep daha günceldir. Yenilemeden hemen önceki
  ilerleme bu yüzden geri geliyor.
*/

import type { GameConfig } from './components/GameScreen'
import { loadPuzzle } from './storage'

const ANAHTAR = 'puzzle:acik-oyun'

/** Kayıttan tazelenecek, bu yüzden saklamaya değmeyen alanlar */
type Hafif = Omit<GameConfig, 'imageDataUrl' | 'snap'>

export function acikOyunuYaz(config: GameConfig): void {
  try {
    const hafif: Hafif = { ...config }
    delete (hafif as GameConfig).imageDataUrl
    delete (hafif as GameConfig).snap
    sessionStorage.setItem(ANAHTAR, JSON.stringify(hafif))
  } catch {
    // depolama kapalıysa yenileme eski davranışa döner, oyun bozulmaz
  }
}

export function acikOyunuSil(): void {
  try {
    sessionStorage.removeItem(ANAHTAR)
  } catch {
    // yoksay
  }
}

/**
 * Yenilemeden önce açık olan oyunun yapılandırması.
 *
 * `local` kipinde fotoğraf yalnızca cihazdaki kayıtta duruyor; kayıt yoksa
 * (kullanıcı çıkış yapmış, kota dolmuş) oyun kurulamaz, null dönüyoruz ve
 * ana ekran açılıyor.
 */
export function acikOyunuOku(): GameConfig | null {
  let hafif: Hafif
  try {
    const ham = sessionStorage.getItem(ANAHTAR)
    if (!ham) return null
    hafif = JSON.parse(ham) as Hafif
  } catch {
    return null
  }
  if (!hafif?.puzzleId || !hafif.mode) return null

  const kayit = loadPuzzle(hafif.puzzleId)
  if (hafif.mode === 'local' && !kayit?.imageDataUrl) return null

  return {
    ...hafif,
    // Kayıt her zaman daha güncel: son 15 saniyenin hamleleri burada
    ...(kayit
      ? {
          title: kayit.title,
          message: kayit.message,
          imageDataUrl: kayit.imageDataUrl,
          seed: kayit.seed,
          pieceCount: kayit.pieceCount,
          snap: kayit.snap,
          elapsed: kayit.elapsed,
        }
      : {}),
  }
}
