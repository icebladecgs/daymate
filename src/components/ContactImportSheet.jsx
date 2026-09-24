import { memo, useCallback, useDeferredValue, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import S from "../styles.js";
import { prepareSearchQuery, matchSearchIndex } from "../data/contacts.js";

// 연락처 가져오기 전·실패 시 안내 창
// mode 'before': 선택 창을 열기 전에 "허용 → 모두 선택" 순서를 알려줌 (첫 성공 전까지)
// mode 'empty' : 아무 연락처도 안 넘어왔을 때 크롬 연락처 권한 켜는 방법 + 다시 시도
export function ContactPermissionGuide({ mode, onContinue, onClose }) {
  const step = (n, text) => (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
      <span style={{ width: 22, height: 22, borderRadius: 999, background: '#6C8EFF', color: '#fff', fontSize: 12, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</span>
      <span style={{ fontSize: 14, color: 'var(--dm-text)', lineHeight: 1.55 }}>{text}</span>
    </div>
  );
  const portalTarget = document.querySelector('.dm-phone') || document.body;
  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 310, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 380, background: 'var(--dm-bg)', borderRadius: 18, border: '1px solid var(--dm-border)', padding: '20px 20px 16px', boxShadow: '0 12px 40px rgba(0,0,0,.4)' }}>
        {mode === 'before' ? (
          <>
            <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 6 }}>📱 휴대폰 연락처 가져오기</div>
            <div style={{ fontSize: 12, color: 'var(--dm-muted)', marginBottom: 16, lineHeight: 1.5 }}>휴대폰 연락처 창이 열려요. 아래 순서대로 해주세요.</div>
            {step(1, <>연락처 접근을 묻는 창이 뜨면 <b>허용</b></>)}
            {step(2, <>연락처 창에서는 검색하지 말고 맨 위 <b>모두 선택</b> → <b>확인</b></>)}
            {step(3, <>DayMate 목록에서 <b>검색하며 등록할 사람 체크</b></>)}
            <div style={{ fontSize: 11, color: 'var(--dm-muted)', lineHeight: 1.5, margin: '4px 0 14px' }}>
              고른 연락처만 내 계정에 저장되고, 다른 곳으로 보내지 않아요.
            </div>
            <button onClick={onContinue} style={{ ...S.btn, marginBottom: 8 }}>연락처 열기</button>
            <button onClick={onClose} style={{ ...S.btnGhost, marginTop: 0 }}>취소</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 6 }}>연락처를 받지 못했어요</div>
            <div style={{ fontSize: 12, color: 'var(--dm-muted)', marginBottom: 16, lineHeight: 1.5 }}>
              목록이 비어 있었다면 <b>크롬에 연락처 권한이 꺼져 있을 가능성</b>이 커요. (예전에 거부하면 다시 묻지 않아요)
            </div>
            {step(1, <>휴대폰 <b>설정 → 애플리케이션 → Chrome</b></>)}
            {step(2, <><b>권한 → 연락처 → 허용</b></>)}
            {step(3, <>DayMate로 돌아와 <b>다시 시도</b></>)}
            <div style={{ fontSize: 11, color: 'var(--dm-muted)', lineHeight: 1.5, margin: '4px 0 14px' }}>
              연락처 창에서 검색 후 키보드 검색(엔터)을 누르면 창이 그냥 닫혀요. 검색하지 말고 <b>모두 선택 → 확인</b>을 눌러주세요.
            </div>
            <button onClick={onContinue} style={{ ...S.btn, marginBottom: 8 }}>다시 시도</button>
            <button onClick={onClose} style={{ ...S.btnGhost, marginTop: 0 }}>닫기</button>
          </>
        )}
      </div>
    </div>,
    portalTarget
  );
}

// 한 줄 — 체크한 줄만 다시 그리도록 memo (연락처가 수천 명이어도 체크 반응이 빠르게)
const ImportRow = memo(function ImportRow({ x, onToggle }) {
  return (
    <div onClick={() => onToggle(x)}
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
  );
});

const PAGE = 100; // 한 번에 그리는 줄 수 — 나머지는 "더 보기" 또는 검색으로

// 휴대폰 연락처 가져오기 — 안드로이드 선택 창에서 "모두 선택"으로 넘겨받은 연락처 전체를 보여주고,
// 여기서 검색(이름·초성·전화번호)하며 등록할 사람만 체크한다. 기본은 모두 해제.
// 이미 등록된 사람은 "이미 등록됨" 표시(체크하면 새로 하나 더 만들어지므로 체크 불가).
// 태그는 가져올 사람 전체에 한 번에 적용.
// 성능: 검색 정보는 buildImportCandidates에서 미리 계산(item.search), 목록은 100줄씩, 입력과 목록 갱신 분리(useDeferredValue)
export default function ContactImportSheet({ candidates, allTags = [], onImport, onClose }) {
  const [items, setItems] = useState(candidates);
  const [tags, setTags] = useState([]);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const deferredQuery = useDeferredValue(query);
  const checkedCount = useMemo(() => items.reduce((n, x) => n + (x.checked ? 1 : 0), 0), [items]);
  const visible = useMemo(() => {
    const pq = prepareSearchQuery(deferredQuery);
    return pq.q ? items.filter(x => matchSearchIndex(x.search, pq)) : items;
  }, [items, deferredQuery]);
  const selectable = useMemo(() => visible.filter(x => !x.dup), [visible]);
  const allVisibleChecked = selectable.length > 0 && selectable.every(x => x.checked);
  const shown = visible.slice(0, limit);

  const onToggle = useCallback((x) => {
    if (x.dup) return;
    setItems(prev => prev.map(y => y.key === x.key ? { ...y, checked: !y.checked } : y));
  }, []);
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
          <input value={query} onChange={e => { setQuery(e.target.value); setLimit(PAGE); }} placeholder="이름·초성(ㄱㅊㅅ)·전화번호 검색"
            style={{ ...S.input, marginBottom: 8 }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: 'var(--dm-muted)' }}>{deferredQuery ? `검색 결과 ${visible.length}명` : `전체 ${items.length}명`}</span>
            {selectable.length > 0 && (
              <button onClick={toggleAllVisible}
                style={{ background: 'none', border: 'none', color: '#6C8EFF', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '2px 0', fontFamily: 'inherit' }}>
                {allVisibleChecked ? '전체 해제' : (deferredQuery ? '검색 결과 전체 선택' : '전체 선택')}
              </button>
            )}
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px 12px' }}>
          {shown.map(x => <ImportRow key={x.key} x={x} onToggle={onToggle} />)}
          {visible.length > shown.length && (
            <button onClick={() => setLimit(l => l + PAGE)}
              style={{ ...S.btnGhost, marginTop: 10 }}>
              {Math.min(PAGE, visible.length - shown.length)}명 더 보기 (남은 {visible.length - shown.length}명 · 검색하면 빨라요)
            </button>
          )}
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
