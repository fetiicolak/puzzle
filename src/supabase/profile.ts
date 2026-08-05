// Profil bilgileri: ad, fotoğraf, doğum yılı, cinsiyet.
//
// Yaş yerine doğum yılı tutuluyor; yaş her yıl kendiliğinden doğru kalsın.
// Fotoğraflar ayrı bir kovada ve özel; görünürlüğü profil kuralıyla aynı
// (bkz. supabase/schema.sql -> avatar_gorulebilir).

import { supabase } from './client'

const BUCKET = 'avatars'

export type Cinsiyet = 'kadin' | 'erkek'

export const CINSIYET_ADI: Record<Cinsiyet, string> = {
  kadin: 'Kadın',
  erkek: 'Erkek',
}

export interface Profil {
  id: string
  ad: string
  avatarPath: string | null
  dogumYili: number | null
  cinsiyet: Cinsiyet | null
}

/** Doğum yılından yaş; yıl mantıksızsa null */
export function yas(dogumYili: number | null): number | null {
  if (!dogumYili) return null
  const y = new Date().getFullYear() - dogumYili
  return y >= 0 && y < 130 ? y : null
}

function satirdanProfil(s: Record<string, unknown>): Profil {
  return {
    id: String(s.id),
    ad: (s.display_name as string) || 'İsimsiz',
    avatarPath: (s.avatar_path as string) ?? null,
    dogumYili: (s.birth_year as number) ?? null,
    cinsiyet: (s.gender as Cinsiyet) ?? null,
  }
}

/** Kendi profilin. Şema güncel değilse eski sütunlarla geri düşer. */
export async function profilimiGetir(): Promise<Profil | null> {
  if (!supabase) return null
  const { data: oturum } = await supabase.auth.getUser()
  const ben = oturum.user?.id
  if (!ben) return null

  const { data, error } = await supabase.from('profiles').select('*').eq('id', ben).maybeSingle()
  if (error || !data) return null
  return satirdanProfil(data as Record<string, unknown>)
}

export async function profilKaydet(alanlar: {
  ad?: string
  dogumYili?: number | null
  cinsiyet?: Cinsiyet | null
  avatarPath?: string | null
}): Promise<void> {
  if (!supabase) return
  const { data: oturum } = await supabase.auth.getUser()
  const ben = oturum.user?.id
  if (!ben) throw new Error('Önce giriş yapmalısın')

  const guncelle: Record<string, unknown> = {}
  if (alanlar.ad !== undefined) guncelle.display_name = alanlar.ad.trim().slice(0, 40)
  if (alanlar.dogumYili !== undefined) guncelle.birth_year = alanlar.dogumYili
  if (alanlar.cinsiyet !== undefined) guncelle.gender = alanlar.cinsiyet
  if (alanlar.avatarPath !== undefined) guncelle.avatar_path = alanlar.avatarPath
  if (Object.keys(guncelle).length === 0) return

  let { error } = await supabase.from('profiles').update(guncelle).eq('id', ben)

  // Şemanın son sürümü çalıştırılmadıysa yeni alanlar olmayabilir; en azından
  // ad kaydedilsin ve kullanıcıya ne eksik olduğu söylensin.
  if (error && /column .* does not exist|Could not find the '.*' column/i.test(error.message)) {
    const sadeceAd = guncelle.display_name
    if (sadeceAd === undefined) {
      throw new Error('Profil alanları için veritabanı güncellemesi gerekiyor.')
    }
    ;({ error } = await supabase
      .from('profiles')
      .update({ display_name: sadeceAd })
      .eq('id', ben))
    if (!error) {
      await supabase.auth.updateUser({ data: { display_name: sadeceAd } })
      throw new Error(
        'Adın kaydedildi ama doğum yılı ve cinsiyet için veritabanı güncellemesi gerekiyor (supabase/schema.sql).',
      )
    }
  }
  if (error) throw new Error(error.message)

  // Ad, hesabın üst verisinde de duruyor (oturum açar açmaz orada okunuyor)
  if (alanlar.ad !== undefined) {
    await supabase.auth.updateUser({ data: { display_name: alanlar.ad.trim().slice(0, 40) } })
  }
}

/**
 * Profil fotoğrafını yükle ve yolunu döndür. Dosya adına zaman damgası
 * ekleniyor: aynı yola ikinci kez yazmak yerine yenisini koyup eskiyi siliyoruz,
 * böylece tarayıcı önbelleği eski fotoğrafı göstermiyor.
 */
export async function avatarYukle(blob: Blob, oncekiYol?: string | null): Promise<string> {
  if (!supabase) throw new Error('Sunucu bağlantısı yok')
  const { data: oturum } = await supabase.auth.getUser()
  const ben = oturum.user?.id
  if (!ben) throw new Error('Önce giriş yapmalısın')

  const yol = `${ben}/${Date.now().toString(36)}.jpg`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(yol, blob, { contentType: 'image/jpeg' })
  if (error) throw new Error(`Fotoğraf yüklenemedi: ${error.message}`)

  if (oncekiYol && oncekiYol !== yol) {
    await supabase.storage.from(BUCKET).remove([oncekiYol])
  }
  return yol
}

export async function avatarSil(yol: string | null): Promise<void> {
  if (!supabase || !yol) return
  await supabase.storage.from(BUCKET).remove([yol])
}

/** Depodaki avatarı görüntülenebilir adrese çevir */
export async function avatarUrl(yol: string | null | undefined): Promise<string | null> {
  if (!supabase || !yol) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(yol, 60 * 60)
  return error ? null : data.signedUrl
}

/** Birden çok avatarı tek seferde adrese çevir (yol -> url) */
export async function avatarUrlleri(yollar: (string | null | undefined)[]): Promise<Map<string, string>> {
  const harita = new Map<string, string>()
  const temiz = [...new Set(yollar.filter(Boolean) as string[])]
  if (!supabase || temiz.length === 0) return harita
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(temiz, 60 * 60)
  if (error || !data) return harita
  for (const g of data) {
    if (g.signedUrl && g.path) harita.set(g.path, g.signedUrl)
  }
  return harita
}

/** Bir kovadaki kendi klasörünü tamamen boşalt */
async function klasoruBosalt(kova: string, uid: string): Promise<void> {
  if (!supabase) return
  const { data } = await supabase.storage.from(kova).list(uid, { limit: 1000 })
  const yollar = (data ?? []).map((d) => `${uid}/${d.name}`)
  if (yollar.length > 0) await supabase.storage.from(kova).remove(yollar)
}

/**
 * Hesabı ve ona bağlı her şeyi sil.
 *
 * İki adım, bu sırayla:
 *  1. Depodaki dosyalar — Storage API ile. Supabase, SQL'den storage.objects
 *     silmeyi engelliyor, bu yüzden sunucu fonksiyonu bunu yapamıyor.
 *  2. Tablolar ve hesabın kendisi — hesabi_sil() RPC'si, tek işlemde.
 *
 * Arada kesinti olursa dosyalar gitmiş, hesap durur; kullanıcı tekrar
 * deneyebilir. Tersi sırada sahipsiz dosyalar geride kalır ve artık
 * silinemezdi (kaydı olmayan dosyaya erişim kuralı izin vermiyor).
 */
export async function hesabiSil(): Promise<void> {
  if (!supabase) throw new Error('Sunucu bağlantısı yok')
  const { data: oturum } = await supabase.auth.getUser()
  const ben = oturum.user?.id
  if (!ben) throw new Error('Önce giriş yapmalısın')

  await klasoruBosalt('puzzle-images', ben)
  await klasoruBosalt('avatars', ben)

  const { error } = await supabase.rpc('hesabi_sil')
  if (error) throw new Error(error.message)
  await supabase.auth.signOut()
}

/**
 * Fotoğrafı kareye kırpıp küçült. Avatar için 2 MB sınırı var; telefondan
 * gelen ham fotoğraf bunu rahat aşıyor.
 */
export async function avatarHazirla(dosya: File, boyut = 256): Promise<Blob> {
  const url = URL.createObjectURL(dosya)
  try {
    const img = await new Promise<HTMLImageElement>((coz, hata) => {
      const i = new Image()
      i.onload = () => coz(i)
      i.onerror = () => hata(new Error('Görsel açılamadı'))
      i.src = url
    })
    const kenar = Math.min(img.naturalWidth, img.naturalHeight)
    const sx = (img.naturalWidth - kenar) / 2
    const sy = (img.naturalHeight - kenar) / 2
    const tuval = document.createElement('canvas')
    tuval.width = boyut
    tuval.height = boyut
    const ctx = tuval.getContext('2d')
    if (!ctx) throw new Error('Görsel işlenemedi')
    ctx.drawImage(img, sx, sy, kenar, kenar, 0, 0, boyut, boyut)
    return await new Promise<Blob>((coz, hata) =>
      tuval.toBlob(
        (b) => (b ? coz(b) : hata(new Error('Görsel işlenemedi'))),
        'image/jpeg',
        0.85,
      ),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}
