import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { AuthProvider } from './supabase/auth.tsx'

// Not: StrictMode bilinçli olarak kullanılmıyor — çift effect çalıştırması,
// aynı oda ID'siyle iki PeerJS bağlantısı açıp "unavailable-id" hatasına yol açıyor.
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <AuthProvider>
      <App />
    </AuthProvider>
  </ErrorBoundary>,
)

// Service worker yalnızca üretimde: dev sunucusunda önbellek HMR'ı bozar.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', location.href)).catch(() => {
      // kayıt başarısız olursa uygulama normal çalışmaya devam eder
    })
  })
}
