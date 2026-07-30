// Hazır puzzle kataloğu.
//
// Tablolar Wikimedia Commons'tan alınmıştır; hepsi kamu malı (eser sahibi
// 70+ yıl önce vefat etmiş) veya CC0'dır — atıf zorunluluğu yoktur, ticari
// kullanıma da uygundur. Ressamı olan eserlerde ad ve ressam gösterilir.

export interface Sample {
  /** public/samples altındaki dosya adı */
  file: string
  /** Eser/görsel adı — puzzle kurulurken öntanımlı isim olur */
  title: string
  /** Ressam (yalnızca tablolarda) */
  artist?: string
  year?: string
}

export const SAMPLES: Sample[] = [
  { file: 'mona-lisa.jpg', title: 'Mona Lisa', artist: 'Leonardo da Vinci', year: '1503' },
  { file: 'yildizli-gece.jpg', title: 'Yıldızlı Gece', artist: 'Vincent van Gogh', year: '1889' },
  { file: 'opucuk.jpg', title: 'Öpücük', artist: 'Gustav Klimt', year: '1908' },
  { file: 'kedi.jpg', title: 'Kedi' },
  { file: 'kopek.jpg', title: 'Köpek' },
  { file: 'gunbatimi.svg', title: 'Gün Batımı' },
  { file: 'kalpler.svg', title: 'Kalpler' },
  { file: 'mozaik.svg', title: 'Mozaik' },
]

export function sampleUrl(s: Sample): string {
  return `samples/${s.file}`
}

/** Galeri için küçük önizleme (SVG'ler zaten küçük, olduğu gibi kullanılır) */
export function sampleThumbUrl(s: Sample): string {
  return s.file.endsWith('.svg') ? `samples/${s.file}` : `samples/thumb/${s.file}`
}

export function findSampleByUrl(url: string): Sample | undefined {
  return SAMPLES.find((s) => url.endsWith(s.file))
}
