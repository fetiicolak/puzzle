import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Not: StrictMode bilinçli olarak kullanılmıyor — çift effect çalıştırması,
// aynı oda ID'siyle iki PeerJS bağlantısı açıp "unavailable-id" hatasına yol açıyor.
createRoot(document.getElementById('root')!).render(<App />)
