import { useEffect, useRef, useState } from 'react'
import {
  mesajGonder,
  mesajlariGetir,
  okunduIsaretle,
  type Kisi,
  type Mesaj,
} from '../supabase/friends'

interface Props {
  kisi: Kisi
  onKapat: () => void
}

/** Bir arkadaşla yazışma penceresi */
export default function MessageBox({ kisi, onKapat }: Props) {
  const [mesajlar, setMesajlar] = useState<Mesaj[]>([])
  const [metin, setMetin] = useState('')
  const [yukleniyor, setYukleniyor] = useState(true)
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const sonRef = useRef<HTMLDivElement>(null)

  const tazele = async () => {
    setMesajlar(await mesajlariGetir(kisi.id))
    await okunduIsaretle(kisi.id)
  }

  useEffect(() => {
    let iptal = false
    tazele().finally(() => {
      if (!iptal) setYukleniyor(false)
    })
    // pencere açıkken yeni mesajları çek
    const id = setInterval(() => void tazele(), 6000)
    return () => {
      iptal = true
      clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kisi.id])

  useEffect(() => {
    sonRef.current?.scrollIntoView({ block: 'end' })
  }, [mesajlar.length])

  const gonder = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = metin.trim()
    if (!t || gonderiliyor) return
    setGonderiliyor(true)
    try {
      await mesajGonder(kisi.id, t)
      setMetin('')
      await tazele()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Mesaj gönderilemedi')
    } finally {
      setGonderiliyor(false)
    }
  }

  const saat = (iso: string) =>
    new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="modal-arka" onClick={onKapat}>
      <div className="mesaj-kutusu" onClick={(e) => e.stopPropagation()}>
        <header className="chat-head">
          <span className="avatar">{(kisi.ad[0] ?? '?').toUpperCase()}</span>
          <b>{kisi.ad}</b>
          <span className="spacer" />
          <button className="icon-btn" onClick={onKapat} title="Kapat">
            ✕
          </button>
        </header>

        <div className="chat-body">
          {yukleniyor && <p className="muted chat-bos">Yükleniyor…</p>}
          {!yukleniyor && mesajlar.length === 0 && (
            <p className="muted chat-bos">Henüz mesajlaşmamışsınız.</p>
          )}
          {mesajlar.map((m) => (
            <div key={m.id} className={`chat-satir ${m.benMi ? 'ben' : ''}`}>
              <span className="chat-balon">{m.metin}</span>
              <small className="chat-ad">{saat(m.ts)}</small>
            </div>
          ))}
          <div ref={sonRef} />
        </div>

        <form className="chat-form" onSubmit={gonder}>
          <input
            className="input"
            placeholder="Mesaj yaz…"
            value={metin}
            maxLength={1000}
            disabled={gonderiliyor}
            onChange={(e) => setMetin(e.target.value)}
          />
          <button className="btn btn-primary btn-sm" type="submit" disabled={gonderiliyor}>
            Gönder
          </button>
        </form>
      </div>
    </div>
  )
}
