import { useEffect, useRef, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import FriendsSection from './FriendsSection'
import ProfileDialog from './ProfileDialog'
import RenameDialog from './RenameDialog'
import Select from './Select'
import { basHarfler } from '../ad'
import { SAMPLES, sampleThumbUrl, sampleUrl, type Sample } from '../samples'
import {
  listPuzzles,
  removePuzzle,
  savePuzzle,
  toPuzzleImage,
  yerelKilitliMi,
  type SavedPuzzle,
} from '../storage'
import { useAuth } from '../supabase/auth'
import { avatarUrl, profilimiGetir } from '../supabase/profile'
import {
  bitmisleriOnar,
  deleteRemotePuzzle,
  gercektenBitti,
  katilimcilariGetir,
  istatistikCikar,
  kilitliMi,
  listRemotePuzzles,
  puzzleImageUrl,
  yenidenAdlandir,
  type RemotePuzzle,
} from '../supabase/puzzles'

interface Props {
  /** title/artist: hazır eser seçildiyse dolu, kendi fotoğrafında boş */
  onPickImage: (imageDataUrl: string, title: string, artist: string) => void
  onResume: (saved: SavedPuzzle) => void
  onResumeRemote: (p: RemotePuzzle) => void
  /** Misafir olarak devam edilmişken giriş ekranına dön */
  onSignIn: () => void
}

function sureMetni(sn: number): string {
  const s = Math.max(0, Math.round(sn))
  const saat = Math.floor(s / 3600)
  const dk = Math.floor((s % 3600) / 60)
  if (saat > 0) return `${saat} sa ${dk} dk`
  if (dk > 0) return `${dk} dk`
  return `${s} sn`
}

/** Kilide kalan süre, insan diliyle */
function geriSayim(iso: string): string {
  const fark = new Date(iso).getTime() - Date.now()
  if (fark <= 0) return 'açıldı'
  const gun = Math.floor(fark / 86400000)
  const saat = Math.floor((fark % 86400000) / 3600000)
  const dk = Math.floor((fark % 3600000) / 60000)
  if (gun > 0) return `${gun} gün ${saat} saat kaldı`
  if (saat > 0) return `${saat} saat ${dk} dk kaldı`
  return `${dk} dk kaldı`
}

export type Siralama = 'yeni' | 'eski' | 'cokParca' | 'azParca'

const SIRALAMA_ADI: Record<Siralama, string> = {
  yeni: 'Yeniden eskiye',
  eski: 'Eskiden yeniye',
  cokParca: 'En çok parçadan aza',
  azParca: 'En az parçadan çoğa',
}

/** Listeyi seçilen ölçüte göre sırala (kaynak diziyi bozmadan) */
function sirala<T>(
  liste: T[],
  nasil: Siralama,
  al: (x: T) => { zaman: number; parca: number },
): T[] {
  return [...liste].sort((a, b) => {
    const x = al(a)
    const y = al(b)
    switch (nasil) {
      case 'yeni':
        return y.zaman - x.zaman
      case 'eski':
        return x.zaman - y.zaman
      case 'cokParca':
        return y.parca - x.parca || y.zaman - x.zaman
      case 'azParca':
        return x.parca - y.parca || y.zaman - x.zaman
    }
  })
}

function tarih(s: string | number): string {
  const d = new Date(s)
  const fark = (Date.now() - d.getTime()) / 86400000
  if (fark < 1) return 'bugün'
  if (fark < 2) return 'dün'
  if (fark < 7) return `${Math.floor(fark)} gün önce`
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })
}

export default function HomeScreen({ onPickImage, onResume, onResumeRemote, onSignIn }: Props) {
  const auth = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [saved, setSaved] = useState<SavedPuzzle[]>(listPuzzles)
  const [busy, setBusy] = useState(false)
  const [uzak, setUzak] = useState<RemotePuzzle[]>([])
  const [uzakYukleniyor, setUzakYukleniyor] = useState(false)
  const [kapaklar, setKapaklar] = useState<Record<string, string>>({})
  const [siliniyor, setSiliniyor] = useState<string | null>(null)
  const [hepsiniGoster, setHepsiniGoster] = useState(false)
  const [surukleniyor, setSurukleniyor] = useState(false)
  /** Adı değiştirilmekte olan kayıt (pencere bunun için açılır) */
  const [adlandirilan, setAdlandirilan] = useState<
    { tur: 'uzak'; p: RemotePuzzle } | { tur: 'yerel'; p: SavedPuzzle } | null
  >(null)
  /** Silinmek üzere onay bekleyen kayıt */
  const [silinecek, setSilinecek] = useState<
    { tur: 'uzak'; p: RemotePuzzle } | { tur: 'yerel'; p: SavedPuzzle } | null
  >(null)
  /** puzzle kimliği -> birlikte oynanan kişilerin adları */
  const [katilimcilar, setKatilimcilar] = useState<Map<string, string[]>>(new Map())
  const [siralama, setSiralama] = useState<Siralama>('yeni')
  /** "Tablolarım" katlanır; arkadaşlar gibi tıklayınca açılır */
  const [tablolarAcik, setTablolarAcik] = useState(false)
  const [profilAcik, setProfilAcik] = useState(false)
  const [benimAvatar, setBenimAvatar] = useState<string | null>(null)
  /** Profilde ad değişince üst çubuk hemen güncellensin */
  const [gorunenAd, setGorunenAd] = useState('')
  /** Bilgi/hata kutusu — tarayıcının alert'i yerine */
  const [bilgi, setBilgi] = useState<{ baslik: string; mesaj: string } | null>(null)

  /** Kilitli puzzle'a dokunulunca ne zaman açılacağını söyle */
  const kilitliUyarisi = (acilis: string) =>
    setBilgi({
      baslik: 'Henüz açılmadı',
      mesaj: `Bu puzzle özel gün için saklanmış. ${new Date(acilis).toLocaleString('tr-TR')} tarihinde açılacak.`,
    })

  // Liste render sırasında okunuyor; oyundan çıkarken yazılan son kayıt bundan
  // sonra düşüyor. Bağlandıktan sonra bir kez daha oku.
  useEffect(() => {
    setSaved(listPuzzles())
  }, [])

  useEffect(() => {
    if (!auth.user) {
      setUzak([])
      return
    }
    let iptal = false
    setUzakYukleniyor(true)
    listRemotePuzzles()
      .then(async (liste) => {
        if (iptal) return
        // eski kayıtlarda eksik kalmış "bitti" bayrağını onar
        await bitmisleriOnar(liste)
        if (iptal) return
        setUzak([...liste])
        // kimlerle oynandığını getir (tek seferde)
        katilimcilariGetir(liste.map((p) => p.id))
          .then((m) => {
            if (!iptal) setKatilimcilar(m)
          })
          .catch(() => {})
        // kapak görsellerini getir
        const girisler = await Promise.all(
          liste.map(async (p) => [p.id, await puzzleImageUrl(p.image_path)] as const),
        )
        if (!iptal) {
          setKapaklar(Object.fromEntries(girisler.filter(([, u]) => u) as [string, string][]))
        }
      })
      .finally(() => {
        if (!iptal) setUzakYukleniyor(false)
      })
    return () => {
      iptal = true
    }
  }, [auth.user])

  // Profil fotoğrafı ve adı (üst çubuk için)
  useEffect(() => {
    if (!auth.user) {
      setBenimAvatar(null)
      setGorunenAd('')
      return
    }
    let iptal = false
    profilimiGetir()
      .then(async (p) => {
        if (iptal || !p) return
        setGorunenAd(p.ad === 'İsimsiz' ? '' : p.ad)
        const u = await avatarUrl(p.avatarPath)
        if (!iptal) setBenimAvatar(u)
      })
      .catch(() => {})
    return () => {
      iptal = true
    }
  }, [auth.user, profilAcik])

  // Giriş yapılmışken cihazdaki kayıtlar gösterilmiyor: misafirken çözülenler
  // hesabın geçmişi değil, listeye karışmasınlar. Girişliyken oynananlar zaten
  // sunucuya da yazıldığı için "Tablolarım"da duruyor.
  const uzakKodlar = new Set(uzak.map((p) => p.room_code))
  const yalnizcaYerel = auth.user ? [] : saved.filter((p) => !uzakKodlar.has(p.id))

  const siraliUzak = sirala(uzak, siralama, (p) => ({
    zaman: new Date(p.updated_at).getTime(),
    parca: p.piece_count,
  }))
  const siraliYerel = sirala(yalnizcaYerel, siralama, (p) => ({
    zaman: p.updatedAt,
    parca: p.pieceCount,
  }))

  const pick = async (src: File | Sample) => {
    setBusy(true)
    try {
      const isSample = !(src instanceof File)
      const url = isSample ? sampleUrl(src) : src
      onPickImage(
        await toPuzzleImage(url),
        isSample ? src.title : '',
        isSample ? (src.artist ?? '') : '',
      )
    } catch {
      setBilgi({
        baslik: 'Görsel açılamadı',
        mesaj: 'Bu dosya okunamadı. Başka bir fotoğraf deneyebilirsin.',
      })
    } finally {
      setBusy(false)
    }
  }

  /** Sunucudaki kaydın adını değiştir (cihazdaki kopya da güncellenir) */
  const uzakAdKaydet = async (p: RemotePuzzle, ad: string) => {
    await yenidenAdlandir(p.id, ad)
    setUzak((l) => l.map((x) => (x.id === p.id ? { ...x, title: ad } : x)))
    const yerel = listPuzzles().find((s) => s.id === p.room_code)
    if (yerel) savePuzzle({ ...yerel, title: ad, updatedAt: Date.now() })
    setSaved(listPuzzles())
    setAdlandirilan(null)
  }

  /** Yalnızca bu cihazdaki kaydın adını değiştir */
  const yerelAdKaydet = (p: SavedPuzzle, ad: string) => {
    savePuzzle({ ...p, title: ad, updatedAt: Date.now() })
    setSaved(listPuzzles())
    setAdlandirilan(null)
  }

  // Önce sunucudan sil, sonra listeden çıkar. Tersi olursa silinmemiş bir
  // kayıt silinmiş gibi görünüp sayfa yenilenince geri geliyor.
  const uzakSil = async (p: RemotePuzzle) => {
    setSiliniyor(p.id)
    try {
      await deleteRemotePuzzle(p.id, p.image_path)
      setUzak((l) => l.filter((x) => x.id !== p.id))
      // yerel kopyayı da at, yoksa tekilleştirme kalkınca listede geri belirir
      removePuzzle(p.room_code)
      setSaved(listPuzzles())
      setSilinecek(null)
    } finally {
      setSiliniyor(null)
    }
  }

  /** Silme penceresinde gösterilecek açıklama */
  const silmeMesaji = (): string => {
    if (!silinecek) return ''
    const ad = silinecek.p.title || 'İsimsiz'
    if (silinecek.tur === 'yerel') {
      return `"${ad}" bu cihazdan silinecek. İlerlemen kaybolur, geri alınamaz.`
    }
    const kisiler = katilimcilar.get(silinecek.p.id) ?? []
    const kimle =
      kisiler.length > 0
        ? ` ${kisiler.join(', ')} ile birlikte çözdüğünüz bu tablo herkesin geçmişinden kalkar.`
        : ''
    return `"${ad}" kalıcı olarak silinecek; fotoğrafı da sunucudan kaldırılır.${kimle} Geri alınamaz.`
  }

  // Sürükle bırak: dosyayı sayfanın herhangi bir yerine bırakmak yeterli.
  // dragenter/dragleave iç içe öğelerde çok kez tetiklendiği için sayaç tutuyoruz.
  const surukleSayac = useRef(0)
  const dosyaVarMi = (e: React.DragEvent) =>
    Array.from(e.dataTransfer?.types ?? []).includes('Files')

  const onDragEnter = (e: React.DragEvent) => {
    if (!dosyaVarMi(e)) return
    e.preventDefault()
    surukleSayac.current++
    setSurukleniyor(true)
  }
  const onDragOver = (e: React.DragEvent) => {
    if (dosyaVarMi(e)) e.preventDefault()
  }
  const onDragLeave = (e: React.DragEvent) => {
    if (!dosyaVarMi(e)) return
    surukleSayac.current--
    if (surukleSayac.current <= 0) {
      surukleSayac.current = 0
      setSurukleniyor(false)
    }
  }
  const onDrop = (e: React.DragEvent) => {
    if (!dosyaVarMi(e)) return
    e.preventDefault()
    surukleSayac.current = 0
    setSurukleniyor(false)
    const dosya = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'))
    if (dosya) void pick(dosya)
    else
      setBilgi({
        baslik: 'Bu dosya olmaz',
        mesaj: 'Yalnızca resim dosyası bırakabilirsin (jpg, png, webp).',
      })
  }

  return (
    <div
      className="screen"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {adlandirilan && (
        <RenameDialog
          mevcutAd={
            adlandirilan.tur === 'uzak' ? adlandirilan.p.title : adlandirilan.p.title
          }
          onIptal={() => setAdlandirilan(null)}
          onKaydet={(ad) =>
            adlandirilan.tur === 'uzak'
              ? uzakAdKaydet(adlandirilan.p, ad)
              : yerelAdKaydet(adlandirilan.p, ad)
          }
        />
      )}

      {silinecek && (
        <ConfirmDialog
          baslik="Puzzle'ı sil"
          mesaj={silmeMesaji()}
          onayYazisi="Sil"
          tehlikeli
          onIptal={() => setSilinecek(null)}
          onOnayla={async () => {
            if (silinecek.tur === 'uzak') {
              await uzakSil(silinecek.p)
            } else {
              removePuzzle(silinecek.p.id)
              setSaved(listPuzzles())
              setSilinecek(null)
            }
          }}
        />
      )}

      {surukleniyor && (
        <div className="birak-katmani">
          <div className="birak-kutu">
            <b>Bırak gitsin</b>
            <small>Fotoğrafı buraya bırak, puzzle'a çevireyim</small>
          </div>
        </div>
      )}
      {profilAcik && <ProfileDialog onKapat={() => setProfilAcik(false)} />}

      {bilgi && (
        <ConfirmDialog
          baslik={bilgi.baslik}
          mesaj={bilgi.mesaj}
          tekButon
          onayYazisi="Tamam"
          onIptal={() => setBilgi(null)}
          onOnayla={() => setBilgi(null)}
        />
      )}

      {auth.enabled && (
        <div className="account-bar">
          {auth.user ? (
            <>
              <button
                className="hesap-dugme"
                onClick={() => setProfilAcik(true)}
                title="Profilini düzenle"
              >
                <span className="avatar">
                  {benimAvatar ? (
                    <img src={benimAvatar} alt="" />
                  ) : (
                    basHarfler(gorunenAd || auth.displayName)
                  )}
                </span>
                <span>{gorunenAd || auth.displayName}</span>
              </button>
              <span className="spacer" />
              <button className="btn btn-ghost btn-sm" onClick={() => setProfilAcik(true)}>
                Profil
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => void auth.signOut()}>
                Çıkış
              </button>
            </>
          ) : (
            <>
              <span className="muted">Misafirsin</span>
              <span className="spacer" />
              <button className="btn btn-ghost btn-sm" onClick={onSignIn}>
                Giriş yap
              </button>
            </>
          )}
        </div>
      )}

      <header className="hero">
        <h1 className="title">
          Birlikte <span>Puzzle</span>
        </h1>
        <p className="subtitle">Fotoğrafını seç, linki gönder, aynı puzzle'ı beraber çözün.</p>
      </header>

      <button className="btn btn-primary btn-lg" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? 'Hazırlanıyor…' : 'Fotoğraf yükle'}
      </button>
      <small className="muted">ya da fotoğrafı sürükleyip buraya bırak</small>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void pick(f)
          e.target.value = ''
        }}
      />

      {auth.user && uzak.length > 0 && (
        <section className="stats">
          {(() => {
            const s = istatistikCikar(uzak, auth.user!.id)
            return (
              <>
                <div className="stat-box">
                  <b>{s.bitenPuzzle}</b>
                  <small>biten puzzle</small>
                </div>
                <div className="stat-box">
                  <b>{sureMetni(s.toplamSure)}</b>
                  <small>toplam süre</small>
                </div>
                <div className="stat-box">
                  <b>{s.toplamParca}</b>
                  <small>çözülen parça</small>
                </div>
                {s.enHizli && (
                  <div className="stat-box">
                    <b>{sureMetni(s.enHizli.elapsed)}</b>
                    <small>en hızlı · {s.enHizli.title}</small>
                  </div>
                )}
              </>
            )
          })()}
        </section>
      )}

      {auth.user && <FriendsSection />}

      {auth.user && (uzak.length > 0 || uzakYukleniyor) && (
        <section className="block">
          <div className="katlanir-satir">
            <button
              className={`section-katlanir ${tablolarAcik ? 'acik' : ''}`}
              onClick={() => setTablolarAcik((v) => !v)}
              aria-expanded={tablolarAcik}
            >
              <span className="katlanir-ok">▸</span>
              Tablolarım
              <em className="field-hint">{uzak.length}</em>
            </button>
            {tablolarAcik && uzak.length > 1 && (
              <Select
                kucuk
                etiket="Sıralama"
                deger={siralama}
                onDegis={setSiralama}
                secenekler={(Object.keys(SIRALAMA_ADI) as Siralama[]).map((s) => ({
                  deger: s,
                  etiket: SIRALAMA_ADI[s],
                }))}
              />
            )}
          </div>
          {!tablolarAcik ? null : uzakYukleniyor && uzak.length === 0 ? (
            <div className="skeleton-list">
              <div className="skeleton" />
              <div className="skeleton" />
            </div>
          ) : (
            <div className="resume-list">
              {siraliUzak.map((p) => {
                const kilitli = kilitliMi(p)
                return (
                <article
                  key={p.id}
                  className={`resume-card ${kilitli ? 'kilitli' : ''}`}
                  onClick={() => {
                    if (kilitli) {
                      kilitliUyarisi(p.unlock_at!)
                      return
                    }
                    onResumeRemote(p)
                  }}
                >
                  {kapaklar[p.id] && !kilitli ? (
                    <img src={kapaklar[p.id]} alt="" />
                  ) : (
                    <div className="cover-fallback">{kilitli ? '🔒' : ''}</div>
                  )}
                  <div className="info">
                    <b>{p.title || 'İsimsiz'}</b>
                    <small>
                      {kilitli ? (
                        <span className="kilit-yazi">{geriSayim(p.unlock_at!)}</span>
                      ) : (
                        <>
                          {gercektenBitti(p) ? 'bitti · ' : ''}
                          {p.piece_count} parça · {tarih(p.updated_at)}
                        </>
                      )}
                    </small>
                    {!kilitli && (katilimcilar.get(p.id)?.length ?? 0) > 0 && (
                      <span className="birlikte">
                        {katilimcilar.get(p.id)!.slice(0, 3).map((ad) => (
                          <span key={ad} className="rozet-kisi">
                            <span className="avatar mini">{basHarfler(ad)}</span>
                            {ad}
                          </span>
                        ))}
                        {katilimcilar.get(p.id)!.length > 3 && (
                          <span className="rozet-kisi">
                            +{katilimcilar.get(p.id)!.length - 3}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <button
                    className="del"
                    title="Yeniden adlandır"
                    onClick={(e) => {
                      e.stopPropagation()
                      setAdlandirilan({ tur: 'uzak', p })
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className="del"
                    title="Sil"
                    disabled={siliniyor === p.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSilinecek({ tur: 'uzak', p })
                    }}
                  >
                    {siliniyor === p.id ? '…' : '✕'}
                  </button>
                </article>
                )
              })}
            </div>
          )}
        </section>
      )}

      {yalnizcaYerel.length > 0 && (
        <section className="block">
          <div className="katlanir-satir">
            <h2 className="section-label">
              Bu cihazda
              {auth.enabled && !auth.user && (
                <em className="field-hint">giriş yaparsan kaybolmaz</em>
              )}
            </h2>
            {yalnizcaYerel.length > 1 && (
              <Select
                kucuk
                etiket="Sıralama"
                deger={siralama}
                onDegis={setSiralama}
                secenekler={(Object.keys(SIRALAMA_ADI) as Siralama[]).map((s) => ({
                  deger: s,
                  etiket: SIRALAMA_ADI[s],
                }))}
              />
            )}
          </div>
          <div className="resume-list">
            {siraliYerel.map((p) => {
              const kilitli = yerelKilitliMi(p)
              return (
              <article
                key={p.id}
                className={`resume-card ${kilitli ? 'kilitli' : ''}`}
                onClick={() => {
                  if (kilitli) {
                    kilitliUyarisi(p.unlockAt!)
                    return
                  }
                  onResume(p)
                }}
              >
                {kilitli ? (
                  <div className="cover-fallback">🔒</div>
                ) : (
                  <img src={p.imageDataUrl} alt="" />
                )}
                <div className="info">
                  <b>{p.title || 'İsimsiz'}</b>
                  <small>
                    {kilitli ? (
                      <span className="kilit-yazi">{geriSayim(p.unlockAt!)}</span>
                    ) : (
                      <>
                        {p.completed ? 'bitti · ' : ''}
                        {p.pieceCount} parça · {tarih(p.updatedAt)}
                      </>
                    )}
                  </small>
                </div>
                <button
                  className="del"
                  title="Yeniden adlandır"
                  onClick={(e) => {
                    e.stopPropagation()
                    setAdlandirilan({ tur: 'yerel', p })
                  }}
                >
                  ✎
                </button>
                <button
                  className="del"
                  title="Sil"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSilinecek({ tur: 'yerel', p })
                  }}
                >
                  ✕
                </button>
              </article>
              )
            })}
          </div>
        </section>
      )}

      <section className="block">
        <h2 className="section-label">
          Hazır olanlar
          <em className="field-hint">{SAMPLES.length} eser</em>
        </h2>
        <div className="sample-grid">
          {(hepsiniGoster ? SAMPLES : SAMPLES.slice(0, 12)).map((s) => (
            <button
              key={s.file}
              className="sample"
              onClick={() => void pick(s)}
              disabled={busy}
              title={s.artist ? `${s.title} — ${s.artist}` : s.title}
            >
              <img src={sampleThumbUrl(s)} alt={s.title} />
              <span className="sample-caption">
                <b>{s.title}</b>
                {s.artist && <small>{s.artist}</small>}
              </span>
            </button>
          ))}
        </div>
        {!hepsiniGoster && SAMPLES.length > 12 && (
          <button className="btn btn-secondary" onClick={() => setHepsiniGoster(true)}>
            Tümünü göster ({SAMPLES.length - 12} tane daha)
          </button>
        )}
      </section>
    </div>
  )
}
