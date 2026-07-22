import { useMemo, useState } from "react";
import S from "../styles.js";
import { getTopKeywords, parseWikiLinks } from "../utils/knowledge.js";
import { formatKoreanDate } from "../utils/date.js";

const getMemoText = (day) =>
  (day.memos || []).map(m => m.text || '').join('\n').trim() || (day.memo || '').trim();

export default function Knowledge({ plans, onOpenKeyword, onOpenDate }) {
  const [searchText, setSearchText] = useState('');

  const topKeywords = useMemo(() => getTopKeywords(plans, 40), [plans]);

  const recentDays = useMemo(() => {
    return Object.entries(plans)
      .filter(([, day]) => {
        const hasMemo = !!getMemoText(day);
        const hasJournal = !!(day.journal?.body || '').trim();
        const hasTags = (day.tags || []).length > 0;
        return hasMemo || hasJournal || hasTags;
      })
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 10);
  }, [plans]);

  const filtered = searchText.trim()
    ? topKeywords.filter(k =>
        k.name.toLowerCase().includes(searchText.toLowerCase()) ||
        searchText.toLowerCase().includes(k.name.toLowerCase())
      )
    : topKeywords;

  const totalMentions = topKeywords.reduce((s, k) => s + k.count, 0);
  const hasAnyContent = topKeywords.length > 0;

  return (
    <div style={S.content}>
      <div style={S.topbar}>
        <div>
          <div style={S.title}>연결된 생각</div>
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

      {/* 자주 등장한 키워드 */}
      {hasAnyContent && (
        <>
          <div style={S.sectionTitle}>
            <span style={S.sectionEmoji}>🏷️</span>자주 등장한 키워드
          </div>
          {filtered.length === 0 ? (
            <div style={{ ...S.card, textAlign: 'center', color: 'var(--dm-muted)', fontSize: 13, padding: '20px' }}>
              검색 결과가 없어요
            </div>
          ) : (
            <div style={{ padding: '0 16px 4px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {filtered.map(({ name, count }) => (
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

      {/* 최근 기록 */}
      {recentDays.length > 0 && (
        <>
          <div style={S.sectionTitle}>
            <span style={S.sectionEmoji}>📋</span>최근 기록
          </div>
          {recentDays.map(([dateStr, day]) => {
            const text = day.journal?.body || getMemoText(day);
            const links = parseWikiLinks(text);
            const tags = day.tags || [];
            const allKeywords = [...new Set([...links, ...tags])];
            const preview = text.replace(/\[\[([^\]]+)\]\]/g, '$1');
            const type = day.journal?.body ? '📖 일기' : '📝 메모';
            return (
              <div
                key={dateStr}
                style={{ ...S.card, cursor: 'pointer' }}
                onClick={() => onOpenDate(dateStr, type === '📝 메모')}
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
