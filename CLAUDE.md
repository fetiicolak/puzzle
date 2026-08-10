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
  düğme turda da aynı koşulla görünmeli (örn. `hesapVar`, `davetVar`).
  - Yalnızca **belli ekran genişliğinde** görünen düğme turda da aynı eşikle
    listelenir. `⋯` 420 px altında çıkıyor (`index.css`), tur da `darEkranMi()`
    ile aynı eşiğe bakıyor. Yoksa telefonda ekranda olmayan altı düğme
    anlatılıyor.
  - **Davranış değişince de turu güncelle**, yalnızca düğme eklenince değil.
    Müzik odada ortaklaştı ama tur bunu bir tur boyunca hiç söylemedi; `🔊`
    ana şaltere dönüştüğü hâlde turda "ses efektleri" yazmaya devam etti.
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
- **Taşıma tutamağı `PanelBaslik`'tir, panelin tamamı değil.** Önce panelin
  kendisi tutamak yapılmıştı; sürükleme düğme/video/kutu üstünden başlamadığı
  için görüşme penceresinde iki kamera açıkken tutulacak boş yer kalmıyor,
  panel dokunmatikte hiç taşınamıyordu. Her yüzen panel `PanelBaslik` ile
  başlar: soldaki çift çizgi "buradan tut" işareti, çubuk en az 40 px.
  Kapatma/geri döndürme düğmeleri de orada — içeriğin üstüne binmiyorlar.
- **Panel içindeki görsel `useYakinlastir` ile büyür, panel büyümez**
  (`surukle.ts`). İki parmak · fare tekerleği · çift dokunuş (1 ↔ 2,5 kat).
  Önce paneli köşeden büyütmeyi denedik, kullanışlı bulunmadı.
  - Tekerlek **elle** bağlanıyor (`addEventListener(..., { passive: false })`).
    React kendi `onWheel`'ini kök öğeye passive takıyor, orada
    `preventDefault()` çalışmıyor ve tekerlek sayfayı kaydırmaya devam ediyor.
  - Çerçeve kendi dokunuşlarını tüketiyor (`stopPropagation`); görselin
    üstünden panel taşınmıyor. Taşıma yalnızca başlık çubuğundan — dokunmatikte
    tek belirsizlik buydu.
  - Kaydırma sınırı görselin çerçeveden kaçmasını engelliyor: `x` daima
    `[en - en*ölçek, 0]` aralığında.
  - ↺ hem yeri hem yakınlaştırmayı sıfırlıyor; kullanıcı için tek bir "eski
    hâline dön" var.
- **Cihazın durum çubuğu için `env(safe-area-inset-*)` bırak.** `index.html`'de
  `viewport-fit=cover` var; kurulu uygulamada (ve Android 15'in kenardan kenara
  kipinde) saat ve bildirim simgeleri üst çubuğun üstüne biniyordu, düğmelere
  basmak imkânsızdı. `.game-topbar` ve `.screen` üst dolgularını `calc(... +
  env(safe-area-inset-top, 0px))` ile, yanları `max(..., env(...))` ile veriyor.
  Tarayıcı sekmesinde bu değerler 0 — orada hiçbir şey değişmiyor, o yüzden
  masaüstünde denemek bu hatayı **göstermez**.

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
  - **Tarif `src/muzik.ts`'te, çalma `audio.ts`'te.** `muzik.ts` saf: parça
    tablosu + `notalariPlanla(parca, tohum, adim)`. Web Audio'ya hiç
    dokunmadığı için testte doğrudan çalışıyor (jsdom'da `AudioContext` yok).
    **Yeni parça eklemek `PARCALAR` tablosuna bir satır** — `audio.ts`'e
    dokunmak gerekmiyor.
  - **Odaya ses değil tarif gönderiliyor**: `{ t: 'muzik', p, seed }` ~30 bayt,
    iki taraf da notaları kendisi üretiyor. Tohum `mulberry32`'ye gidiyor,
    aynı tohum her cihazda aynı ezgiyi veriyor. Adım tohuma karıştırılıyor
    (`tohum + adim * 0x9e3779b1`), yoksa ardışık adımlar birbirine benziyor.
  - **Gelen `muzik` mesajı yalnızca seçimi değiştirir, ses açmaz.** Müziği
    kapatmış ya da kısmış kişiye odadan ses açtırmak yanlış; seçim hatırlanıp
    o kişi müziği açtığında çalıyor. `parcaSec` çalmıyorken kazanca dokunmuyor.
  - Parça değişimi yumuşak geçişle: ramp aşağı → `kaynaklariSustur()` → ramp
    yukarı. Susturma olmazsa eski parçanın ileriye planlanmış notaları
    yenisinin üstüne biniyor.
  - `durdur(ayariYaz, sonus)` ayrı: parça değiştirirken ve **oyundan çıkarken**
    ayara `false` yazılmamalı, yoksa "müzik kapalı" diye kaydedilip bir daha
    açılmıyor.
  - **Parçaları ayıran şey akorlar değil, kurgu.** Üç parça da aynı yastığı
    çalıp yalnızca akor/oktav değiştirdiğinde kullanıcı hiçbirini birbirinden
    ayıramadı. Ayrım `tur` (`akor` · `arpej` · `ambiyans`), dalga biçimi ve
    `akorSuresi` üzerinden kuruluyor; testi de bu üçlünün benzersizliğine
    bakıyor. **Sinüse lowpass koymak tını değiştirmez** — `gece` bu yüzden
    `sawtooth` + 300 Hz kesim.
  - **Müzik yalnızca oyun içinde çalar.** `sesiKapat()` (GameScreen
    temizliğinde) durduruyor; iki inceliği var:
    - Ayarı **yazmıyor**. Kullanıcı müziği kapatmadı, oyundan çıktı.
    - `oturum` sayacını artırıyor. Çıkış düğmesine basmak da bir `pointerdown`
      ve "ilk dokunuşta başlat" dinleyicisini tetikliyor; async `muzigiBaslat`
      temizlikten *sonra* tamamlanıp müziği ana ekranda açıyordu — hesaptan
      çıkınca bile susmuyordu. `muzigiBaslat` beklemeden önce `oturum`u
      yakalayıp döndüğünde karşılaştırıyor.
    - Kısılma 0,25 sn ve arkasından `kaynaklariSustur()`; ileriye planlanmış
      notalar (ambiyansta 8+ sn süren döngü) yoksa ekran kapandıktan sonra
      da çalmaya devam ediyor.
  - Efekt ve müzik ayrı kazanç yollarından geçiyor; seviye (0-1) bu yolların
    üstüne **çarpan** olarak biniyor. Seviye 1 iken ses eski davranışla birebir
    aynı — yeni ayar hiçbir şeyi sessizce değiştirmiyor.
  - **Kazanca doğrudan değer atama.** Kaydırıcı sürüklenirken saniyede onlarca
    kez çağrılıyor ve her adımda hoparlörde "çıt" oluyor; `setTargetAtTime`
    ile yumuşat.
  - **`muzikSeviyesiAyarla` müzik çalmıyorken kazanca dokunmuyor.** Dokunsa
    durdurulmuş müzik yeniden duyulmaya başlar; yeni seviye bir sonraki
    başlatmada uygulanıyor.
- **Spotify hiçbir biçimde kullanılamıyor — API anahtarı bunu çözmüyor.**
  Bir daha araştırılmasın diye gerekçeler:
  - Web API **ses akışı vermiyor**; yalnızca üst veri (ad, sanatçı, kapak).
  - Web Playback SDK tam parça çalıyor ama **her dinleyicide ayrı Premium
    hesabı ve OAuth girişi** şart. Anahtar uygulamayı tanıtıyor, dinleyicinin
    aboneliğinin yerine geçmiyor.
  - Geliştirici sözleşmesi **ortak/eşzamanlı dinlemeyi** ve içeriğin başka
    medyayla senkronlanmasını yasaklıyor. "Odada aynı şarkı" tam olarak bu;
    25 kullanıcıyı aşmak için gereken kota incelemesinden geçmesi beklenmez.
  - 30 saniyelik `preview_url` yeni uygulamalarda boş dönüyor (Kasım 2024).
  - Embed (iframe): tam parça için yine hesap şart, kesintisiz dönmüyor, ses
    seviyesi dışarıdan ayarlanamıyor.
  - YouTube da çözüm değil: ToS yalnızca-ses ve arka plan kullanımını
    yasaklıyor. Telif çizgisi eserlerde ne ise müzikte de o.
- **Örnek eserler kamu malı** (sahibi 70+ yıl önce vefat etmiş) veya CC0.
  Telifli eser eklenmez — Picasso bu yüzden reddedildi.
- **"Şu an sitede" tek sütunla çözülüyor** (`profiles.last_seen`, `nabizAt`).
  Realtime kanalı ya da ayrı oturum defteri yok: sekme kapansa, ağ kopsa,
  telefon uykuya geçse bile damga eskiyor ve kişi kendiliğinden çevrimdışı
  görünüyor. "Çıktım" bildirimi göndermek gerekmiyor. Damga dakikada bir,
  yalnızca sekme öndeyken atılıyor; okuma penceresi 2 dakika (`cevrimiciMi`).

## İkon ve service worker

- **Kaynak `public/icon.svg`, PNG'ler ondan üretiliyor.** Üretme komutu ve
  gerekçeler dosyanın kendi içinde yorumda. Bir PNG'yi elle düzenleme —
  yedisi birden tutarsız kalır.
- **Yuvarlak köşe yalnızca `icon.svg` ve `icon-*.png`'de.**
  `apple-touch-icon*` ve `icon-512-maskable.png` **kare** olmalı: iOS ve
  Android kendi maskesini uyguluyor, önden yuvarlatılmış ikon orada çift
  yuvarlak ya da kesik köşe veriyor.
- **Maskable ikon dairesine sığ.** Android `purpose: "maskable"` ikonu 80%
  çapında bir daireye kırpıyor; 100x100 tuvalde çizim merkezden 40 birimden
  uzağa taşmamalı. Bugünkü çizim 32,2'de.
- **`icon.svg` XML olarak ayrıştırılıyor: yorumun içinde iki tire yan yana
  gelemez.** Yorumdaki `npx --yes ...` yüzünden dosya aylarca ayrıştırılamadı;
  tarayıcı hata vermiyor, favicon'u sessizce göstermiyor. Dosyayı doğrudan
  `localhost:5173/icon.svg` adresinde açıp bayrağı gör — hata sayfası çıkarsa
  ayrıştırılamıyordur.
- **Ortalamayı gözle değil ölçerek doğrula.** Eski ikon 512'lik karede 51
  piksel aşağı kaymıştı (üstte 112, altta 61 boşluk) ve kimse fark etmemişti.
  Tuvale çizip zemin renginden farklı piksellerin sınır kutusuna bak; yuvarlak
  köşeli dosyalarda **saydam pikselleri de ele** (`alpha < 200` atlanmazsa
  sınır kutusu karonun kendisi çıkıyor, ölçüm hep "ortalı" diyor).
- **Ay-yıldızın ölçüleri birbirine bağlı.** Üç çemberin yarıçapı ve merkezleri
  tek bir ölçekten (`G`) türetiliyor; biri elle yuvarlanırsa hem bayrak oranı
  hem ortalama bozulur. Değiştireceksen üçünü birden yeniden hesapla.
- **`sw.js`: kabuk dosyası aynı adla değişirse `CACHE` sürümünü artır.**
  `activate` yalnızca *farklı* anahtarlı önbellekleri siliyor; artırmazsan
  kurulu uygulama eski dosyayı vermeye devam ediyor. Yeni bir kabuk dosyası
  eklediysen `SHELL` listesine de yaz.

## Sırlar ve dağıtım

- `.env` git'te izlenmiyor; şablon `.env.example`. Üretim değerleri **GitHub
  Actions secrets**'tan geliyor (`VITE_SUPABASE_*`, `VITE_TURN_*`).
  Yeni bir `VITE_` değişkeni eklersen `deploy.yml`'deki `env:` bloğuna da ekle,
  yoksa canlıda boş kalır.
- `main`'e push → Actions → GitHub Pages. `gh run watch <id> --exit-status`
  ile bitmesini bekle, sonra canlı paketi indirip değerlerin girdiğini doğrula.
- **Dağıtım takılırsa hangi işin asılı olduğuna bak: `gh run view <id>`.**
  İş akışı iki işten oluşuyor ve ikisi çok farklı şeyler söylüyor:
  - `build` de bekliyorsa → runner sıkıntısı ya da kota; bizi ilgilendirir.
  - `build` 20 saniyede bitip `deploy` asılı kaldıysa → **sorun bizde değil**,
    GitHub'ın Pages yayınlama adımındadır. Derleme ve testler zaten geçmiştir.
    Çare: `gh workflow run "Deploy to GitHub Pages" --ref main`. 2026-08-09'da
    art arda iki çalıştırma 36 ve 19 dakika asılı kaldı, elle tetiklenen
    üçüncüsü 30 saniyede bitti. Onay kapısı ya da GitHub arızası yoktu
    (`gh api .../pending_deployments` boş, durum sayfası temiz) — boşuna orada
    arama.
  - Bu arada canlı site bozulmuyor, bir önceki sürümü sunmaya devam ediyor.
- **`concurrency: cancel-in-progress: true` var**: yeni bir push, devam eden
  dağıtımı iptal ediyor. Bir çalıştırmanın "cancelled" görünmesi hata değil,
  ardından push yaptığın anlamına gelir.
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
- [ ] Panellerin başlık çubuğundan parmakla sürüklenmesi ve orijinal görselde
      iki parmakla yakınlaştırma. Sentetik `pointerType: 'touch'` olaylarıyla
      dördü de taşınıyor, kıskaç oranı birebir çıkıyor; gerçek dokunmatikte
      `touch-action: none` yeterli mi, sürükleme sayfayı kaydırıyor mu
      görülmedi. (2026-08-10)
- [ ] **Güvenli alan dolgusu.** Tarayıcıda `env(safe-area-inset-*)` hep 0
      olduğu için düzeltmenin işe yaradığı yalnızca gerçek cihazda, kurulu
      uygulamada görülür. Beklenen: üst çubuk saatin/bildirimlerin altına
      inmiyor. (2026-08-10)
- [ ] **Android'de galeriye yönlenme.** `accept="image/*"` zaten doğruydu;
      girdi `hidden` yerine ekran dışına alındı (bazı Android sürümleri
      `display: none` girdide accept'i yok sayıyor). Tahmin — düzelmezse
      seçici uygulamayı işletim sistemi belirliyor, cihazda "Dosyalar"
      varsayılan yapılmış olabilir. (2026-08-10)
- [ ] `hafifMod`'un doğru cihazlarda açılması. Ölçüt `hardwareConcurrency` ve
      `deviceMemory`; ikisi de kaba ipuçları, gerçek telefonlarda ne dediği
      bilinmiyor. Konsoldan `__puzzle.board.hafifMod` ile bakılır.
- [ ] Ses kaydırıcılarının parmakla sürüklenmesi. Kazanç değerleri ölçülerek
      doğrulandı (%40 → 0.36, %25 → 0.25, %0 → tam sessiz) ama kimse kulakla
      dinlemedi ve dokunmatikte `input[type=range]` sürüklenmesi denenmedi.
      (2026-08-09)
- [ ] **Müzik parçaları kulakla dinlenmedi.** İlk sürümde üçü birbirine
      benziyordu; kurguları ayrıldı (gece: 49-98 Hz sawtooth drone, 14 sn'de
      bir akor · kutu: 0,36 sn'de bir tek tek nota, 880-2093 Hz triangle ·
      beyaz: yalnızca gürültü, nota yok). Çalan frekanslar ve zamanlama
      tarayıcıda ölçüldü, **kulakla dinlenmedi**. Beğenilmezse `PARCALAR`
      tablosundaki sayılar değişir. (2026-08-10)

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
