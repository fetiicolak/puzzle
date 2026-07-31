import { useAuth } from '../supabase/auth'

interface Props {
  /** Davet edilen oda kodu — kullanıcıya gösterilir */
  roomCode: string
  onGiris: () => void
  onMisafir: () => void
}

/**
 * Davet linkiyle gelen kişiye sorulan ekran. Doğrudan odaya atmak yerine
 * seçim sunuyoruz: giriş yaparsa çözdüğünüz tablo onun geçmişine de düşer.
 */
export default function JoinChoiceScreen({ roomCode, onGiris, onMisafir }: Props) {
  const auth = useAuth()

  return (
    <div className="screen screen-center">
      <header className="hero">
        <h1 className="title">
          Puzzle <span>daveti</span>
        </h1>
        <p className="subtitle">
          Biri seni birlikte puzzle çözmeye çağırdı. Nasıl devam etmek istersin?
        </p>
        <code className="oda-kodu">oda: {roomCode}</code>
      </header>

      <div className="join-secenekler">
        <button className="join-kart" onClick={onGiris}>
          <b>Hesabımla gireyim</b>
          <small>
            Çözdüğünüz tablo geçmişine kaydedilir, sonra kaldığın yerden devam
            edebilirsin. Arkadaş ekleyebilirsin.
          </small>
        </button>

        <button className="join-kart sade" onClick={onMisafir}>
          <b>Misafir olarak devam et</b>
          <small>Hemen oyuna girersin. Tablo kaydedilmez, geçmişinde görünmez.</small>
        </button>
      </div>

      {auth.user && (
        <small className="muted">
          Zaten <b>{auth.displayName}</b> olarak girişlisin — "Hesabımla gireyim" seni
          doğrudan odaya alır.
        </small>
      )}
    </div>
  )
}
