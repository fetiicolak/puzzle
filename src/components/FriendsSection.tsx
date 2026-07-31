import { useCallback, useEffect, useState } from 'react'
import MessageBox from './MessageBox'
import {
  arkadaslikIste,
  arkadasligiKabulEt,
  arkadasligiSil,
  arkadasliklariGetir,
  birlikteOynananlar,
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

  const tazele = useCallback(async () => {
    const liste = await arkadasliklariGetir()
    setArkadasliklar(liste)
    // zaten arkadaş olduğun ya da istek gidip gelen kişileri önerme
    setOneriler(await birlikteOynananlar(liste.map((a) => a.kisi.id)))
    setOkunmamis(await okunmamisSayilari())
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

  const sarmala = async (anahtar: string, is: () => Promise<void>) => {
    setIslemdeki(anahtar)
    try {
      await is()
      await tazele()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'İşlem yapılamadı')
    } finally {
      setIslemdeki(null)
    }
  }

  const arkadaslar = arkadasliklar.filter((a) => a.durum === 'accepted')
  const gelenler = arkadasliklar.filter((a) => a.durum === 'pending' && a.yon === 'gelen')
  const gidenler = arkadasliklar.filter((a) => a.durum === 'pending' && a.yon === 'giden')

  if (yukleniyor) return null
  if (arkadaslar.length === 0 && gelenler.length === 0 && gidenler.length === 0 && oneriler.length === 0) {
    return null
  }

  const bas = (ad: string) => (ad[0] ?? '?').toUpperCase()

  return (
    <section className="block">
      <h2 className="section-label">
        Arkadaşlar
        {gelenler.length > 0 && <span className="badge">{gelenler.length}</span>}
      </h2>

      {acikSohbet && (
        <MessageBox
          kisi={acikSohbet}
          onKapat={() => {
            setAcikSohbet(null)
            void tazele()
          }}
        />
      )}

      {gelenler.length > 0 && (
        <div className="friend-list">
          {gelenler.map((a) => (
            <div key={a.id} className="friend-row pending">
              <span className="avatar">{bas(a.kisi.ad)}</span>
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
              <span className="avatar">{bas(a.kisi.ad)}</span>
              <div className="info">
                <b>{a.kisi.ad}</b>
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
                onClick={() => {
                  if (confirm(`${a.kisi.ad} arkadaşlıktan çıkarılsın mı?`)) {
                    void sarmala(a.id, () => arkadasligiSil(a.id))
                  }
                }}
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
              <span className="avatar dim">{bas(a.kisi.ad)}</span>
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

      {oneriler.length > 0 && (
        <>
          <p className="hint-line">Birlikte puzzle çözdüklerin</p>
          <div className="friend-list">
            {oneriler.map((k) => (
              <div key={k.id} className="friend-row">
                <span className="avatar dim">{bas(k.ad)}</span>
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
    </section>
  )
}
