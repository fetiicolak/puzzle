import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ConfirmDialog from './ConfirmDialog'
import Linkli from './Linkli'
import { basHarfler } from '../ad'
import { useDil } from '../dil'
import { useModalErisim } from '../erisim'
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
  const { dil, ceviri } = useDil()
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
  const baslikId = useId()
  const kutuRef = useModalErisim(onKapat)

  const tazele = async () => {
    setMesajlar(await mesajlariGetir(kisi.id))
    await okunduIsaretle(kisi.id)
  }

  useEffect(() => {
    let iptal = false
    void tazele().finally(() => {
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
      setHata(err instanceof Error ? hataMetni(err.message) : ceviri('Mesaj gönderilemedi'))
    } finally {
      setGonderiliyor(false)
    }
  }

  const saat = (iso: string) =>
    new Date(iso).toLocaleTimeString(dil === 'en' ? 'en-GB' : 'tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    })

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

  /*
    Pencere sayfanın köküne çiziliyor: oyun içindeki arkadaş panelinden de
    açılıyor ve o panel backdrop-filter kullandığı için sabit konumlu çocuk
    ekrana değil panele göre yerleşip kenardan taşıyor (bkz. ConfirmDialog).
  */
  return createPortal(
    <div className="modal-arka" onClick={onKapat}>
      <div
        className="mesaj-kutusu"
        ref={kutuRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={baslikId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="chat-head">
          <span className="avatar">{basHarfler(kisi.ad)}</span>
          <b id={baslikId}>{kisi.ad}</b>
          <span className="spacer" />
          <button
            className={`icon-btn ${menuAcik ? 'on' : ''}`}
            onClick={() => setMenuAcik((v) => !v)}
            aria-label={ceviri('Diğer')}
            title={ceviri('Diğer')}
          >
            ⋯
          </button>
          <button
            className="icon-btn"
            onClick={onKapat}
            aria-label={ceviri('Kapat')}
            title={ceviri('Kapat')}
          >
            ✕
          </button>
        </header>

        {menuAcik && (
          <div className="sohbet-menu">
            {!sikayetAcik ? (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => setSikayetAcik(true)}>
                  ⚑ {ceviri('Şikayet et')}
                </button>
                <button
                  className="btn btn-ghost btn-sm tehlike-yazi"
                  onClick={() => setEngelOnayi(true)}
                >
                  🚫 {ceviri('Engelle')}
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
                    setBilgi(ceviri('Şikayetin iletildi. Teşekkürler.'))
                  } catch (err) {
                    setHata(
                      err instanceof Error ? hataMetni(err.message) : ceviri('Gönderilemedi'),
                    )
                  }
                }}
              >
                <label className="field">
                  <span className="field-label">{ceviri('Ne oldu?')}</span>
                  <textarea
                    className="input textarea"
                    placeholder={ceviri('Kısaca anlat…')}
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
                    {ceviri('Vazgeç')}
                  </button>
                  <button className="btn btn-primary btn-sm" type="submit">
                    {ceviri('Gönder')}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {engelOnayi && (
          <ConfirmDialog
            baslik="Engelle"
            mesaj={ceviri(
              '{ad} sana mesaj gönderemeyecek ve profilini göremeyecek. Aranızdaki arkadaşlık da kalkar. İstediğin zaman engeli kaldırabilirsin.',
              { ad: kisi.ad },
            )}
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
            /* bilgi zaten çevrilmiş geliyor */
            tekButon
            onayYazisi="Tamam"
            onIptal={() => setBilgi(null)}
            onOnayla={() => setBilgi(null)}
          />
        )}

        <div className="chat-body">
          {yukleniyor && <p className="muted chat-bos">{ceviri('Yükleniyor…')}</p>}
          {!yukleniyor && mesajlar.length === 0 && (
            <p className="muted chat-bos">{ceviri('Henüz mesajlaşmamışsınız.')}</p>
          )}
          {mesajlar.map((m) => (
            <div key={m.id} className={`chat-satir ${m.benMi ? 'ben' : ''}`}>
              <span className="chat-balon">
                <Linkli metin={m.metin} />
              </span>
              <small className="chat-ad">
                {saat(m.ts)}
                {/* Rahatsız eden bir mesajı gelen kutundan kaldırabilirsin */}
                <button
                  className="mesaj-sil"
                  aria-label={ceviri('Bu mesajı sil')}
                  title={ceviri('Bu mesajı sil')}
                  onClick={async () => {
                    setHata(null)
                    try {
                      await mesajSil(m.id)
                      setMesajlar((l) => l.filter((x) => x.id !== m.id))
                    } catch (err) {
                      setHata(
                        err instanceof Error ? hataMetni(err.message) : ceviri('Silinemedi'),
                      )
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
              aria-label={ceviri('{emoji} ekle', { emoji: e })}
              title={ceviri('{emoji} ekle', { emoji: e })}
              onClick={() => emojiEkle(e)}
            >
              {e}
            </button>
          ))}
          <button
            type="button"
            className="tepki emoji-daha"
            aria-label={emojiAcik ? ceviri('Daha az göster') : ceviri('Daha fazla emoji')}
            title={emojiAcik ? ceviri('Daha az göster') : ceviri('Daha fazla emoji')}
            onClick={() => setEmojiAcik((v) => !v)}
          >
            {emojiAcik ? '▴' : '⋯'}
          </button>
        </div>

        <form className="chat-form" onSubmit={gonder}>
          <input
            ref={girdiRef}
            className="input"
            placeholder={ceviri('Mesaj yaz…')}
            value={metin}
            maxLength={1000}
            disabled={gonderiliyor}
            onChange={(e) => setMetin(e.target.value)}
          />
          <button className="btn btn-primary btn-sm" type="submit" disabled={gonderiliyor}>
            {ceviri('Gönder')}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  )
}
