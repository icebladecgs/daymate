import { useMemo } from "react";
import S from "../styles.js";
import { getKeywordRecords, getRelatedKeywords } from "../utils/knowledge.js";
import { formatKoreanDate } from "../utils/date.js";

export default function KeywordDetail({ keyword, plans, onBack, onOpenKeyword, onOpenDate }) {
  const records = useMemo(
    () => getKeywordRecords(plans, keyword),
    [plans, keyword]
  );
  const related = useMemo(
    () => getRelatedKeywords(plans, keyword),
    [plans, keyword]
  );

  const lastDate = records[0]?.dateStr || '';
  const diaryCount = records.filter(r => r.type === '일기').length;
  const memoCount = records.filter(r => r.type === '메모').length;

  return (
    <div style={S.content}>
      <div style={S.topbar}>
        <button
          onClick={onBack}
          style={{ ...S.btnGhost, width: 'auto', marginTop: 0, padding: '6px 12px', fontSize: 13 }}
        >
          ← 뒤로
        </button>
        <div style={{ flex: 1, paddingLeft: 8, minWidth: 0 }}>
          <div style={{ ...S.title, fontSize: 17 }}>#{keyword}</div>
          <div style={S.sub}>
            {records.length}번 언급
            {lastDate ? ` · 최근 ${lastDate.slice(5).replace('-', '/')}` : ''}
          </div>
        </div>
      </div>

      {/* 통계 카드 */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px 0' }}>
        {[
          { label: '총 언급', value: records.length, color: '#b8c3ff' },
          { label: '일기', value: diaryCount, color: '#c4b5fd' },
          { label: '메모', value: memoCount, color: '#6ee7b7' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            flex: 1, ...S.card, margin: 0, textAlign: 'center', padding: '14px 8px',
          }}>
            <div style={{ fontSize: 22, fontWeight: 900, color }}>{value}</div>
            <div style={{ fontSize: 10, color: 'var(--dm-muted)', marginTop: 4, fontWeight: 700 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* 관련 키워드 */}
      {related.length > 0 && (
        <>
          <div style={S.sectionTitle}>
            <span style={S.sectionEmoji}>🔗</span>함께 등장한 키워드
          </div>
          <div style={{ padding: '0 16px 4px', display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {related.map(({ name, count }) => (
              <button
                key={name}
                onClick={() => onOpenKeyword(name)}
                style={{
                  background: 'rgba(167,139,250,0.12)',
                  border: '1px solid rgba(167,139,250,0.25)',
                  borderRadius: 999,
                  padding: '6px 13px',
                  fontSize: 12,
                  color: '#c4b5fd',
                  cursor: 'pointer',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontFamily: 'inherit',
                }}
              >
                {name}
                <span style={{ fontSize: 10, color: 'var(--dm-muted)' }}>·{count}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* 관련 기록 (백링크) */}
      <div style={S.sectionTitle}>
        <span style={S.sectionEmoji}>📋</span>관련 기록 ({records.length})
      </div>

      {records.length === 0 ? (
        <div style={{ ...S.card, textAlign: 'center', color: 'var(--dm-muted)', fontSize: 13, padding: '28px' }}>
          아직 이 키워드를 언급한 기록이 없어요
        </div>
      ) : (
        records.map((rec, i) => {
          const day = plans[rec.dateStr];
          const fullText = rec.type === '일기'
            ? (day?.journal?.body || '')
            : rec.type === '메모'
            ? (day?.memo || '')
            : (day?.journal?.body || day?.memo || ''); // 태그 타입
          const preview = fullText.replace(/\[\[([^\]]+)\]\]/g, '$1');

          const typeStyle = rec.type === '일기'
            ? { bg: 'rgba(167,139,250,0.15)', color: '#c4b5fd' }
            : rec.type === '메모'
            ? { bg: 'rgba(108,142,255,0.15)', color: '#b8c3ff' }
            : { bg: 'rgba(74,222,128,0.12)', color: '#4ADE80' };

          return (
            <div
              key={i}
              style={{ ...S.card, cursor: 'pointer' }}
              onClick={() => onOpenDate(rec.dateStr)}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--dm-muted)' }}>
                  {formatKoreanDate(rec.dateStr)}
                </span>
                <span style={{
                  background: typeStyle.bg,
                  borderRadius: 999,
                  padding: '2px 9px',
                  fontSize: 11,
                  color: typeStyle.color,
                  fontWeight: 700,
                }}>
                  {rec.type}
                </span>
              </div>
              <div style={{
                fontSize: 13, color: 'var(--dm-text)', lineHeight: 1.65,
                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                overflow: 'hidden', whiteSpace: 'pre-wrap',
              }}>
                {preview}
              </div>
            </div>
          );
        })
      )}

      <div style={{ height: 16 }} />
    </div>
  );
}
