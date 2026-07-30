# Birlikte Puzzle 🧩

Sevdiğinle aynı puzzle'ı gerçek zamanlı birlikte çözebileceğin, tarayıcıda çalışan bir yapboz oyunu.

- 📷 Kendi fotoğrafını yükle ya da hazır puzzle'lardan seç
- 🔢 24 – 500 arası parça sayısı
- 💕 Davet linkiyle partnerini çağır: parçalar, imleçler ve ilerleme iki tarafta da canlı senkronize
- 🔒 Fotoğraf hiçbir sunucuya yüklenmez — WebRTC ile doğrudan partnerin tarayıcısına aktarılır
- 💌 Puzzle tamamlanınca açılan sürpriz mesaj
- 💾 İlerleme otomatik kaydedilir, kaldığın yerden devam edersin
- 📱 Mobil uyumlu PWA: telefonun ana ekranına eklenip tam ekran açılır,
  service worker sayesinde çevrimdışıyken de başlatılabilir

## Nasıl çalışır?

Gerçek zamanlı bağlantı [PeerJS](https://peerjs.com) üzerinden WebRTC P2P ile kurulur;
sunucu, hesap veya veritabanı yoktur. Oda kuran kişi davet linkini paylaşır, partner
linke tıklayınca iki tarayıcı doğrudan birbirine bağlanır.

Parça kesimi seed tabanlı ve deterministiktir (`src/engine/cutter.ts`) — iki taraf da
aynı seed'den birebir aynı kesimi üretir, ağdan yalnızca parça hareketleri geçer.

## Geliştirme

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # motor birim testleri (Vitest)
npm run build    # üretim derlemesi (dist/)
```

## Yayınlama

`main` dalına push edildiğinde GitHub Actions ile GitHub Pages'e otomatik deploy edilir
(`.github/workflows/deploy.yml`). Repo ayarlarından **Settings → Pages → Source:
GitHub Actions** seçilmiş olmalıdır.
