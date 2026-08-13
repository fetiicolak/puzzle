import { useCallback, useEffect, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import { basHarfler } from '../ad'
import { useDil } from '../dil'
import { hataMetni } from '../supabase/client'
import { avatarUrlleri } from '../supabase/profile'
import {
  ARAMA_EN_AZ,
  arkadaslikIste,
  arkadasligiKabulEt,
  arkadasligiSil,
  arkadasliklariGetir,
  birlikteOynananlar,
  cevrimiciMi,
  kisiAra,
  type Arkadaslik,
  type Kisi,
} from '../supabase/friends'

export default function FriendsSection() {
  const { ceviri } = useDil()
  const [arkadasliklar, setArkadasliklar] = useState<Arkadaslik[]>([])
  const [oneriler, setOneriler] = useState<Kisi[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [islemdeki, setIslemdeki] = useState<string | null>(null)
  /** Arkadaşlıktan çıkarılmak üzere onay bekleyen kişi */
  const [cikarilacak, setCikarilacak] = useState<Arkadaslik | null>(null)
  /** Başlığa tıklanınca liste açılır; sayfa uzamasın diye kapalı başlar */
  const [acik, setAcik] = useState(false)
  const [avatarlar, setAvatarlar] = useState<Map<string, string>>(new Map())
  const [hata, setHata] = useState<string | null>(null)
  /** Arama kutusuna yazılan metin */
  const [sorgu, setSorgu] = useState('')
  const [sonuclar, setSonuclar] = useState<Kisi[] | null>(null)
  const [araniyor, setAraniyor] = useState(false)

  const tazele = useCallback(async () => {
    const liste = await arkadasliklariGetir()
    setArkadasliklar(liste)
    // zaten arkadaş olduğun ya da istek gidip gelen kişileri önerme
    const oneri = await birlikteOynananlar(liste.map((a) => a.kisi.id))
    setOneriler(oneri)
    setAvatarlar(
      await avatarUrlleri([
        ...liste.map((a) => a.kisi.avatarPath),
        ...oneri.map((k) => k.avatarPath),
      ]),
    )
  }, [])

  useEffect(() => {
    let iptal = false
    void tazele().finally(() => {
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

  /*
    Yazdıkça arama. Her tuşta sorgu atmamak için 350 ms bekleniyor; `iptal`
    bayrağı da geç dönen bir cevabın daha yeni sonucun üstüne yazmasını
    engelliyor (kısa sorgu uzun sorgudan sonra dönebiliyor).
  */
  useEffect(() => {
    const temiz = sorgu.trim()
    if (temiz.length < ARAMA_EN_AZ) {
      setSonuclar(null)
      setAraniyor(false)
      return
    }
    let iptal = false
    setAraniyor(true)
    const zamanlayici = setTimeout(() => {
      void kisiAra(temiz)
        .then(async (liste) => {
          if (iptal) return
          setSonuclar(liste)
          const yeni = await avatarUrlleri(liste.map((k) => k.avatarPath))
          if (!iptal) setAvatarlar((eski) => new Map([...eski, ...yeni]))
        })
        .finally(() => {
          if (!iptal) setAraniyor(false)
        })
    }, 350)
    return () => {
      iptal = true
      clearTimeout(zamanlayici)
    }
  }, [sorgu])

  const sarmala = async (anahtar: string, is: () => Promise<void>) => {
    setIslemdeki(anahtar)
    setHata(null)
    try {
      await is()
      await tazele()
    } catch (e) {
      // Ham İngilizce sunucu metni kullanıcıya gösterilmesin
      setHata(e instanceof Error ? hataMetni(e.message) : ceviri('İşlem yapılamadı'))
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

  // Bölüm hiç arkadaşın yokken de duruyor: arama kutusu tam olarak o durumda
  // gerekiyor. (Eskiden liste boşsa bölüm hiç çizilmiyordu ve arkadaş
  // eklemenin tek yolu birlikte oynamış olmaktı.)

  /** Aramada çıkan ama zaten listende olan kişileri gösterme */
  const tanidik = new Set(arkadasliklar.map((a) => a.kisi.id))
  const bulunanlar = (sonuclar ?? []).filter((k) => !tanidik.has(k.id))
  /*
    Eleme yüzünden liste boş kaldıysa "bulunamadı" demek yanlış: kişi bulundu,
    zaten arkadaşın. Arkadaşının adını aramak aramayı denemenin en doğal yolu
    ve tam orada "kimse bulunamadı" çıkıyordu — arama bozuk görünüyordu.
  */
  const hepsiTanidik = (sonuclar ?? []).length > 0 && bulunanlar.length === 0

  return (
    <section className="block">
      {hata && <div className="form-error">{hata}</div>}

      <button
        className={`section-katlanir ${acik ? 'acik' : ''}`}
        onClick={() => setAcik((v) => !v)}
        aria-expanded={acik}
      >
        <span className="katlanir-ok">▸</span>
        {ceviri('Arkadaşlar')}
        <em className="field-hint">{toplam}</em>
        {gelenler.length > 0 && <span className="badge">{gelenler.length}</span>}
      </button>

      {cikarilacak && (
        <ConfirmDialog
          baslik="Arkadaşlıktan çıkar"
          mesaj={ceviri(
            '{ad} arkadaş listenden çıkarılacak. Birbirinize mesaj gönderemezsiniz; birlikte çözdüğünüz tablolar durmaya devam eder.',
            { ad: cikarilacak.kisi.ad },
          )}
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
      <label className="field">
        <span className="field-label">{ceviri('Arkadaş ara')}</span>
        <input
          className="input"
          type="search"
          value={sorgu}
          maxLength={40}
          placeholder={ceviri('Adının en az {n} harfi', { n: ARAMA_EN_AZ })}
          onChange={(e) => setSorgu(e.target.value)}
        />
      </label>

      {sonuclar !== null && (
        <div className="friend-list">
          {bulunanlar.map((k) => (
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
                {islemdeki === k.id ? '…' : ceviri('Ekle')}
              </button>
            </div>
          ))}
          {bulunanlar.length === 0 && !araniyor && (
            <p className="hint-line">
              {hepsiTanidik
                ? ceviri('Bu adla bulunan herkes zaten arkadaş listende.')
                : ceviri('Bu adla kimse bulunamadı.')}
            </p>
          )}
        </div>
      )}

      {gelenler.length > 0 && (
        <div className="friend-list">
          {gelenler.map((a) => (
            <div key={a.id} className="friend-row pending">
              <Avatar kisi={a.kisi} />
              <div className="info">
                <b>{a.kisi.ad}</b>
                <small>{ceviri('seni arkadaş olarak ekledi')}</small>
              </div>
              <button
                className="btn btn-sm btn-primary"
                disabled={islemdeki === a.id}
                onClick={() => void sarmala(a.id, () => arkadasligiKabulEt(a.id))}
              >
                {ceviri('Kabul et')}
              </button>
              <button
                className="btn btn-sm btn-ghost"
                disabled={islemdeki === a.id}
                onClick={() => void sarmala(a.id, () => arkadasligiSil(a.id))}
              >
                {ceviri('Yoksay')}
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
                <small>
                  {cevrimiciMi(a.kisi.sonGorulme)
                    ? ceviri('şu an sitede')
                    : ceviri('çevrimdışı')}
                </small>
              </div>
              <button
                className="del"
                aria-label={ceviri('Arkadaşlıktan çıkar')}
                title={ceviri('Arkadaşlıktan çıkar')}
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
                <small>{ceviri('istek gönderildi')}</small>
              </div>
              <button
                className="btn btn-sm btn-ghost"
                disabled={islemdeki === a.id}
                onClick={() => void sarmala(a.id, () => arkadasligiSil(a.id))}
              >
                {ceviri('Geri al')}
              </button>
            </div>
          ))}
        </div>
      )}

      {oneriler.length > 0 && (
        <>
          <p className="hint-line">{ceviri('Birlikte puzzle çözdüklerin')}</p>
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
                  {islemdeki === k.id ? '…' : ceviri('Ekle')}
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
