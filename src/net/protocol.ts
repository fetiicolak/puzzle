// P2P mesaj protokolü. Tüm mesajlar JSON-serileştirilebilir
// (görsel aktarımı base64 chunk'larla yapılır — PeerJS json modu).

import type { StateSnapshot } from '../engine/state'

export interface MetaMsg {
  t: 'meta'
  seed: number
  pieceCount: number
  title: string
  /** hazır eser seçildiyse ressamı */
  artist?: string
  message: string
  /** base64 chunk sayısı */
  imgChunks: number
  elapsed: number
  /** döndürmeli zorluk açık mı */
  rotation?: boolean
}

export interface ImgChunkMsg {
  t: 'img'
  i: number
  data: string
}

export interface StateMsg {
  t: 'state'
  snap: StateSnapshot
}

export interface GrabMsg {
  t: 'grab'
  g: number
}

export interface ReleaseMsg {
  t: 'release'
  g: number
}

export interface MoveMsg {
  t: 'move'
  g: number
  anchor: number
  x: number
  y: number
}

export interface DropMsg {
  t: 'drop'
  g: number
  anchor: number
  x: number
  y: number
}

export interface CursorMsg {
  t: 'cursor'
  x: number
  y: number
  /** Gönderenin adı — imlecin yanında gösterilir */
  ad?: string
}

/** Yerleşmemiş parçaları yeniden dağıt */
export interface ShuffleMsg {
  t: 'shuffle'
  seed: number
}

/** Birleşmiş bir parçayı grubundan koparma */
export interface SplitMsg {
  t: 'split'
  piece: number
  group: number
  x: number
  y: number
}

/** Oda dolu — host yeni gelene bunu gönderip bağlantıyı kapatır */
export interface FullMsg {
  t: 'full'
}

/** Oda içi sohbet */
export interface ChatMsg {
  t: 'chat'
  /** Gönderenin görünen adı */
  ad: string
  metin: string
  /** Gönderim zamanı (gönderenin saati) */
  ts: number
}

/**
 * Kimlik tanıtma. Bağlantı kurulur kurulmaz gönderilir; odadaki kişi
 * listesinde misafirlerin de görünmesini sağlar (hesap kaydı olmayanlar
 * puzzle_players tablosunda yer almaz).
 */
export interface HelloMsg {
  t: 'hello'
  ad: string
  /** Giriş yapılmışsa hesap kimliği, misafirde null */
  uid: string | null
  /**
   * Kişiyi ayırt eden kalıcı değer: hesap kimliği ya da misafir için cihaza
   * yazılan kimlik. Aynı kişi odaya yeniden katıldığında eski bağlantısının
   * kapatılabilmesi için gerekli.
   */
  kimlik?: string
}

/** Odadan çıkarıldın — sunucu kaydı silmeden önce karşı tarafa haber ver */
export interface KickMsg {
  t: 'kick'
  /** Çıkarılan kişinin hesap kimliği */
  uid: string
}

/** Grubu çeyrek tur döndür */
export interface RotateMsg {
  t: 'rot'
  g: number
  /** Kaç çeyrek tur */
  d: number
}

/** Parçaları tepsiye diz (herkeste aynı sonucu verir) */
export interface TrayMsg {
  t: 'tray'
  /** Dizilim sırasını karıştırmak için ortak tohum */
  seed: number
}

export type Msg = (
  | MetaMsg
  | ImgChunkMsg
  | StateMsg
  | GrabMsg
  | ReleaseMsg
  | MoveMsg
  | DropMsg
  | CursorMsg
  | SplitMsg
  | FullMsg
  | ChatMsg
  | RotateMsg
  | TrayMsg
  | ShuffleMsg
  | HelloMsg
  | KickMsg
) & {
  /** Host yansıtırken kaynağı işaretler; doğrudan gelen mesajlarda boştur */
  from?: string
}

/** Tek chunk'ın bayt sınırı */
export const CHUNK_BOYUTU = 16_000

/**
 * dataURL'i güvenli boyutlu chunk'lara böl.
 * 16 KB, WebRTC data channel'ın tek mesaj sınırının epey altında kalır;
 * daha büyük parçalar bazı tarayıcılarda kanalı kapattırıyordu.
 */
export function chunkDataUrl(dataUrl: string, size = CHUNK_BOYUTU): string[] {
  const chunks: string[] = []
  for (let i = 0; i < dataUrl.length; i += size) chunks.push(dataUrl.slice(i, i + size))
  return chunks
}

// ------------------------------------------------------------- doğrulama

/**
 * Kabul edilebilecek en fazla fotoğraf parçası.
 * Kova sınırı 10 MB; base64 ~1,37 kat büyüttüğü için 16 KB'lık ~880 parça
 * eder. 1024 rahat bir tavan — bunun üstü kötü niyetli kabul edilir.
 */
export const MAX_IMG_CHUNKS = 1024

/**
 * Yalnızca odayı kuranın gönderebileceği mesajlar.
 *
 * Bunlar oyunun kimliğini (hangi fotoğraf, hangi başlık), tam durumunu ve
 * kimin odada kalacağını belirler. Herkesten kabul edilirse odadaki herhangi
 * biri tahtayı değiştirebilir ya da başkasını atabilir.
 *
 * tray/shuffle bilerek listede değil: onlar iş birliğine dayalı düğmeler,
 * misafirin de kullanabilmesi gerekiyor.
 */
export const HOST_YETKILI: ReadonlySet<string> = new Set([
  'meta',
  'img',
  'state',
  'full',
  'kick',
])

const sayiMi = (v: unknown, enAz: number, enCok: number): boolean =>
  typeof v === 'number' && Number.isFinite(v) && v >= enAz && v <= enCok

const tamSayiMi = (v: unknown, enAz: number, enCok: number): boolean =>
  sayiMi(v, enAz, enCok) && Number.isInteger(v as number)

const metinMi = (v: unknown, enCokUzunluk: number): boolean =>
  typeof v === 'string' && v.length <= enCokUzunluk

/** Dünya koordinatları için makul sınır — parçalar bu kadar uzağa gitmez */
const KONUM = 1e6

/**
 * Gelen P2P mesajını doğrula.
 *
 * Karşı taraf bizim kodumuzu çalıştırmak zorunda değil; konsoldan elle mesaj
 * gönderebilir. Bu yüzden alan tipleri, sayı aralıkları ve metin uzunlukları
 * burada tek noktadan kontrol ediliyor.
 *
 * Yetki kontrolü `from` damgasına dayanıyor: host yansıtırken damgayı kendi
 * basıyor (peer.ts), yani misafir onu taklit edemiyor. Misafir tarafında
 * `dogrudan = true` ⇔ "mesaj doğrudan host'tan geldi".
 *
 * @param hostMu  bu taraf odayı kuran mı
 * @param dogrudan  mesaj yansıtılmadan geldi mi (from damgası yok)
 * @returns geçerliyse mesajın kendisi, değilse null
 */
export function dogrula(veri: unknown, hostMu: boolean, dogrudan: boolean): Msg | null {
  if (!veri || typeof veri !== 'object') return null
  const m = veri as Record<string, unknown>
  const t = m.t
  if (typeof t !== 'string') return null

  // Host yetkili mesajlar: host'ta hiç kabul edilmez (host otoritenin
  // kendisi), misafirde yalnızca doğrudan host'tan gelmişse kabul edilir.
  if (HOST_YETKILI.has(t)) {
    if (hostMu || !dogrudan) return null
  }

  const gecerli = (() => {
    switch (t) {
      case 'meta':
        return (
          tamSayiMi(m.seed, 0, 0xffffffff) &&
          tamSayiMi(m.pieceCount, 2, 5000) &&
          metinMi(m.title, 200) &&
          (m.artist === undefined || metinMi(m.artist, 200)) &&
          metinMi(m.message, 2000) &&
          tamSayiMi(m.imgChunks, 1, MAX_IMG_CHUNKS) &&
          sayiMi(m.elapsed, 0, 1e9) &&
          (m.rotation === undefined || typeof m.rotation === 'boolean')
        )
      case 'img':
        return tamSayiMi(m.i, 0, MAX_IMG_CHUNKS - 1) && metinMi(m.data, CHUNK_BOYUTU)
      case 'state':
        return !!m.snap && typeof m.snap === 'object'
      case 'grab':
      case 'release':
        return tamSayiMi(m.g, 0, 1e6)
      case 'move':
      case 'drop':
        return (
          tamSayiMi(m.g, 0, 1e6) &&
          tamSayiMi(m.anchor, 0, 1e6) &&
          sayiMi(m.x, -KONUM, KONUM) &&
          sayiMi(m.y, -KONUM, KONUM)
        )
      case 'cursor':
        return (
          sayiMi(m.x, -KONUM, KONUM) &&
          sayiMi(m.y, -KONUM, KONUM) &&
          (m.ad === undefined || metinMi(m.ad, 40))
        )
      case 'split':
        return (
          tamSayiMi(m.piece, 0, 1e6) &&
          tamSayiMi(m.group, 0, 1e6) &&
          sayiMi(m.x, -KONUM, KONUM) &&
          sayiMi(m.y, -KONUM, KONUM)
        )
      case 'rot':
        return tamSayiMi(m.g, 0, 1e6) && tamSayiMi(m.d, -3, 3)
      case 'tray':
      case 'shuffle':
        return tamSayiMi(m.seed, 0, 0xffffffff)
      case 'chat':
        return metinMi(m.ad, 40) && metinMi(m.metin, 1000) && sayiMi(m.ts, 0, 1e15)
      case 'hello':
        return (
          metinMi(m.ad, 40) &&
          (m.uid === null || metinMi(m.uid, 64)) &&
          (m.kimlik === undefined || metinMi(m.kimlik, 64))
        )
      case 'kick':
        return metinMi(m.uid, 64)
      case 'full':
        return true
      default:
        return false
    }
  })()

  // Alanlar yukarıda tek tek doğrulandı; tip sistemi bunu takip edemiyor.
  return gecerli ? (m as unknown as Msg) : null
}
