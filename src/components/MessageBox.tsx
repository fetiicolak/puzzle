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

/** Yazma barının üstündeki hızlı emojiler */
const EMOJILER = [
  '😄', '😅', '😍', '😘', '🥰', '😎', '🤔', '😢',
  '😴', '🙈', '👍', '👏', '🙌', '❤️', '🔥', '🎉',
  '🧩', '☕', '🌙', '✨',
]

/** Bir arkadaşla yazışma penceresi */
export default function MessageBox({ kisi, onKapat }: Props) {
  const [mesajlar, setMesajlar] = useState<Mesaj[]>([])
  const [metin, setMetin] = useState('')
  const [yukleniyor, setYukleniyor] = useState(true)
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [emojiAcik, setEmojiAcik] = useState(false)
  const sonRef = useRef<HTMLDivElement>(null)
  const girdiRef = useRef<HTMLInputElement>(null)

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

  /** Emojiyi imlecin bulunduğu yere ekle, odağı yazı alanında bırak */
  const emojiEkle = (e: string) => {
    const el = girdiRef.current
    if (!el) {
      setMetin((m) => (m + e).slice(0, 1000))
      return
    }
    const bas = el.selectionStart ?? metin.length
    const son = el.selectionEnd ?? metin.length
    const yeni = (metin.slice(0, bas) + e + metin.slice(son)).slice(0, 1000)
    setMetin(yeni)
    requestAnimationFrame(() => {
      el.focus()
      const yer = Math.min(bas + e.length, yeni.length)
      el.setSelectionRange(yer, yer)
    })
  }

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

        <div className={`emoji-cubuk ${emojiAcik ? 'genis' : ''}`}>
          {(emojiAcik ? EMOJILER : EMOJILER.slice(0, 8)).map((e) => (
            <button
              key={e}
              type="button"
              className="tepki"
              disabled={gonderiliyor}
              title={`${e} ekle`}
              onClick={() => emojiEkle(e)}
            >
              {e}
            </button>
          ))}
          <button
            type="button"
            className="tepki emoji-daha"
            title={emojiAcik ? 'Daha az göster' : 'Daha fazla emoji'}
            onClick={() => setEmojiAcik((v) => !v)}
          >
            {emojiAcik ? '▴' : '⋯'}
          </button>
        </div>

        <form className="chat-form" onSubmit={gonder}>
          <input
            ref={girdiRef}
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
