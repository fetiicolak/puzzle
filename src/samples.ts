// Hazır puzzle kataloğu.
//
// Tablolar Wikimedia Commons'tan alınmıştır; hepsi kamu malı (eser sahibi
// 70+ yıl önce vefat etmiş) veya CC0'dır — atıf zorunluluğu yoktur, ticari
// kullanıma da uygundur. Ressamı olan eserlerde ad ve ressam gösterilir.

/** Galeri filtreleri. Sanat tarihi sınıfı değil, "ne görmek istiyorum" sorusu. */
export type Kategori = 'turk' | 'portre' | 'sahne' | 'manzara' | 'doga' | 'hayvan' | 'desen'

export const KATEGORI_ADI: Record<Kategori, string> = {
  turk: 'Türk resmi',
  portre: 'Portreler',
  sahne: 'Ünlü sahneler',
  manzara: 'Manzara & deniz',
  doga: 'Çiçek & doğa',
  hayvan: 'Hayvanlar',
  desen: 'Desenler',
}

/** Filtre çubuğunda görünecek sıra */
export const KATEGORI_SIRASI: Kategori[] = [
  'turk',
  'portre',
  'sahne',
  'manzara',
  'doga',
  'hayvan',
  'desen',
]

export interface Sample {
  /** public/samples altındaki dosya adı */
  file: string
  /** Eser/görsel adı — puzzle kurulurken öntanımlı isim olur */
  title: string
  /** Ressam (yalnızca tablolarda) */
  artist?: string
  year?: string
  kategori: Kategori
}

export const SAMPLES: Sample[] = [
  // --- Türk resmi ---
  {
    file: 'kaplumbaga-terbiyecisi.jpg',
    title: 'Kaplumbağa Terbiyecisi',
    artist: 'Osman Hamdi Bey',
    year: '1906',
    kategori: 'turk',
  },
  {
    file: 'iki-muzisyen-kiz.jpg',
    title: 'İki Müzisyen Kız',
    artist: 'Osman Hamdi Bey',
    year: '1880',
    kategori: 'turk',
  },

  // --- portreler ---
  { file: 'mona-lisa.jpg', title: 'Mona Lisa', artist: 'Leonardo da Vinci', year: '1503', kategori: 'portre' },
  { file: 'inci-kupeli-kiz.jpg', title: 'İnci Küpeli Kız', artist: 'Johannes Vermeer', year: '1665', kategori: 'portre' },
  { file: 'adele-bloch-bauer.jpg', title: 'Adele Bloch-Bauer', artist: 'Gustav Klimt', year: '1907', kategori: 'portre' },
  { file: 'arnolfini-portresi.jpg', title: 'Arnolfini Portresi', artist: 'Jan van Eyck', year: '1434', kategori: 'portre' },
  { file: 'amerikan-gotigi.jpg', title: 'Amerikan Gotiği', artist: 'Grant Wood', year: '1930', kategori: 'portre' },
  { file: 'sut-dagitan-kadin.jpg', title: 'Süt Dağıtan Kadın', artist: 'Johannes Vermeer', year: '1658', kategori: 'portre' },

  // --- ünlü sahneler ---
  { file: 'opucuk.jpg', title: 'Öpücük', artist: 'Gustav Klimt', year: '1908', kategori: 'sahne' },
  { file: 'ciglik.jpg', title: 'Çığlık', artist: 'Edvard Munch', year: '1893', kategori: 'sahne' },
  { file: 'gece-devriyesi.jpg', title: 'Gece Devriyesi', artist: 'Rembrandt', year: '1642', kategori: 'sahne' },
  { file: 'ademin-yaratilisi.jpg', title: "Âdem'in Yaratılışı", artist: 'Michelangelo', year: '1512', kategori: 'sahne' },
  {
    file: 'son-aksam-yemegi.jpg',
    title: 'Son Akşam Yemeği',
    artist: 'Leonardo da Vinci',
    year: '1498',
    kategori: 'sahne',
  },
  {
    file: 'moulin-de-la-galette.jpg',
    title: 'Moulin de la Galette',
    artist: 'Auguste Renoir',
    year: '1876',
    kategori: 'sahne',
  },
  {
    file: 'teknede-ogle-yemegi.jpg',
    title: 'Teknede Öğle Yemeği',
    artist: 'Auguste Renoir',
    year: '1881',
    kategori: 'sahne',
  },
  { file: 'bale-dersi.jpg', title: 'Bale Dersi', artist: 'Edgar Degas', year: '1874', kategori: 'sahne' },
  { file: 'grande-jatte.jpg', title: 'Grande Jatte', artist: 'Georges Seurat', year: '1884', kategori: 'sahne' },
  { file: 'gece-kafe.jpg', title: 'Gece Kafe Terası', artist: 'Vincent van Gogh', year: '1888', kategori: 'sahne' },
  { file: 'venusun-dogusu.jpg', title: "Venüs'ün Doğuşu", artist: 'Sandro Botticelli', year: '1486', kategori: 'sahne' },

  // --- manzara ve deniz ---
  { file: 'buyuk-dalga.jpg', title: 'Büyük Dalga', artist: 'Katsushika Hokusai', year: '1831', kategori: 'manzara' },
  { file: 'dokuzuncu-dalga.jpg', title: 'Dokuzuncu Dalga', artist: 'Ivan Ayvazovski', year: '1850', kategori: 'manzara' },
  { file: 'kizil-fuji.jpg', title: 'Kızıl Fuji', artist: 'Katsushika Hokusai', year: '1831', kategori: 'manzara' },
  {
    file: 'sis-denizi-gezgini.jpg',
    title: 'Sis Denizi Üzerinde Gezgin',
    artist: 'Caspar David Friedrich',
    year: '1818',
    kategori: 'manzara',
  },
  { file: 'temeraire.jpg', title: 'Savaşçı Téméraire', artist: 'J. M. W. Turner', year: '1839', kategori: 'manzara' },
  { file: 'izlenim-gundogumu.jpg', title: 'İzlenim, Gündoğumu', artist: 'Claude Monet', year: '1872', kategori: 'manzara' },
  { file: 'karda-avcilar.jpg', title: 'Karda Avcılar', artist: 'Pieter Bruegel', year: '1565', kategori: 'manzara' },
  { file: 'babil-kulesi.jpg', title: 'Babil Kulesi', artist: 'Pieter Bruegel', year: '1563', kategori: 'manzara' },

  // --- çiçek ve doğa ---
  { file: 'yildizli-gece.jpg', title: 'Yıldızlı Gece', artist: 'Vincent van Gogh', year: '1889', kategori: 'doga' },
  { file: 'aycicekleri.jpg', title: 'Ayçiçekleri', artist: 'Vincent van Gogh', year: '1888', kategori: 'doga' },
  { file: 'badem-cicekleri.jpg', title: 'Badem Çiçekleri', artist: 'Vincent van Gogh', year: '1890', kategori: 'doga' },
  { file: 'niluferler.jpg', title: 'Nilüferler', artist: 'Claude Monet', year: '1906', kategori: 'doga' },

  // --- hayvanlar ---
  { file: 'kedi.jpg', title: 'Kedi', kategori: 'hayvan' },
  { file: 'kopek.jpg', title: 'Köpek', kategori: 'hayvan' },

  // --- desenler ---
  { file: 'gunbatimi.svg', title: 'Gün Batımı', kategori: 'desen' },
  { file: 'kalpler.svg', title: 'Kalpler', kategori: 'desen' },
  { file: 'mozaik.svg', title: 'Mozaik', kategori: 'desen' },
]

/** Bir kategoride kaç eser var */
export function kategoriSayisi(k: Kategori): number {
  return SAMPLES.filter((s) => s.kategori === k).length
}

export function sampleUrl(s: Sample): string {
  return `samples/${s.file}`
}

/** Galeri için küçük önizleme (SVG'ler zaten küçük, olduğu gibi kullanılır) */
export function sampleThumbUrl(s: Sample): string {
  return s.file.endsWith('.svg') ? `samples/${s.file}` : `samples/thumb/${s.file}`
}
