import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import StickyMemo from './components/StickyMemo.jsx'

// 데스크탑 앱의 바탕화면 포스트잇 창은 앱 전체 대신 가벼운 메모 화면만 띄운다
// (StrictMode 이중 실행 시 새 메모가 두 번 만들어지지 않도록 포스트잇은 StrictMode 밖에서)
const isSticky = new URLSearchParams(window.location.search).get('view') === 'sticky'

createRoot(document.getElementById('root')).render(
  isSticky ? <StickyMemo /> : (
    <StrictMode>
      <App />
    </StrictMode>
  ),
)
