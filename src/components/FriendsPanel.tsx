import { useCallback, useEffect, useState } from 'react'
import MessageBox from './MessageBox'
import { basHarfler } from '../ad'
import { hataMetni } from '../supabase/client'
import { avatarUrlleri } from '../supabase/profile'
import {
  arkadasliklariGetir,
  cevrimiciMi,
  mesajGonder,
  okunmamisSayilari,
  type Kisi,
} from '../supabase/friends'

interface Props {
  /** Paylaşılacak davet linki; oda henüz kurulmadıysa boş */
  davetLinki: string
  onKapat: () => void
}

/**
 * Oyun içindeki arkadaş paneli: kim sitede, kime mesaj, kime davet.
 *
 * Davet linkini kopyalayıp başka bir uygulamaya yapıştırmak gerekmesin diye
 * link doğrudan mesaj olarak gidiyor; karşı taraf mesajdaki bağlantıya
 * tıklayınca odaya giriyor (bkz. Linkli).
 */
export default function FriendsPanel({ davetLinki, onKapat }: Props) {
  const [arkadaslar, setArkadaslar] = useState<Kisi[]>([])
  const [avatarlar, setAvatarlar] = useState<Map<string, string>>(new Map())
  const [okunmamis, setOkunmamis] = useState<Map<string, number>>(new Map())
  const [yukleniyor, setYukleniyor] = useState(true)
  const [gonderilen, setGonderilen] = useState<Set<string>>(new Set())
  const [islemdeki, setIslemdeki] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [acikSohbet, setAcikSohbet] = useState<Kisi | null>(null)

  const tazele = useCallback(async () => {
    const liste = (await arkadasliklariGetir()).filter((a) => a.durum === 'accepted')
    const kisiler = liste.map((a) => a.kisi)
    setArkadaslar(kisiler)
    setOkunmamis(await okunmamisSayilari())
    setAvatarlar(await avatarUrlleri(kisiler.map((k) => k.avatarPath)))
  }, [])

  useEffect(() => {
    let iptal = false
    tazele().finally(() => {
      if (!iptal) setYukleniyor(false)
    })
    // "Şu an sitede" ışığı damgayla aynı sıklıkta tazelensin
    const zamanlayici = setInterval(() => void tazele(), 60_000)
    return () => {
      iptal = true
      clearInterval(zamanlayici)
    }
  }, [tazele])

  const davetEt = async (kisi: Kisi) => {
    setIslemdeki(kisi.id)
    setHata(null)
    try {
      await mesajGonder(kisi.id, `Birlikte puzzle çözelim mi? ${davetLinki}`)
      setGonderilen((s) => new Set(s).add(kisi.id))
    } catch (e) {
      setHata(e instanceof Error ? hataMetni(e.message) : 'Davet gönderilemedi')
    } finally {
      setIslemdeki(null)
    }
  }

  return (
    <aside className="oda-panel">
      <header className="chat-head">
        <b>Arkadaşlar</b>
        <span className="spacer" />
        <button className="icon-btn" onClick={onKapat} title="Kapat">
          ✕
        </button>
      </header>

      {acikSohbet && (
        <MessageBox
          kisi={acikSohbet}
          onKapat={() => {
            setAcikSohbet(null)
            void tazele()
          }}
        />
      )}

      <div className="oda-liste">
        {yukleniyor && <p className="muted chat-bos">Yükleniyor…</p>}

        {!yukleniyor && arkadaslar.length === 0 && (
          <p className="muted chat-bos">
            Henüz arkadaşın yok. Ana ekrandaki Arkadaşlar bölümünden ekleyebilirsin.
          </p>
        )}

        {arkadaslar.map((k) => {
          const url = k.avatarPath ? avatarlar.get(k.avatarPath) : null
          const cevrimici = cevrimiciMi(k.sonGorulme)
          const okunmamisSayi = okunmamis.get(k.id) ?? 0
          return (
            <div key={k.id} className="oda-satir">
              <span className={`avatar ${cevrimici ? 'cevrimici' : 'dim'}`}>
                {url ? <img src={url} alt="" /> : basHarfler(k.ad)}
              </span>
              <div className="info">
                <b>
                  <span className="ad-kisa">{k.ad}</span>
                </b>
                <small className="muted">{cevrimici ? 'şu an sitede' : 'çevrimdışı'}</small>
              </div>

              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setAcikSohbet(k)}
                title="Mesaj yaz"
              >
                💬
                {okunmamisSayi > 0 && <span className="badge">{okunmamisSayi}</span>}
              </button>

              <button
                className="btn btn-sm btn-secondary"
                disabled={!davetLinki || islemdeki === k.id || gonderilen.has(k.id)}
                title={davetLinki ? 'Davet linkini mesaj olarak gönder' : 'Önce odayı kur'}
                onClick={() => void davetEt(k)}
              >
                {gonderilen.has(k.id) ? 'Gönderildi' : islemdeki === k.id ? '…' : 'Davet et'}
              </button>
            </div>
          )
        })}
      </div>

      {hata && <div className="form-error">{hata}</div>}

      {!davetLinki && arkadaslar.length > 0 && (
        <small className="muted oda-not">
          Davet gönderebilmek için önce üstteki “Davet” düğmesiyle odayı kur.
        </small>
      )}
    </aside>
  )
}
