// Supabase istemcisi. Ayarlar yoksa uygulama sunucusuz (yalnızca cihazda kayıt)
// modunda çalışmaya devam eder — giriş ve ortak geçmiş özellikleri kapanır.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cevir, suankiDil } from '../dil'

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

/**
 * Şifre sıfırlama bağlantısıyla mı gelindi.
 *
 * detectSessionInUrl kapalı (adres çubuğundaki #room=... ile çakışmasın diye),
 * bu yüzden kurtarma jetonunu elle okuyoruz. Supabase bağlantıyı
 * #access_token=...&refresh_token=...&type=recovery biçiminde döndürür.
 */
export function kurtarmaJetonu(): { access_token: string; refresh_token: string } | null {
  try {
    const h = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash
    if (!h.includes('type=recovery')) return null
    const p = new URLSearchParams(h)
    const access_token = p.get('access_token')
    const refresh_token = p.get('refresh_token')
    if (!access_token || !refresh_token) return null
    return { access_token, refresh_token }
  } catch {
    return null
  }
}

/** Kurtarma jetonunu adres çubuğundan temizle (geçmişe yazmadan) */
export function kurtarmaJetonunuTemizle(): void {
  try {
    history.replaceState(null, '', location.pathname + location.search)
  } catch {
    // yoksay
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
 * Veritabanı tetikleyicilerinin `raise exception` metinleri.
 *
 * Bunlar SQL dosyasında ASCII yazılıyor (`gunluk puzzle sinirina ulastin`) —
 * orada Türkçe karakter kullanmamak bilinçli bir tercih. Ama kullanıcıya da
 * aynen böyle gösteriliyorlardı: ne Türkçesi doğru ne İngilizcesi vardı.
 * Burada tek noktadan çevriliyor.
 *
 * Anahtar, hata metninde geçen ayırt edici parça (küçük harfe çevrilmiş
 * metinde aranıyor). Yeni bir `raise exception` eklersen buraya da bir satır
 * ekle — yoksa kullanıcı ham sunucu metnini görür.
 */
const SUNUCU_HATALARI: [string, string][] = [
  ['oda bulunamadi', 'Böyle bir oda bulunamadı. Linki kontrol et.'],
  ['puzzle henuz acilmadi', 'Bu puzzle henüz açılmadı. Özel gün için saklanmış.'],
  ['odadan cikarildin', 'Bu odadan çıkarıldın.'],
  ['sahiplik degistirilemez', 'Puzzle’ın sahibi değiştirilemez.'],
  [
    'bu alani yalnizca puzzle sahibi degistirebilir',
    'Bunu yalnızca puzzle’ı kuran kişi değiştirebilir.',
  ],
  ['bu odanin katilimcisi degilsin', 'Bu odanın katılımcısı değilsin.'],
  ['kisi odada degil', 'Bu kişi artık odada değil.'],
  ['kendini cikaramazsin', 'Kendini odadan çıkaramazsın.'],
  ['odayi kuran kisi cikarilamaz', 'Odayı kuran kişi çıkarılamaz.'],
  [
    'yetkili bir kisiyi yalnizca odayi kuran cikarabilir',
    'Yetkili birini yalnızca odayı kuran çıkarabilir.',
  ],
  ['yetkiyi yalnizca odayi kuran verebilir', 'Yetkiyi yalnızca odayı kuran verebilir.'],
  ['odayi kuranin yetkisi degistirilemez', 'Odayı kuranın yetkisi değiştirilemez.'],
  ['arkadaslik taraflari degistirilemez', 'Bu arkadaşlık kaydı değiştirilemez.'],
  ['gecersiz arkadaslik durumu degisikligi', 'Bu arkadaşlık isteği böyle güncellenemez.'],
  ['mesaj icerigi degistirilemez', 'Gönderilmiş bir mesajın içeriği değiştirilemez.'],
  [
    'gunluk puzzle sinirina ulastin',
    'Bugünlük puzzle oluşturma sınırına ulaştın. Yarın tekrar dene.',
  ],
  ['cok hizli mesaj gonderiyorsun', 'Çok hızlı mesaj gönderiyorsun. Biraz bekleyip tekrar dene.'],
  [
    'gunluk arkadaslik istegi sinirina ulastin',
    'Bugünlük arkadaşlık isteği sınırına ulaştın. Yarın tekrar dene.',
  ],
  ['gunluk sikayet sinirina ulastin', 'Bugünlük şikayet sınırına ulaştın.'],
  ['oturum yok', 'Önce giriş yapmalısın.'],
  // Yetki metni en sonda: "yetkin yok" başka satırların içinde de geçebilir,
  // daha belirli olanlar önce eşleşsin.
  ['yetkin yok', 'Bu işlem için yetkin yok.'],
]

/**
 * Supabase hatalarını kullanıcıya gösterilebilir Türkçe metne çevir.
 * Yalnızca giriş akışında değil, tanımadığımız her sunucu hatasında
 * kullanılıyor — ham İngilizce metin kullanıcıya gösterilmesin.
 */
export function hataMetni(message: string): string {
  // Bileşen değil, düz fonksiyon: dil <html lang>'ten okunuyor (bkz. dil.tsx)
  const c = (t: string) => cevir(suankiDil(), t)
  const m = message.toLowerCase()

  for (const [anahtar, metin] of SUNUCU_HATALARI) {
    if (m.includes(anahtar)) return c(metin)
  }

  if (m.includes('row-level security') || m.includes('violates'))
    return c('Bu işlem için yetkin yok.')
  if (m.includes('failed to fetch') || m.includes('networkerror'))
    return c('Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.')
  if (m.includes('invalid login credentials')) return c('E-posta veya şifre hatalı.')
  if (m.includes('user already registered') || m.includes('already been registered'))
    return c('Bu e-posta zaten kayıtlı. Giriş yapmayı deneyin.')
  if (m.includes('password should be at least')) return c('Şifre en az 6 karakter olmalı.')
  if (m.includes('unable to validate email') || m.includes('invalid email'))
    return c('Geçerli bir e-posta adresi girin.')
  if (m.includes('email not confirmed'))
    return c('E-postanızı doğrulamanız gerekiyor. Gelen kutunuzu kontrol edin.')
  if (m.includes('rate limit') || m.includes('too many'))
    return c('Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.')
  return message
}
