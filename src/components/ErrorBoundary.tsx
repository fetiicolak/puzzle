import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hataVar: boolean
}

/**
 * Beklenmeyen bir hatada beyaz ekran yerine ne olduğunu söyleyen bir sayfa.
 *
 * React'te bunu yapmanın tek yolu hâlâ sınıf bileşeni. Hata yakalanmazsa
 * React tüm ağacı söküyor ve kullanıcı bomboş bir sayfayla kalıyor — yenile
 * düğmesi bile olmadan.
 *
 * En olası kalıcı hata kaynağı bozuk bir kayıtlı oyun durumu; o yüzden
 * "kayıtları temizle" seçeneği de var, yoksa yenilemek de kurtarmıyor.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hataVar: false }

  static getDerivedStateFromError(): State {
    return { hataVar: true }
  }

  componentDidCatch(_hata: Error, _bilgi: ErrorInfo): void {
    // Hata toplama servisi yok; kullanıcıya gösterilen mesaj yeterli.
  }

  private kayitlariTemizle = (): void => {
    try {
      for (const anahtar of Object.keys(localStorage)) {
        if (anahtar.startsWith('puzzle:')) localStorage.removeItem(anahtar)
      }
    } catch {
      // depolama kapalıysa yenilemek yine de denenebilir
    }
    location.reload()
  }

  render(): ReactNode {
    if (!this.state.hataVar) return this.props.children

    return (
      <div className="screen screen-center">
        <div className="hata-kart">
          <div className="hata-simge" aria-hidden="true">
            🧩
          </div>
          <h2>Bir şeyler ters gitti</h2>
          <p className="muted">
            Beklenmedik bir hata oldu ve oyun durdu. Çözdüğün tablolar sunucuda duruyor,
            kaybolmadı.
          </p>
          <div className="action-row">
            <button className="btn btn-primary" onClick={() => location.reload()}>
              Sayfayı yenile
            </button>
            <button className="btn btn-ghost" onClick={this.kayitlariTemizle}>
              Cihazdaki kayıtları temizle
            </button>
          </div>
          <small className="muted">
            Yenilemek işe yaramazsa ikinci düğme bu cihazdaki yarım kalmış oyunları siler.
            Hesabındaki tablolar etkilenmez.
          </small>
        </div>
      </div>
    )
  }
}
