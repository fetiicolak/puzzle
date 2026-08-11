/// <reference types="vite/client" />

/*
  `?raw` ile alınan SQL. Yalnızca testte kullanılıyor: `kufur.test.ts`,
  istemcideki küfür sözlüğünü şemadaki `kaba_mi()` ile karşılaştırıyor.
  Node'un `fs`'i yerine bu yol seçildi — uygulamanın tsconfig'inde Node tipleri
  yok ve yalnızca bu test için eklemek istenmedi.
*/
declare module '*.sql?raw' {
  const icerik: string
  export default icerik
}
