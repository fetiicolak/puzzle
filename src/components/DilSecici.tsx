import { DIL_ADI, useDil, type Dil } from '../dil'

const SIRA: Dil[] = ['tr', 'en']

/**
 * Dil düğmesi. İki dil olduğu için açılır liste yerine iki küçük düğme:
 * tek tıkla değişiyor ve hangi dilde olduğun bakmadan görünüyor.
 *
 * Kendi metni çevrilmiyor — "Türkçe" her dilde Türkçe yazar.
 */
export default function DilSecici({ ince }: { ince?: boolean }) {
  const { dil, degistir } = useDil()

  return (
    <div className={`dil-secici ${ince ? 'ince' : ''}`} role="group" aria-label="Language">
      {SIRA.map((d) => (
        <button
          key={d}
          className={`dil-dugme ${dil === d ? 'secili' : ''}`}
          aria-pressed={dil === d}
          title={DIL_ADI[d]}
          onClick={() => degistir(d)}
        >
          {d.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
