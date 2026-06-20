import { useEffect, useRef, useState, useMemo } from "react";
import { formatKoreanDate } from "../utils/date.js";
import S from "../styles.js";
import Toast from "../components/Toast.jsx";
import SearchViewer from "./SearchViewer.jsx";
import { parseWikiLinks, extractKeywords } from "../utils/knowledge.js";
import MemoTimeline, { genMemoId, getMemoTimeStr } from "../components/MemoTimeline.jsx";

export default function Today({ dateStr, data, setData, toast, setToast, plans, onOpenDate, onUpdateDayData, onOpenInvest, onOpenKnowledge }) {
  const doneCount = data.tasks.filter((t) => t.done && t.title.trim()).length;
  const filledCount = data.tasks.filter((t) => t.title.trim()).length;
  const [showSearch, setShowSearch] = useState(false);
  const [recording, setRecording] = useState(null); // 'memo' | 'journal' | null
  const recognitionRef = useRef(null);
  const [tagInput, setTagInput] = useState('');
  const tagInputRef = useRef(null);

  // 기존 memo 문자열 → memos 배열 마이그레이션 (Firebase 로드 후 data.memo 변경 시 실행)
  useEffect(() => {
    if (data.memo?.trim() && !(data.memos?.length)) {
      setData(prev => ({
        ...prev,
        memos: [{ id: `legacy_${Date.now()}`, text: prev.memo.trim(), createdAt: '00:00' }],
        memo: '',
      }));
    }
  }, [data.memo]); // eslint-disable-line

  const addMemo = (text, time) => {
    setData(prev => ({
      ...prev,
      memos: [...(prev.memos || []), { id: genMemoId(), text, createdAt: time }],
    }));
  };
  const updateMemo = (id, text) => {
    setData(prev => ({
      ...prev,
      memos: (prev.memos || []).map(m => m.id === id ? { ...m, text } : m),
    }));
  };
  const deleteMemo = (id) => {
    setData(prev => ({
      ...prev,
      memos: (prev.memos || []).filter(m => m.id !== id),
    }));
  };

  const [journalText, setJournalText] = useState(data.journal?.body ?? '');
  const lastSavedJournalRef = useRef(data.journal?.body ?? '');
  const journalSaved = journalText === lastSavedJournalRef.current;
  const isPerfect = filledCount >= 3 && doneCount === filledCount && !!journalText.trim();

  useEffect(() => {
    if (data.journal?.body !== lastSavedJournalRef.current) {
      setJournalText(data.journal?.body ?? '');
      lastSavedJournalRef.current = data.journal?.body ?? '';
    }
  }, [data.journal?.body]); // eslint-disable-line

  useEffect(() => {
    if (journalText === lastSavedJournalRef.current) return;
    const t = setTimeout(() => {
      setData(prev => ({ ...prev, journal: { ...prev.journal, body: journalText } }));
      lastSavedJournalRef.current = journalText;
    }, 1500);
    return () => clearTimeout(t);
  }, [journalText]); // eslint-disable-line

  const startRecording = (field) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setToast('이 브라우저는 음성 인식을 지원하지 않아요'); return; }
    if (recording) { recognitionRef.current?.stop(); setRecording(null); return; }
    const r = new SR();
    r.lang = 'ko-KR';
    r.interimResults = false;
    r.continuous = true;
    recognitionRef.current = r;
    r.onresult = (e) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) text += e.results[i][0].transcript;
      }
      if (!text) return;
      if (field === 'memo') {
        addMemo(text.trim(), getMemoTimeStr());
      } else {
        setJournalText(prev => prev + (prev.trim() ? '\n' : '') + text);
      }
    };
    r.onerror = () => setRecording(null);
    r.onend = () => setRecording(null);
    r.start();
    setRecording(field);
  };

  if (showSearch) return <SearchViewer plans={plans} onClose={() => setShowSearch(false)} onOpenDate={onOpenDate} onUpdateDayData={onUpdateDayData} />;

  return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}

      <div style={S.topbar}>
        <div>
          <div style={S.title}>오늘 일기</div>
          <div style={S.sub}>{formatKoreanDate(dateStr)} · {doneCount}/{filledCount || 3} 완료</div>
        </div>
        <button onClick={() => setShowSearch(true)} style={{
          ...S.btnGhost, marginTop: 0, padding: '6px 12px', fontSize: 11, width: 'auto',
        }}>🔍 검색</button>
      </div>

      {isPerfect && (
        <div style={{
          ...S.card,
          background: "linear-gradient(135deg,rgba(74,222,128,.15),rgba(108,142,255,.10))",
          border: "1.5px solid rgba(74,222,128,.35)",
        }}>
          <div style={{ fontSize: 32, textAlign: "center", marginBottom: 8 }}>🎉</div>
          <div style={{ fontSize: 14, fontWeight: 900, textAlign: "center", color: "#4ADE80" }}>
            완벽한 하루!
          </div>
          <div style={{ fontSize: 12, textAlign: "center", color: "var(--dm-sub)", marginTop: 6 }}>
            3가지 완료 + 일기 작성. 연속 기록이 쌓이고 있어요 🔥
          </div>
        </div>
      )}

      <div style={{ ...S.sectionTitle, justifyContent: "space-between", paddingRight: 16 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={S.sectionEmoji}>📝</span>메모</span>
        {recording === 'memo' && <span style={{ fontSize: 11, color: "#F87171", fontWeight: 900, animation: "pulse 1s infinite" }}>● 녹음 중</span>}
      </div>
      <div style={S.card}>
        <MemoTimeline
          memos={data.memos || []}
          onAdd={addMemo}
          onUpdate={updateMemo}
          onDelete={deleteMemo}
          placeholder="메모 입력 후 Enter (시간 자동 기록)"
          extraAction={
            <button
              onClick={() => startRecording('memo')}
              style={{ width: 42, height: 42, borderRadius: 10, border: `1.5px solid ${recording === 'memo' ? '#F87171' : 'var(--dm-border)'}`, background: recording === 'memo' ? 'rgba(248,113,113,.15)' : 'var(--dm-input)', fontSize: 18, cursor: 'pointer', flexShrink: 0 }}
            >{recording === 'memo' ? '⏹' : '🎤'}</button>
          }
        />
      </div>

      <div style={{ ...S.sectionTitle, justifyContent: "space-between", paddingRight: 16 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={S.sectionEmoji}>📖</span>일기 <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--dm-muted)' }}>(22:00 이후 추천)</span></span>
        {recording === 'journal' && <span style={{ fontSize: 11, color: "#F87171", fontWeight: 900, animation: "pulse 1s infinite" }}>● 녹음 중</span>}
      </div>
      <div style={S.card}>
        <textarea
          rows={10}
          style={{ ...S.input, resize: "none", lineHeight: 1.6 }}
          value={journalText}
          onChange={(e) => setJournalText(e.target.value)}
          placeholder="오늘 하루를 한 줄이라도 기록해봐요."
          maxLength={1200}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <span style={{ fontSize: 11, color: journalSaved ? 'var(--dm-muted)' : '#A78BFA', fontWeight: journalSaved ? 400 : 700, transition: 'color 0.3s' }}>
            {journalSaved ? `✓ 자동저장 · ${journalText.length} / 1200` : '저장 중...'}
          </span>
          <button
            onClick={() => startRecording('journal')}
            style={{ width: 40, height: 36, borderRadius: 10, border: `1.5px solid ${recording === 'journal' ? '#F87171' : 'var(--dm-border)'}`, background: recording === 'journal' ? 'rgba(248,113,113,.15)' : 'var(--dm-input)', fontSize: 18, cursor: 'pointer' }}
          >{recording === 'journal' ? '⏹' : '🎤'}</button>
        </div>
        {/* 무드 셀렉터 — 글 작성 후 기분 선택 */}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--dm-border)" }}>
          <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700, marginBottom: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>오늘 기분은?</div>
          <div style={{ display: "flex", justifyContent: "space-around" }}>
            {[["😊","행복"],["😌","평온"],["🤔","보통"],["😴","피곤"],["😔","우울"]].map(([emoji, label]) => {
              const selected = data.journal?.mood === label;
              return (
                <button key={label}
                  onClick={() => setData(prev => ({ ...prev, journal: { ...prev.journal, mood: selected ? null : label } }))}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: selected ? "rgba(184,195,255,0.12)" : "transparent", border: "none", cursor: "pointer", padding: "6px 10px", borderRadius: 12, transition: "all 0.2s", boxShadow: selected ? "inset 0 0 0 1px rgba(184,195,255,0.25)" : "none" }}>
                  <span style={{ fontSize: 24, display: "inline-block", filter: selected ? "none" : "grayscale(0.6)", transform: selected ? "scale(1.15)" : "scale(1)", transition: "all 0.2s" }}>{emoji}</span>
                  <span style={{ fontSize: 10, color: selected ? "#b8c3ff" : "var(--dm-muted)", fontWeight: selected ? 700 : 400, transition: "color 0.2s" }}>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 태그 & 연결 키워드 */}
      <TagSection
        data={data}
        setData={setData}
        memoText={memoText}
        journalText={journalText}
        tagInput={tagInput}
        setTagInput={setTagInput}
        tagInputRef={tagInputRef}
        onOpenKnowledge={onOpenKnowledge}
      />

      {/* 투자 허브 바로가기 */}
      {onOpenInvest && (
        <div onClick={onOpenInvest} style={{
          ...S.card, marginTop: 4, cursor: "pointer",
          background: "linear-gradient(135deg,rgba(167,139,250,0.12),rgba(108,142,255,0.08))",
          border: "1.5px solid rgba(167,139,250,0.25)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>💹</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)" }}>투자 허브</div>
              <div style={{ fontSize: 11, color: "var(--dm-muted)" }}>브리핑 확인 후 판단을 기록하세요</div>
            </div>
          </div>
          <span style={{ fontSize: 18, color: "var(--dm-muted)" }}>›</span>
        </div>
      )}

      <div style={{ height: 12 }} />
    </div>
  );
}

function TagSection({ data, setData, memoText, journalText, tagInput, setTagInput, tagInputRef, onOpenKnowledge }) {
  const existingTags = data.tags || [];

  const suggested = useMemo(() => {
    const text = memoText + ' ' + journalText;
    const wikiLinks = parseWikiLinks(text);
    const extracted = extractKeywords(text, 8);
    return [...new Set([...wikiLinks, ...extracted])]
      .filter(k => !existingTags.includes(k))
      .slice(0, 5);
  }, [memoText, journalText, existingTags]);

  const addTag = (tag) => {
    const t = tag.trim();
    if (!t || existingTags.includes(t)) return;
    setData(prev => ({ ...prev, tags: [...(prev.tags || []), t] }));
    setTagInput('');
  };

  const removeTag = (tag) => {
    setData(prev => ({ ...prev, tags: (prev.tags || []).filter(t => t !== tag) }));
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      addTag(tagInput);
    } else if (e.key === 'Backspace' && !tagInput && existingTags.length > 0) {
      removeTag(existingTags[existingTags.length - 1]);
    }
  };

  const hasContent = existingTags.length > 0 || suggested.length > 0;

  return (
    <div style={S.card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--dm-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>🏷️</span> 연결 태그
        </div>
        {onOpenKnowledge && (
          <button
            onClick={onOpenKnowledge}
            style={{ fontSize: 11, color: '#6C8EFF', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, padding: 0 }}
          >
            지식 대시보드 →
          </button>
        )}
      </div>

      {/* 현재 태그 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: hasContent ? 10 : 0 }}>
        {existingTags.map(tag => (
          <span
            key={tag}
            style={{
              background: 'rgba(108,142,255,0.18)',
              border: '1px solid rgba(108,142,255,0.35)',
              borderRadius: 999,
              padding: '5px 10px 5px 12px',
              fontSize: 12,
              color: '#b8c3ff',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              style={{ background: 'none', border: 'none', color: 'rgba(184,195,255,0.5)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0, fontFamily: 'inherit' }}
            >×</button>
          </span>
        ))}

        {/* 태그 입력 */}
        <input
          ref={tagInputRef}
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={existingTags.length === 0 ? '태그 추가...' : '+'}
          style={{
            background: 'none',
            border: 'none',
            outline: 'none',
            fontSize: 12,
            color: 'var(--dm-text)',
            fontFamily: 'inherit',
            minWidth: 80,
            flex: 1,
            padding: '5px 4px',
          }}
        />
        {tagInput.trim() && (
          <button
            onClick={() => addTag(tagInput)}
            style={{ background: 'rgba(108,142,255,0.2)', border: '1px solid rgba(108,142,255,0.3)', borderRadius: 999, padding: '4px 10px', fontSize: 11, color: '#6C8EFF', cursor: 'pointer', fontWeight: 900, fontFamily: 'inherit' }}
          >추가</button>
        )}
      </div>

      {/* 자동 추천 키워드 */}
      {suggested.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--dm-muted)', fontWeight: 700, marginBottom: 6 }}>추천 키워드 (탭하여 추가)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {suggested.map(kw => (
              <button
                key={kw}
                onClick={() => addTag(kw)}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px dashed var(--dm-border)',
                  borderRadius: 999,
                  padding: '4px 11px',
                  fontSize: 11,
                  color: 'var(--dm-muted)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                }}
              >
                + {kw}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
