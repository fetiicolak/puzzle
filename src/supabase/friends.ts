// Arkadaşlık işlemleri.
//
// friendships tablosu tek yönlü kayıt tutar (isteyen / istenen). Kabul edilince
// iki taraf da arkadaş sayılır, bu yüzden listeler her iki yönü de tarar.

import { supabase } from './client'

export interface Kisi {
  id: string
  ad: string
}

export interface Arkadaslik {
  id: string
  kisi: Kisi
  /** Bekleyen istek bana mı geldi, ben mi gönderdim */
  yon: 'gelen' | 'giden'
  durum: 'pending' | 'accepted'
}

interface FriendRow {
  id: string
  requester: string
  addressee: string
  status: 'pending' | 'accepted'
}

async function adlariGetir(idler: string[]): Promise<Map<string, string>> {
  const harita = new Map<string, string>()
  if (!supabase || idler.length === 0) return harita
  const { data } = await supabase.from('profiles').select('id,display_name').in('id', idler)
  for (const p of data ?? []) {
    const satir = p as { id: string; display_name: string }
    harita.set(satir.id, satir.display_name || 'İsimsiz')
  }
  return harita
}

/** Kabul edilmiş arkadaşlar ve bekleyen istekler */
export async function arkadasliklariGetir(): Promise<Arkadaslik[]> {
  if (!supabase) return []
  const { data: oturum } = await supabase.auth.getUser()
  const ben = oturum.user?.id
  if (!ben) return []

  const { data, error } = await supabase.from('friendships').select('*')
  if (error) return []
  const satirlar = (data ?? []) as FriendRow[]

  const karsiIdler = satirlar.map((s) => (s.requester === ben ? s.addressee : s.requester))
  const adlar = await adlariGetir([...new Set(karsiIdler)])

  return satirlar.map((s) => {
    const karsiId = s.requester === ben ? s.addressee : s.requester
    return {
      id: s.id,
      kisi: { id: karsiId, ad: adlar.get(karsiId) ?? 'İsimsiz' },
      yon: s.requester === ben ? 'giden' : 'gelen',
      durum: s.status,
    }
  })
}

/**
 * Birlikte puzzle çözdüğün ama henüz arkadaş olmadığın kişiler.
 * puzzle_players üzerinden bulunur: senin bulunduğun tablolardaki diğer kişiler.
 */
export async function birlikteOynananlar(haricTut: string[]): Promise<Kisi[]> {
  if (!supabase) return []
  const { data: oturum } = await supabase.auth.getUser()
  const ben = oturum.user?.id
  if (!ben) return []

  const { data: benimkiler } = await supabase
    .from('puzzle_players')
    .select('puzzle_id')
    .eq('user_id', ben)
  const puzzleIdler = (benimkiler ?? []).map((r) => (r as { puzzle_id: string }).puzzle_id)
  if (puzzleIdler.length === 0) return []

  const { data: hepsi } = await supabase
    .from('puzzle_players')
    .select('user_id')
    .in('puzzle_id', puzzleIdler)

  const disla = new Set([ben, ...haricTut])
  const digerleri = [
    ...new Set((hepsi ?? []).map((r) => (r as { user_id: string }).user_id)),
  ].filter((id) => !disla.has(id))
  if (digerleri.length === 0) return []

  const adlar = await adlariGetir(digerleri)
  return digerleri.map((id) => ({ id, ad: adlar.get(id) ?? 'İsimsiz' }))
}

export async function arkadaslikIste(kisiId: string): Promise<void> {
  if (!supabase) return
  const { data: oturum } = await supabase.auth.getUser()
  const ben = oturum.user?.id
  if (!ben) throw new Error('Önce giriş yapmalısın')
  const { error } = await supabase
    .from('friendships')
    .insert({ requester: ben, addressee: kisiId })
  if (error) {
    // aynı çift için ikinci kayıt engellenir
    throw new Error(
      error.code === '23505' ? 'Bu kişiye zaten istek gönderilmiş.' : error.message,
    )
  }
}

export async function arkadasligiKabulEt(id: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function arkadasligiSil(id: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('friendships').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ------------------------------------------------------------- mesajlaşma

export interface Mesaj {
  id: string
  metin: string
  benMi: boolean
  ts: string
  okundu: boolean
}

/** Bir arkadaşla olan yazışma, eskiden yeniye */
export async function mesajlariGetir(kisiId: string): Promise<Mesaj[]> {
  if (!supabase) return []
  const { data: oturum } = await supabase.auth.getUser()
  const ben = oturum.user?.id
  if (!ben) return []

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(
      `and(sender.eq.${ben},receiver.eq.${kisiId}),and(sender.eq.${kisiId},receiver.eq.${ben})`,
    )
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) return []

  return (data ?? []).map((m) => {
    const s = m as { id: string; body: string; sender: string; created_at: string; read_at: string | null }
    return { id: s.id, metin: s.body, benMi: s.sender === ben, ts: s.created_at, okundu: !!s.read_at }
  })
}

export async function mesajGonder(kisiId: string, metin: string): Promise<void> {
  if (!supabase) return
  const temiz = metin.trim().slice(0, 1000)
  if (!temiz) return
  const { data: oturum } = await supabase.auth.getUser()
  const ben = oturum.user?.id
  if (!ben) throw new Error('Önce giriş yapmalısın')
  const { error } = await supabase
    .from('messages')
    .insert({ sender: ben, receiver: kisiId, body: temiz })
  if (error) {
    throw new Error(
      error.message.includes('row-level security')
        ? 'Yalnızca arkadaşlarına mesaj gönderebilirsin.'
        : error.message,
    )
  }
}

/** Gelen mesajları okundu işaretle */
export async function okunduIsaretle(kisiId: string): Promise<void> {
  if (!supabase) return
  const { data: oturum } = await supabase.auth.getUser()
  const ben = oturum.user?.id
  if (!ben) return
  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('sender', kisiId)
    .eq('receiver', ben)
    .is('read_at', null)
}

/** Kişi başına okunmamış mesaj sayısı */
export async function okunmamisSayilari(): Promise<Map<string, number>> {
  const harita = new Map<string, number>()
  if (!supabase) return harita
  const { data: oturum } = await supabase.auth.getUser()
  const ben = oturum.user?.id
  if (!ben) return harita
  const { data } = await supabase
    .from('messages')
    .select('sender')
    .eq('receiver', ben)
    .is('read_at', null)
  for (const m of data ?? []) {
    const s = (m as { sender: string }).sender
    harita.set(s, (harita.get(s) ?? 0) + 1)
  }
  return harita
}
