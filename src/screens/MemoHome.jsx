import { useRef, useState } from "react";
import { formatKoreanDate, addDays } from "../utils/date.js";
import S from "../styles.js";
import LongMemoEditor from "../components/LongMemoEditor.jsx";
import MemoTimeline, { genMemoId, getMemoTimeStr } from "../components/MemoTimeline.jsx";
import SearchViewer from "./SearchViewer.jsx";

// "메모" 탭 화면 — 새 메모 작성(긴 메모 에디터) + 스크롤하면 나오는 날짜별 짧은 메모 목록
export default function MemoHome({
  todayStr, plans, onUpdateDayData,
  onCreateToday, onUpdateToday, onUpdatePhotosToday, onUpdateStarredToday,
  onOpenDate, onOpenKnowledge, onRequireLogin,
  uid, toast, setToast,
  frequentTags, myTags, hiddenTags, onHideTag,
}) {
  const [dayOffset, setDayOffset] = useState(0);
  const [longMemo, setLongMemo] = useState(null); // 목록에서 특정 메모를 열어 편집할 때만 사용
  const [showSearch, setShowSearch] = useState(false);
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef(null);

  const targetDs = dayOffset === 0 ? todayStr : addDays(todayStr, dayOffset);
  const targetData = plans[targetDs] || {};
  const dayLabel = dayOffset === 0 ? '오늘' : dayOffset === 1 ? '내일' : dayOffset === -1 ? '어제' : formatKoreanDate(targetDs);

  const addMemoAt = (text, time, id = genMemoId()) => {
    onUpdateDayData(targetDs, prev => ({
      ...prev,
      memos: [...(prev.memos || []), { id, text, createdAt: time }],
    }));
    return id;
  };
  const updateMemoAt = (id, text) => onUpdateDayData(targetDs, prev => ({
    ...prev,
    memos: (prev.memos || []).map(m => m.id === id ? { ...m, text } : m),
  }));
  const updateMemoPhotosAt = (id, photos) => onUpdateDayData(targetDs, prev => ({
    ...prev,
    memos: (prev.memos || []).map(m => m.id === id ? { ...m, photos } : m),
  }));
  const updateMemoStarredAt = (id, starred) => onUpdateDayData(targetDs, prev => ({
    ...prev,
    memos: (prev.memos || []).map(m => m.id === id ? { ...m, starred } : m),
  }));
  const deleteMemoAt = (id) => {
    onUpdateDayData(targetDs, prev => ({
      ...prev,
      memos: (prev.memos || []).filter(m => m.id !== id),
    }));
  };

  const startRecording = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setToast('이 브라우저는 음성 인식을 지원하지 않아요'); return; }
    if (recording) { recognitionRef.current?.stop(); setRecording(false); return; }
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
      if (text) addMemoAt(text.trim(), getMemoTimeStr());
    };
    r.onerror = () => setRecording(false);
    r.onend = () => setRecording(false);
    r.start();
    setRecording(true);
  };

  if (showSearch) return <SearchViewer plans={plans} onClose={() => setShowSearch(false)} onOpenDate={onOpenDate} onUpdateDayData={onUpdateDayData} uid={uid} setToast={setToast} hiddenTags={hiddenTags} onHideTag={onHideTag} />;

  if (longMemo) return (
    <LongMemoEditor
      key={`edit-${longMemo.id}`}
      initialId={longMemo.id}
      initialText={longMemo.text}
      initialPhotos={longMemo.photos || []}
      initialStarred={longMemo.starred || false}
      subtitle={dayLabel !== '오늘' ? dayLabel : ''}
      onCreate={(text) => addMemoAt(text, getMemoTimeStr())}
      onUpdate={updateMemoAt}
      onUpdatePhotos={updateMemoPhotosAt}
      onUpdateStarred={updateMemoStarredAt}
      onClose={() => setLongMemo(null)}
      onSearch={() => { setLongMemo(null); setShowSearch(true); }}
      onOpenKnowledge={onOpenKnowledge ? () => { setLongMemo(null); onOpenKnowledge(); } : undefined}
      uid={uid}
      pathPrefix={uid ? `users/${uid}/memos` : undefined}
      onPhotoError={setToast}
      onRequireLogin={onRequireLogin}
      frequentTags={frequentTags}
      myTags={myTags}
      onHideTag={onHideTag}
    />
  );

  const timelineSection = (
    <div style={{ borderTop: '1px solid var(--dm-border)', marginTop: 8, padding: '18px 20px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--dm-text)' }}>{dayLabel} 메모</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setDayOffset(o => o - 1)} aria-label="전날 메모" style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--dm-border)', background: 'var(--dm-input)', color: 'var(--dm-sub)', fontSize: 16, fontWeight: 900, cursor: 'pointer' }}>‹</button>
          <button onClick={() => setDayOffset(o => o + 1)} aria-label="다음날 메모" style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--dm-border)', background: 'var(--dm-input)', color: 'var(--dm-sub)', fontSize: 16, fontWeight: 900, cursor: 'pointer' }}>›</button>
        </div>
      </div>
      <MemoTimeline
        memos={targetData.memos || []}
        onAdd={addMemoAt}
        onUpdate={updateMemoAt}
        onDelete={deleteMemoAt}
        onOpenLongEditor={(item) => setLongMemo({ id: item.id, text: item.text, photos: item.photos || [], starred: item.starred || false })}
        onToggleStar={updateMemoStarredAt}
        placeholder="메모 입력 후 + 버튼"
        extraAction={
          <button
            onClick={startRecording}
            style={{ width: 42, height: 42, borderRadius: 10, border: `1.5px solid ${recording ? '#F87171' : 'var(--dm-border)'}`, background: recording ? 'rgba(248,113,113,.15)' : 'var(--dm-input)', fontSize: 18, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
          >{recording ? '⏹' : <span style={{ display: 'inline-block', transform: 'translateX(-2px)' }}>🎤</span>}</button>
        }
      />
    </div>
  );

  return (
    <LongMemoEditor
      key="compose-new"
      initialId={null}
      initialText=""
      onCreate={(text) => onCreateToday(text, getMemoTimeStr())}
      onUpdate={onUpdateToday}
      onUpdatePhotos={onUpdatePhotosToday}
      onUpdateStarred={onUpdateStarredToday}
      onClose={() => window.history.back()}
      onSearch={() => setShowSearch(true)}
      onOpenKnowledge={onOpenKnowledge}
      uid={uid}
      pathPrefix={uid ? `users/${uid}/memos` : undefined}
      onPhotoError={setToast}
      onRequireLogin={onRequireLogin}
      frequentTags={frequentTags}
      myTags={myTags}
      onHideTag={onHideTag}
      extraContent={timelineSection}
    />
  );
}
