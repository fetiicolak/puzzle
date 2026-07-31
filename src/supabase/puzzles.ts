// Puzzle kayıtları: veritabanı + fotoğraf deposu.
//
// Ortak tablo mantığı: bir odaya katılan herkes puzzle_players tablosuna eklenir,
// böylece puzzle o kişinin de geçmişinde görünür (bkz. supabase/schema.sql).
//
// Fotoğraf depoda tutulduğu için odaya katılan kişi görseli doğrudan sunucudan
// indirir; cihazdan cihaza aktarıma (ve onun bağlantı kırılganlığına) gerek kalmaz.

import type { StateSnapshot } from '../engine/state'
import { supabase } from './client'

const BUCKET = 'puzzle-images'

export interface RemotePuzzle {
  id: string
  owner: string
  room_code: string
  title: string
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

/** Tablolardan özet istatistik çıkar */
export function istatistikCikar(liste: RemotePuzzle[], benimId: string): Istatistik {
  const bitenler = liste.filter((p) => p.completed)
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

  const { data, error } = await supabase
    .from('puzzles')
    .insert({
      owner: kullanici.id,
      room_code: opts.roomCode,
      title: opts.title,
      image_path: yol,
      seed: opts.seed,
      piece_count: opts.pieceCount,
      message: opts.message,
      max_players: opts.maxPlayers,
      rotation: opts.rotation ?? false,
      unlock_at: opts.unlockAt ?? null,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as RemotePuzzle
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

/** Bir tabloya katılan kişilerin adları */
export async function puzzlePlayerNames(puzzleId: string): Promise<string[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('puzzle_players')
    .select('user_id')
    .eq('puzzle_id', puzzleId)
  const idler = (data ?? []).map((r) => (r as { user_id: string }).user_id)
  if (idler.length === 0) return []
  const { data: profiller } = await supabase
    .from('profiles')
    .select('display_name')
    .in('id', idler)
  return (profiller ?? []).map((p) => (p as { display_name: string }).display_name)
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
export async function deleteRemotePuzzle(puzzleId: string, imagePath?: string): Promise<void> {
  if (!supabase) return
  const { data, error } = await supabase.from('puzzles').delete().eq('id', puzzleId).select('id')
  if (error) throw new Error(error.message)
  // RLS engellediğinde hata gelmez, sadece hiçbir satır silinmez
  if (!data || data.length === 0) throw new Error('Bu kaydı silme yetkin yok')
  // depodaki fotoğraf artık sahipsiz; o da gitsin
  if (imagePath) await supabase.storage.from(BUCKET).remove([imagePath])
}
