import { useState } from "react";
import { createPortal } from "react-dom";
import S from "../styles.js";

// 휴대폰 연락처 가져오기 미리보기 — 사용자가 연락처 선택 창에서 직접 고른 사람만 넘어온다.
// 한 번 더 체크를 풀 수 있고, 이미 등록된 사람은 기본 해제("이미 등록됨"). 태그는 가져올 사람 전체에 한 번에 적용.
export default function ContactImportSheet({ candidates, allTags = [], onImport, onClose }) {
  const [items, setItems] = useState(candidates);
  const [tags, setTags] = useState([]);
  const checkedCount = items.filter(x => x.checked).length;

  const toggle = (key) => setItems(prev => prev.map(x => x.key === key ? { ...x, checked: !x.checked } : x));
  const toggleTag = (t) => setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  // 하단 네비에 가려지지 않게 앱 루트(.dm-phone)에 포털 렌더링
  const portalTarget = document.querySelector('.dm-phone') || document.body;
  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 430, maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--dm-bg)', borderRadius: '20px 20px 0 0', border: '1px solid var(--dm-border)', borderBottom: 'none', boxShadow: '0 -8px 32px rgba(0,0,0,.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 8px' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--dm-text)' }}>📱 연락처에서 가져오기</div>
            <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginTop: 2 }}>{items.length}명 선택됨 · 가져올 사람을 확인하세요</div>
          </div>
          <button onClick={onClose} aria-label="닫기"
            style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>✕</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 20px 12px' }}>
          {items.map(x => (
            <div key={x.key} onClick={() => toggle(x.key)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--dm-row)', cursor: 'pointer', opacity: x.checked ? 1 : 0.55 }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#4ADE80',
                border: `1.5px solid ${x.checked ? 'rgba(74,222,128,.5)' : 'var(--dm-border)'}`, background: x.checked ? 'rgba(74,222,128,.15)' : 'var(--dm-input)' }}>{x.checked ? '✓' : ''}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--dm-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</div>
                <div style={{ fontSize: 11, color: 'var(--dm-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[x.phone, x.email].filter(Boolean).join(' · ') || '연락처 정보 없음'}
                </div>
              </div>
              {x.dup && <span style={{ fontSize: 10, color: '#FBBF24', background: 'rgba(251,191,36,.12)', borderRadius: 6, padding: '2px 6px', flexShrink: 0 }}>이미 등록됨</span>}
            </div>
          ))}

          {allTags.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: 'var(--dm-muted)', fontWeight: 700, margin: '16px 0 6px' }}>태그 붙이기 (선택)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {allTags.map(t => <button key={t} onClick={() => toggleTag(t)} style={S.pill(tags.includes(t))}>{t}</button>)}
              </div>
            </>
          )}
        </div>

        <div style={{ padding: '10px 20px 18px', borderTop: '1px solid var(--dm-border)' }}>
          <button onClick={() => onImport(items.filter(x => x.checked), tags)} disabled={checkedCount === 0}
            style={{ ...S.btn, marginBottom: 0, opacity: checkedCount === 0 ? 0.5 : 1 }}>
            {checkedCount > 0 ? `${checkedCount}명 가져오기` : '가져올 사람을 선택하세요'}
          </button>
        </div>
      </div>
    </div>,
    portalTarget
  );
}
