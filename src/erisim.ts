// Erişilebilirlik yardımcıları.
//
// Uygulamadaki pencereler `createPortal` ile doğrudan `document.body`ye
// çiziliyor (bkz. ConfirmDialog). Bu, görsel sorunu çözüyor ama klavye için
// bir şey yapmıyor: odak arkadaki sayfada kalıyor, Tab pencereden dışarı
// çıkıyor ve ekran okuyucu açılan şeyin bir pencere olduğunu bilmiyor.
// Aşağıdaki kanca üç eksiği birden kapatıyor.

import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react'

/**
 * Klavyeyle ulaşılabilen öğeler.
 *
 * `[tabindex="-1"]` bilerek dışarıda: onlar programla odaklanmak için var,
 * Tab sırasında atlanmaları gerekiyor. Gizli (`hidden`) ve pasif (`disabled`)
 * öğeler de listeye girmiyor — Tab onları zaten atlıyor, tuzağın sınırlarını
 * onlara göre kurmak "ilk öğe" diye görünmez bir düğmeye odaklanmak olurdu.
 */
const ODAKLANABILIR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function odaklanabilirler(kok: HTMLElement): HTMLElement[] {
  return [...kok.querySelectorAll<HTMLElement>(ODAKLANABILIR)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  )
}

/**
 * Modal pencerenin klavye davranışı: Escape ile kapanma, odak tuzağı ve
 * kapanınca odağın geldiği yere dönmesi.
 *
 * Dönen ref pencerenin *kutusuna* verilir (arka örtüye değil):
 *
 *     const kutuRef = useModalErisim(onKapat)
 *     <div className="modal-arka" onClick={onKapat}>
 *       <div className="dialog" ref={kutuRef} role="dialog" aria-modal="true">
 *
 * @param onKapat  Escape'e basılınca çağrılır
 * @param kapatilabilir  false ise Escape yok sayılır (kayıt sürerken)
 */
export function useModalErisim<T extends HTMLElement = HTMLDivElement>(
  onKapat: () => void,
  kapatilabilir = true,
): RefObject<T | null> {
  const kutuRef = useRef<T>(null)

  // Odağın geri döneceği yer. Efektin içinde okunursa geç kalıyor: React
  // pencereyi bağladıktan sonra çalıştığı için o an aktif öğe değişmiş
  // olabiliyor. Render sırasında bir kez yakalanıyor.
  const oncekiOdak = useRef<HTMLElement | null>(
    typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null,
  )

  // Açılışta pencerenin içine odaklan. Ayrı bir efekt: yalnızca bir kez
  // çalışması gerekiyor, aşağıdaki tuş dinleyicisi ise onKapat değiştikçe
  // yeniden kuruluyor.
  useEffect(() => {
    const kutu = kutuRef.current
    if (!kutu) return
    const ilk = odaklanabilirler(kutu)[0]
    if (ilk) ilk.focus()
    else {
      // İçinde odaklanacak bir şey yoksa (yalnızca metin) kutunun kendisi
      // odaklanabilir olmalı, yoksa okuyucu pencereyi hiç duyurmuyor.
      kutu.tabIndex = -1
      kutu.focus()
    }

    const geriDon = oncekiOdak.current
    return () => {
      // Öğe bu arada DOM'dan çıkmış olabilir; odak kaybolup body'ye
      // düşmesin diye varlığını kontrol ediyoruz.
      if (geriDon && document.contains(geriDon)) geriDon.focus()
    }
  }, [])

  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (kapatilabilir) onKapat()
        return
      }
      if (e.key !== 'Tab') return

      const kutu = kutuRef.current
      if (!kutu) return
      const liste = odaklanabilirler(kutu)
      if (liste.length === 0) {
        e.preventDefault()
        return
      }
      const ilk = liste[0]
      const son = liste[liste.length - 1]
      const aktif = document.activeElement

      // Uçlarda dönüş yaptır. Odak pencerenin tamamen dışındaysa (arkadaki
      // sayfaya kaçmış) da içeri çekiyoruz.
      if (!kutu.contains(aktif)) {
        e.preventDefault()
        ilk.focus()
      } else if (e.shiftKey && aktif === ilk) {
        e.preventDefault()
        son.focus()
      } else if (!e.shiftKey && aktif === son) {
        e.preventDefault()
        ilk.focus()
      }
    }

    window.addEventListener('keydown', tus)
    return () => window.removeEventListener('keydown', tus)
  }, [onKapat, kapatilabilir])

  return kutuRef
}

/**
 * Tıklanabilir ama düğme olmayan öğeleri (kart görevi gören `article` gibi)
 * klavyeye açar: Enter ve Boşluk tıklama sayılır.
 *
 * Düğmeye çevirmek yerine bunu yapıyoruz çünkü kartların içinde kendi
 * düğmeleri var; iç içe `button` geçersiz HTML.
 */
export function tiklanabilirTus(
  calistir: () => void,
): (e: ReactKeyboardEvent<HTMLElement>) => void {
  return (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    // Tıklama kartın kendi düğmesinden geldiyse karta ikinci kez basma
    if (e.target !== e.currentTarget) return
    e.preventDefault()
    calistir()
  }
}
