# reklam/ — tanıtım malzemeleri

Bu klasör **ürünün parçası değil**. Vite yalnızca `public/` klasörünü ve
import grafiğini paketlediği için buradaki dosyalar canlı siteye çıkmaz.

| Dosya | Ne işe yarar |
| --- | --- |
| `tanitim.html` | Tek başına bitmiş 15 saniyelik 9:16 tanıtım animasyonu. Ekran kaydı alınıp doğrudan paylaşılabilir. |
| `kartlar.html` | Kendi ekran kaydının arasına kesilecek açılış / kanca / alt şerit / kapanış kartları. 9:16 · 1:1 · 16:9. |
| `lansman-kiti.html` | Çekim planı, kayıt ayarları, iki dilli metinler ve ilk hafta yayın takvimi. |
| `render.js` | `tanitim.html`'i doğrudan mp4'e çevirir. Ekran kaydı almaz — kareleri tek tek çizdirir. |

Üçü de dev sunucusundan açılır:

```
npm run dev
http://localhost:5173/reklam/tanitim.html?kayit
http://localhost:5173/reklam/kartlar.html
http://localhost:5173/reklam/lansman-kiti.html
```

`tanitim.html` görselleri `/samples/` altından alıyor; `file://` ile açılırsa
`../public/samples/` yoluna düşüyor ama dev sunucusundan açmak daha güvenli.

## Videoyu üretmek

**Ekran kaydı almak gerekmiyor.** `render.js` kareleri tek tek çizdirip
ffmpeg'e veriyor:

```bash
npm run dev                                       # ayrı bir kabukta açık kalsın
npm i --no-save puppeteer-core @ffmpeg-installer/ffmpeg
node reklam/render.js                             # -> reklam-tanitim-tr.mp4
node reklam/render.js --dil=en --cikti=promo-en.mp4
node reklam/render.js --eser=yildizli-gece --parca=48 --fps=60
```

Çıktı 1080x1920, H.264 High, yuv420p, 30 fps ve sessiz bir AAC izi taşıyor
(bazı platformlar ses izi olmayan dosyada takılıyor). Instagram Reels /
TikTok / YouTube Shorts'a doğrudan yüklenebiliyor.

- **İki paket bilerek `--no-save`**: ürünün `package.json`'ına girmiyorlar.
  `@ffmpeg-installer/ffmpeg` ikiliyi npm kayıt defterinden getiriyor
  (`ffmpeg-static` gibi kurulumda GitHub'dan indirmiyor), sistemde ffmpeg
  olmasına gerek yok. Chrome sistemdekini kullanıyor — `puppeteer` değil
  `puppeteer-core` bu yüzden.
- Ölçüldü: 453 kare (15,1 sn × 30 fps), ~1,5 dk, 4,3 MB dosya.

## Bilinmesi gerekenler

- **Kesim matematiği `src/engine/cutter.ts`'ten kopyalandı** (`mulberry32`,
  `generateCut`, `piecePath`). Kopya bilinçli: tanıtım dosyası ürün koduna
  bağımlı olmasın diye. Motor değişirse burası kendiliğinden güncellenmez.
- **Logodaki degrade id'si her kopyada benzersiz olmalı.** Aynı `id="bayrak"`
  iki kez geçtiğinde `url(#bayrak)` hep ilk kopyayı buluyor; ilk kopya
  `display:none` bir kartın içindeyse ikinci logo kırmızısını kaybediyor ve
  bayrak bembeyaz çıkıyor. Bir kez oldu.
- **Degrade yazıda `text-shadow` kullanılamıyor.** `background-clip: text` ile
  harfler saydam olduğu için gölge doğrudan görünüyor ve yazı gri bir lekeye
  dönüyor; gölge kapsayıcıya `drop-shadow` olarak veriliyor.
- Sahne 1080×1920 çizilip pencereye sığacak kadar küçültülüyor. Net kayıt için
  OBS'te **Browser Source**'u 1080×1920 boyutuyla eklemek, ekranı kaydedip
  büyütmekten iyi.
- **Bitişteki hatıra kartının yeri CSS'te değil JS'te** (`hatiraYerlestir`).
  Kartın içine oturan fotoğrafın oranı esere göre değişiyor; sabit koordinat
  dikey eserde de yatay eserde de tutmuyor. Yerini değiştireceksen
  `BITIS_OLCEK` / `BITIS_KAY` ile birlikte düşün — tuvaldeki küçülme de
  aynı iki sayıdan besleniyor.
- **Sayfa arka plandayken saat ilerlemiyor.** `requestAnimationFrame`
  görünmeyen sekmede durduruyor. `render.js` bu yüzden saati hiç
  kullanmıyor; rAF'ı devre dışı bırakıp `t`yi kendisi ilerletiyor.
- **`render.js` rAF'ı öldürmek zorunda.** Döngü yaşarsa her rAF'ta `ciz()`
  bir kez daha çalışıyor; imleç konumu lerp ile ilerlediği için fazladan
  adım alıyor ve kare istenen ana ait olmuyor. `bastanAl()` sonrasında
  `oynuyor = false` tek başına yetmiyor — `ciz()` yine çağrılıyor.
