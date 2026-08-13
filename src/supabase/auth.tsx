// Oturum yönetimi. Supabase ayarlı değilse uygulama misafir modunda çalışır:
// giriş ve ortak geçmiş kapalı, kayıtlar yalnızca cihazda tutulur.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { cevir, suankiDil } from '../dil'
import { oturumVerisiniTemizle } from '../storage'
import { nabizAt } from './profile'
import {
  hataMetni,
  epostayiHatirla,
  etkinligiDamgala,
  etkinlikDamgasiniSil,
  oturumZamanAsimiMi,
  supabase,
  supabaseEnabled,
} from './client'

interface AuthState {
  /** Supabase yapılandırılmış mı */
  enabled: boolean
  /** İlk oturum kontrolü sürüyor mu */
  loading: boolean
  user: User | null
  displayName: string
  signUp: (email: string, password: string, displayName: string) => Promise<string | null>
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  /** Şifre sıfırlama bağlantısı gönder */
  sifreSifirla: (email: string) => Promise<string | null>
  /** Kurtarma bağlantısıyla gelindikten sonra yeni şifreyi yaz */
  sifreyiDegistir: (yeniSifre: string) => Promise<string | null>
  /** Profilden şifre değiştir — mevcut şifre doğrulanır */
  sifreyiGuncelle: (mevcutSifre: string, yeniSifre: string) => Promise<string | null>
  /** E-posta değiştir; yeni adrese onay bağlantısı gider */
  epostayiDegistir: (yeniEposta: string) => Promise<string | null>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(supabaseEnabled)

  useEffect(() => {
    if (!supabase) return
    let iptal = false

    // Uygulamadan uzun süre uzak kalındıysa hesabı açık bırakma
    const baslat = async () => {
      if (oturumZamanAsimiMi()) {
        await supabase!.auth.signOut()
        etkinlikDamgasiniSil()
        if (!iptal) {
          setSession(null)
          setLoading(false)
        }
        return
      }
      const { data } = await supabase!.auth.getSession()
      if (iptal) return
      setSession(data.session)
      setLoading(false)
    }
    void baslat()

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!iptal) setSession(s)
    })

    // Sekme kapanırken / arka plana geçerken son etkinlik anını yaz;
    // geri dönüldüğünde süre aşılmışsa oturum kapanır.
    const gizlendi = () => {
      if (document.visibilityState === 'hidden') etkinligiDamgala()
      else if (oturumZamanAsimiMi()) {
        void supabase!.auth.signOut().then(() => {
          etkinlikDamgasiniSil()
          if (!iptal) setSession(null)
        })
      } else {
        etkinligiDamgala()
      }
    }
    const ayrilirken = () => etkinligiDamgala()
    document.addEventListener('visibilitychange', gizlendi)
    window.addEventListener('pagehide', ayrilirken)
    window.addEventListener('beforeunload', ayrilirken)
    // Açıkken damga tazelensin ki kullanırken oturum düşmesin
    const tik = setInterval(() => {
      if (document.visibilityState === 'visible') etkinligiDamgala()
    }, 60_000)
    etkinligiDamgala()

    return () => {
      iptal = true
      sub.subscription.unsubscribe()
      document.removeEventListener('visibilitychange', gizlendi)
      window.removeEventListener('pagehide', ayrilirken)
      window.removeEventListener('beforeunload', ayrilirken)
      clearInterval(tik)
    }
  }, [])

  // Arkadaşlara "şu an sitede" görünmek için düzenli damga. Sekme arka plana
  // düştüğünde durur: başka bir sekmede açık unutulan site kişiyi sonsuza
  // kadar çevrimiçi göstermemeli.
  const uid = session?.user?.id ?? null
  useEffect(() => {
    if (!supabase || !uid) return
    const at = () => {
      if (document.visibilityState === 'visible') void nabizAt(uid).catch(() => {})
    }
    at()
    const zamanlayici = setInterval(at, 60_000)
    document.addEventListener('visibilitychange', at)
    return () => {
      clearInterval(zamanlayici)
      document.removeEventListener('visibilitychange', at)
    }
  }, [uid])

  const value = useMemo<AuthState>(() => {
    const user = session?.user ?? null
    return {
      enabled: supabaseEnabled,
      loading,
      user,
      displayName:
        (user?.user_metadata?.display_name as string | undefined) ??
        user?.email?.split('@')[0] ??
        '',

      async signUp(email, password, displayName) {
        if (!supabase) return 'Sunucu bağlantısı yapılandırılmamış.'
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() } },
        })
        return error ? hataMetni(error.message) : null
      },

      async signIn(email, password) {
        if (!supabase) return 'Sunucu bağlantısı yapılandırılmamış.'
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (!error) {
          // e-posta bir dahakine hazır gelsin, oturum sayacı sıfırlansın
          epostayiHatirla(email)
          etkinligiDamgala()
        }
        return error ? hataMetni(error.message) : null
      },

      async sifreSifirla(email) {
        if (!supabase) return 'Sunucu bağlantısı yapılandırılmamış.'
        // Bağlantıya tıklayınca sitenin kendisine dönsün; kurtarma jetonu
        // adres çubuğundaki # kısmında gelir (bkz. client.ts kurtarmaJetonu)
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: location.origin + location.pathname,
        })
        return error ? hataMetni(error.message) : null
      },

      async sifreyiDegistir(yeniSifre) {
        if (!supabase) return 'Sunucu bağlantısı yapılandırılmamış.'
        const { error } = await supabase.auth.updateUser({ password: yeniSifre })
        return error ? hataMetni(error.message) : null
      },

      /*
        Profilden şifre değiştirme. Sıfırlama akışından farkı, mevcut şifrenin
        sorulması: Supabase açık oturumda eski şifreyi istemiyor, yani açık
        unutulmuş bir cihazın başına geçen kişi hesabı devralabiliyordu.
        Doğrulamayı signInWithPassword ile yapıyoruz — sunucuya soruyor.
      */
      async sifreyiGuncelle(mevcutSifre, yeniSifre) {
        if (!supabase) return 'Sunucu bağlantısı yapılandırılmamış.'
        const eposta = session?.user?.email
        if (!eposta) return cevir(suankiDil(), 'Oturum bulunamadı, yeniden giriş yap.')
        const { error: dogrulama } = await supabase.auth.signInWithPassword({
          email: eposta,
          password: mevcutSifre,
        })
        if (dogrulama) return cevir(suankiDil(), 'Mevcut şifren yanlış.')
        const { error } = await supabase.auth.updateUser({ password: yeniSifre })
        if (!error) etkinligiDamgala()
        return error ? hataMetni(error.message) : null
      },

      /*
        E-posta değişikliği hemen olmuyor: Supabase yeni adrese (ve "secure
        email change" açıksa eskisine de) onay bağlantısı gönderiyor, adres
        ancak tıklandıktan sonra değişiyor. Arayüz bunu böyle anlatmalı,
        yoksa kullanıcı değişti sanıp eski adresiyle giriş yapamıyor.
      */
      async epostayiDegistir(yeniEposta) {
        if (!supabase) return 'Sunucu bağlantısı yapılandırılmamış.'
        const { error } = await supabase.auth.updateUser(
          { email: yeniEposta.trim() },
          { emailRedirectTo: location.origin + location.pathname },
        )
        return error ? hataMetni(error.message) : null
      },

      async signOut() {
        await supabase?.auth.signOut()
        etkinlikDamgasiniSil()
        // Cihazdaki fotoğraflar ve gizli notlar da gitsin — ortak
        // bilgisayarda sıradaki kişi onları görmemeli
        oturumVerisiniTemizle()
      },
    }
  }, [session, loading])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth, AuthProvider içinde kullanılmalı')
  return v
}
