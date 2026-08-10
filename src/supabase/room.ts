// Oda katılımcıları ve yetkileri.
//
// Kurallar sunucuda (supabase/schema.sql -> oyuncu_cikar / yetki_ayarla):
// odayı kuran herkesi çıkarabilir ve çıkarma yetkisi verip alabilir; yetki
// verilen kişi yalnızca sıradan katılımcıyı çıkarabilir, kurucuya ya da başka
// bir yetkiliye dokunamaz, yetki de dağıtamaz. Arayüz bu kuralları yalnızca
// gösterir — kararı sunucu verir.

import { supabase } from './client'

export type OdaRolu = 'owner' | 'mod' | 'player'

export interface OdaKisisi {
  id: string
  ad: string
  rol: OdaRolu
  avatarPath: string | null
}

export const ROL_ADI: Record<OdaRolu, string> = {
  owner: 'kurucu',
  mod: 'yetkili',
  player: '',
}

/** Odadaki kişiler; kurucu başta */
export async function odaKatilimcilari(puzzleId: string): Promise<OdaKisisi[]> {
  if (!supabase) return []
  // Yanıt bütün olarak: `data` alanı `any`, parçalayınca tip güvenliği kaybolur
  const cevap = await supabase.rpc('oda_katilimcilari', { p_puzzle: puzzleId })
  if (cevap.error || !cevap.data) return []
  return (cevap.data as Record<string, unknown>[]).map((s) => ({
    id: String(s.user_id),
    ad: (s.ad as string) || 'İsimsiz',
    rol: (s.rol as OdaRolu) ?? 'player',
    avatarPath: (s.avatar_path as string) ?? null,
  }))
}

function anlamliHata(mesaj: string): string {
  if (mesaj.includes('yetkin yok')) return 'Bunu yapma yetkin yok.'
  if (mesaj.includes('odayi kuran kisi cikarilamaz')) return 'Odayı kuran kişi çıkarılamaz.'
  if (mesaj.includes('yetkili bir kisiyi')) {
    return 'Yetkili birini yalnızca odayı kuran çıkarabilir.'
  }
  if (mesaj.includes('yetkiyi yalnizca odayi kuran')) {
    return 'Yetki vermeyi yalnızca odayı kuran yapabilir.'
  }
  if (mesaj.includes('odayi kuranin yetkisi')) return 'Odayı kuranın yetkisi değiştirilemez.'
  if (mesaj.includes('kendini cikaramazsin')) return 'Kendini çıkaramazsın.'
  if (mesaj.includes('kisi odada degil')) return 'Bu kişi artık odada değil.'
  return mesaj
}

/** Kişiyi odadan çıkar; aynı davet linkiyle geri giremez */
export async function oyuncuCikar(puzzleId: string, kisiId: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.rpc('oyuncu_cikar', {
    p_puzzle: puzzleId,
    p_user: kisiId,
  })
  if (error) throw new Error(anlamliHata(error.message))
}

/** Çıkarma yetkisini ver ya da geri al (yalnızca kurucu) */
export async function yetkiAyarla(
  puzzleId: string,
  kisiId: string,
  yetkili: boolean,
): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.rpc('yetki_ayarla', {
    p_puzzle: puzzleId,
    p_user: kisiId,
    p_yetkili: yetkili,
  })
  if (error) throw new Error(anlamliHata(error.message))
}
