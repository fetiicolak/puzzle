import { useEffect, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import { avatarUrlleri } from '../supabase/profile'
import { odaKatilimcilari, oyuncuCikar, yetkiAyarla, type OdaKisisi } from '../supabase/room'

export interface BagliKisi {
  /** P2P bağlantı kimliği */
  peerId: string
  ad: string
  /** Giriş yapmışsa hesap kimliği */
  uid: string | null
}

interface Props {
  /** Sunucudaki puzzle kaydı; yoksa yalnızca bağlı olanlar listelenir */
  puzzleId: string | null
  /** Kendi hesap kimliğin */
  benimId: string | null
  /** Şu an odaya bağlı olanlar (misafirler dahil) */
  bagliOlanlar: BagliKisi[]
  onKapat: () => void
  /** Çıkarılan kişiye haber ver ki oyunu kapatabilsin */
  onCikarildi: (uid: string) => void
}

/** Oyun sırasında odadaki kişiler, yetkiler ve odadan çıkarma */
export default function RoomPanel({
  puzzleId,
  benimId,
  bagliOlanlar,
  onKapat,
  onCikarildi,
}: Props) {
  const [kisiler, setKisiler] = useState<OdaKisisi[]>([])
  const [avatarlar, setAvatarlar] = useState<Map<string, string>>(new Map())
  const [yukleniyor, setYukleniyor] = useState(!!puzzleId)
  const [islemdeki, setIslemdeki] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [cikarilacak, setCikarilacak] = useState<OdaKisisi | null>(null)

  const tazele = async () => {
    if (!puzzleId) return
    const liste = await odaKatilimcilari(puzzleId)
    setKisiler(liste)
    setAvatarlar(await avatarUrlleri(liste.map((k) => k.avatarPath)))
  }

  useEffect(() => {
    let iptal = false
    tazele().finally(() => {
      if (!iptal) setYukleniyor(false)
    })
    return () => {
      iptal = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleId])

  const benimRol = kisiler.find((k) => k.id === benimId)?.rol ?? 'player'
  const cikarabilirMiyim = (k: OdaKisisi) => {
    if (k.id === benimId || k.rol === 'owner') return false
    if (benimRol === 'owner') return true
    // yetkili yalnızca sıradan katılımcıyı çıkarabilir
    return benimRol === 'mod' && k.rol === 'player'
  }

  const sarmala = async (anahtar: string, is: () => Promise<void>) => {
    setIslemdeki(anahtar)
    setHata(null)
    try {
      await is()
      await tazele()
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'İşlem yapılamadı')
    } finally {
      setIslemdeki(null)
    }
  }

  // Bağlı olup sunucu kaydında olmayanlar (misafir girenler)
  const kayitliIdler = new Set(kisiler.map((k) => k.id))
  const misafirler = bagliOlanlar.filter((b) => !b.uid || !kayitliIdler.has(b.uid))
  const bagliUidler = new Set(bagliOlanlar.map((b) => b.uid).filter(Boolean) as string[])

  return (
    <aside className="oda-panel">
      <header className="chat-head">
        <b>Odadakiler</b>
        <span className="spacer" />
        <button className="icon-btn" onClick={onKapat} title="Kapat">
          ✕
        </button>
      </header>

      {cikarilacak && (
        <ConfirmDialog
          baslik="Odadan çıkar"
          mesaj={`${cikarilacak.ad} bu odadan çıkarılacak. Puzzle onun geçmişinden kalkar ve aynı davet linkiyle geri giremez.${
            cikarilacak.rol === 'mod' ? ' Bu kişinin çıkarma yetkisi de gider.' : ''
          }`}
          onayYazisi="Çıkar"
          tehlikeli
          onIptal={() => setCikarilacak(null)}
          onOnayla={async () => {
            const kisi = cikarilacak
            await oyuncuCikar(puzzleId!, kisi.id)
            onCikarildi(kisi.id)
            setCikarilacak(null)
            await tazele()
          }}
        />
      )}

      <div className="oda-liste">
        {yukleniyor && <p className="muted chat-bos">Yükleniyor…</p>}

        {kisiler.map((k) => {
          const url = k.avatarPath ? avatarlar.get(k.avatarPath) : null
          const cevrimici = k.id === benimId || bagliUidler.has(k.id)
          return (
            <div key={k.id} className="oda-satir">
              <span className={`avatar ${cevrimici ? '' : 'dim'}`}>
                {url ? <img src={url} alt="" /> : (k.ad[0] ?? '?').toUpperCase()}
              </span>
              <div className="info">
                <b>
                  {k.ad}
                  {k.id === benimId && <span className="rol-etiket">sen</span>}
                  {k.rol === 'owner' && <span className="rol-etiket kurucu">kurucu</span>}
                  {k.rol === 'mod' && <span className="rol-etiket">yetkili</span>}
                </b>
                <small className="muted">{cevrimici ? 'odada' : 'şu an bağlı değil'}</small>
              </div>

              {benimRol === 'owner' && k.rol !== 'owner' && k.id !== benimId && (
                <button
                  className={`btn btn-sm ${k.rol === 'mod' ? 'btn-ghost' : 'btn-secondary'}`}
                  disabled={islemdeki === k.id}
                  title={
                    k.rol === 'mod'
                      ? 'Çıkarma yetkisini geri al'
                      : 'Bu kişi de başkalarını çıkarabilsin'
                  }
                  onClick={() =>
                    void sarmala(k.id, () => yetkiAyarla(puzzleId!, k.id, k.rol !== 'mod'))
                  }
                >
                  {k.rol === 'mod' ? 'Yetkiyi al' : 'Yetki ver'}
                </button>
              )}

              {cikarabilirMiyim(k) && (
                <button
                  className="del"
                  title="Odadan çıkar"
                  disabled={islemdeki === k.id}
                  onClick={() => setCikarilacak(k)}
                >
                  ✕
                </button>
              )}
            </div>
          )
        })}

        {misafirler.map((m) => (
          <div key={m.peerId} className="oda-satir">
            <span className="avatar dim">{(m.ad[0] ?? '?').toUpperCase()}</span>
            <div className="info">
              <b>
                {m.ad}
                <span className="rol-etiket">misafir</span>
              </b>
              <small className="muted">hesapsız girdi, çıkarılamaz</small>
            </div>
          </div>
        ))}

        {!yukleniyor && kisiler.length === 0 && misafirler.length === 0 && (
          <p className="muted chat-bos">Şimdilik yalnızsın.</p>
        )}
      </div>

      {hata && <div className="form-error">{hata}</div>}

      {benimRol === 'owner' && kisiler.length > 1 && (
        <small className="muted oda-not">
          Yetki verdiğin kişi sıradan katılımcıları çıkarabilir; sana ve diğer yetkililere
          dokunamaz.
        </small>
      )}
    </aside>
  )
}
