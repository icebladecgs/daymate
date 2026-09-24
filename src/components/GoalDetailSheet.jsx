import { useState } from "react";
import { createPortal } from "react-dom";
import S from "../styles.js";

// 목표 상세 — 인생목표·올해 목표가 같은 화면 사용.
// "이루기 위해 할 것들"(실천 항목)을 적고, 항목마다 "언젠가로"를 눌러 언젠가할일로 파생시킨다.
// 파생된 할일에는 goalRef가 붙어 🎯 표시로 어느 목표에서 왔는지 보이고, 언젠가 → 오늘로 옮겨도 유지된다.
// 같은 항목에서 여러 번 파생 가능 (매주 반복하는 일 등)
export default function GoalDetailSheet({ kind, title, actions = [], onChangeActions, onSendToSomeday, onClose }) {
  const [input, setInput] = useState('');
  const [sentId, setSentId] = useState(null);
  const label = kind === 'life' ? '🌟 인생목표' : '🌱 올해 목표';

  const add = () => {
    const t = input.trim();
    if (!t) return;
    onChangeActions([...actions, { id: `ga_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, title: t }]);
    setInput('');
  };
  const remove = (a) => {
    if (!window.confirm(`"${a.title}" 항목을 지울까요?\n(이미 언젠가할일로 보낸 것은 그대로 남아요)`)) return;
    onChangeActions(actions.filter(x => x.id !== a.id));
  };
  const send = (a) => {
    onSendToSomeday(a);
    setSentId(a.id);
    setTimeout(() => setSentId(id => (id === a.id ? null : id)), 1500);
  };

  // 할일 상세와 같은 이유로 앱 루트(.dm-phone)에 포털 렌더링 (하단 네비에 가려지지 않게)
  const portalTarget = document.querySelector('.dm-phone') || document.body;
  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 430, maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--dm-bg)', borderRadius: '20px 20px 0 0', border: '1px solid var(--dm-border)', borderBottom: 'none', boxShadow: '0 -8px 32px rgba(0,0,0,.35)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '16px 20px 10px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--dm-muted)', fontWeight: 700, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--dm-text)', lineHeight: 1.4, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{title}</div>
          </div>
          <button onClick={onClose} aria-label="닫기"
            style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 4px', flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 20px 12px' }}>
          <div style={{ fontSize: 11, color: 'var(--dm-muted)', fontWeight: 700, marginBottom: 8 }}>📌 이루기 위해 할 것들</div>
          {actions.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--dm-muted)', lineHeight: 1.6, padding: '6px 0 12px' }}>
              이 목표를 이루려면 무엇을 해야 할까요?<br />떠오르는 것을 적고, <b>언젠가로</b>를 눌러 할일로 만들어 보세요.
            </div>
          )}
          {actions.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--dm-row)' }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: 'var(--dm-text)', lineHeight: 1.4, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{a.title}</span>
              <button onClick={() => send(a)}
                style={{ background: sentId === a.id ? 'rgba(74,222,128,.15)' : 'rgba(108,142,255,.1)', border: `1px solid ${sentId === a.id ? 'rgba(74,222,128,.4)' : 'rgba(108,142,255,.25)'}`, borderRadius: 8, padding: '4px 8px', fontSize: 11, color: sentId === a.id ? '#4ADE80' : '#6C8EFF', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {sentId === a.id ? '보냄 ✓' : '언젠가로'}
              </button>
              <button onClick={() => remove(a)} aria-label="항목 삭제"
                style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', cursor: 'pointer', fontSize: 16, padding: '0 4px', flexShrink: 0 }}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && add()}
              placeholder="할 것 추가 후 Enter"
              maxLength={60}
              style={{ ...S.input, flex: 1, marginBottom: 0 }}
            />
            <button onClick={add}
              style={{ width: 42, height: 42, padding: 0, borderRadius: 10, border: '1.5px solid rgba(108,142,255,.35)', background: 'rgba(108,142,255,.12)', fontSize: 20, cursor: 'pointer', color: '#6C8EFF', flexShrink: 0 }}>+</button>
          </div>
        </div>

        <div style={{ padding: '10px 20px 18px', borderTop: '1px solid var(--dm-border)' }}>
          <button onClick={onClose} style={{ ...S.btn, marginBottom: 0 }}>완료</button>
        </div>
      </div>
    </div>,
    portalTarget
  );
}
