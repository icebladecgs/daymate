import { useState } from "react";
import { createPortal } from "react-dom";

// 계정(서버)에 1분 넘게 못 올라간 날짜 기록이 있을 때만 화면 위쪽에 작게 알린다 (2026-10-05).
// 평소에는 보이지 않는다 — "저장됨"을 매번 띄우면 소음이라, 문제가 있을 때만 보여 주기로 했다.
// 기록은 이 기기에 남아 있으므로 지워질 걱정은 없다는 점을 함께 알린다.
export default function UnsyncedBar({ count, offline, onRetry, onClose }) {
  const [busy, setBusy] = useState(false);
  const target = document.querySelector('.dm-phone') || document.body; // 시트처럼 앱 루트에 그려야 가려지지 않음
  return createPortal(
    <div role="status" style={{
      position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 24px)', maxWidth: 406,
      zIndex: 240, background: 'var(--dm-card)', border: '1.5px solid rgba(251,191,36,.55)', borderRadius: 12,
      boxShadow: '0 6px 20px rgba(0,0,0,.18)', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span style={{ fontSize: 16 }}>☁</span>
      <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--dm-text)', lineHeight: 1.45 }}>
        {offline
          ? <>인터넷 연결이 없어요. 기록 {count}일치는 <b>이 기기에 있고</b>, 연결되면 계정에 저장돼요.</>
          : <>기록 {count}일치가 아직 <b>계정에 저장되지 않았어요</b>. 이 기기에는 남아 있어요.</>}
      </div>
      {!offline && (
        <button onClick={() => { setBusy(true); onRetry(); setTimeout(() => setBusy(false), 3000); }} disabled={busy}
          style={{ flexShrink: 0, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(251,191,36,.6)', background: 'rgba(251,191,36,.15)', color: 'var(--dm-text)', fontSize: 12, fontWeight: 800, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
          {busy ? '저장 중…' : '다시 저장'}
        </button>
      )}
      <button onClick={onClose} aria-label="닫기"
        style={{ flexShrink: 0, width: 26, height: 26, padding: 0, background: 'none', border: 'none', color: 'var(--dm-muted)', fontSize: 16, cursor: 'pointer' }}>✕</button>
    </div>,
    target
  );
}
