import { useEffect, useRef, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import { basHarfler } from '../ad'
import { hataMetni } from '../supabase/client'
import {
  engelle,
  mesajGonder,
  mesajSil,
  mesajlariGetir,
  okunduIsaretle,
  sikayetEt,
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
  const [hata, setHata] = useState<string | null>(null)
  const [menuAcik, setMenuAcik] = useState(false)
  const [sikayetAcik, setSikayetAcik] = useState(false)
  const [sebep, setSebep] = useState('')
  const [engelOnayi, setEngelOnayi] = useState(false)
  const [bilgi, setBilgi] = useState<string | null>(null)
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
    setHata(null)
    try {
      await mesajGonder(kisi.id, t)
      setMetin('')
      await tazele()
    } catch (err) {
      // Ham İngilizce sunucu metni kullanıcıya gösterilmesin
      setHata(err instanceof Error ? hataMetni(err.message) : 'Mesaj gönderilemedi')
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
          <span className="avatar">{basHarfler(kisi.ad)}</span>
          <b>{kisi.ad}</b>
          <span className="spacer" />
          <button
            className={`icon-btn ${menuAcik ? 'on' : ''}`}
            onClick={() => setMenuAcik((v) => !v)}
            title="Diğer"
          >
            ⋯
          </button>
          <button className="icon-btn" onClick={onKapat} title="Kapat">
            ✕
          </button>
        </header>

        {menuAcik && (
          <div className="sohbet-menu">
            {!sikayetAcik ? (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => setSikayetAcik(true)}>
                  ⚑ Şikayet et
                </button>
                <button
                  className="btn btn-ghost btn-sm tehlike-yazi"
                  onClick={() => setEngelOnayi(true)}
                >
                  🚫 Engelle
                </button>
              </>
            ) : (
              <form
                className="sikayet-form"
                onSubmit={async (e) => {
                  e.preventDefault()
                  setHata(null)
                  try {
                    await sikayetEt(kisi.id, sebep)
                    setSikayetAcik(false)
                    setMenuAcik(false)
                    setSebep('')
                    setBilgi('Şikayetin iletildi. Teşekkürler.')
                  } catch (err) {
                    setHata(err instanceof Error ? hataMetni(err.message) : 'Gönderilemedi')
                  }
                }}
              >
                <label className="field">
                  <span className="field-label">Ne oldu?</span>
                  <textarea
                    className="input textarea"
                    placeholder="Kısaca anlat…"
                    value={sebep}
                    maxLength={1000}
                    required
                    onChange={(e) => setSebep(e.target.value)}
                  />
                </label>
                <div className="dialog-butonlar">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setSikayetAcik(false)}
                  >
                    Vazgeç
                  </button>
                  <button className="btn btn-primary btn-sm" type="submit">
                    Gönder
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {engelOnayi && (
          <ConfirmDialog
            baslik="Engelle"
            mesaj={`${kisi.ad} sana mesaj gönderemeyecek ve profilini göremeyecek. Aranızdaki arkadaşlık da kalkar. İstediğin zaman engeli kaldırabilirsin.`}
            onayYazisi="Engelle"
            tehlikeli
            onIptal={() => setEngelOnayi(false)}
            onOnayla={async () => {
              await engelle(kisi.id)
              setEngelOnayi(false)
              onKapat()
            }}
          />
        )}

        {bilgi && (
          <ConfirmDialog
            baslik="Teşekkürler"
            mesaj={bilgi}
            tekButon
            onayYazisi="Tamam"
            onIptal={() => setBilgi(null)}
            onOnayla={() => setBilgi(null)}
          />
        )}

        <div className="chat-body">
          {yukleniyor && <p className="muted chat-bos">Yükleniyor…</p>}
          {!yukleniyor && mesajlar.length === 0 && (
            <p className="muted chat-bos">Henüz mesajlaşmamışsınız.</p>
          )}
          {mesajlar.map((m) => (
            <div key={m.id} className={`chat-satir ${m.benMi ? 'ben' : ''}`}>
              <span className="chat-balon">{m.metin}</span>
              <small className="chat-ad">
                {saat(m.ts)}
                {/* Rahatsız eden bir mesajı gelen kutundan kaldırabilirsin */}
                <button
                  className="mesaj-sil"
                  title="Bu mesajı sil"
                  onClick={async () => {
                    setHata(null)
                    try {
                      await mesajSil(m.id)
                      setMesajlar((l) => l.filter((x) => x.id !== m.id))
                    } catch (err) {
                      setHata(err instanceof Error ? hataMetni(err.message) : 'Silinemedi')
                    }
                  }}
                >
                  ✕
                </button>
              </small>
            </div>
          ))}
          <div ref={sonRef} />
        </div>

        {hata && <div className="form-error mesaj-hata">{hata}</div>}

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
