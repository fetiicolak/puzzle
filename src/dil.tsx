// Arayüz dili.
//
// Anahtar olarak Türkçe metnin kendisi kullanılıyor: `ceviri('Kaydet')`.
// Sebep: ayrı anahtar isimleri uydurmak yüzlerce kalem demekti ve sözlükte
// bir kalem eksik kalırsa ekranda anahtar adı görünürdü. Bu düzende eksik
// kalan kalem Türkçe olarak görünür — kırık değil, yalnızca çevrilmemiş.
//
// Kod, yorumlar ve değişken adları Türkçe kalmaya devam ediyor (bkz.
// CLAUDE.md); değişen yalnızca kullanıcıya gösterilen metin.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { SOZLUK } from './sozluk'

export type Dil = 'tr' | 'en'

const ANAHTAR = 'puzzle:dil'

export const DIL_ADI: Record<Dil, string> = {
  tr: 'Türkçe',
  en: 'English',
}

/** Tarayıcının dili İngilizceye yakınsa İngilizce başla */
function varsayilanDil(): Dil {
  try {
    const kayitli = localStorage.getItem(ANAHTAR)
    if (kayitli === 'tr' || kayitli === 'en') return kayitli
  } catch {
    // depolama kapalıysa tarayıcı diline bak
  }
  const tarayici = typeof navigator !== 'undefined' ? navigator.language : 'tr'
  return tarayici.toLowerCase().startsWith('tr') ? 'tr' : 'en'
}

/**
 * Metni çevir ve içindeki {alan} yerlerini doldur.
 *
 * Türkçe seçiliyken sözlüğe hiç bakılmıyor: anahtar zaten Türkçe metin.
 */
export function cevir(
  dil: Dil,
  metin: string,
  degerler?: Record<string, string | number>,
): string {
  let sonuc = dil === 'tr' ? metin : (SOZLUK[metin] ?? metin)
  if (degerler) {
    for (const [ad, deger] of Object.entries(degerler)) {
      sonuc = sonuc.split(`{${ad}}`).join(String(deger))
    }
  }
  return sonuc
}

interface DilDurumu {
  dil: Dil
  /** Kısa ad: bileşenlerin içinde çok geçiyor */
  ceviri: (metin: string, degerler?: Record<string, string | number>) => string
  degistir: (yeni: Dil) => void
}

const Ctx = createContext<DilDurumu | null>(null)

export function DilProvider({ children }: { children: ReactNode }) {
  const [dil, setDil] = useState<Dil>(varsayilanDil)

  useEffect(() => {
    document.documentElement.lang = dil
    try {
      localStorage.setItem(ANAHTAR, dil)
    } catch {
      // depolama kapalıysa seçim yalnızca bu oturumda geçerli
    }
  }, [dil])

  const ceviri = useCallback(
    (metin: string, degerler?: Record<string, string | number>) => cevir(dil, metin, degerler),
    [dil],
  )

  const deger = useMemo<DilDurumu>(
    () => ({ dil, ceviri, degistir: setDil }),
    [dil, ceviri],
  )

  return <Ctx.Provider value={deger}>{children}</Ctx.Provider>
}

export function useDil(): DilDurumu {
  const v = useContext(Ctx)
  if (!v) throw new Error('useDil, DilProvider içinde kullanılmalı')
  return v
}

/**
 * Bileşen dışından (olay işleyicileri, yardımcı fonksiyonlar) çeviri gerektiğinde.
 * Provider'ın yazdığı son dili okur.
 */
export function suankiDil(): Dil {
  // document yoksa (test ortamı, ileride sunucu tarafı) varsayılana düş:
  // bu fonksiyon hataMetni() gibi bileşen dışı yollardan da çağrılıyor ve
  // orada patlaması hatanın kendisini gizliyor.
  if (typeof document === 'undefined') return 'tr'
  return (document.documentElement.lang as Dil) || 'tr'
}
