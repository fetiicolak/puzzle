# Birlikte Puzzle 🧩

Sevdiğinle aynı puzzle'ı gerçek zamanlı birlikte çözebileceğin, tarayıcıda çalışan bir yapboz oyunu.

- 📷 Kendi fotoğrafını yükle ya da 36 parçalık hazır galeriden seç (kategorilere ayrılmış)
- 🔢 24 – 500 arası parça sayısı, istersen parçalar döndürmeli
- 💕 Davet linkiyle partnerini çağır: parçalar, imleçler ve ilerleme canlı senkronize
- 🎥 Oyun sırasında görüntülü veya yalnızca sesli konuşma, yan panelde sohbet
- 💌 Puzzle tamamlanınca açılan sürpriz mesaj; istersen belirli bir tarihe kilitle
- 🏅 Bitişte indirilebilir hatıra kartı — eser adı, çözenler, süre, tarih
- 🔊 Web Audio ile üretilen parça sesleri ve kapatılabilir sakin arka plan müziği
- 💾 İlerleme otomatik kaydedilir, kaldığın yerden devam edersin
- 📱 Mobil uyumlu PWA: ana ekrana eklenip tam ekran açılır, service worker ile
  çevrimdışı başlatılabilir

Hesap açarsan ayrıca: profil (ad, fotoğraf, doğum yılı, cinsiyet), arkadaş listesi
(kim şu an sitede görünür), arkadaşlarla mesajlaşma, oyunun içinden arkadaşına
davet linki gönderme, çözdüğün puzzle'ların cihazdan bağımsız listesi, oda içi
yetkiler (oyuncu çıkarma ve bu yetkiyi devretme), engelleme ve şikayet.

## Nasıl çalışır?

Gerçek zamanlı bağlantı [PeerJS](https://peerjs.com) üzerinden WebRTC P2P ile kurulur.
Oda kuran kişi davet linkini paylaşır, partner linke tıklayınca tarayıcılar doğrudan
birbirine bağlanır. Doğrudan bağlantı kurulamayan ağlarda trafik bir TURN sunucusu
üzerinden aktarılır.

Parça kesimi seed tabanlı ve deterministiktir (`src/engine/cutter.ts`) — iki taraf da
aynı seed'den birebir aynı kesimi üretir, ağdan yalnızca parça hareketleri geçer.

### Fotoğraf nereye gidiyor?

| | Fotoğraf | Puzzle kaydı |
|---|---|---|
| **Misafir olarak** | Yalnızca tarayıcında; partnerine WebRTC ile doğrudan aktarılır | Yalnızca cihazında (localStorage) |
| **Hesapla** | Supabase Storage'a yüklenir | Supabase Postgres'te |

Yani hesapla oynadığında fotoğraf ve puzzle bilgileri bir sunucuda saklanır. Depolama
kovaları herkese kapalıdır; erişim yalnızca kısa ömürlü imzalı URL'lerle ve yalnızca
o puzzle'ı birlikte çözenlere açıktır. Yetki kararları sunucudaki `security definer`
fonksiyonlarda verilir, istemci yalnızca sonucu gösterir.

Hangi verinin niçin toplandığı ve nasıl sileceğin [gizlilik metninde](public/gizlilik.html)
yazılı; profil ekranından hesabını (tüm satırları ve yüklediğin dosyaları dahil) tamamen
silebilirsin.

## Geliştirme

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest — motor ve P2P protokolü birim testleri
npm run build    # tsc -b && vite build (dist/)
```

Supabase olmadan da çalışır: `.env` yoksa hesap özellikleri kapanır, misafir akışı
(fotoğraf seç → oda kur → davet linki) olduğu gibi kullanılabilir. Kendi Supabase
projeni bağlamak için `.env.example`'ı `.env` olarak kopyala ve `supabase/schema.sql`
dosyasını SQL editöründe çalıştır.

Projeye özel kurallar, tuzaklar ve açık işler [CLAUDE.md](CLAUDE.md)'de.

## Yayınlama

`main` dalına push edildiğinde GitHub Actions ile GitHub Pages'e otomatik deploy edilir
(`.github/workflows/deploy.yml`). Repo ayarlarından **Settings → Pages → Source:
GitHub Actions** seçilmiş olmalıdır. `VITE_` ile başlayan tüm ortam değişkenleri
Actions secrets'tan gelir — yeni bir değişken eklersen `deploy.yml`'deki `env:`
bloğuna da eklemeyi unutma.
