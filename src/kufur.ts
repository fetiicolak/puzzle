/*
  Küfür ve tehdit süzgeci — istemci tarafı.

  Neden burada da var: hesaplar arası mesajlaşma sunucudan geçiyor ve orada
  `kaba_mi()` süzüyor, ama **oyun içi sohbet P2P**. O metin sunucuya hiç
  uğramıyor; sunucuda süzmek için sohbeti sunucuya taşımak gerekirdi, bu da
  her satır için veritabanı yazması demek — hem masraf hem gereksiz gecikme.
  Süzgecin kendisi saf bir düzenli ifade, çalıştırması bedava.

  İki uçta birden çalışıyor ve asıl güç ikincisinde:
  - Gönderirken: yazan kişi mesajının gitmediğini görüyor.
  - Alırken: gelen mesaj gösterilmiyor. Karşı taraf bizim kodumuzu çalıştırmak
    zorunda değil (konsoldan elle mesaj gönderilebilir), ama **senin** neyi
    göreceğine senin cihazın karar veriyor. Yalnızca gönderirken süzmek, kodu
    değiştiren birinin karşısında hiçbir şey ifade etmezdi.

  Sözlük `supabase/schema.sql`'deki `kaba_mi()` ile birebir aynı; `kufur.test.ts`
  iki dosyayı karşılaştırıyor ve ayrışırlarsa düşüyor.
*/

/**
 * Bağlamı ne olursa olsun hakaret ya da tehdit sayılan kalıplar.
 *
 * Bilerek dar. Geniş bir liste normal cümleleri de eliyor ve eleme sessiz
 * değil — kullanıcı mesajının gitmediğini görüyor. Yanlış pozitif burada
 * kaçırılan bir küfürden pahalı.
 */
export const KUFUR_KALIPLARI = [
  // hakaret
  'orospu',
  'piç',
  'yarra',
  'amc[ıi][kğ]',
  'am[ıi]na',
  'sikey',
  'siktir',
  'sikik',
  'siker',
  'sikm',
  'ibne',
  'kahpe',
  'pezevenk',
  'gavat',
  'sürtük',
  'yavşak',
  'şerefsiz',
  'puşt',
  'kaltak',
  'göt\\M',
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'cunt',
  'whore',
  'bastard',
  'dickhead',
  // tehdit
  'öldürece',
  'öldürürüm',
  'öldürürüz',
  'gebert',
  'geber\\M',
  'canına oku',
  'kill you',
  'i will kill',
]

/*
  Kelime **başı** sınırı var (\m), sonu yok: Türkçe ek alıyor ("orospusun",
  "gebertirim"). Kısa kökler bu yüzden listede tam yazılıyor — "göt" kendi
  sonu sınırıyla giriyor, yoksa "götürmek" de takılırdı.

  JavaScript'te \m/\M yok ve `\b` de işe yaramıyor: `\w` yalnızca ASCII
  sayıyor, yani "öldüreceğim" kelimesinin başında boşluk olsa bile `\b`
  eşleşmiyordu (boşluk da 'ö' de \w değil). Sınırlar bu yüzden Unicode
  harf/rakam bakan ileri-geri bakışlarla yazılıyor.
*/
const BAS = '(?<![\\p{L}\\p{N}])'
const SON = '(?![\\p{L}\\p{N}])'
const KALIP = new RegExp(
  BAS + '(' + KUFUR_KALIPLARI.map((k) => k.replace(/\\M/g, SON)).join('|') + ')',
  'iu',
)

/**
 * Türkçe büyük harf düzeltmesi.
 *
 * `toLowerCase()` 'İ'yi 'i' + birleşen nokta yapıyor, 'I'yı da 'i'; ikisi de
 * kalıba uymuyor ve büyük harfle yazılmış küfür ("SİKTİR") süzgeçten geçiyordu.
 * Şemadaki `kaba_mi()` aynı işi `translate(..., 'İI', 'iı')` ile yapıyor.
 */
const kucult = (metin: string) => metin.replace(/İ/g, 'i').replace(/I/g, 'ı')

/** Metin hakaret ya da tehdit içeriyor mu */
export function kabaMi(metin: string): boolean {
  return KALIP.test(kucult(metin ?? ''))
}
