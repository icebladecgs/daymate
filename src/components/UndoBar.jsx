import { createPortal } from "react-dom";

// ↩ 되돌리기 띠 — 상태는 utils/useUndo.js
export default function UndoBar({ bar, onUndo }) {
  if (!bar) return null;
  // 화면 본문(zIndex:1) 밖, 앱 루트에 그린다 — 하단 메뉴 위, 상세 창(300) 아래
  const portalTarget = document.querySelector('.dm-phone') || document.body;
  return createPortal(
    <div key={bar.id} role="status" style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 96, zIndex: 250, width: 'calc(100% - 32px)', maxWidth: 398, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px 10px 16px', borderRadius: 14, background: '#2B2F3A', color: '#fff', boxShadow: '0 6px 24px rgba(0,0,0,.3)' }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bar.msg}</span>
      <button onClick={onUndo} style={{ height: 36, padding: '0 14px', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,.14)', color: '#A5B8FF', fontSize: 15, fontWeight: 900, cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}>↩ 되돌리기</button>
    </div>,
    portalTarget
  );
}
