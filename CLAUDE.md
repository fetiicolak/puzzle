# Birlikte Puzzle — çalışma notları

İki kişinin aynı yapbozu gerçek zamanlı birlikte çözdüğü Türkçe site.
Vite + React 19 + TypeScript, Canvas 2D motoru, PeerJS (WebRTC) ile P2P,
Supabase (Auth + Postgres + Storage), GitHub Pages'te yayında.

Bu dosya projeye özel kuralları ve daha önce canımızı yakmış tuzakları
tutar. Genel iyi kodlama tavsiyeleri burada yok.

## Dil

- **Kod, yorumlar, değişken ve fonksiyon adları Türkçe.**
  `oyuncuCikar`, `hataMetni`, `misafirKimligi` gibi. Yeni kod da böyle olmalı.
- **Arayüz iki dilli: Türkçe ve İngilizce.** Kullanıcıya gösterilen her metin
  `ceviri('Türkçe metin')` içinden geçer (`useDil`, `src/dil.tsx`); İngilizce
  karşılığı `src/sozluk.ts`'e yazılır.
- **Anahtar, Türkçe metnin kendisi.** Sözlükte karşılığı olmayan metin ekranda
  Türkçe kalır — uygulama kırılmaz. Türkçe metni değiştirirsen sözlükteki
  anahtarı da değiştir, yoksa çeviri sessizce düşer.
- Değişken içeren cümlelerde `{ad}` yer tutucusu kullanılır:
  `ceviri('Bu cihazda {ad} olarak girişlisin.', { ad })`. Metni parçalayıp
  birleştirme — kelime sırası dile göre değişiyor.
- Bağlantı ya da kalın yazı içeren cümlelerde (ek almış Türkçe kelimeler)
  şablon yerine `dil === 'tr' ? (...) : (...)` yazılır; örnek `AuthScreen`
  içindeki yasal satır.
- Supabase'in ham hata metinleri `hataMetni()` (`src/supabase/client.ts`)
  içinden geçirilir.
- **Hukuki sayfalar dört dosya:** `gizlilik.html`/`kosullar.html` (TR) ve
  `privacy.html`/`terms.html` (EN). Biri değişirse karşılığını da güncelle;
  `AuthScreen`'deki bağlantılar dile göre ayrılıyor.

## Araç tuzakları

- **PowerShell ile Türkçe dosyalarda toplu metin değiştirme yapma.**
  `(Get-Content ... ) -replace ... | Set-Content` UTF-8 Türkçe karakterleri
  bozuyor. Bir kez tüm bir turun işi bu yüzden geri alındı. Edit aracını kullan.
- **Commit mesajlarını dosyaya yazıp `git commit -F` ile ver.** `-m` ile çok
  satırlı mesaj PowerShell'de parçalanıyor. Mesaj metni ASCII olsun.
- **Adres çubuğunda yalnızca `#` kısmı değişiyorsa sayfa yeniden yüklenmez.**
  `location.href = '...#room=x'` sonrası `location.reload()` gerekiyor; yoksa
  açılış kodu (davet, şifre sıfırlama) hiç çalışmaz. İki kez buna takıldık.
- Tarayıcı paneli arka plandayken CSS animasyonları ilerlemiyor; ölçüm
  alırken `el.style.animation = 'none'` yapıp öyle ölç.

## Arayüz kuralları

- **`alert` / `confirm` / `prompt` kullanılmaz.** `ConfirmDialog` var;
  bilgi/hata kutusu için `tekButon` propu. Kaynakta hiç `alert(` kalmamalı.
- Modaller `createPortal` ile `document.body`'ye çizilir. Sebep: `oda-panel`
  gibi `backdrop-filter` kullanan kutular sabit konumlu çocukları için yeni
  sınırlayıcı blok yaratıyor, pencere ekrandan taşıyor.
- Pencere genişliği `min(100%, Npx)` — `vw` kullanma. `modal-arka`'nın 18px
  iç boşluğu var, `94vw` onu taşırıp pencereyi kenara yapıştırıyor.
- **Üst çubuğa düğme eklersen `Tutorial.tsx`'in araç listesine de ekle.**
  Liste elle yazılıyor, kendiliğinden güncellenmiyor; koşullu görünen bir
  düğme turda da aynı koşulla görünmeli (örn. `hesapVar`).
- **Kullanıcı metnindeki adresler `Linkli` ile basılır.** Ham metin basmak,
  paylaşılan oda linkini kopyala-yapıştır işine çeviriyor. Ayrıştırıcı yalnızca
  http/https tanır (`javascript:` bağlantıya dönüşmemeli) ve testi var.
- Açılır liste için `Select` bileşeni kullanılır. Tarayıcının kendi `<select>`
  menüsü sayfanın koyu temasını almıyor, Windows'ta okunmuyordu.
- Yeni ekranlarda 320 / 390 / 768 genişliklerini kontrol et.
- **Tuvalin üstünde duran panellere `backdrop-filter` koyma.** Zeminleri zaten
  ~%97 opak, bulanıklık görünmüyor; buna karşılık altındaki tuval her karede
  değiştiği için tarayıcı bulanıklığı boyuna yeniden hesaplıyor. Görüşme açıkken
  takılmanın sebeplerinden biriydi. Akıştaki (`.game-topbar`) elemanlarda sorun
  yok — arkalarında hareketli bir şey olmuyor.

### Oyun ekranındaki yüzen paneller

- **Yeni yüzen panel eklersen `useSurukle` ile taşınabilir yap** (`surukle.ts`).
  Aynı anda açık panel sayısı 0-4 arasında değişiyor, boyları içeriğe göre
  büyüyor; hiçbir sabit yerleşim bütün birleşimlerde çakışmasız kalmıyor.
  Daha önce tek bir çakışmaya CSS yaması yazılmıştı (`.peek.kaydir`), o da
  yenisini doğurmuştu.
- **Varsayılan yerler dört köşeye dağıtılmış**: sol üst odadakiler · sağ üst
  kameralar · sol alt orijinal · sağ alt sohbet. Yeni panel eklerken bu
  dağılımı boz(may)acak bir yer seç ve dört panel birden açıkken ölç.
- **Panel yeri açılışta değil, kullanıcı taşıyınca belirlenir.** Taşınana kadar
  satır içi stil verilmiyor; duyarlı CSS kuralları böylece çalışmaya devam
  ediyor. Taşındığı an `left/top`'a geçiliyor ve `puzzle:panel:<ad>` altında
  saklanıyor — panel kapatılıp açılınca aynı yerde geliyor.
- **Panelleri `top: 64px` gibi sabit değerle konumlandırma.** Üst çubuk dar
  ekranda ikinci satıra sarıyor (tablette 99px oluyor). Gerçek boyu GameScreen
  bir `ResizeObserver` ile `--ust-cubuk` değişkenine yazıyor; `top:
  calc(var(--ust-cubuk) + 8px)` kullan.
- **Sağ üst + sağ alt panellerin yükseklik toplamı ekranı taşmamalı.**
  `.video-panel` 45vh, `.chat` 55vh ile sınırlı; kamera sayısı artınca panel
  uzayıp sohbetin üstüne biniyordu.
- Tutamağa `touch-action: none` gerekiyor, yoksa dokunmatikte tarayıcı hareketi
  kaydırma sanıp `pointermove`'ları kesiyor. Sürükleme düğme/kutu üstünden
  başlamaz (`closest('button, input, …')`).

## Çizim başarımı

Kural: **kare başına yapılan iş parça sayısıyla büyümemeli.**

- **Tuval iki katmanlı** (`board.ts`). Duran her şey ayrı bir tuvale çizilip
  kare kare oradan kopyalanıyor; yalnızca hareket eden gruplar ve imleçler
  üstte yeniden çiziliyor. Öncesinde imleç mesajı (sn'de ~9-16) ve hareket
  mesajı (~20) 500 parçanın tamamını yeniden çizdiriyordu.
- **Doğru geçersiz kılmayı seç**, yoksa kazanç yok olur ya da hayalet çıkar:
  `invalidate()` her şey · `grupTasindi()` hareket hâlindeki grubun konumu ·
  `imlecDegisti()` yalnızca imleç. Görünüm (pan/zoom/sığdır) değiştiyse hep
  `invalidate()`.
- **`lockedGroups`'u dışarıdan değiştirme** — `kilitle()` / `kilidiAc()` kullan.
  Kilitli grup statik katmandan çıkarıldığı için, haritayı sessizce değiştirmek
  parçayı iki katmanda birden (eski ve yeni konumunda) gösterir.
- **Ekran dışındaki parça çizilmez.** Kırpma payı cömert: tab çıkıntısı +
  `max(cellW, cellH)`. Döndürülmüş parça hücresinin dışına taşıyor, dar pay
  kenardaki parçayı yok ediyor.
- **Piksel oranına tavan var**: 2, zayıf cihazda 1.5. 3x bir telefonda tam
  çözünürlük iki katından fazla piksel demek, fotoğrafta farkı görünmüyor.
- **`hafifMod`** (zayıf cihaz ya da 200+ parça) bulanık gölgeyi kapatıp
  yerine parçanın konturunu çiziyor. `shadowBlur` her karede yeniden
  hesaplanıyor ve canvas'ta en pahalı işlerden biri.
- Ölçmeden "iyileştirdim" deme. Konsoldan: `__puzzle.board` üzerinde
  `statikKirli` kurup `render()` süresini karşılaştır (dev derlemede açık).

## Sunucu ve güvenlik

- **Güvenlik kararı her zaman sunucuda verilir.** İstemci yalnızca sonucu
  gösterir. Oda yetkileri (`oyuncu_cikar`, `yetki_ayarla`), kilit kontrolü ve
  ban `security definer` fonksiyonlarda; hepsinde `set search_path = public`.
- **`supabase/schema.sql` idempotent kalmalı** — `create or replace`,
  `drop policy if exists`, `add column if not exists`. Hem boş şemada hem
  mevcut şema üzerinde ikinci kez hatasız çalışmalı.
- **Fonksiyon tanım sırası önemli.** `language sql` fonksiyonları oluşturulurken
  referansları doğrulanıyor; bir fonksiyon kendinden sonra tanımlanan başka
  birine başvuramaz. `profil_gorunur` bu yüzden dosyanın sonunda.
- **Şemayı değiştirdiysen kullanıcıya "SQL'i yeniden çalıştır" de.** Commit
  mesajının başına da yaz. Kullanıcı çalıştırmadan düzeltme canlıya geçmez.
- **Satır düzeyi politika sütunu korumaz.** "Bu satırı güncelleyebilir" demek
  "her sütunu değiştirebilir" demektir. Sütun kısıtı için trigger yaz;
  örnek desen: `puzzle_guncelleme_kontrol`, `friendship_guncelleme_kontrol`.
- **Supabase, SQL'den `storage.objects` silmeye izin vermiyor.** Dosya silme
  istemciden Storage API ile yapılır (`hesabiSil` içindeki `klasoruBosalt`).
- İstemcide tolerans: yeni sütun eksikse kayıt tamamen başarısız olmasın
  (`createRemotePuzzle` içindeki `eksikSutun` geri düşüşü).

## P2P

- Karşı taraf bizim kodumuzu çalıştırmak zorunda değil; konsoldan elle mesaj
  gönderebilir. Gelen her mesaj `dogrula()` (`src/net/protocol.ts`) süzgecinden
  geçer — `peer.ts` içinde, **yansıtmadan önce**.
- Yetki `from` damgasına dayanır: host yansıtırken damgayı kendi bastığı için
  (`{ ...msg, from: id }`) misafir onu taklit edemez. `meta`/`img`/`state`/
  `full`/`kick` yalnızca doğrudan host'tan kabul edilir.
- `tray`/`shuffle` bilerek herkeste — iş birliğine dayalı düğmeler.
- **PeerJS'in `close` olayı güvenilir değil.** Ayrılan taraf kapanmadan önce
  `bye` gönderir; host bunu yansıtır, böylece diğer misafirler de listeden
  düşürür. Ölü bağlantı taraması (`oluleriTemizle`, 5 sn) yedek yol olarak
  duruyor ama tek başına yavaş ve yalnızca host'ta çalışıyor.
- **Odaya sonradan giren, önce gelenleri görmüyordu.** Host her katılımcının
  son `hello`'sunu `sonHello`'da tutar ve yeni gelene topluca iletir; `from`
  damgasını host bastığı için misafir bunu taklit edemez.
- **Kamera/mikrofon oyundan çıkınca bırakılır.** `yayiniDurdur()` izleri
  `stop()` eder; `GameScreen` temizliğinde ayrıca `yerelAkisRef` üzerinden
  durdurulur (oda hiç kurulmadıysa `room.close()` çalışmaz). Yalnızca çağrıyı
  kapatmak kamerayı bırakmıyor, cihazın ışığı yanmaya devam ediyordu.
- Yeni mesaj tipi eklersen `dogrula`'ya alan doğrulaması ve gerekiyorsa
  `HOST_YETKILI` kaydını eklemeyi unutma; testi `protocol.test.ts`'e yaz.

## Bilinçli tercihler (değiştirmeden önce düşün)

- **StrictMode kapalı** (`src/main.tsx`). Çift effect, aynı oda kimliğiyle iki
  PeerJS bağlantısı açıp `unavailable-id` hatası veriyor.
- **`detectSessionInUrl: false`** — adres çubuğundaki `#room=` ile çakışıyor.
  Şifre sıfırlama jetonu bu yüzden elle okunuyor (`kurtarmaJetonu`).
- **Ses dosyası yok, Web Audio ile üretiliyor** (`src/audio.ts`). Paket
  büyümüyor, telif yok, çevrimdışı çalışıyor.
- **Spotify embed kullanılmadı**: tam parça için dinleyicinin hesabını şart
  koşuyor, kesintisiz dönmüyor, ses seviyesi dışarıdan ayarlanamıyor.
- **Örnek eserler kamu malı** (sahibi 70+ yıl önce vefat etmiş) veya CC0.
  Telifli eser eklenmez — Picasso bu yüzden reddedildi.
- **"Şu an sitede" tek sütunla çözülüyor** (`profiles.last_seen`, `nabizAt`).
  Realtime kanalı ya da ayrı oturum defteri yok: sekme kapansa, ağ kopsa,
  telefon uykuya geçse bile damga eskiyor ve kişi kendiliğinden çevrimdışı
  görünüyor. "Çıktım" bildirimi göndermek gerekmiyor. Damga dakikada bir,
  yalnızca sekme öndeyken atılıyor; okuma penceresi 2 dakika (`cevrimiciMi`).

## Sırlar ve dağıtım

- `.env` git'te izlenmiyor; şablon `.env.example`. Üretim değerleri **GitHub
  Actions secrets**'tan geliyor (`VITE_SUPABASE_*`, `VITE_TURN_*`).
  Yeni bir `VITE_` değişkeni eklersen `deploy.yml`'deki `env:` bloğuna da ekle,
  yoksa canlıda boş kalır.
- `main`'e push → Actions → GitHub Pages. `gh run watch <id> --exit-status`
  ile bitmesini bekle, sonra canlı paketi indirip değerlerin girdiğini doğrula.
- Kullanıcının Supabase panelinden yapması gerekenler (kod işi değil):
  SMTP sağlayıcısı, e-posta doğrulama, izinli yönlendirme adresleri.
- **Şifremi unuttum akışı kod tarafında tam** (2026-08-06 doğrulandı: `tsc -b`
  ve testler temiz, uçtan uca akış — link → oturum → yeni şifre — kod
  seviyesinde eksiksiz). Gerçek e-postayla denenmedi; panelde SMTP sağlayıcısı
  bağlanmadan ve site adresi izinli yönlendirmelere eklenmeden e-posta hiç
  gitmez veya bağlantı çalışmaz. Bu ikisi yapılmadıysa akış hâlâ "tamamlanmadı"
  sayılır — kod değil, panel eksik.

## Açık işler

Bittikçe buradan sil. Sıra kabaca öncelik sırası.

**Bu liste her turda güncellenir.** Bir iş bitip doğrulandıysa satırı sil; bir
şey yazılıp da denenemediyse "Doğrulanmamış"a ekle, neyin eksik olduğunu ve
tarihi yaz. "Herhalde çalışır" diye sessizce geçme — denenmemiş iş bitmiş
sayılmıyor.

**Kullanıcıda (kod işi değil)**
- [ ] SMTP sağlayıcısı bağla (Resend/Brevo) — şifre sıfırlama bunsuz çalışmıyor
- [ ] Supabase → URL Configuration → izinli yönlendirmelere site adresini ekle
- [ ] `b@gmail.com` tekrar açılamıyor; hata metni alınacak
- [ ] Depolama kotası kararı: 1 GB ≈ 200-700 fotoğraf, dolunca ne olacak

**Doğrulanmamış** — kod yazıldı, `tsc`/test/build temiz, ama şu koşulda hiç
denenmedi. Parantez içi, denemek için gereken şey.

*Gerçek cihaz gerekiyor (tarayıcı paneli yetmiyor)*
- [ ] Başarım: 200 / 300 / 500 parça, kamera açıkken, zayıf bir tablet ya da
      telefonda. Ölçümler geliştirme makinesinde yapıldı; oran korunmalı ama
      gerçek kare hızı bilinmiyor. (2026-08-09'da eklendi)
- [ ] Odadan çıkınca kameranın gerçekten bırakılması — cihazın ışığı sönüyor
      mu? Tarayıcı paneli `getUserMedia`'yı engellediği için tuvalden üretilen
      sahte akışla denendi, gerçek kamerayla denenmedi. (2026-08-06)
- [ ] Panellerin parmakla sürüklenmesi. Sentetik `pointerType: 'touch'`
      olaylarıyla çalışıyor; gerçek dokunmatikte `touch-action: none` yeterli
      mi, sürükleme sayfayı kaydırıyor mu görülmedi. (2026-08-09)
- [ ] `hafifMod`'un doğru cihazlarda açılması. Ölçüt `hardwareConcurrency` ve
      `deviceMemory`; ikisi de kaba ipuçları, gerçek telefonlarda ne dediği
      bilinmiyor. Konsoldan `__puzzle.board.hafifMod` ile bakılır.

*İki hesap gerekiyor*
- [ ] A5 uçtan uca test: hız sınırı, engelleme, şikayet, alıcının mesaj silmesi
- [ ] Oyun içi arkadaş paneli (🤝): "şu an sitede" ışığı, mesaj kutusu ve
      "Davet et" ile giden davet mesajı
- [ ] Ana ekrandaki Mesajlar bölümü: önizleme, okunmamış rozeti ve sıralama

*Bilinen, kabul edilmiş sınır (düzeltilecekse iş var)*
- [ ] 390 px genişlikte "Odadakiler" paneli (320 px) ile kamera paneli yan yana
      sığmıyor, üst üste biniyor. Odadakiler üstte ve geçici; şimdilik
      bırakıldı. Tablette ve masaüstünde sorun yok.

**Teknik borç**
- [ ] Yetim depo dosyası temizleyicisi (satır silinip dosya kalırsa erişilemez olur)
- [ ] Kod bölme — tek chunk ~600 KB
- [ ] ESLint + `lint` script'i
- [ ] Erişilebilirlik: modal `role="dialog"`, odak tuzağı, ikon butonlara `aria-label`,
      `HomeScreen`'deki tıklanabilir `article`'lar klavyeyle açılamıyor
- [ ] Test kapsamı: `supabase/`, `net/peer.ts`, `engine/board.ts` ve bileşenler
      test edilmiyor (şu an `engine` 41 + `protocol` 23 + `Linkli` 12 = 76)

**Ölçek büyürse**
- [ ] Kendi TURN sunucusu (şimdilik metered.ca ücretsiz katman)
- [ ] Senkronizasyonu Supabase Realtime'a taşı — P2P bağlantı sorunlarını kökten bitirir

## Çalıştırma

```bash
npm run dev      # http://localhost:5173
npm test         # Vitest — engine + protocol
npm run build    # tsc -b && vite build
```

Lint yok; `tsconfig` sıkı (`strict`, `noUnusedLocals`, `noUnusedParameters`).
`npx tsc -b` temiz olmadan commit etme.

## Doğrulama beklentisi

Bu projede "yazdım, herhalde çalışır" kabul edilmiyor. Değişiklik tarayıcıda
gözlemlenebiliyorsa `preview_start` ile çalıştırıp gerçekten dene; güvenlik
düzeltmesi yaptıysan saldırıyı tekrarlayıp reddedildiğini gör. Test edemediğin
bir şey varsa raporda **açıkça** söyle.

Girişli akışlar için iki hesap gerekiyor ve aynı adreste tek oturum tutulabilir
— biri canlı sitede, biri `localhost:5173`'te açılır. Hesap açma ve şifre
girme kullanıcıya bırakılır.
