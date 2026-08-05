// Supabase istemcisi. Ayarlar yoksa uygulama sunucusuz (yalnızca cihazda kayıt)
// modunda çalışmaya devam eder — giriş ve ortak geçmiş özellikleri kapanır.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseEnabled = Boolean(url && key)

const HATIRLA_ANAHTARI = 'puzzle:beni-hatirla'
const EPOSTA_ANAHTARI = 'puzzle:son-eposta'
const ETKINLIK_ANAHTARI = 'puzzle:son-etkinlik'

/**
 * Oturumun açık kalacağı en uzun boşta kalma süresi.
 *
 * "Beni hatırla" e-postayı hatırlar ve sayfayı yenilerken oturumu düşürmez,
 * ama sekme kapatılıp bir süre geçtiyse hesap açık kalmaz; dönüşte yeniden
 * giriş yapılır. Ortak kullanılan bir cihazda hesabın süresiz açık kalmaması
 * için.
 */
export const OTURUM_ZAMAN_ASIMI_MS = 10 * 60 * 1000

/** "Beni hatırla" işaretli mi (varsayılan: evet) */
export function beniHatirla(): boolean {
  try {
    return localStorage.getItem(HATIRLA_ANAHTARI) !== '0'
  } catch {
    return true
  }
}

/** Giriş formunda hazır gelsin diye son kullanılan e-posta */
export function hatirlananEposta(): string {
  try {
    return beniHatirla() ? (localStorage.getItem(EPOSTA_ANAHTARI) ?? '') : ''
  } catch {
    return ''
  }
}

export function epostayiHatirla(eposta: string): void {
  try {
    if (beniHatirla() && eposta.trim()) {
      localStorage.setItem(EPOSTA_ANAHTARI, eposta.trim())
    } else {
      localStorage.removeItem(EPOSTA_ANAHTARI)
    }
  } catch {
    // yoksay
  }
}

/** Son etkinlik anını damgala (sekme kapanırken / arka plana geçerken) */
export function etkinligiDamgala(): void {
  try {
    localStorage.setItem(ETKINLIK_ANAHTARI, String(Date.now()))
  } catch {
    // yoksay
  }
}

/** Uygulamadan uzak kalınan süre sınırı aştı mı */
export function oturumZamanAsimiMi(): boolean {
  try {
    const son = Number(localStorage.getItem(ETKINLIK_ANAHTARI) ?? 0)
    if (!son) return false
    return Date.now() - son > OTURUM_ZAMAN_ASIMI_MS
  } catch {
    return false
  }
}

export function etkinlikDamgasiniSil(): void {
  try {
    localStorage.removeItem(ETKINLIK_ANAHTARI)
  } catch {
    // yoksay
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

/**
 * Supabase hatalarını kullanıcıya gösterilebilir Türkçe metne çevir.
 * Yalnızca giriş akışında değil, tanımadığımız her sunucu hatasında
 * kullanılıyor — ham İngilizce metin kullanıcıya gösterilmesin.
 */
export function hataMetni(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('row-level security') || m.includes('violates'))
    return 'Bu işlem için yetkin yok.'
  if (m.includes('failed to fetch') || m.includes('networkerror'))
    return 'Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.'
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
