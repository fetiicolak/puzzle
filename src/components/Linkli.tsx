import { Fragment, type ReactNode } from 'react'

/**
 * Mesaj metnindeki adresleri tıklanabilir bağlantıya çevirir.
 *
 * Yalnızca http/https eşleşir: mesajı yazan başkası olabilir, "javascript:"
 * gibi şemalar bağlantıya dönüşmemeli.
 */
const KALIP = /https?:\/\/[^\s<>"']+/g

/** Cümle sonundaki noktalama adrese dahil olmasın */
const SON_NOKTALAMA = /[.,;:!?«»"']+$/

/** Metin parçası ya da adres */
export type Parca = { tur: 'yazi'; deger: string } | { tur: 'adres'; deger: string }

/**
 * Metni düz yazı ve adres parçalarına ayır.
 *
 * Bileşenden ayrı duruyor ki sınanabilsin: hangi metnin bağlantıya
 * dönüştüğü güvenlik meselesi.
 */
export function parcala(metin: string): Parca[] {
  const parcalar: Parca[] = []
  let son = 0

  const ekleYazi = (s: string) => {
    if (s) parcalar.push({ tur: 'yazi', deger: s })
  }

  for (const m of metin.matchAll(KALIP)) {
    const bas = m.index ?? 0
    ekleYazi(metin.slice(son, bas))

    let adres = m[0]
    const nokta = adres.match(SON_NOKTALAMA)
    if (nokta) adres = adres.slice(0, -nokta[0].length)
    // "(bak https://…)" — açılış parantezi yoksa kapanış adrese ait değildir
    while (adres.endsWith(')') && !adres.includes('(')) adres = adres.slice(0, -1)

    // Şema dışında hiçbir şey kalmadıysa adres sayma
    if (/^https?:\/\/.+/.test(adres)) parcalar.push({ tur: 'adres', deger: adres })
    else ekleYazi(adres)

    ekleYazi(m[0].slice(adres.length))
    son = bas + m[0].length
  }

  ekleYazi(metin.slice(son))
  return parcalar
}

/**
 * Sitenin kendi adresine tıklanınca elle yenile.
 *
 * Adres çubuğunda yalnızca "#" kısmı değişiyorsa tarayıcı sayfayı yeniden
 * yüklemez; oda kodunu okuyan açılış kodu (App.tsx -> davetKodu) yalnızca
 * yüklenirken çalıştığı için davet hiç işlenmez.
 */
function tikla(e: React.MouseEvent<HTMLAnchorElement>, adres: string): void {
  let u: URL
  try {
    u = new URL(adres)
  } catch {
    return
  }
  if (u.origin !== location.origin || u.pathname !== location.pathname) return
  e.preventDefault()
  location.hash = u.hash
  location.reload()
}

export default function Linkli({ metin }: { metin: string }): ReactNode {
  return (
    <>
      {parcala(metin).map((p, i) =>
        p.tur === 'yazi' ? (
          <Fragment key={i}>{p.deger}</Fragment>
        ) : (
          <a
            key={i}
            className="mesaj-link"
            href={p.deger}
            target={p.deger.startsWith(location.origin) ? undefined : '_blank'}
            rel="noopener noreferrer"
            title={p.deger.startsWith(location.origin) ? 'Odaya git' : p.deger}
            onClick={(e) => tikla(e, p.deger)}
          >
            {p.deger}
          </a>
        ),
      )}
    </>
  )
}
