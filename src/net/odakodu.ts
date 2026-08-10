// Oda kodu üretimi.
//
// Kendi dosyasında duruyor, peer.ts'in içinde değil: App.tsx kurulum ekranında
// oda kodunu tek başına oynarken de üretiyor ve peer.ts'ten almak PeerJS'in
// (~200 KB) açılış paketine girmesine yol açıyordu. Oyun ekranı artık gecikmeli
// yükleniyor (App.tsx'teki lazy), bu küçük fonksiyonun ayrılması da o ayrımın
// bozulmaması için.

/**
 * Adres çubuğunda paylaşılabilecek kısa oda kodu.
 *
 * Alfabede birbirine benzeyen harfler yok (i/l/1, o/0): kod elle
 * yazıldığında ya da telefonda okunduğunda karışmasın.
 */
export function randomRoomCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  let code = ''
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  for (const b of bytes) code += alphabet[b % alphabet.length]
  return code
}
