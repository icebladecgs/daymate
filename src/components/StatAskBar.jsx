import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { GROWTH_STATS } from "../data/growthStats.js";

// 분류 안 된 할일을 완료했을 때 "어느 능력치일까요?"를 한 번 묻는 작은 줄.
// 체크 흐름을 막지 않도록 창이 아니라 화면 위쪽 띠로 띄우고, 손대지 않으면 저절로 사라진다(알림 toast는 아래쪽이라 겹치지 않음).
// 답은 App이 "내 단어"로 기억해 다음부터 같은 제목은 묻지 않고 자동 분류한다.
const AUTO_CLOSE_MS = 10000;

export default function StatAskBar({ title, onAnswer, onClose, onStop }) {
  const timerRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const startTimer = () => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => closeRef.current(), AUTO_CLOSE_MS);
  };
  useEffect(() => { startTimer(); return () => clearTimeout(timerRef.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const chip = {
    fontSize: 12, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--dm-border)', background: 'var(--dm-input)',
    color: 'var(--dm-text)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', fontWeight: 700,
  };
  const link = { background: 'none', border: 'none', padding: '2px 0', fontSize: 11, color: 'var(--dm-muted)', cursor: 'pointer', fontFamily: 'inherit' };

  // 시트와 같은 이유로 앱 루트(.dm-phone)에 그린다 — 화면 본문 안이면 쌓임 순서에 가려짐
  const target = document.querySelector('.dm-phone') || document.body;
  return createPortal(
    <div
      role="dialog"
      aria-label="능력치 고르기"
      onPointerDown={startTimer} // 고르는 중에는 사라지지 않게 시간을 다시 잰다
      style={{
        position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 24px)', maxWidth: 406,
        zIndex: 250, background: 'var(--dm-card)', border: '1.5px solid rgba(108,142,255,.45)', borderRadius: 14,
        boxShadow: '0 8px 28px rgba(0,0,0,.25)', padding: '10px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--dm-text)', lineHeight: 1.5 }}>
          🌱 <b style={{ wordBreak: 'break-all' }}>'{title}'</b>은(는) 어느 능력치일까요?
          <div style={{ fontSize: 11, color: 'var(--dm-muted)' }}>고르면 기억해서 다음부터는 묻지 않아요</div>
        </div>
        <button onClick={onClose} aria-label="닫기" style={{ ...link, fontSize: 18, lineHeight: 1, padding: '0 2px' }}>✕</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {GROWTH_STATS.map(s => (
          <button key={s.id} onClick={() => onAnswer(s.id)} style={chip}>{s.icon} {s.name}</button>
        ))}
        <button onClick={() => onAnswer('NONE')} style={{ ...chip, gridColumn: 'span 2', color: 'var(--dm-muted)' }}>🚫 해당 없음</button>
      </div>
      <div style={{ textAlign: 'right', marginTop: 6 }}>
        <button onClick={onStop} style={link}>다시 묻지 않기</button>
      </div>
    </div>,
    target
  );
}
