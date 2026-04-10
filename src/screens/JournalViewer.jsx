import { useEffect, useMemo, useState } from "react";
import { formatKoreanDate } from "../utils/date.js";
import S from "../styles.js";

export default function JournalViewer({ plans, onClose, focusDate = null, onSaveEntry = null }) {
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState('');
  const [draftText, setDraftText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveDone, setSaveDone] = useState(false);

  const journalEntries = useMemo(() => (
    Object.entries(plans)
      .filter(([, d]) => d?.journal?.body?.trim())
      .sort(([a], [b]) => b.localeCompare(a))
  ), [plans]);

  const focusedEntry = focusDate ? journalEntries.find(([ds]) => ds === focusDate) || null : null;

  useEffect(() => {
    if (!focusDate) return;
    setDraftText(focusedEntry?.[1]?.journal?.body?.trim() || '');
    setSaveDone(false);
  }, [focusDate, focusedEntry]);

  const filtered = focusDate
    ? (focusedEntry ? [focusedEntry] : [])
    : query.trim()
    ? journalEntries.filter(([ds, d]) =>
        d.journal.body.toLowerCase().includes(query.toLowerCase()) ||
        formatKoreanDate(ds).includes(query)
      )
    : journalEntries;

  const copySource = focusDate ? filtered : journalEntries;

  const allText = copySource
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

  const handleSave = async () => {
    if (!focusDate || !onSaveEntry) return;
    setSaving(true);
    try {
      await onSaveEntry(focusDate, draftText);
      setSaveDone(true);
      window.setTimeout(() => setSaveDone(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--dm-bg)', zIndex: 500, display: 'flex', flexDirection: 'column', maxWidth: '100%' }}>
      <div style={{ ...S.topbar, flexShrink: 0 }}>
        <button onClick={onClose} style={{ ...S.btnGhost, width: 56, marginTop: 0, padding: 10 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={S.title}>{focusDate ? '일기 보기' : '일기 몰아보기'}</div>
          <div style={S.sub}>{focusDate ? formatKoreanDate(focusDate) : `${journalEntries.length}일치 일기`}</div>
        </div>
        <button onClick={copyAll} style={{
          padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
          background: copied ? 'rgba(74,222,128,.15)' : 'rgba(108,142,255,.15)',
          color: copied ? '#4ADE80' : '#6C8EFF',
          fontSize: 12, fontWeight: 900, flexShrink: 0,
        }}>
          {copied ? '✓ 복사됨' : focusDate ? '복사' : '전체 복사'}
        </button>
      </div>
      {!focusDate && <div style={{ padding: '8px 16px 4px', flexShrink: 0 }}>
        <input
          style={{ ...S.input, marginBottom: 0 }}
          placeholder="🔍 일기 검색..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>}
      <div style={{ ...S.content, paddingBottom: focusDate ? 20 : 32, display: focusDate ? 'flex' : 'block', minHeight: 0 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--dm-muted)', fontSize: 14 }}>
            {focusDate ? '일기를 찾을 수 없어요.' : query ? '검색 결과가 없어요.' : '아직 작성된 일기가 없어요.'}
          </div>
        ) : filtered.map(([ds, d]) => (
          <div key={ds} style={{
            ...S.card,
            ...(focusDate ? {
              flex: 1,
              minHeight: 0,
              margin: '12px 12px 20px',
              padding: '18px 16px 20px',
              display: 'flex',
              flexDirection: 'column',
            } : null),
          }}>
            <div style={{ fontSize: focusDate ? 12 : 11, color: '#A78BFA', fontWeight: 900, marginBottom: focusDate ? 14 : 8 }}>
              {formatKoreanDate(ds)}
            </div>
            {focusDate ? (
              <>
                <textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  placeholder="일기를 입력하세요"
                  style={{ ...S.input, flex: 1, minHeight: 0, resize: 'none', lineHeight: 1.8, marginBottom: 12 }}
                  maxLength={1200}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontSize: 11, color: saveDone ? '#4ADE80' : 'var(--dm-muted)', fontWeight: saveDone ? 800 : 500 }}>
                    {saveDone ? '저장 완료' : `${draftText.length} / 1200`}
                  </div>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{ ...S.btn, width: 'auto', marginTop: 0, padding: '10px 18px', fontSize: 13, opacity: saving ? 0.7 : 1 }}
                  >
                    {saving ? '저장 중...' : '저장'}
                  </button>
                </div>
              </>
            ) : (
              <div style={{
                fontSize: focusDate ? 15 : 14,
                color: 'var(--dm-text)',
                lineHeight: focusDate ? 1.9 : 1.75,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                flex: focusDate ? 1 : 'initial',
                overflowY: focusDate ? 'auto' : 'visible',
              }}>
                {d.journal.body.trim()}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
