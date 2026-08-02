// Puzzle kayıtları: veritabanı + fotoğraf deposu.
//
// Ortak tablo mantığı: bir odaya katılan herkes puzzle_players tablosuna eklenir,
// böylece puzzle o kişinin de geçmişinde görünür (bkz. supabase/schema.sql).
//
// Fotoğraf depoda tutulduğu için odaya katılan kişi görseli doğrudan sunucudan
// indirir; cihazdan cihaza aktarıma (ve onun bağlantı kırılganlığına) gerek kalmaz.

import { snapshotTamamlanmis, type StateSnapshot } from '../engine/state'
import { supabase } from './client'

const BUCKET = 'puzzle-images'

export interface RemotePuzzle {
  id: string
  owner: string
  room_code: string
  title: string
  /** Hazır eser seçildiyse ressamı */
  artist: string
  image_path: string
  seed: number
  piece_count: number
  message: string
  max_players: number
  rotation: boolean
  /** Doluysa bu zamana kadar kilitli */
  unlock_at: string | null
  state: StateSnapshot | null
  elapsed: number
  completed: boolean
  created_at: string
  updated_at: string
}

/** Puzzle hâlâ kilitli mi (özel gün) */
export function kilitliMi(p: { unlock_at: string | null }): boolean {
  return !!p.unlock_at && new Date(p.unlock_at).getTime() > Date.now()
}

export interface Istatistik {
  toplamPuzzle: number
  bitenPuzzle: number
  toplamSure: number
  toplamParca: number
  enHizli: { title: string; elapsed: number } | null
  birlikteCozulen: number
}

/**
 * Puzzle gerçekten bitmiş mi. Bayrağa tek başına güvenilmiyor: eski
 * kayıtlarda tamamlanma sunucuya ulaşmadan kalabildiği için parça
 * konumlarından da doğruluyoruz.
 */
export function gercektenBitti(p: RemotePuzzle): boolean {
  return p.completed || snapshotTamamlanmis(p.state)
}

/**
 * Bayrağı eksik kalmış kayıtları sunucuda düzeltir (bir kerelik onarım).
 * Sessizce çalışır; başarısız olursa istatistikler yine doğru gösterilir.
 */
export async function bitmisleriOnar(liste: RemotePuzzle[]): Promise<number> {
  if (!supabase) return 0
  const bozuk = liste.filter((p) => !p.completed && snapshotTamamlanmis(p.state))
  for (const p of bozuk) {
    try {
      await supabase.from('puzzles').update({ completed: true }).eq('id', p.id)
      p.completed = true
    } catch {
      // yetki yoksa veya çevrimdışıysak boş ver
    }
  }
  return bozuk.length
}

/** Tablolardan özet istatistik çıkar */
export function istatistikCikar(liste: RemotePuzzle[], benimId: string): Istatistik {
  const bitenler = liste.filter(gercektenBitti)
  let enHizli: { title: string; elapsed: number } | null = null
  for (const p of bitenler) {
    if (p.elapsed > 0 && (!enHizli || p.elapsed < enHizli.elapsed)) {
      enHizli = { title: p.title || 'İsimsiz', elapsed: p.elapsed }
    }
  }
  return {
    toplamPuzzle: liste.length,
    bitenPuzzle: bitenler.length,
    toplamSure: liste.reduce((t, p) => t + (p.elapsed || 0), 0),
    toplamParca: bitenler.reduce((t, p) => t + (p.piece_count || 0), 0),
    enHizli,
    birlikteCozulen: liste.filter((p) => p.owner !== benimId || p.max_players > 1).length,
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [bas, veri] = dataUrl.split(',')
  const tip = /:(.*?);/.exec(bas)?.[1] ?? 'image/jpeg'
  const ikili = atob(veri)
  const buf = new Uint8Array(ikili.length)
  for (let i = 0; i < ikili.length; i++) buf[i] = ikili.charCodeAt(i)
  return new Blob([buf], { type: tip })
}

/** Yeni puzzle'ı sunucuya kaydet; fotoğrafı depoya yükler. */
export async function createRemotePuzzle(opts: {
  roomCode: string
  title: string
  artist?: string
  imageDataUrl: string
  seed: number
  pieceCount: number
  message: string
  maxPlayers: number
  rotation?: boolean
  unlockAt?: string | null
}): Promise<RemotePuzzle | null> {
  if (!supabase) return null
  const { data: oturum } = await supabase.auth.getUser()
  const kullanici = oturum.user
  if (!kullanici) return null

  // Not: upsert kullanmıyoruz. Depoda upsert bir UPDATE olarak işlendiği için
  // ayrı bir güncelleme izni gerektiriyor; yolun zaten benzersiz olduğu bu
  // akışta gerekmiyor. Yine de çakışma olursa yola son ek verip tekrar deniyoruz.
  const blob = dataUrlToBlob(opts.imageDataUrl)
  let yol = `${kullanici.id}/${opts.roomCode}.jpg`
  let { error: yuklemeHatasi } = await supabase.storage
    .from(BUCKET)
    .upload(yol, blob, { contentType: 'image/jpeg' })

  if (yuklemeHatasi && /exist|duplicate|409/i.test(yuklemeHatasi.message)) {
    yol = `${kullanici.id}/${opts.roomCode}-${Date.now().toString(36)}.jpg`
    ;({ error: yuklemeHatasi } = await supabase.storage
      .from(BUCKET)
      .upload(yol, blob, { contentType: 'image/jpeg' }))
  }
  if (yuklemeHatasi) throw new Error(`Fotoğraf yüklenemedi: ${yuklemeHatasi.message}`)

  const satir: Record<string, unknown> = {
    owner: kullanici.id,
    room_code: opts.roomCode,
    title: opts.title,
    artist: opts.artist ?? '',
    image_path: yol,
    seed: opts.seed,
    piece_count: opts.pieceCount,
    message: opts.message,
    max_players: opts.maxPlayers,
    rotation: opts.rotation ?? false,
    unlock_at: opts.unlockAt ?? null,
  }

  let { data, error } = await supabase.from('puzzles').insert(satir).select().single()

  // Şemanın son sürümü henüz çalıştırılmadıysa yeni sütunlar olmayabilir.
  // Kayıt tamamen başarısız olacağına, o alanı atlayıp devam etmek daha iyi.
  if (error && eksikSutun(error.message)) {
    delete satir.artist
    ;({ data, error } = await supabase.from('puzzles').insert(satir).select().single())
  }
  if (error) throw new Error(error.message)
  return data as RemotePuzzle
}

/** Hata "böyle bir sütun yok" mu diyor */
function eksikSutun(mesaj: string): boolean {
  return /column .* does not exist|Could not find the '.*' column/i.test(mesaj)
}

/**
 * Oda koduyla katıl: kullanıcıyı katılımcı listesine ekler ve puzzle'ı döndürür.
 * (Sunucudaki join_puzzle fonksiyonu, doğrudan okuma izni vermeden bunu yapar.)
 */
/** Odaya katılırken sunucudan dönebilecek anlamlı durumlar */
export class OdaHatasi extends Error {
  constructor(
    message: string,
    readonly tur: 'kilitli' | 'bulunamadi' | 'diger',
  ) {
    super(message)
  }
}

export async function joinRemotePuzzle(roomCode: string): Promise<RemotePuzzle | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('join_puzzle', { p_code: roomCode })
  if (error) {
    const m = error.message ?? ''
    // sunucu kilidi: özel gün tarihi gelmeden katılım engellenir
    if (m.includes('acilmadi')) {
      throw new OdaHatasi('Bu puzzle henüz açılmadı. Özel gün için saklanmış.', 'kilitli')
    }
    if (m.includes('bulunamadi')) return null
    return null
  }
  return (data ?? null) as RemotePuzzle | null
}

/** Depodaki fotoğrafı indirilebilir geçici adrese çevir */
export async function puzzleImageUrl(imagePath: string): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(imagePath, 60 * 60)
  if (error) return null
  return data.signedUrl
}

/** İlerlemeyi sunucuya yaz (katılımcıların hepsi güncelleyebilir) */
export async function saveRemoteProgress(
  puzzleId: string,
  alanlar: { state?: StateSnapshot; elapsed?: number; completed?: boolean; title?: string },
): Promise<void> {
  if (!supabase) return
  await supabase
    .from('puzzles')
    .update({ ...alanlar, updated_at: new Date().toISOString() })
    .eq('id', puzzleId)
}

/** Kullanıcının katıldığı tüm tablolar — en yeni önce */
export async function listRemotePuzzles(): Promise<RemotePuzzle[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('puzzles')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(60)
  if (error) return []
  return (data ?? []) as RemotePuzzle[]
}

/**
 * Birden çok puzzle'ın katılımcı adlarını tek seferde getirir.
 * Kendi adın listede yer almaz — kart üzerinde "kiminle oynandığı" yazacak.
 * Puzzle başına ayrı sorgu atmamak için hepsi iki istekte toplanıyor.
 */
export async function katilimcilariGetir(
  puzzleIdler: string[],
): Promise<Map<string, string[]>> {
  const harita = new Map<string, string[]>()
  if (!supabase || puzzleIdler.length === 0) return harita

  const { data: oturum } = await supabase.auth.getUser()
  const ben = oturum.user?.id

  // Odadan çıkarılanlar sayılmaz: kaydı duruyor ama artık o tabloyu birlikte
  // çözmüş sayılmıyor (bkz. schema.sql -> oyuncu_cikar).
  const { data: satirlar } = await supabase
    .from('puzzle_players')
    .select('puzzle_id,user_id')
    .eq('banned', false)
    .in('puzzle_id', puzzleIdler)
  if (!satirlar || satirlar.length === 0) return harita

  const kayitlar = satirlar as { puzzle_id: string; user_id: string }[]
  const kisiIdler = [...new Set(kayitlar.map((r) => r.user_id))].filter((id) => id !== ben)
  if (kisiIdler.length === 0) return harita

  const { data: profiller } = await supabase
    .from('profiles')
    .select('id,display_name')
    .in('id', kisiIdler)
  const adlar = new Map(
    (profiller ?? []).map((p) => {
      const s = p as { id: string; display_name: string }
      return [s.id, s.display_name || 'İsimsiz']
    }),
  )

  for (const r of kayitlar) {
    if (r.user_id === ben) continue
    const ad = adlar.get(r.user_id)
    if (!ad) continue
    const mevcut = harita.get(r.puzzle_id) ?? []
    if (!mevcut.includes(ad)) mevcut.push(ad)
    harita.set(r.puzzle_id, mevcut)
  }
  return harita
}

/** Oda kodu çakışma sonrası değiştiyse sunucudaki kaydı da güncelle */
export async function updateRemoteRoomCode(puzzleId: string, roomCode: string): Promise<void> {
  if (!supabase) return
  await supabase.from('puzzles').update({ room_code: roomCode }).eq('id', puzzleId)
}

/**
 * Kaydı ve fotoğrafını sil. Silinemezse hata fırlatır ki arayüz kartı
 * listede tutup kullanıcıya haber verebilsin.
 */
/** Puzzle'ın adını değiştir (yalnızca katılımcılar) */
export async function yenidenAdlandir(puzzleId: string, yeniAd: string): Promise<void> {
  if (!supabase) return
  const ad = yeniAd.trim().slice(0, 60)
  if (!ad) throw new Error('Ad boş olamaz')
  const { error } = await supabase.from('puzzles').update({ title: ad }).eq('id', puzzleId)
  if (error) throw new Error(error.message)
}

export async function deleteRemotePuzzle(puzzleId: string, imagePath?: string): Promise<void> {
  if (!supabase) return
  const { data, error } = await supabase.from('puzzles').delete().eq('id', puzzleId).select('id')
  if (error) throw new Error(error.message)
  // RLS engellediğinde hata gelmez, sadece hiçbir satır silinmez
  if (!data || data.length === 0) throw new Error('Bu kaydı silme yetkin yok')
  // depodaki fotoğraf artık sahipsiz; o da gitsin
  if (imagePath) await supabase.storage.from(BUCKET).remove([imagePath])
}
