import { useEffect, useRef, useState } from 'react'

export interface SecenekTanimi<T extends string> {
  deger: T
  etiket: string
}

interface Props<T extends string> {
  deger: T
  secenekler: SecenekTanimi<T>[]
  onDegis: (v: T) => void
  /** Ekran okuyucular ve dokunma hedefi için */
  etiket?: string
  /** Dar yerlerde (bölüm başlığı gibi) küçük hâli */
  kucuk?: boolean
}

/**
 * Açılır liste.
 *
 * Tarayıcının kendi <select> menüsü sayfanın karanlık temasını almıyor;
 * Windows'ta beyaz zemine açık gri yazı çıkıyor ve seçenekler okunmuyordu.
 * Bu yüzden menüyü kendimiz çiziyoruz — böylece her yerde aynı ve okunur.
 *
 * Klavye: Enter/Boşluk açar, ok tuşları gezer, Enter seçer, Escape kapatır.
 */
export default function Select<T extends string>({
  deger,
  secenekler,
  onDegis,
  etiket,
  kucuk = false,
}: Props<T>) {
  const [acik, setAcik] = useState(false)
  const [odak, setOdak] = useState(() => Math.max(0, secenekler.findIndex((s) => s.deger === deger)))
  const kokRef = useRef<HTMLDivElement>(null)

  const secili = secenekler.find((s) => s.deger === deger)

  useEffect(() => {
    if (!acik) return
    const disariTikla = (e: MouseEvent) => {
      if (!kokRef.current?.contains(e.target as Node)) setAcik(false)
    }
    const tus = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setAcik(false)
      }
    }
    document.addEventListener('mousedown', disariTikla)
    window.addEventListener('keydown', tus, true)
    return () => {
      document.removeEventListener('mousedown', disariTikla)
      window.removeEventListener('keydown', tus, true)
    }
  }, [acik])

  const sec = (i: number) => {
    const s = secenekler[i]
    if (!s) return
    onDegis(s.deger)
    setOdak(i)
    setAcik(false)
  }

  const klavye = (e: React.KeyboardEvent) => {
    if (!acik) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setAcik(true)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOdak((i) => Math.min(secenekler.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setOdak((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      sec(odak)
    }
  }

  return (
    <div ref={kokRef} className={`secim ${kucuk ? 'kucuk' : ''} ${acik ? 'acik' : ''}`}>
      <button
        type="button"
        className="secim-dugme"
        aria-haspopup="listbox"
        aria-expanded={acik}
        aria-label={etiket}
        onKeyDown={klavye}
        onClick={() => {
          setOdak(Math.max(0, secenekler.findIndex((s) => s.deger === deger)))
          setAcik((v) => !v)
        }}
      >
        <span className="secim-yazi">{secili?.etiket ?? '—'}</span>
        <span className="secim-ok" aria-hidden="true">
          ▾
        </span>
      </button>

      {acik && (
        <ul className="secim-menu" role="listbox" tabIndex={-1}>
          {secenekler.map((s, i) => (
            <li key={s.deger}>
              <button
                type="button"
                role="option"
                aria-selected={s.deger === deger}
                className={`secim-secenek ${s.deger === deger ? 'secili' : ''} ${
                  i === odak ? 'odakta' : ''
                }`}
                onMouseEnter={() => setOdak(i)}
                onClick={() => sec(i)}
              >
                {s.etiket}
                {s.deger === deger && <span className="secim-tik">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
