// Supabase istemcisi. Ayarlar yoksa uygulama sunucusuz (yalnızca cihazda kayıt)
// modunda çalışmaya devam eder — giriş ve ortak geçmiş özellikleri kapanır.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseEnabled = Boolean(url && key)

const HATIRLA_ANAHTARI = 'puzzle:beni-hatirla'

/** "Beni hatırla" işaretli mi (varsayılan: evet) */
export function beniHatirla(): boolean {
  try {
    return localStorage.getItem(HATIRLA_ANAHTARI) !== '0'
  } catch {
    return true
  }
}

export function beniHatirlaAyarla(deger: boolean): void {
  try {
    localStorage.setItem(HATIRLA_ANAHTARI, deger ? '1' : '0')
    // tercih değişince oturumu doğru yere taşı
    const digeri = deger ? sessionStorage : localStorage
    const hedef = deger ? localStorage : sessionStorage
    for (const k of Object.keys(digeri)) {
      if (k.startsWith('sb-')) {
        hedef.setItem(k, digeri.getItem(k)!)
        digeri.removeItem(k)
      }
    }
  } catch {
    // depolama kapalıysa oturum yine de bu sekmede çalışır
  }
}

/**
 * Oturum, tercihe göre kalıcı (localStorage) ya da sekmelik (sessionStorage)
 * saklanır. Supabase istemcisi bir kez kurulduğu için seçim okuma anında
 * yapılıyor; böylece kullanıcı tercihini değiştirdiğinde yeniden kurmak
 * gerekmiyor.
 */
const oturumDeposu = {
  getItem: (k: string) => {
    try {
      return localStorage.getItem(k) ?? sessionStorage.getItem(k)
    } catch {
      return null
    }
  },
  setItem: (k: string, v: string) => {
    try {
      ;(beniHatirla() ? localStorage : sessionStorage).setItem(k, v)
    } catch {
      // yoksay
    }
  },
  removeItem: (k: string) => {
    try {
      localStorage.removeItem(k)
      sessionStorage.removeItem(k)
    } catch {
      // yoksay
    }
  },
}

export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storage: oturumDeposu,
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
