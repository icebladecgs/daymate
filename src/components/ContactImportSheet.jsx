import { useState } from "react";
import { createPortal } from "react-dom";
import S from "../styles.js";
import { searchContacts } from "../data/contacts.js";

// 휴대폰 연락처 가져오기 — 안드로이드 선택 창에서 "모두 선택"으로 넘겨받은 연락처 전체를 보여주고,
// 여기서 검색(이름·초성·전화번호)하며 등록할 사람만 체크한다. 기본은 모두 해제.
// 이미 등록된 사람은 "이미 등록됨" 표시(체크하면 새로 하나 더 만들어지므로 체크 불가).
// 태그는 가져올 사람 전체에 한 번에 적용.
export default function ContactImportSheet({ candidates, allTags = [], onImport, onClose }) {
  const [items, setItems] = useState(candidates);
  const [tags, setTags] = useState([]);
  const [query, setQuery] = useState('');
  const checkedCount = items.filter(x => x.checked).length;
  const visible = searchContacts(items, query);
  const selectable = visible.filter(x => !x.dup);
  const allVisibleChecked = selectable.length > 0 && selectable.every(x => x.checked);

  const toggle = (x) => { if (!x.dup) setItems(prev => prev.map(y => y.key === x.key ? { ...y, checked: !y.checked } : y)); };
  const toggleAllVisible = () => {
    const keys = new Set(selectable.map(x => x.key));
    setItems(prev => prev.map(y => keys.has(y.key) ? { ...y, checked: !allVisibleChecked } : y));
  };
  const toggleTag = (t) => setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  // 하단 네비에 가려지지 않게 앱 루트(.dm-phone)에 포털 렌더링
  const portalTarget = document.querySelector('.dm-phone') || document.body;
  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 430, height: '90vh', display: 'flex', flexDirection: 'column', background: 'var(--dm-bg)', borderRadius: '20px 20px 0 0', border: '1px solid var(--dm-border)', borderBottom: 'none', boxShadow: '0 -8px 32px rgba(0,0,0,.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 8px' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--dm-text)' }}>📱 연락처에서 가져오기</div>
            <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginTop: 2 }}>연락처 {items.length}명 · 등록할 사람을 체크하세요</div>
          </div>
          <button onClick={onClose} aria-label="닫기"
            style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>✕</button>
        </div>

        <div style={{ padding: '0 20px 8px' }}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="이름·초성(ㄱㅊㅅ)·전화번호 검색"
            style={{ ...S.input, marginBottom: 8 }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: 'var(--dm-muted)' }}>{query ? `검색 결과 ${visible.length}명` : `전체 ${items.length}명`}</span>
            {selectable.length > 0 && (
              <button onClick={toggleAllVisible}
                style={{ background: 'none', border: 'none', color: '#6C8EFF', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '2px 0', fontFamily: 'inherit' }}>
                {allVisibleChecked ? '전체 해제' : (query ? '검색 결과 전체 선택' : '전체 선택')}
              </button>
            )}
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px 12px' }}>
          {visible.map(x => (
            <div key={x.key} onClick={() => toggle(x)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--dm-row)', cursor: x.dup ? 'default' : 'pointer', opacity: x.dup ? 0.5 : 1 }}>
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
          {visible.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--dm-muted)', fontSize: 13 }}>검색 결과가 없어요</div>
          )}

          {allTags.length > 0 && checkedCount > 0 && (
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
            {checkedCount > 0 ? `${checkedCount}명 등록하기` : '등록할 사람을 체크하세요'}
          </button>
        </div>
      </div>
    </div>,
    portalTarget
  );
}
