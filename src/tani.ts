/*
  Tanılama bayrağı (#tani).

  Neden ayrı dosya ve neden sessionStorage: adres çubuğunun `#` parçası oda
  kodu için kullanılıyor ve oyuna girerken temizleniyor. `GameScreen` gecikmeli
  yüklendiği için bayrağı ancak temizlendikten sonra görüyordu — katman hiç
  çıkmıyordu. Bayrak bu yüzden açılışta, her şeyden önce okunup oturuma
  yazılıyor.

  sessionStorage bilerek: tanılama açık bir sekme yenilendiğinde açık kalsın,
  ama sekme kapanınca kendiliğinden sönsün. `acikOyun.ts` de aynı gerekçeyle
  sessionStorage kullanıyor.
*/
const ANAHTAR = 'puzzle:tani'

/** Açılışta bir kez, adres temizlenmeden önce çağrılır (`main.tsx`) */
export function taniBaslat(): void {
  if (!/(^|[#&?])tani\b/.test(location.hash + location.search)) return
  try {
    sessionStorage.setItem(ANAHTAR, '1')
  } catch {
    // depolama kapalıysa tanılama bu sayfa için çalışmaz; oyun etkilenmez
  }
}

/** Tanılama katmanı çizilsin mi */
export function taniAcikMi(): boolean {
  try {
    return sessionStorage.getItem(ANAHTAR) === '1'
  } catch {
    return false
  }
}
