import { useState } from "react";
import { formatKoreanDate } from "../utils/date.js";
import S from "../styles.js";

export default function JournalViewer({ plans, onClose }) {
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState('');

  const journalEntries = Object.entries(plans)
    .filter(([, d]) => d?.journal?.body?.trim())
    .sort(([a], [b]) => b.localeCompare(a));

  const filtered = query.trim()
    ? journalEntries.filter(([ds, d]) =>
        d.journal.body.toLowerCase().includes(query.toLowerCase()) ||
        formatKoreanDate(ds).includes(query)
      )
    : journalEntries;

  const allText = journalEntries
    .map(([ds, d]) => `[${formatKoreanDate(ds)}]\n${d.journal.body.trim()}`)
    .join('\n\n───────────\n\n');

  const copyAll = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(allText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
    } else {
      const ta = document.createElement('textarea');
      ta.value = allText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--dm-bg)', zIndex: 500, display: 'flex', flexDirection: 'column', maxWidth: '100%' }}>
      <div style={{ ...S.topbar, flexShrink: 0 }}>
        <button onClick={onClose} style={{ ...S.btnGhost, width: 56, marginTop: 0, padding: 10 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={S.title}>일기 몰아보기</div>
          <div style={S.sub}>{journalEntries.length}일치 일기</div>
        </div>
        <button onClick={copyAll} style={{
          padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
          background: copied ? 'rgba(74,222,128,.15)' : 'rgba(108,142,255,.15)',
          color: copied ? '#4ADE80' : '#6C8EFF',
          fontSize: 12, fontWeight: 900, flexShrink: 0,
        }}>
          {copied ? '✓ 복사됨' : '전체 복사'}
        </button>
      </div>
      <div style={{ padding: '8px 16px 4px', flexShrink: 0 }}>
        <input
          style={{ ...S.input, marginBottom: 0 }}
          placeholder="🔍 일기 검색..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>
      <div style={{ ...S.content, paddingBottom: 32 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--dm-muted)', fontSize: 14 }}>
            {query ? '검색 결과가 없어요.' : '아직 작성된 일기가 없어요.'}
          </div>
        ) : filtered.map(([ds, d]) => (
          <div key={ds} style={S.card}>
            <div style={{ fontSize: 11, color: '#A78BFA', fontWeight: 900, marginBottom: 8 }}>
              {formatKoreanDate(ds)}
            </div>
            <div style={{ fontSize: 14, color: 'var(--dm-text)', lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {d.journal.body.trim()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
