// Supabase istemcisi. Ayarlar yoksa uygulama sunucusuz (yalnızca cihazda kayıt)
// modunda çalışmaya devam eder — giriş ve ortak geçmiş özellikleri kapanır.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseEnabled = Boolean(url && key)

export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // #room=... bağlantısıyla çakışmasın diye oturum bilgisini
        // adres çubuğundan okuma
        detectSessionInUrl: false,
      },
    })
  : null

/** Supabase hatalarını kullanıcıya gösterilebilir Türkçe metne çevir */
export function authErrorText(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-posta veya şifre hatalı.'
  if (m.includes('user already registered') || m.includes('already been registered'))
    return 'Bu e-posta zaten kayıtlı. Giriş yapmayı deneyin.'
  if (m.includes('password should be at least'))
    return 'Şifre en az 6 karakter olmalı.'
  if (m.includes('unable to validate email') || m.includes('invalid email'))
    return 'Geçerli bir e-posta adresi girin.'
  if (m.includes('email not confirmed'))
    return 'E-postanızı doğrulamanız gerekiyor. Gelen kutunuzu kontrol edin.'
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.'
  return message
}
