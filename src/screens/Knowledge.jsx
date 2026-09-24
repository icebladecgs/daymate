import { useMemo, useState } from "react";
import S from "../styles.js";
import { getTopKeywords, parseWikiLinks } from "../utils/knowledge.js";
import { formatKoreanDate } from "../utils/date.js";
import LongMemoEditor from "../components/LongMemoEditor.jsx";

export default function Knowledge({
  plans, onOpenKeyword, onOpenDate, onBack,
  onUpdateDayData, uid, toast, setToast, onRequireLogin,
  frequentTags = [], myTags = [], hiddenTags, onHideTag,
}) {
  const [searchText, setSearchText] = useState('');
  const [expandMy, setExpandMy] = useState(false);
  const [expandFrequent, setExpandFrequent] = useState(false);
  const [expandGroups, setExpandGroups] = useState(false);
  const [longMemo, setLongMemo] = useState(null); // { dateStr, id, text, photos, starred } | null

  const topKeywords = useMemo(() => getTopKeywords(plans, 40), [plans]);

  // #상위/하위 형식의 계층형 태그를 분리 — 그룹은 별도 섹션에, 나머지는 기존 키워드 목록에
  const { flatKeywords, groupedTags } = useMemo(() => {
    const flatKeywords = [];
    const groups = new Map();
    topKeywords.forEach(k => {
      const slashIdx = k.name.indexOf('/');
      if (slashIdx > 0 && slashIdx < k.name.length - 1) {
        const parent = k.name.slice(0, slashIdx);
        const child = k.name.slice(slashIdx + 1);
        if (!groups.has(parent)) groups.set(parent, []);
        groups.get(parent).push({ ...k, child });
      } else {
        flatKeywords.push(k);
      }
    });
    return { flatKeywords, groupedTags: groups };
  }, [topKeywords]);

  // 하루 단위로 뭉치지 않고 메모/일기 개별 항목으로 펼쳐서 최신순 정렬
  // (하루에 메모가 여러 개면 예전엔 통째로 합쳐서 보여줘서 방금 쓴 메모가 미리보기에 묻혔음)
  const recentItems = useMemo(() => {
    const items = [];
    Object.entries(plans).forEach(([dateStr, day]) => {
      (day.memos || []).forEach((m, idx) => {
        const text = (m.text || '').trim();
        if (!text && !(m.photos || []).length) return;
        items.push({ key: `${dateStr}_m${m.id}`, dateStr, idx, kind: 'memo', id: m.id, text, photos: m.photos || [], files: m.files || [], starred: !!m.starred });
      });
      const journalBody = (day.journal?.body || '').trim();
      if (journalBody) {
        items.push({ key: `${dateStr}_j`, dateStr, idx: -1, kind: 'journal', text: journalBody });
      }
    });
    items.sort((a, b) => a.dateStr === b.dateStr ? b.idx - a.idx : b.dateStr.localeCompare(a.dateStr));
    return items.slice(0, 15);
  }, [plans]);

  const searchLower = searchText.trim().toLowerCase();
  const matchesSearch = (name) => !searchLower || name.toLowerCase().includes(searchLower) || searchLower.includes(name.toLowerCase());

  const allMyTags = flatKeywords.filter(k => k.explicit);
  const allFrequentTags = flatKeywords.filter(k => !k.explicit);
  const myFlatTags = allMyTags.filter(k => matchesSearch(k.name));
  const frequentFlatTags = allFrequentTags.filter(k => matchesSearch(k.name));

  const totalMentions = topKeywords.reduce((s, k) => s + k.count, 0);
  const hasAnyContent = topKeywords.length > 0;

  if (longMemo) return (
    <LongMemoEditor
      key={`edit-${longMemo.dateStr}-${longMemo.id}`}
      initialId={longMemo.id}
      initialText={longMemo.text}
      initialPhotos={longMemo.photos || []}
      initialFiles={longMemo.files || []}
      initialStarred={longMemo.starred || false}
      subtitle={formatKoreanDate(longMemo.dateStr)}
      onCreate={() => longMemo.id}
      onUpdate={(id, text) => onUpdateDayData(longMemo.dateStr, prev => ({ ...prev, memos: (prev.memos || []).map(m => m.id === id ? { ...m, text } : m) }))}
      onUpdatePhotos={(id, photos) => onUpdateDayData(longMemo.dateStr, prev => ({ ...prev, memos: (prev.memos || []).map(m => m.id === id ? { ...m, photos } : m) }))}
      onUpdateFiles={(id, files) => onUpdateDayData(longMemo.dateStr, prev => ({ ...prev, memos: (prev.memos || []).map(m => m.id === id ? { ...m, files } : m) }))}
      onUpdateStarred={(id, starred) => onUpdateDayData(longMemo.dateStr, prev => ({ ...prev, memos: (prev.memos || []).map(m => m.id === id ? { ...m, starred } : m) }))}
      onClose={() => setLongMemo(null)}
      onOpenKnowledge={undefined}
      uid={uid}
      pathPrefix={uid ? `users/${uid}/memos` : undefined}
      onPhotoError={setToast}
      onRequireLogin={onRequireLogin}
      frequentTags={frequentTags}
      myTags={myTags}
      onHideTag={onHideTag}
    />
  );

  return (
    <div style={S.content}>
      <div style={S.topbar}>
        {onBack && (
          <button
            onClick={onBack}
            style={{ ...S.btnGhost, width: 'auto', marginTop: 0, padding: '6px 12px', fontSize: 13 }}
          >
            ← 뒤로
          </button>
        )}
        <div>
          <div style={S.title}>지식</div>
          <div style={S.sub}>키워드 {topKeywords.length}개 · 언급 {totalMentions}회</div>
        </div>
      </div>

      <div style={{ padding: '12px 16px 4px' }}>
        <input
          style={{ ...S.input, marginBottom: 0 }}
          placeholder="키워드 검색..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
        />
      </div>

      {/* 사용 안내 (콘텐츠 없을 때) */}
      {!hasAnyContent && (
        <div style={{ ...S.card, background: 'rgba(108,142,255,0.06)', border: '1.5px solid rgba(108,142,255,0.18)', marginTop: 8 }}>
          <div style={{ fontSize: 28, textAlign: 'center', marginBottom: 12 }}>🧠</div>
          <div style={{ fontSize: 14, fontWeight: 900, textAlign: 'center', marginBottom: 10 }}>지식 연결 기능</div>
          <div style={{ fontSize: 12, color: 'var(--dm-sub)', lineHeight: 1.9 }}>
            일기나 메모에 <span style={{ color: '#6C8EFF', fontWeight: 900 }}>[[키워드]]</span> 형식으로 입력하면
            자동으로 연결되고 여기서 모아볼 수 있어요.<br /><br />
            예시:<br />
            <span style={{ color: 'var(--dm-text)' }}>오늘 [[비트코인]]을 추가 매수했다.<br />[[은퇴]] 준비를 위해 장기 보유할 계획.</span>
          </div>
          <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--dm-muted)', fontWeight: 700, marginBottom: 6 }}>일기/메모 화면에서 태그도 추가 가능해요</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {['비트코인', '은퇴', '유튜브', '우리은행', 'IRP'].map(kw => (
                <span key={kw} style={{ background: 'rgba(108,142,255,0.12)', border: '1px solid rgba(108,142,255,0.2)', borderRadius: 999, padding: '3px 10px', fontSize: 11, color: '#6C8EFF', fontWeight: 700 }}>{kw}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 내가 만든 태그 */}
      {allMyTags.length > 0 && (
        <>
          <div style={S.sectionTitle}>
            <span style={S.sectionEmoji}>🏷️</span>내가 만든 태그
            {allMyTags.length > 6 && (
              <button
                onClick={() => setExpandMy(v => !v)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#6C8EFF', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >{expandMy ? '접기 ▴' : '펼쳐보기 ▾'}</button>
            )}
          </div>
          {myFlatTags.length === 0 ? (
            <div style={{ ...S.card, textAlign: 'center', color: 'var(--dm-muted)', fontSize: 13, padding: '20px' }}>
              검색 결과가 없어요
            </div>
          ) : (
            <div style={{ padding: '0 16px 4px', display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: expandMy ? 'none' : 76, overflow: 'hidden' }}>
              {myFlatTags.map(({ name, count }) => (
                <button
                  key={name}
                  onClick={() => onOpenKeyword(name)}
                  style={{
                    background: 'rgba(167,139,250,0.13)',
                    border: '1px solid rgba(167,139,250,0.3)',
                    borderRadius: 999,
                    padding: '7px 14px',
                    fontSize: 13,
                    color: '#c4b5fd',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontFamily: 'inherit',
                  }}
                >
                  {name}
                  <span style={{
                    background: 'rgba(167,139,250,0.3)',
                    borderRadius: 999,
                    padding: '1px 7px',
                    fontSize: 10,
                    color: '#c4b5fd',
                    fontWeight: 900,
                  }}>
                    {count}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* 자주 등장한 키워드 (자동 추출) */}
      {allFrequentTags.length > 0 && (
        <>
          <div style={S.sectionTitle}>
            <span style={S.sectionEmoji}>🔥</span>자주 등장한 키워드
            {allFrequentTags.length > 6 && (
              <button
                onClick={() => setExpandFrequent(v => !v)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#6C8EFF', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >{expandFrequent ? '접기 ▴' : '펼쳐보기 ▾'}</button>
            )}
          </div>
          {frequentFlatTags.length === 0 ? (
            <div style={{ ...S.card, textAlign: 'center', color: 'var(--dm-muted)', fontSize: 13, padding: '20px' }}>
              검색 결과가 없어요
            </div>
          ) : (
            <div style={{ padding: '0 16px 4px', display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: expandFrequent ? 'none' : 76, overflow: 'hidden' }}>
              {frequentFlatTags.map(({ name, count }) => (
                <button
                  key={name}
                  onClick={() => onOpenKeyword(name)}
                  style={{
                    background: 'rgba(108,142,255,0.13)',
                    border: '1px solid rgba(108,142,255,0.28)',
                    borderRadius: 999,
                    padding: '7px 14px',
                    fontSize: 13,
                    color: '#b8c3ff',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontFamily: 'inherit',
                  }}
                >
                  {name}
                  <span style={{
                    background: 'rgba(108,142,255,0.35)',
                    borderRadius: 999,
                    padding: '1px 7px',
                    fontSize: 10,
                    color: '#6C8EFF',
                    fontWeight: 900,
                  }}>
                    {count}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* 계층형 태그 (#상위/하위) 모아보기 */}
      {groupedTags.size > 0 && (
        <>
          <div style={S.sectionTitle}>
            <span style={S.sectionEmoji}>📂</span>카테고리별 모아보기
            {groupedTags.size > 2 && (
              <button
                onClick={() => setExpandGroups(v => !v)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#6C8EFF', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >{expandGroups ? '접기 ▴' : '펼쳐보기 ▾'}</button>
            )}
          </div>
          <div style={{ padding: '0 16px 4px' }}>
            {[...groupedTags.entries()].slice(0, expandGroups ? undefined : 2).map(([parent, children]) => (
              <div key={parent} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--dm-muted)', fontWeight: 900, marginBottom: 6 }}>{parent}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {children.map(({ name, child, count }) => (
                    <button
                      key={name}
                      onClick={() => onOpenKeyword(name)}
                      style={{
                        background: 'rgba(167,139,250,0.12)',
                        border: '1px solid rgba(167,139,250,0.25)',
                        borderRadius: 999,
                        padding: '6px 12px',
                        fontSize: 12,
                        color: '#c4b5fd',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        fontFamily: 'inherit',
                      }}
                    >
                      {child}
                      <span style={{
                        background: 'rgba(167,139,250,0.3)',
                        borderRadius: 999,
                        padding: '1px 6px',
                        fontSize: 10,
                        color: '#c4b5fd',
                        fontWeight: 900,
                      }}>
                        {count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 최근 기록 */}
      {recentItems.length > 0 && (
        <>
          <div style={S.sectionTitle}>
            <span style={S.sectionEmoji}>📋</span>최근 기록
          </div>
          {recentItems.map(item => {
            const { dateStr, text } = item;
            const allKeywords = [...new Set(parseWikiLinks(text))];
            const preview = text.replace(/\[\[([^\]]+)\]\]/g, '$1');
            const type = item.kind === 'journal' ? '📖 일기' : '📝 메모';
            return (
              <div
                key={item.key}
                style={{ ...S.card, cursor: 'pointer' }}
                onClick={() => item.kind === 'memo'
                  ? setLongMemo({ dateStr, id: item.id, text: item.text, photos: item.photos, files: item.files, starred: item.starred })
                  : onOpenDate(dateStr, false)}
              >
                <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{formatKoreanDate(dateStr)}</span>
                  <span style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '1px 7px', fontSize: 10 }}>{type}</span>
                </div>
                <div style={{
                  fontSize: 13, color: 'var(--dm-text)', lineHeight: 1.65,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden', whiteSpace: 'pre-wrap',
                  marginBottom: allKeywords.length ? 10 : 0,
                }}>
                  {preview}
                </div>
                {allKeywords.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {allKeywords.slice(0, 5).map(kw => (
                      <span
                        key={kw}
                        onClick={e => { e.stopPropagation(); onOpenKeyword(kw); }}
                        style={{
                          background: 'rgba(108,142,255,0.10)',
                          border: '1px solid rgba(108,142,255,0.2)',
                          borderRadius: 999,
                          padding: '3px 10px',
                          fontSize: 11,
                          color: '#6C8EFF',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      <div style={{ height: 16 }} />
    </div>
  );
}
