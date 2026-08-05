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

      async signOut() {
        await supabase?.auth.signOut()
        etkinlikDamgasiniSil()
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
