/**
 * Fotoğrafı olmayan kişiler için baş harfler.
 *
 * Tek kelime ise tek harf, birden çok kelime ise ilk ve son kelimenin
 * baş harfleri: "FETİ ÇOLAK" -> "FÇ". Türkçe büyütme kuralı kullanılıyor,
 * yoksa "ipek" -> "IPEK" oluyor.
 */
export function basHarfler(ad: string | null | undefined): string {
  const kelimeler = (ad ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (kelimeler.length === 0) return '?'
  const buyut = (s: string) => s.charAt(0).toLocaleUpperCase('tr')
  if (kelimeler.length === 1) return buyut(kelimeler[0])
  return buyut(kelimeler[0]) + buyut(kelimeler[kelimeler.length - 1])
}
