import { useEffect, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import { basHarfler } from '../ad'
import { useDil } from '../dil'
import { avatarUrlleri } from '../supabase/profile'
import { useSurukle } from './surukle'
import { odaKatilimcilari, oyuncuCikar, yetkiAyarla, type OdaKisisi } from '../supabase/room'

export interface BagliKisi {
  /** P2P bağlantı kimliği */
  peerId: string
  ad: string
  /** Giriş yapmışsa hesap kimliği, misafirde null */
  uid: string | null
  /** Kişiyi ayırt eden kalıcı değer (hesap kimliği ya da misafir cihazı) */
  kimlik: string
}

interface Props {
  /** Sunucudaki puzzle kaydı; yoksa yalnızca bağlı olanlar listelenir */
  puzzleId: string | null
  /** Kendi hesap kimliğin */
  benimId: string | null
  /** Şu an odaya bağlı olanlar (misafirler dahil) */
  bagliOlanlar: BagliKisi[]
  /** Odayı kuran ben miyim — bağlantıyı yalnızca o kesebilir */
  benHost: boolean
  onKapat: () => void
  /** Çıkarılan kişiye haber ver ki oyunu kapatabilsin */
  onCikarildi: (uid: string) => void
  /** Hesapsız misafiri odadan çıkar (bağlantısı kesilir) */
  onMisafirCikar: (kimlik: string) => void
}

/** Oyun sırasında odadaki kişiler, yetkiler ve odadan çıkarma */
export default function RoomPanel({
  puzzleId,
  benimId,
  bagliOlanlar,
  benHost,
  onKapat,
  onCikarildi,
  onMisafirCikar,
}: Props) {
  const { ceviri } = useDil()
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
      setHata(e instanceof Error ? e.message : ceviri('İşlem yapılamadı'))
    } finally {
      setIslemdeki(null)
    }
  }

  // Sunucu kaydında görünmeyen ama odaya bağlı olanlar.
  //
  // Misafir olarak girenler sunucu listesini hiç okuyamaz (kaydı yok); o
  // durumda odadakileri yalnızca buradan görürler. "Misafir" etiketi
  // listede olup olmamaya değil, hesabı olup olmamasına bakar — hesaplı biri
  // yanlışlıkla misafir gösterilmesin.
  const kayitliIdler = new Set(kisiler.map((k) => k.id))
  const listeDisi = bagliOlanlar.filter((b) => !b.uid || !kayitliIdler.has(b.uid))
  const bagliUidler = new Set(bagliOlanlar.map((b) => b.uid).filter(Boolean) as string[])
  const [cikarilacakMisafir, setCikarilacakMisafir] = useState<BagliKisi | null>(null)
  const { kokRef, stil, tutamac, tasindi, sifirla } = useSurukle<HTMLElement>('oda')

  return (
    <aside ref={kokRef} style={stil} className="oda-panel">
      <header className="chat-head panel-tutamac" {...tutamac}>
        <b>{ceviri('Odadakiler')}</b>
        <span className="spacer" />
        {tasindi && (
          <button className="icon-btn" onClick={sifirla} title={ceviri('Yerine döndür')}>
            ↺
          </button>
        )}
        <button className="icon-btn" onClick={onKapat} title={ceviri('Kapat')}>
          ✕
        </button>
      </header>

      {cikarilacak && (
        <ConfirmDialog
          baslik="Odadan çıkar"
          mesaj={
            ceviri(
              '{ad} bu odadan çıkarılacak. Puzzle onun geçmişinden kalkar ve aynı davet linkiyle geri giremez.',
              { ad: cikarilacak.ad },
            ) +
            (cikarilacak.rol === 'mod'
              ? ' ' + ceviri('Bu kişinin çıkarma yetkisi de gider.')
              : '')
          }
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
        {yukleniyor && <p className="muted chat-bos">{ceviri('Yükleniyor…')}</p>}

        {kisiler.map((k) => {
          const url = k.avatarPath ? avatarlar.get(k.avatarPath) : null
          const cevrimici = k.id === benimId || bagliUidler.has(k.id)
          return (
            <div key={k.id} className="oda-satir">
              <span className={`avatar ${cevrimici ? '' : 'dim'}`}>
                {url ? <img src={url} alt="" /> : basHarfler(k.ad)}
              </span>
              <div className="info">
                <b>
                  {k.ad}
                  {k.id === benimId && <span className="rol-etiket">{ceviri('sen')}</span>}
                  {k.rol === 'owner' && (
                    <span className="rol-etiket kurucu">{ceviri('kurucu')}</span>
                  )}
                  {k.rol === 'mod' && <span className="rol-etiket">{ceviri('yetkili')}</span>}
                </b>
                <small className="muted">
                  {cevrimici ? ceviri('odada') : ceviri('şu an bağlı değil')}
                </small>
              </div>

              {benimRol === 'owner' && k.rol !== 'owner' && k.id !== benimId && (
                <button
                  className={`btn btn-sm ${k.rol === 'mod' ? 'btn-ghost' : 'btn-secondary'}`}
                  disabled={islemdeki === k.id}
                  title={
                    k.rol === 'mod'
                      ? ceviri('Çıkarma yetkisini geri al')
                      : ceviri('Bu kişi de başkalarını çıkarabilsin')
                  }
                  onClick={() =>
                    void sarmala(k.id, () => yetkiAyarla(puzzleId!, k.id, k.rol !== 'mod'))
                  }
                >
                  {k.rol === 'mod' ? ceviri('Yetkiyi al') : ceviri('Yetki ver')}
                </button>
              )}

              {cikarabilirMiyim(k) && (
                <button
                  className="del"
                  title={ceviri('Odadan çıkar')}
                  disabled={islemdeki === k.id}
                  onClick={() => setCikarilacak(k)}
                >
                  ✕
                </button>
              )}
            </div>
          )
        })}

        {listeDisi.map((m) => (
          <div key={m.peerId} className="oda-satir">
            <span className="avatar dim">{basHarfler(m.ad)}</span>
            <div className="info">
              <b>
                {m.ad}
                {!m.uid && <span className="rol-etiket">{ceviri('misafir')}</span>}
              </b>
              <small className="muted">
                {m.uid ? ceviri('odada') : ceviri('hesapsız girdi')}
              </small>
            </div>
            {benHost && (
              <button
                className="del"
                title={ceviri('Odadan çıkar')}
                onClick={() => setCikarilacakMisafir(m)}
              >
                ✕
              </button>
            )}
          </div>
        ))}

        {cikarilacakMisafir && (
          <ConfirmDialog
            baslik="Odadan çıkar"
            mesaj={ceviri(
              '{ad} bu odadan çıkarılacak ve bağlantısı kesilecek. Aynı davet linkiyle geri giremez; ama oda kapanıp yeniden kurulursa tekrar girebilir.',
              { ad: cikarilacakMisafir.ad },
            )}
            onayYazisi="Çıkar"
            tehlikeli
            onIptal={() => setCikarilacakMisafir(null)}
            onOnayla={() => {
              onMisafirCikar(cikarilacakMisafir.kimlik)
              setCikarilacakMisafir(null)
            }}
          />
        )}

        {!yukleniyor && kisiler.length === 0 && listeDisi.length === 0 && (
          <p className="muted chat-bos">{ceviri('Şimdilik yalnızsın.')}</p>
        )}
      </div>

      {hata && <div className="form-error">{hata}</div>}

      {benimRol === 'owner' && kisiler.length > 1 && (
        <small className="muted oda-not">
          {ceviri(
            'Yetki verdiğin kişi sıradan katılımcıları çıkarabilir; sana ve diğer yetkililere dokunamaz.',
          )}
        </small>
      )}
    </aside>
  )
}
