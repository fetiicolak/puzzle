import { Suspense, lazy, useEffect, useState } from 'react'
import AuthScreen from './components/AuthScreen'
import ConfirmDialog from './components/ConfirmDialog'
import type { GameConfig } from './components/GameScreen'
import HomeScreen from './components/HomeScreen'
import JoinChoiceScreen from './components/JoinChoiceScreen'
import NewPasswordScreen from './components/NewPasswordScreen'
import SetupScreen, { type StartOptions } from './components/SetupScreen'
import { acikOyunuOku, acikOyunuSil, acikOyunuYaz } from './acikOyun'
import { randomRoomCode } from './net/odakodu'

/*
  Oyun ekranı ayrı bir paket olarak yükleniyor.

  Açılışta gereken tek şey giriş ve ana ekran; oyun ekranı ise yanında motoru
  (kesim, tuval), PeerJS'i ve ses üretimini getiriyor. Hepsi tek pakette
  olduğunda ilk açılışta ~694 KB indiriliyordu. Bölündükten sonra oyun paketi
  ancak bir puzzle açılırken iniyor — o sırada zaten "Parçalar kesiliyor"
  ekranı var, bekleme fark edilmiyor.

  `type GameConfig` yukarıda ayrıca ve yalnızca tip olarak alınıyor: normal
  import olsaydı modül açılış paketine geri girer, bölme hiçbir işe yaramazdı.
*/
const GameScreen = lazy(() => import('./components/GameScreen'))
import { useDil } from './dil'
import { savePuzzle, type SavedPuzzle } from './storage'
import { useAuth } from './supabase/auth'
import {
  kurtarmaHatasi,
  kurtarmaJetonu,
  kurtarmaJetonunuTemizle,
  supabase,
} from './supabase/client'
import { createRemotePuzzle } from './supabase/puzzles'

type Screen =
  | { s: 'home' }
  | { s: 'setup'; imageDataUrl: string; defaultTitle: string; artist: string }
  | { s: 'game'; config: GameConfig }
  /** Davet linkiyle gelindi: hesapla mı misafir mi devam edileceği soruluyor */
  | { s: 'join'; roomCode: string }

/** Davet linkindeki oda kodu (#room=abc123) */
function davetKodu(): string | null {
  return location.hash.match(/room=([a-z0-9]+)/)?.[1] ?? null
}

function initialScreen(): Screen {
  const kod = davetKodu()
  if (kod) return { s: 'join', roomCode: kod }
  // Sayfa oyunun ortasında yenilendiyse aynı puzzle'a geri dön
  const acik = acikOyunuOku()
  return acik ? { s: 'game', config: acik } : { s: 'home' }
}

/**
 * Yerel kayıt kimliği olarak oda kodunu kullanıyoruz: aynı puzzle'a hangi
 * yoldan girilirse girilsin (yerel / sunucu / davet linki) tek kayıt olur.
 */
function misafirConfig(kod: string, misafirZorla = false): GameConfig {
  return { puzzleId: kod, mode: 'guest', roomCode: kod, misafirZorla }
}

export default function App() {
  const auth = useAuth()
  const { dil, ceviri } = useDil()
  const [screen, setScreenRaw] = useState<Screen>(initialScreen)

  /**
   * Ekran değişimlerini tarayıcı geçmişine yazar; böylece telefondaki ya da
   * tarayıcıdaki geri tuşu bir önceki ekrana döner. Eskiden tek bir geçmiş
   * girdisi olduğu için geri tuşu siteden tamamen çıkıyordu.
   */
  const setScreen = (yeni: Screen) => {
    setScreenRaw(yeni)
    history.pushState({ ekran: yeni.s }, '')
  }

  useEffect(() => {
    // ilk girdiyi işaretle ki geri tuşu buraya dönebilsin
    history.replaceState({ ekran: 'home' }, '')
    const geri = () => {
      // Geçmişte geri gidildi: oyun/kurulum ekranındaysak ana ekrana dön.
      setScreenRaw((mevcut) => {
        if (mevcut.s === 'home') return mevcut
        if (location.hash) {
          history.replaceState(null, '', location.pathname + location.search)
        }
        return { s: 'home' }
      })
    }
    window.addEventListener('popstate', geri)
    return () => window.removeEventListener('popstate', geri)
  }, [])

  /*
    Açık oyunu sekmeye not et. Tek yerde duruyor çünkü ekran üç ayrı yoldan
    değişebiliyor (setScreen, geri tuşu, davetten dönüş); her birine ayrı satır
    yazmak birini unutmak demekti.
  */
  useEffect(() => {
    if (screen.s === 'game') acikOyunuYaz(screen.config)
    else acikOyunuSil()
  }, [screen])
  // Davet linkiyle gelen kişi önce seçim ekranını görür; giriş duvarına
  // ancak "hesabımla gireyim" derse takılır.
  // Yenilemeden sonra misafir oyununa geri dönüldüyse giriş duvarı çıkmasın:
  // kullanıcı bu oyuna zaten "misafir olarak devam et" diyerek girmişti.
  const [misafirDevam, setMisafirDevam] = useState(
    () => screen.s === 'game' && !!screen.config.misafirZorla,
  )
  /** Girişten sonra doğrudan odaya dönebilmek için beklemeye alınan davet */
  const [bekleyenDavet, setBekleyenDavet] = useState<string | null>(null)
  /**
   * Davette "hesabımla gireyim" seçildi: oturum açık olsa bile giriş formu
   * gösterilir. Sessizce mevcut hesapla devam etmek, linki başkasının
   * cihazında açanı yanlış hesapla odaya sokuyordu.
   */
  const [davetGirisi, setDavetGirisi] = useState(false)
  /**
   * Şifre sıfırlama bağlantısıyla mı gelindi.
   *
   * detectSessionInUrl kapalı olduğu için (adres çubuğundaki #room=... ile
   * çakışmasın diye) kurtarma jetonunu elle okuyup oturumu kendimiz kuruyoruz.
   */
  const [sifreYenileme, setSifreYenileme] = useState(false)

  const [saklaniyor, setSaklaniyor] = useState(false)
  /** Bilgi/hata kutusu — tarayıcının alert'i yerine */
  const [bilgi, setBilgi] = useState<{
    baslik: string
    mesaj: string
    /** Kutu kapanınca çalışacak iş */
    sonra?: () => void
  } | null>(null)

  useEffect(() => {
    // Bağlantı jeton yerine hata döndürdüyse sebebini göster. Yoksa kullanıcı
    // sessizce giriş ekranına düşüyor ve bağlantının neden işe yaramadığını
    // hiç öğrenemiyor — "sıfırlama çalışmıyor" diye görünen şey buydu.
    const kurtarmaHata = kurtarmaHatasi()
    if (kurtarmaHata) {
      setBilgi({ baslik: ceviri('Şifre sıfırlama'), mesaj: kurtarmaHata })
      kurtarmaJetonunuTemizle()
      return
    }
    const jeton = kurtarmaJetonu()
    if (!jeton || !supabase) return
    setSifreYenileme(true)
    void supabase.auth.setSession(jeton).finally(() => {
      // Jeton adres çubuğunda kalmasın
      kurtarmaJetonunuTemizle()
    })
    // Yalnızca açılışta bir kez: adres çubuğu okunup temizleniyor. Dile
    // bağlanırsa dil değişiminde kutu yeniden açılır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goHome = () => {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search)
    setScreen({ s: 'home' })
  }

  /**
   * Özel gün puzzle'ı: oyunu açmadan kaydet. Giriş yapılmışsa sunucuya
   * (böylece partner de kilitli görür), değilse yalnızca bu cihaza.
   */
  const ozelGuneSakla = async (kod: string, seed: number, opts: StartOptions) => {
    if (screen.s !== 'setup') return
    const gorsel = screen.imageDataUrl
    setSaklaniyor(true)
    try {
      if (auth.user) {
        await createRemotePuzzle({
          roomCode: kod,
          title: opts.title,
          artist: screen.artist,
          imageDataUrl: gorsel,
          seed,
          pieceCount: opts.pieceCount,
          message: opts.message,
          maxPlayers: opts.maxPlayers,
          rotation: opts.rotation,
          unlockAt: opts.unlockAt,
        })
      }
      savePuzzle({
        id: kod,
        title: opts.title,
        imageDataUrl: gorsel,
        seed,
        pieceCount: opts.pieceCount,
        snap: null,
        elapsed: 0,
        message: opts.message,
        completed: false,
        updatedAt: Date.now(),
        unlockAt: opts.unlockAt,
      })
      const ne = new Date(opts.unlockAt!).toLocaleString(dil === 'en' ? 'en-GB' : 'tr-TR')
      setBilgi({
        baslik: 'Özel gün için saklandı',
        mesaj: ceviri('"{ad}" {ne} tarihinde açılacak. O güne kadar kimse göremez.', {
          ad: opts.title,
          ne,
        }),
        sonra: goHome,
      })
    } catch {
      setBilgi({
        baslik: 'Kaydedilemedi',
        mesaj: ceviri('Bağlantını kontrol edip tekrar dene.'),
      })
    } finally {
      setSaklaniyor(false)
    }
  }

  // Arka plan: giriş yapılmadan bulanık, girildikten sonra net.
  // Oyun ekranında tuval tam ekran olduğu için tamamen gizlenir.
  const bulanik = auth.enabled && !auth.user
  const oyunda = screen.s === 'game'
  const arkaPlan = (
    <>
      <div className={`bg ${bulanik ? 'blurred' : ''} ${oyunda ? 'hidden' : ''}`} aria-hidden="true" />
      <div
        className={`bg-scrim ${bulanik ? 'dim' : ''} ${oyunda ? 'hidden' : ''}`}
        aria-hidden="true"
      />
    </>
  )

  const icerik = () => {
    if (saklaniyor) {
      return (
        <div className="overlay">
          <div className="spinner" />
          <p>{ceviri('Özel gün için saklanıyor…')}</p>
        </div>
      )
    }

    if (auth.enabled && auth.loading) {
      return (
        <div className="overlay">
          <div className="spinner" />
          <p>{ceviri('Bir saniye…')}</p>
        </div>
      )
    }

    // Davet linki: önce nasıl devam edileceği sorulur
    if (screen.s === 'join') {
      return (
        <JoinChoiceScreen
          roomCode={screen.roomCode}
          onGiris={() => {
            if (!auth.enabled) {
              setScreen({ s: 'game', config: misafirConfig(screen.roomCode) })
              return
            }
            // Oturum açık olsa bile giriş formu gösterilir; girince odaya devam
            setBekleyenDavet(screen.roomCode)
            setDavetGirisi(true)
            setMisafirDevam(false)
            setScreen({ s: 'home' })
          }}
          onMisafir={() => {
            setMisafirDevam(true)
            // Cihazda oturum açık olsa bile misafir olarak girilir
            setScreen({ s: 'game', config: misafirConfig(screen.roomCode, true) })
          }}
        />
      )
    }

    // Şifre sıfırlama bağlantısı her şeyden önce gelir
    if (sifreYenileme) {
      return (
        <NewPasswordScreen
          onBitti={() => setSifreYenileme(false)}
          onVazgec={() => {
            setSifreYenileme(false)
            void auth.signOut()
          }}
        />
      )
    }

    // Davetten gelen giriş: şifre sorulur, otomatik geçilmez
    if (auth.enabled && davetGirisi && bekleyenDavet) {
      const kod = bekleyenDavet
      return (
        <AuthScreen
          baslik={
            <>
              {ceviri('Davete')} <span>{ceviri('katıl')}</span>
            </>
          }
          altYazi="Hesabınla gir; çözdüğünüz tablo ikinizin de geçmişine düşsün."
          atlaYazisi="Vazgeçtim, misafir olarak gireyim"
          mevcutHesap={auth.user ? auth.displayName : null}
          onMevcutlaDevam={() => setDavetGirisi(false)}
          onBasarili={() => setDavetGirisi(false)}
          onSkip={() => {
            setDavetGirisi(false)
            setBekleyenDavet(null)
            setMisafirDevam(true)
            setScreen({ s: 'game', config: misafirConfig(kod, true) })
          }}
        />
      )
    }

    if (auth.enabled && !auth.user && !misafirDevam) {
      return <AuthScreen onSkip={() => setMisafirDevam(true)} />
    }

    // Giriş tamamlandıysa bekleyen davete geç
    if (bekleyenDavet && auth.user) {
      const kod = bekleyenDavet
      queueMicrotask(() => {
        setBekleyenDavet(null)
        setScreen({ s: 'game', config: misafirConfig(kod) })
      })
      return (
        <div className="overlay">
          <div className="spinner" />
          <p>{ceviri('Odaya bağlanılıyor')}</p>
        </div>
      )
    }

    switch (screen.s) {
      case 'home':
        return (
        <HomeScreen
          onPickImage={(imageDataUrl, defaultTitle, artist) =>
            setScreen({ s: 'setup', imageDataUrl, defaultTitle, artist })
          }
          onResume={(saved: SavedPuzzle) =>
            setScreen({
              s: 'game',
              config: {
                puzzleId: saved.id,
                mode: 'local',
                title: saved.title,
                imageDataUrl: saved.imageDataUrl,
                seed: saved.seed,
                pieceCount: saved.pieceCount,
                message: saved.message,
                elapsed: saved.elapsed,
                snap: saved.snap,
              },
            })
          }
          onResumeRemote={(p) =>
            setScreen({
              s: 'game',
              config: {
                puzzleId: p.room_code,
                mode: 'remote',
                remoteId: p.id,
                // İyimser kilidin dayanağı: bu damgayla okuduk, bununla yazacağız
                updatedAt: p.updated_at,
                roomCode: p.room_code,
                title: p.title,
                artist: p.artist ?? '',
                imagePath: p.image_path,
                seed: p.seed,
                pieceCount: p.piece_count,
                message: p.message,
                maxPlayers: p.max_players,
                elapsed: p.elapsed,
                snap: p.state,
              },
            })
          }
          onSignIn={() => setMisafirDevam(false)}
        />
        )
      case 'setup':
        return (
        <SetupScreen
          imageDataUrl={screen.imageDataUrl}
          defaultTitle={screen.defaultTitle}
          onBack={goHome}
          onStart={(opts) => {
            // Oda kodunu baştan üret: davet linki, sunucudaki kayıt ve yerel
            // kayıt aynı kimliği paylaşsın (tek başına oynansa bile kaydedilir)
            const kod = randomRoomCode()
            const seed = (Math.random() * 0xffffffff) >>> 0
            const ileriTarihli =
              !!opts.unlockAt && new Date(opts.unlockAt).getTime() > Date.now()

            // Özel gün için saklanıyorsa oyunu açma: kaydet ve ana sayfaya dön.
            // (Yoksa "sakla" deyip anında oynamış oluyorduk.)
            if (ileriTarihli) {
              void ozelGuneSakla(kod, seed, opts)
              return
            }

            setScreen({
              s: 'game',
              config: {
                puzzleId: kod,
                mode: 'local',
                autoHost: opts.withPartner,
                roomCode: kod,
                title: opts.title,
                artist: screen.artist,
                imageDataUrl: screen.imageDataUrl,
                seed,
                pieceCount: opts.pieceCount,
                message: opts.message,
                maxPlayers: opts.maxPlayers,
                rotation: opts.rotation,
                unlockAt: opts.unlockAt,
                elapsed: 0,
                snap: null,
              },
            })
          }}
        />
        )
      case 'game':
        return (
          <Suspense
            fallback={
              <div className="overlay">
                <div className="spinner" />
                <p>{ceviri('Bir saniye…')}</p>
              </div>
            }
          >
            <GameScreen key={screen.config.puzzleId} config={screen.config} onExit={goHome} />
          </Suspense>
        )
    }
  }

  return (
    <>
      {arkaPlan}
      {icerik()}
      {bilgi && (
        <ConfirmDialog
          baslik={bilgi.baslik}
          mesaj={bilgi.mesaj}
          tekButon
          onayYazisi="Tamam"
          onIptal={() => setBilgi(null)}
          onOnayla={() => {
            const sonra = bilgi.sonra
            setBilgi(null)
            sonra?.()
          }}
        />
      )}
    </>
  )
}
