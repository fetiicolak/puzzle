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
  { file: 'inci-kupeli-kiz.jpg', title: 'İnci Küpeli Kız', artist: 'Johannes Vermeer', year: '1665' },
  { file: 'buyuk-dalga.jpg', title: 'Büyük Dalga', artist: 'Katsushika Hokusai', year: '1831' },
  { file: 'ciglik.jpg', title: 'Çığlık', artist: 'Edvard Munch', year: '1893' },
  { file: 'aycicekleri.jpg', title: 'Ayçiçekleri', artist: 'Vincent van Gogh', year: '1888' },
  { file: 'venusun-dogusu.jpg', title: "Venüs'ün Doğuşu", artist: 'Sandro Botticelli', year: '1486' },
  { file: 'izlenim-gundogumu.jpg', title: 'İzlenim, Gündoğumu', artist: 'Claude Monet', year: '1872' },
  {
    file: 'moulin-de-la-galette.jpg',
    title: 'Moulin de la Galette',
    artist: 'Auguste Renoir',
    year: '1876',
  },
  { file: 'karda-avcilar.jpg', title: 'Karda Avcılar', artist: 'Pieter Bruegel', year: '1565' },
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
