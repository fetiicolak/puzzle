# reklam/ — tanıtım malzemeleri

Bu klasör **ürünün parçası değil**. Vite yalnızca `public/` klasörünü ve
import grafiğini paketlediği için buradaki dosyalar canlı siteye çıkmaz.

| Dosya | Ne işe yarar |
| --- | --- |
| `tanitim.html` | Tek başına bitmiş 15 saniyelik 9:16 tanıtım animasyonu. Ekran kaydı alınıp doğrudan paylaşılabilir. |
| `kartlar.html` | Kendi ekran kaydının arasına kesilecek açılış / kanca / alt şerit / kapanış kartları. 9:16 · 1:1 · 16:9. |
| `lansman-kiti.html` | Çekim planı, kayıt ayarları, iki dilli metinler ve ilk hafta yayın takvimi. |

Üçü de dev sunucusundan açılır:

```
npm run dev
http://localhost:5173/reklam/tanitim.html?kayit
http://localhost:5173/reklam/kartlar.html
http://localhost:5173/reklam/lansman-kiti.html
```

`tanitim.html` görselleri `/samples/` altından alıyor; `file://` ile açılırsa
`../public/samples/` yoluna düşüyor ama dev sunucusundan açmak daha güvenli.

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
  görünmeyen sekmede durduruyor; kayıt alırken pencere önde olmalı.
