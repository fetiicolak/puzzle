import { useState } from 'react'
import { useDil } from '../dil'

interface Props {
  value: string
  onChange: (deger: string) => void
  placeholder: string
  autoComplete: 'current-password' | 'new-password'
  minLength?: number
  autoFocus?: boolean
}

/**
 * Göz düğmesiyle içeriği gösterilebilen şifre kutusu.
 *
 * Dört ayrı şifre alanı var (giriş, kayıt, yeni şifre, tekrar); düğmenin
 * yerleşimi ve erişilebilirlik etiketi tek yerde dursun diye bileşen.
 * Düğme `tabIndex={-1}`: Tab ile gezerken şifreden sonra sıradaki alana
 * geçilmeli, araya görsel bir yardımcı girmemeli.
 */
export default function SifreKutusu({
  value,
  onChange,
  placeholder,
  autoComplete,
  minLength = 6,
  autoFocus,
}: Props) {
  const { ceviri } = useDil()
  const [acik, setAcik] = useState(false)
  const etiket = acik ? ceviri('Şifreyi gizle') : ceviri('Şifreyi göster')

  return (
    <div className="sifre-kutusu">
      <input
        className="input"
        type={acik ? 'text' : 'password'}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        minLength={minLength}
        required
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="sifre-goz"
        onClick={() => setAcik((o) => !o)}
        aria-label={etiket}
        title={etiket}
        tabIndex={-1}
      >
        {acik ? '🙈' : '👁'}
      </button>
    </div>
  )
}
