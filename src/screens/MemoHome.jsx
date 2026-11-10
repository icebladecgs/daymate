import { useEffect, useRef, useState } from "react";
import { formatKoreanDate, addDays } from "../utils/date.js";
import S, { UI } from "../styles.js";
import Toast from "../components/Toast.jsx";
import LongMemoEditor from "../components/LongMemoEditor.jsx";
import MemoTimeline, { genMemoId, getMemoTimeStr } from "../components/MemoTimeline.jsx";
import { newDesignOn } from "../utils/todayLook.js";
import { SectionBox } from "../components/TodayExtras.jsx";

// 새 디자인 메모 목록 제목의 짧은 날짜 "11/8 (일)" — 버튼 3개와 한 줄에 들어가게 (2026-11-10)
const shortDayLabel = (ds) => { const [y, m, d] = ds.split('-').map(Number); return `${m}/${d} (${'일월화수목금토'[new Date(y, m - 1, d).getDay()]})`; };

// "메모" 탭 화면 — 새 메모 작성(긴 메모 에디터) + 스크롤하면 나오는 날짜별 짧은 메모 목록
// 메모 화면은 검색·메모 열기·새 메모 쓰기로 모습이 바뀌므로, 알림(toast)은 바깥에서 한 번 그린다.
// (예전엔 이 화면에 알림 표시가 없어서 공유 저장 알림 등이 오늘 화면으로 돌아가야 떴다, 2026-09-25)
export default function MemoHome(props) {
  const { toast, setToast } = props;
  return (
    <>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
      <MemoHomeInner {...props} />
    </>
  );
}

function MemoHomeInner({
  todayStr, plans, onUpdateDayData,
  onCreateToday, onUpdateToday, onUpdatePhotosToday, onUpdateStarredToday, onUpdateFilesToday,
  onRequireLogin,
  uid, setToast,
  frequentTags, myTags, onHideTag,
  onOpenWrong, wrongDue = 0, // 수험생 모드면 오답 노트 열기
  embedded = false, // PC 대시보드 칸 안: 쓰기를 닫아도 화면을 벗어나지 않고 새 메모로
  openMemo = null, onOpenedMemo, // 공유로 저장한 메모 { id, at } — 쓰기 칸에 그대로 띄운다 (2026-11-10)
}) {
  const [composeKey, setComposeKey] = useState(0);
  // 쓰기 칸에 띄울 오늘 메모 id. 받은 뒤 App 쪽 값은 지운다(다른 탭에 갔다 오면 빈 새 메모로)
  const [seedId, setSeedId] = useState(openMemo?.id || null);
  useEffect(() => {
    if (!openMemo) return;
    setSeedId(openMemo.id);
    setComposeKey(k => k + 1);
    onOpenedMemo?.();
  }, [openMemo?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  const seedMemo = seedId ? (plans[todayStr]?.memos || []).find(m => m.id === seedId && !m.locked) : null;
  const [dayOffset, setDayOffset] = useState(0);
  const [longMemo, setLongMemo] = useState(null); // 목록에서 특정 메모를 열어 편집할 때만 사용
  const [recording, setRecording] = useState(false);
  // 🔍는 메모 관리자(검색창 포함)를 연다. 사진 모아보기·찾은 단어 이동은 메모 관리자의 상세검색에서
  const openMemoManager = () => window.dispatchEvent(new CustomEvent('dm:navigate', { detail: 'manager' }));
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
  const updateMemoFilesAt = (id, files) => onUpdateDayData(targetDs, prev => ({
    ...prev,
    memos: (prev.memos || []).map(m => m.id === id ? { ...m, files } : m),
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


  if (longMemo) return (
    <LongMemoEditor
      key={`edit-${longMemo.id}`}
      initialId={longMemo.id}
      initialText={longMemo.text}
      initialPhotos={longMemo.photos || []}
      initialFiles={longMemo.files || []}
      initialStarred={longMemo.starred || false}
      subtitle={dayLabel !== '오늘' ? dayLabel : ''}
      onCreate={(text) => addMemoAt(text, getMemoTimeStr())}
      onUpdate={updateMemoAt}
      onUpdatePhotos={updateMemoPhotosAt}
      onUpdateFiles={updateMemoFilesAt}
      onUpdateStarred={updateMemoStarredAt}
      onClose={() => setLongMemo(null)}
      onSearch={() => { setLongMemo(null); openMemoManager(); }}
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
    <div style={newDesignOn() ? { paddingBottom: 20 } : { borderTop: '1px solid var(--dm-border)', marginTop: 8, padding: '18px 20px 28px' }}>
      {onOpenWrong && (
        <div style={newDesignOn() ? { padding: '0 16px' } : undefined}>
        <button onClick={onOpenWrong} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', marginBottom: 16, borderRadius: 14, border: '1.5px solid var(--dm-accent-line, rgba(91,124,250,.35))', background: 'var(--dm-accent-soft, rgba(91,124,250,.08))', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
          <span style={{ fontSize: 22 }}>📕</span>
          <span style={{ flex: 1, fontSize: 16, fontWeight: 900, color: 'var(--dm-text)' }}>오답 노트</span>
          {wrongDue > 0 && <span style={{ fontSize: 14, fontWeight: 800, color: '#EF4444' }}>다시 풀 문제 {wrongDue}개</span>}
          <span style={{ fontSize: 16, color: 'var(--dm-muted)' }}>›</span>
        </button>
        </div>
      )}
      <SectionBox on={newDesignOn()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: newDesignOn() ? UI.titleGap : 10 }}>
        <span style={{ fontSize: newDesignOn() ? UI.title : 13, fontWeight: 900, color: 'var(--dm-text)', whiteSpace: 'nowrap' }}>{newDesignOn() && Math.abs(dayOffset) > 1 ? shortDayLabel(targetDs) : dayLabel} 메모</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* 다른 날로 갔을 때 한 번에 돌아오기 (2026-11-10) */}
          {newDesignOn() && dayOffset !== 0 && (
            <button onClick={() => setDayOffset(0)} style={{ height: UI.touch, padding: '0 12px', borderRadius: 8, border: '1px solid var(--dm-border)', background: 'var(--dm-input)', color: 'var(--dm-accent, #5B7CFA)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>오늘로</button>
          )}
          <button onClick={() => setDayOffset(o => o - 1)} aria-label="전날 메모" style={{ width: 30, height: 30, borderRadius: 8, ...(newDesignOn() ? { width: UI.touch, height: UI.touch, padding: 0 } : {}), border: '1px solid var(--dm-border)', background: 'var(--dm-input)', color: 'var(--dm-sub)', fontSize: 16, fontWeight: 900, cursor: 'pointer' }}>‹</button>
          <button onClick={() => setDayOffset(o => o + 1)} aria-label="다음날 메모" style={{ width: 30, height: 30, borderRadius: 8, ...(newDesignOn() ? { width: UI.touch, height: UI.touch, padding: 0 } : {}), border: '1px solid var(--dm-border)', background: 'var(--dm-input)', color: 'var(--dm-sub)', fontSize: 16, fontWeight: 900, cursor: 'pointer' }}>›</button>
        </div>
      </div>
      <MemoTimeline
        viewOnly={newDesignOn()} // 새 디자인: 보기 전용(입력칸 없음, 줄을 누르면 전체 글) — 2026-11-10 사용자 결정
        memos={targetData.memos || []}
        onAdd={addMemoAt}
        onUpdate={updateMemoAt}
        onDelete={deleteMemoAt}
        onOpenLongEditor={(item) => setLongMemo({ id: item.id, text: item.text, photos: item.photos || [], files: item.files || [], starred: item.starred || false })}
        onToggleStar={updateMemoStarredAt}
        placeholder="메모 입력 후 + 버튼"
        extraAction={
          <button
            onClick={startRecording}
            style={{ width: 42, height: 42, borderRadius: 10, border: `1.5px solid ${recording ? '#F87171' : 'var(--dm-border)'}`, background: recording ? 'rgba(248,113,113,.15)' : 'var(--dm-input)', fontSize: 18, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
          >{recording ? '⏹' : <span style={{ display: 'inline-block', transform: 'translateX(-2px)' }}>🎤</span>}</button>
        }
      />
      </SectionBox>
    </div>
  );

  return (
    <LongMemoEditor
      // 공유로 저장한 메모가 목록에 들어오면 그 메모로 다시 연다(키가 바뀜)
      key={`compose-${composeKey}-${seedMemo ? seedMemo.id : 'new'}`}
      tabScreen
      hideBack={embedded}
      memoExists={(id) => (plans[todayStr]?.memos || []).some(m => m.id === id)}
      initialId={seedMemo ? seedMemo.id : null}
      initialText={seedMemo ? seedMemo.text || '' : ''}
      initialPhotos={seedMemo?.photos || []}
      initialFiles={seedMemo?.files || []}
      initialStarred={!!seedMemo?.starred}
      onCreate={(text) => onCreateToday(text, getMemoTimeStr())}
      onUpdate={onUpdateToday}
      onUpdatePhotos={onUpdatePhotosToday}
      onUpdateFiles={onUpdateFilesToday}
      onUpdateStarred={onUpdateStarredToday}
      onClose={embedded ? () => setComposeKey(k => k + 1) : () => window.history.back()}
      onSearch={openMemoManager}
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
