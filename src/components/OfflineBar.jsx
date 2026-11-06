import { createPortal } from "react-dom";

// 인터넷이 끊겼을 때 화면 위쪽에 작게 알린다 (2026-11-07).
// 계정에 못 올라간 기록이 쌓였을 때 뜨는 UnsyncedBar는 1분 뒤에야 보여서, 끊긴 직후엔 아무 표시가 없었다.
// 연결되면 저절로 사라진다. 누를 것도 없고 닫을 것도 없는 안내 한 줄이다.
export default function OfflineBar() {
  const target = document.querySelector('.dm-phone') || document.body;
  return createPortal(
    <div role="status" style={{
      position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 24px)', maxWidth: 406,
      zIndex: 240, background: 'var(--dm-card)', border: '1.5px solid rgba(251,191,36,.55)', borderRadius: 12,
      boxShadow: '0 6px 20px rgba(0,0,0,.18)', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none',
    }}>
      <span style={{ fontSize: 16 }}>📡</span>
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--dm-text)', lineHeight: 1.45 }}>
        인터넷이 끊겼어요. 쓰는 내용은 <b>이 기기에 저장</b>되고, 연결되면 계정에 올라가요.
      </div>
    </div>,
    target
  );
}
