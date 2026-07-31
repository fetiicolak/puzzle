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
  // --- Türk resmi ---
  {
    file: 'kaplumbaga-terbiyecisi.jpg',
    title: 'Kaplumbağa Terbiyecisi',
    artist: 'Osman Hamdi Bey',
    year: '1906',
  },
  {
    file: 'iki-muzisyen-kiz.jpg',
    title: 'İki Müzisyen Kız',
    artist: 'Osman Hamdi Bey',
    year: '1880',
  },

  // --- klasikler ---
  { file: 'mona-lisa.jpg', title: 'Mona Lisa', artist: 'Leonardo da Vinci', year: '1503' },
  { file: 'yildizli-gece.jpg', title: 'Yıldızlı Gece', artist: 'Vincent van Gogh', year: '1889' },
  { file: 'opucuk.jpg', title: 'Öpücük', artist: 'Gustav Klimt', year: '1908' },
  { file: 'inci-kupeli-kiz.jpg', title: 'İnci Küpeli Kız', artist: 'Johannes Vermeer', year: '1665' },
  { file: 'buyuk-dalga.jpg', title: 'Büyük Dalga', artist: 'Katsushika Hokusai', year: '1831' },
  { file: 'ciglik.jpg', title: 'Çığlık', artist: 'Edvard Munch', year: '1893' },
  { file: 'aycicekleri.jpg', title: 'Ayçiçekleri', artist: 'Vincent van Gogh', year: '1888' },
  { file: 'venusun-dogusu.jpg', title: "Venüs'ün Doğuşu", artist: 'Sandro Botticelli', year: '1486' },
  { file: 'gece-devriyesi.jpg', title: 'Gece Devriyesi', artist: 'Rembrandt', year: '1642' },
  { file: 'dokuzuncu-dalga.jpg', title: 'Dokuzuncu Dalga', artist: 'Ivan Ayvazovski', year: '1850' },
  { file: 'izlenim-gundogumu.jpg', title: 'İzlenim, Gündoğumu', artist: 'Claude Monet', year: '1872' },
  { file: 'niluferler.jpg', title: 'Nilüferler', artist: 'Claude Monet', year: '1906' },
  {
    file: 'moulin-de-la-galette.jpg',
    title: 'Moulin de la Galette',
    artist: 'Auguste Renoir',
    year: '1876',
  },
  {
    file: 'teknede-ogle-yemegi.jpg',
    title: 'Teknede Öğle Yemeği',
    artist: 'Auguste Renoir',
    year: '1881',
  },
  { file: 'karda-avcilar.jpg', title: 'Karda Avcılar', artist: 'Pieter Bruegel', year: '1565' },
  { file: 'babil-kulesi.jpg', title: 'Babil Kulesi', artist: 'Pieter Bruegel', year: '1563' },
  { file: 'gece-kafe.jpg', title: 'Gece Kafe Terası', artist: 'Vincent van Gogh', year: '1888' },
  { file: 'badem-cicekleri.jpg', title: 'Badem Çiçekleri', artist: 'Vincent van Gogh', year: '1890' },
  { file: 'adele-bloch-bauer.jpg', title: 'Adele Bloch-Bauer', artist: 'Gustav Klimt', year: '1907' },
  {
    file: 'sis-denizi-gezgini.jpg',
    title: 'Sis Denizi Üzerinde Gezgin',
    artist: 'Caspar David Friedrich',
    year: '1818',
  },
  { file: 'grande-jatte.jpg', title: 'Grande Jatte', artist: 'Georges Seurat', year: '1884' },
  { file: 'bale-dersi.jpg', title: 'Bale Dersi', artist: 'Edgar Degas', year: '1874' },
  { file: 'temeraire.jpg', title: 'Savaşçı Téméraire', artist: 'J. M. W. Turner', year: '1839' },
  { file: 'ademin-yaratilisi.jpg', title: "Âdem'in Yaratılışı", artist: 'Michelangelo', year: '1512' },
  {
    file: 'son-aksam-yemegi.jpg',
    title: 'Son Akşam Yemeği',
    artist: 'Leonardo da Vinci',
    year: '1498',
  },
  { file: 'sut-dagitan-kadin.jpg', title: 'Süt Dağıtan Kadın', artist: 'Johannes Vermeer', year: '1658' },
  { file: 'arnolfini-portresi.jpg', title: 'Arnolfini Portresi', artist: 'Jan van Eyck', year: '1434' },
  { file: 'kizil-fuji.jpg', title: 'Kızıl Fuji', artist: 'Katsushika Hokusai', year: '1831' },
  { file: 'amerikan-gotigi.jpg', title: 'Amerikan Gotiği', artist: 'Grant Wood', year: '1930' },

  // --- fotoğraf ve desenler ---
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
