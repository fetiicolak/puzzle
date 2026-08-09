import { useCallback, useEffect, useState } from 'react'
import MessageBox from './MessageBox'
import { basHarfler } from '../ad'
import { avatarUrlleri } from '../supabase/profile'
import {
  arkadasliklariGetir,
  cevrimiciMi,
  sohbetler,
  type Kisi,
  type Sohbet,
} from '../supabase/friends'

/** "14:32" bugünse, değilse "3 Ağu" */
function zamanMetni(iso: string): string {
  const t = new Date(iso)
  const bugun = new Date()
  const ayniGun =
    t.getDate() === bugun.getDate() &&
    t.getMonth() === bugun.getMonth() &&
    t.getFullYear() === bugun.getFullYear()
  return ayniGun
    ? t.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : t.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

/**
 * Mesajlar bölümü.
 *
 * Arkadaşlar listesinden ayrı duruyor: orası arkadaşlığı yönetmek için
 * (kabul et, çıkar, engelle), burası yazışmak için. Okunmamış mesaj sayısı
 * bölüm kapalıyken de başlıkta görünür — yoksa yeni mesajı fark etmek için
 * listeyi açmak gerekiyordu.
 */
export default function MessagesSection() {
  const [liste, setListe] = useState<Sohbet[]>([])
  /** Henüz yazışmadığın arkadaşlar — "Yeni mesaj" altında çıkar */
  const [yazilmayanlar, setYazilmayanlar] = useState<Kisi[]>([])
  const [avatarlar, setAvatarlar] = useState<Map<string, string>>(new Map())
  const [yukleniyor, setYukleniyor] = useState(true)
  const [acik, setAcik] = useState(false)
  const [yeniAcik, setYeniAcik] = useState(false)
  const [acikSohbet, setAcikSohbet] = useState<Kisi | null>(null)

  const tazele = useCallback(async () => {
    const sohbetListesi = await sohbetler()
    const arkadaslar = (await arkadasliklariGetir())
      .filter((a) => a.durum === 'accepted')
      .map((a) => a.kisi)

    const yazisilanlar = new Set(sohbetListesi.map((s) => s.kisi.id))
    const kalanlar = arkadaslar.filter((k) => !yazisilanlar.has(k.id))

    setListe(sohbetListesi.sort((a, b) => b.sonZaman.localeCompare(a.sonZaman)))
    setYazilmayanlar(kalanlar)
    setAvatarlar(
      await avatarUrlleri([
        ...sohbetListesi.map((s) => s.kisi.avatarPath),
        ...kalanlar.map((k) => k.avatarPath),
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

  // Yeni mesaj gelirse başlıktaki sayı kendiliğinden artsın; bölüm kapalıyken
  // de çalışır, rozeti görmek için listeyi açmak gerekmesin.
  useEffect(() => {
    const zamanlayici = setInterval(() => void tazele(), 30_000)
    return () => clearInterval(zamanlayici)
  }, [tazele])

  if (yukleniyor) return null
  if (liste.length === 0 && yazilmayanlar.length === 0) return null

  const toplamOkunmamis = liste.reduce((t, s) => t + s.okunmamis, 0)

  const Avatar = ({ kisi }: { kisi: Kisi }) => {
    const url = kisi.avatarPath ? avatarlar.get(kisi.avatarPath) : null
    return (
      <span className={`avatar ${cevrimiciMi(kisi.sonGorulme) ? 'cevrimici' : ''}`}>
        {url ? <img src={url} alt="" /> : basHarfler(kisi.ad)}
      </span>
    )
  }

  return (
    <section className="block">
      <button
        className={`section-katlanir ${acik ? 'acik' : ''}`}
        onClick={() => setAcik((v) => !v)}
        aria-expanded={acik}
      >
        <span className="katlanir-ok">▸</span>
        Mesajlar
        <em className="field-hint">{liste.length}</em>
        {toplamOkunmamis > 0 && <span className="badge">{toplamOkunmamis}</span>}
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

      {acik && (
        <>
          {liste.length === 0 && (
            <p className="hint-line">Henüz kimseyle yazışmadın.</p>
          )}

          {liste.length > 0 && (
            <div className="friend-list">
              {liste.map((s) => (
                <button
                  key={s.kisi.id}
                  className={`sohbet-satir ${s.okunmamis > 0 ? 'okunmamis' : ''}`}
                  onClick={() => setAcikSohbet(s.kisi)}
                >
                  <Avatar kisi={s.kisi} />
                  <div className="info">
                    <b>
                      <span className="ad-kisa">{s.kisi.ad}</span>
                      <small className="sohbet-zaman">{zamanMetni(s.sonZaman)}</small>
                    </b>
                    <small className="sohbet-onizleme">
                      {s.benMiYazdi && <span className="muted">Sen: </span>}
                      {s.sonMetin}
                    </small>
                  </div>
                  {s.okunmamis > 0 && <span className="badge">{s.okunmamis}</span>}
                </button>
              ))}
            </div>
          )}

          {yazilmayanlar.length > 0 && (
            <>
              <button
                className={`section-katlanir ince ${yeniAcik ? 'acik' : ''}`}
                onClick={() => setYeniAcik((v) => !v)}
                aria-expanded={yeniAcik}
              >
                <span className="katlanir-ok">▸</span>
                Yeni mesaj
                <em className="field-hint">{yazilmayanlar.length}</em>
              </button>

              {yeniAcik && (
                <div className="friend-list">
                  {yazilmayanlar.map((k) => (
                    <button
                      key={k.id}
                      className="sohbet-satir"
                      onClick={() => setAcikSohbet(k)}
                    >
                      <Avatar kisi={k} />
                      <div className="info">
                        <b>
                          <span className="ad-kisa">{k.ad}</span>
                        </b>
                        <small className="sohbet-onizleme muted">
                          {cevrimiciMi(k.sonGorulme) ? 'şu an sitede' : 'henüz yazışmadınız'}
                        </small>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}
