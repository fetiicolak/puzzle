import { useCallback, useEffect, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import MessageBox from './MessageBox'
import { basHarfler } from '../ad'
import { hataMetni } from '../supabase/client'
import { avatarUrlleri } from '../supabase/profile'
import {
  arkadaslikIste,
  arkadasligiKabulEt,
  arkadasligiSil,
  arkadasliklariGetir,
  birlikteOynananlar,
  cevrimiciMi,
  engellenenler,
  engeliKaldir,
  okunmamisSayilari,
  type Arkadaslik,
  type Kisi,
} from '../supabase/friends'

export default function FriendsSection() {
  const [arkadasliklar, setArkadasliklar] = useState<Arkadaslik[]>([])
  const [oneriler, setOneriler] = useState<Kisi[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [islemdeki, setIslemdeki] = useState<string | null>(null)
  const [okunmamis, setOkunmamis] = useState<Map<string, number>>(new Map())
  const [acikSohbet, setAcikSohbet] = useState<Kisi | null>(null)
  /** Arkadaşlıktan çıkarılmak üzere onay bekleyen kişi */
  const [cikarilacak, setCikarilacak] = useState<Arkadaslik | null>(null)
  /** Başlığa tıklanınca liste açılır; sayfa uzamasın diye kapalı başlar */
  const [acik, setAcik] = useState(false)
  const [avatarlar, setAvatarlar] = useState<Map<string, string>>(new Map())
  const [hata, setHata] = useState<string | null>(null)
  const [engelliler, setEngelliler] = useState<Kisi[]>([])

  const tazele = useCallback(async () => {
    const liste = await arkadasliklariGetir()
    setArkadasliklar(liste)
    // zaten arkadaş olduğun ya da istek gidip gelen kişileri önerme
    const oneri = await birlikteOynananlar(liste.map((a) => a.kisi.id))
    setOneriler(oneri)
    setOkunmamis(await okunmamisSayilari())
    setEngelliler(await engellenenler())
    setAvatarlar(
      await avatarUrlleri([
        ...liste.map((a) => a.kisi.avatarPath),
        ...oneri.map((k) => k.avatarPath),
      ]),
    )
  }, [])

  useEffect(() => {
    let iptal = false
    tazele().finally(() => {
      if (!iptal) setYukleniyor(false)
    })
    return () => {
      iptal = true
    }
  }, [tazele])

  // Liste açıkken "şu an sitede" ışığı tazelensin. Kapalıyken sorgu atmıyoruz:
  // görünmeyen bir listeyi dakikada bir yenilemenin karşılığı yok.
  useEffect(() => {
    if (!acik) return
    const zamanlayici = setInterval(() => void tazele(), 60_000)
    return () => clearInterval(zamanlayici)
  }, [acik, tazele])

  const sarmala = async (anahtar: string, is: () => Promise<void>) => {
    setIslemdeki(anahtar)
    setHata(null)
    try {
      await is()
      await tazele()
    } catch (e) {
      // Ham İngilizce sunucu metni kullanıcıya gösterilmesin
      setHata(e instanceof Error ? hataMetni(e.message) : 'İşlem yapılamadı')
    } finally {
      setIslemdeki(null)
    }
  }

  const arkadaslar = arkadasliklar.filter((a) => a.durum === 'accepted')
  const gelenler = arkadasliklar.filter((a) => a.durum === 'pending' && a.yon === 'gelen')
  const gidenler = arkadasliklar.filter((a) => a.durum === 'pending' && a.yon === 'giden')

  if (yukleniyor) return null

  const bas = basHarfler

  /** Fotoğrafı varsa göster, yoksa baş harf */
  const Avatar = ({
    kisi,
    sonuk,
    isik,
  }: {
    kisi: Kisi
    sonuk?: boolean
    /** Sitedeyse fotoğrafın çevresine yeşil halka (yalnızca arkadaşlarda anlamlı) */
    isik?: boolean
  }) => {
    const url = kisi.avatarPath ? avatarlar.get(kisi.avatarPath) : null
    const cevrimici = isik && cevrimiciMi(kisi.sonGorulme)
    return (
      <span className={`avatar ${sonuk ? 'dim' : ''} ${cevrimici ? 'cevrimici' : ''}`}>
        {url ? <img src={url} alt="" /> : bas(kisi.ad)}
      </span>
    )
  }

  // Başlıktaki sayı yalnızca kabul edilmiş arkadaşları sayar. Eskiden bekleyen
  // istekler ve "birlikte çözdüklerin" önerileri de eklendiği için, tek
  // arkadaşın varken 2 görünüyordu.
  const toplam = arkadaslar.length

  // Engellediğin biri bölüm tamamen boşken de görünebilmeli
  const bosMu =
    arkadaslar.length === 0 &&
    gelenler.length === 0 &&
    gidenler.length === 0 &&
    oneriler.length === 0 &&
    engelliler.length === 0

  if (bosMu) return null

  return (
    <section className="block">
      {hata && <div className="form-error">{hata}</div>}

      <button
        className={`section-katlanir ${acik ? 'acik' : ''}`}
        onClick={() => setAcik((v) => !v)}
        aria-expanded={acik}
      >
        <span className="katlanir-ok">▸</span>
        Arkadaşlar
        <em className="field-hint">{toplam}</em>
        {gelenler.length > 0 && <span className="badge">{gelenler.length}</span>}
      </button>

      {acikSohbet && (
        <MessageBox
          kisi={acikSohbet}
          onKapat={() => {
            setAcikSohbet(null)
            void tazele()
          }}
        />
      )}

      {cikarilacak && (
        <ConfirmDialog
          baslik="Arkadaşlıktan çıkar"
          mesaj={`${cikarilacak.kisi.ad} arkadaş listenden çıkarılacak. Birbirinize mesaj gönderemezsiniz; birlikte çözdüğünüz tablolar durmaya devam eder.`}
          onayYazisi="Çıkar"
          tehlikeli
          onIptal={() => setCikarilacak(null)}
          onOnayla={async () => {
            await arkadasligiSil(cikarilacak.id)
            setCikarilacak(null)
            await tazele()
          }}
        />
      )}

      {acik && (
        <>
      {gelenler.length > 0 && (
        <div className="friend-list">
          {gelenler.map((a) => (
            <div key={a.id} className="friend-row pending">
              <Avatar kisi={a.kisi} />
              <div className="info">
                <b>{a.kisi.ad}</b>
                <small>seni arkadaş olarak ekledi</small>
              </div>
              <button
                className="btn btn-sm btn-primary"
                disabled={islemdeki === a.id}
                onClick={() => void sarmala(a.id, () => arkadasligiKabulEt(a.id))}
              >
                Kabul et
              </button>
              <button
                className="btn btn-sm btn-ghost"
                disabled={islemdeki === a.id}
                onClick={() => void sarmala(a.id, () => arkadasligiSil(a.id))}
              >
                Yoksay
              </button>
            </div>
          ))}
        </div>
      )}

      {arkadaslar.length > 0 && (
        <div className="friend-list">
          {arkadaslar.map((a) => (
            <div key={a.id} className="friend-row">
              <Avatar kisi={a.kisi} isik />
              <div className="info">
                <b>{a.kisi.ad}</b>
                <small>{cevrimiciMi(a.kisi.sonGorulme) ? 'şu an sitede' : 'çevrimdışı'}</small>
              </div>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => setAcikSohbet(a.kisi)}
              >
                Mesaj
                {(okunmamis.get(a.kisi.id) ?? 0) > 0 && (
                  <span className="badge">{okunmamis.get(a.kisi.id)}</span>
                )}
              </button>
              <button
                className="del"
                title="Arkadaşlıktan çıkar"
                disabled={islemdeki === a.id}
                onClick={() => setCikarilacak(a)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {gidenler.length > 0 && (
        <div className="friend-list">
          {gidenler.map((a) => (
            <div key={a.id} className="friend-row muted-row">
              <Avatar kisi={a.kisi} sonuk />
              <div className="info">
                <b>{a.kisi.ad}</b>
                <small>istek gönderildi</small>
              </div>
              <button
                className="btn btn-sm btn-ghost"
                disabled={islemdeki === a.id}
                onClick={() => void sarmala(a.id, () => arkadasligiSil(a.id))}
              >
                Geri al
              </button>
            </div>
          ))}
        </div>
      )}

      {engelliler.length > 0 && (
        <>
          <p className="hint-line">Engellediklerin</p>
          <div className="friend-list">
            {engelliler.map((k) => (
              <div key={k.id} className="friend-row muted-row">
                <Avatar kisi={k} sonuk />
                <div className="info">
                  <b>{k.ad}</b>
                  <small>sana mesaj gönderemez</small>
                </div>
                <button
                  className="btn btn-sm btn-ghost"
                  disabled={islemdeki === k.id}
                  onClick={() => void sarmala(k.id, () => engeliKaldir(k.id))}
                >
                  Engeli kaldır
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {oneriler.length > 0 && (
        <>
          <p className="hint-line">Birlikte puzzle çözdüklerin</p>
          <div className="friend-list">
            {oneriler.map((k) => (
              <div key={k.id} className="friend-row">
                <Avatar kisi={k} sonuk />
                <div className="info">
                  <b>{k.ad}</b>
                </div>
                <button
                  className="btn btn-sm btn-secondary"
                  disabled={islemdeki === k.id}
                  onClick={() => void sarmala(k.id, () => arkadaslikIste(k.id))}
                >
                  {islemdeki === k.id ? '…' : 'Ekle'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
        </>
      )}
    </section>
  )
}
