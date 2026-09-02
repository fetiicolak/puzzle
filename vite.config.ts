import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/*
  base '/' → site kendi alan adının kökünde duruyor (birliktepuzzle.com).

  Önceden './' idi ve repo alt yolunda (github.io/puzzle/) çalışması içindi.
  Alan adına geçerken değiştirmek **zorunlu** oldu: Vite, HTML'deki kök-göreli
  yolları base ile yeniden yazıyor ve './' altında `/apple-touch-icon.png`
  çıktıda `./apple-touch-icon.png` oluyordu. Safari göreli apple-touch-icon'u
  bulamıyor (166d628'de bir kez yaşandı), yani ikonlar sessizce boş kalırdı.
  Alt yola geri dönülürse burası da geri alınmalı.
*/
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        /*
          Satıcı paketlerini ayır.

          İki sebep var. Birincisi önbellek: React ve Supabase ayda bir bile
          değişmiyor, uygulama kodu her dağıtımda değişiyor; tek pakette
          olduklarında bir satır değişince kullanıcı 500 KB'ı yeniden
          indiriyordu. İkincisi görünürlük: tek bir "index" paketi neyin ne
          kadar yer kapladığını gizliyor.

          PeerJS burada yok, çünkü onu yalnızca oyun ekranı kullanıyor ve o
          ekran zaten gecikmeli yükleniyor (App.tsx). Buraya yazmak onu tekrar
          açılışa çekerdi.
        */
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react'
          if (id.includes('@supabase')) return 'supabase'
        },
      },
    },
  },
})
