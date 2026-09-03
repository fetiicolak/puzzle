/*
  tanitim.html'i mp4'e çevirir. Ekran kaydı ALMAZ — kareleri tek tek,
  gerçek zamandan bağımsız çizdirir.

  Neden: ekran kaydı yazılımı bütün masaüstünü yakalayıp aynı anda
  kodluyor; tarayıcı 1080x1920'lik sahneyi çizerken ikisi CPU/GPU'yu
  paylaşınca kareler düşüyor ve video kasıyor. Burada kasma diye bir şey
  yok: animasyonun tamamı `t` değişkeninden türediği için her kare tam
  olarak istenen ana ait ve çizim ne kadar sürerse sürsün sonuç aynı.

  Kullanım (dev sunucusu AÇIK olmalı — `npm run dev`):

    npm i --no-save puppeteer-core @ffmpeg-installer/ffmpeg
    node reklam/render.js
    node reklam/render.js --dil=en --cikti=reklam-en.mp4
    node reklam/render.js --eser=yildizli-gece --parca=48 --fps=60

  İki paket bilerek `--no-save` ile kuruluyor: ürünün package.json'ına
  girmiyorlar. Yalnızca video üretmek için gerekiyorlar, uygulamanın
  paketiyle hiçbir ilgileri yok.

  Çıktı: 1080x1920, H.264 High, yuv420p, sessiz AAC izi (bazı platformlar
  ses izi olmayan dosyayı reddediyor; müziği düzenleyicide ekleyeceksin).
*/

// Proje `"type": "module"` — bu dosya da ESM. `require` kullanılamıyor.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import puppeteer from 'puppeteer-core'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'

/* ---------- argümanlar ---------- */

const arg = (ad, varsayilan) => {
  const bul = process.argv.find((a) => a.startsWith(`--${ad}=`))
  return bul ? bul.slice(ad.length + 3) : varsayilan
}

const FPS = Number(arg('fps', 30))
const DIL = arg('dil', 'tr')
const ESER = arg('eser', '')
const PARCA = arg('parca', '')
const SUNUCU = arg('sunucu', 'http://localhost:5173')
const CIKTI = path.resolve(arg('cikti', `reklam-tanitim-${DIL}.mp4`))

/* ---------- Chrome ve ffmpeg ---------- */

function chromeBul() {
  const adaylar = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean)
  const bulunan = adaylar.find((y) => fs.existsSync(y))
  if (!bulunan) {
    throw new Error(
      'Chrome bulunamadı. CHROME_PATH ortam değişkeniyle yolunu ver.',
    )
  }
  return bulunan
}

/* ---------- kareleri çiz ---------- */

async function kareleriCiz(klasor) {
  let adres = `${SUNUCU}/reklam/tanitim.html?kayit`
  if (DIL === 'en') adres += '&dil=en'
  if (ESER) adres += '&eser=' + ESER
  if (PARCA) adres += '&parca=' + PARCA

  const tarayici = await puppeteer.launch({
    executablePath: chromeBul(),
    headless: 'shell',
    args: [
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      // Alt piksel yumuşatma kapalı: kareler arasında yazı kenarları
      // titremesin, kodlayıcı da boşuna bit harcamasın.
      '--disable-lcd-text',
      '--font-render-hinting=none',
    ],
    // Görüntü alanı tam sahne boyu; `olcekle()` böylece ölçeği 1 buluyor
    // ve sahne birebir 1080x1920 çiziliyor.
    defaultViewport: { width: 1080, height: 1920, deviceScaleFactor: 1 },
  })

  try {
    const s = await tarayici.newPage()
    s.on('pageerror', (h) => console.error('SAYFA HATASI:', h.message))
    await s.goto(adres, { waitUntil: 'networkidle0', timeout: 60000 })

    // Görsel inip parçalar kesilene kadar bekle
    await s.waitForFunction('typeof hazir !== "undefined" && hazir === true', {
      timeout: 60000,
    })
    await s.evaluate(() => document.fonts.ready)

    // rAF döngüsünü öldür. Yaşarsa her rAF'ta `ciz()` bir kez daha
    // çalışıyor; imleç konumu lerp ile ilerlediği için fazladan adım
    // alıyor ve kareler saatle uyuşmuyor.
    await s.evaluate(() => {
      window.requestAnimationFrame = () => 0
    })
    await new Promise((r) => setTimeout(r, 150))

    const toplam = await s.evaluate(() => {
      bastanAl() // t = 0 + imleçleri başlangıç yerine al
      oynuyor = false
      return TOPLAM
    })

    const kareSayisi = Math.round(toplam * FPS)
    process.stdout.write(`${toplam} sn -> ${kareSayisi} kare @ ${FPS} fps\n`)

    for (let i = 0; i < kareSayisi; i++) {
      await s.evaluate(
        (an) => {
          t = an
          ciz(t)
          yazilar(t)
        },
        i / FPS,
      )
      await s.screenshot({
        path: path.join(klasor, String(i).padStart(5, '0') + '.jpg'),
        type: 'jpeg',
        quality: 95,
        clip: { x: 0, y: 0, width: 1080, height: 1920 },
        captureBeyondViewport: false,
      })
      if (i % 60 === 0) process.stdout.write(`  ${i}/${kareSayisi}\n`)
    }
    return kareSayisi
  } finally {
    await tarayici.close()
  }
}

/* ---------- kodla ---------- */

function kodla(klasor) {
  const sonuc = spawnSync(
    ffmpegInstaller.path,
    [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-framerate', String(FPS),
      '-i', path.join(klasor, '%05d.jpg'),
      // Sessiz ses izi: bazı platformlar ses izi olmayan dosyada takılıyor
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
      '-map', '0:v', '-map', '1:a', '-shortest',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '19',
      '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      CIKTI,
    ],
    { stdio: 'inherit' },
  )
  if (sonuc.status !== 0) throw new Error('ffmpeg ' + sonuc.status)
}

/* ---------- akış ---------- */

;(async () => {
  const klasor = fs.mkdtempSync(path.join(os.tmpdir(), 'puzzle-kare-'))
  try {
    await kareleriCiz(klasor)
    kodla(klasor)
    const kb = (fs.statSync(CIKTI).size / 1048576).toFixed(1)
    process.stdout.write(`\nbitti: ${CIKTI} (${kb} MB)\n`)
  } finally {
    fs.rmSync(klasor, { recursive: true, force: true })
  }
})().catch((h) => {
  console.error(h.message || h)
  process.exit(1)
})
