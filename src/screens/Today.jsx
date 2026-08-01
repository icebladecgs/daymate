import { useEffect, useRef, useState } from "react";
import { formatKoreanDate, getWeekDates, addDays } from "../utils/date.js";
import S from "../styles.js";
import Toast from "../components/Toast.jsx";
import SearchViewer from "./SearchViewer.jsx";
import MemoTimeline, { genMemoId, getMemoTimeStr } from "../components/MemoTimeline.jsx";
import WeeklySchedule from "../components/WeeklySchedule.jsx";
import LongMemoEditor from "../components/LongMemoEditor.jsx";
import { gcalFetchWeekEvents } from "../api/gcal.js";
import { deletePhoto } from "../firebase.js";
import PhotoAttach from "../components/PhotoAttach.jsx";
import TimeSelect from "../components/TimeSelect.jsx";

export default function Today({
  dateStr, data, setData, toast, setToast, plans, onOpenDate, onUpdateDayData,
  onOpenInvest, onOpenKnowledge, onOpenVoiceDiary,
  habits, onToggleHabit, setHabits,
  someday, setSomeday,
  onSetTodayTasks,
  getValidGcalToken, onGcalConnect,
  onToggleTask,
  autoOpenLongMemo,
  uid,
}) {
  const tasks = data.tasks || [];
  const doneCount = tasks.filter((t) => t.done && t.title.trim()).length;
  const filledCount = tasks.filter((t) => t.title.trim()).length;
  const doneTasks = tasks.filter((t) => t.done && t.title.trim());
  const [showSearch, setShowSearch] = useState(false);
  const [longMemo, setLongMemo] = useState(null); // null | { id: string|null, text: string }

  useEffect(() => {
    if (autoOpenLongMemo) setLongMemo({ id: null, text: '' });
  }, [autoOpenLongMemo]);
  const [recording, setRecording] = useState(null);
  const recognitionRef = useRef(null);
  const [taskInput, setTaskInput] = useState('');
  const [taskDayOffset, setTaskDayOffset] = useState(0); // 오늘의 할일 섹션만 다른 날짜로 미리보기
  const [gcalConnecting, setGcalConnecting] = useState(false);
  const [editingTimeId, setEditingTimeId] = useState(null);
  const [somedayInput, setSomedayInput] = useState('');
  const [editingHabits, setEditingHabits] = useState(false);
  const [newHabitIcon, setNewHabitIcon] = useState('');
  const [newHabitName, setNewHabitName] = useState('');
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString('ko-KR', { hour12: false }));
  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString('ko-KR', { hour12: false })), 1000);
    return () => clearInterval(t);
  }, []);

  const [gcalWeekEvents, setGcalWeekEvents] = useState({});
  const [scheduleOpen, setScheduleOpen] = useState(false);
  useEffect(() => {
    const token = getValidGcalToken?.();
    if (!token) return;
    gcalFetchWeekEvents(token, getWeekDates()).then(setGcalWeekEvents).catch(() => {});
  }, []); // eslint-disable-line

  // 기존 memo 문자열 → memos 배열 마이그레이션
  useEffect(() => {
    if (data.memo?.trim() && !(data.memos?.length)) {
      setData(prev => ({
        ...prev,
        memos: [{ id: `legacy_${Date.now()}`, text: prev.memo.trim(), createdAt: '00:00' }],
        memo: '',
      }));
    }
  }, [data.memo]); // eslint-disable-line

  const addMemo = (text, time, photo = null, id = genMemoId()) => {
    setData(prev => ({
      ...prev,
      memos: [...(prev.memos || []), { id, text, createdAt: time, photoUrl: photo?.url || null, photoPath: photo?.path || null }],
    }));
    return id;
  };
  const updateMemo = (id, text) => setData(prev => ({
    ...prev,
    memos: (prev.memos || []).map(m => m.id === id ? { ...m, text } : m),
  }));
  const updateMemoPhoto = (id, photo) => setData(prev => ({
    ...prev,
    memos: (prev.memos || []).map(m => m.id === id ? { ...m, photoUrl: photo?.url || null, photoPath: photo?.path || null } : m),
  }));
  const deleteMemo = (id) => {
    const target = (data.memos || []).find(m => m.id === id);
    if (target?.photoPath) deletePhoto(target.photoPath);
    setData(prev => ({
      ...prev,
      memos: (prev.memos || []).filter(m => m.id !== id),
    }));
  };
  const updateJournalPhoto = (photo) => setData(prev => ({
    ...prev,
    journal: { ...prev.journal, photoUrl: photo?.url || null, photoPath: photo?.path || null },
  }));

  // 일기 단일 필드
  const [bodyText, setBodyText] = useState(data.journal?.body ?? '');
  const journalSavedRef = useRef(bodyText);
  const journalSaved = bodyText === journalSavedRef.current;

  // Firebase 데이터 로드 후 동기화
  useEffect(() => {
    const b = data.journal?.body ?? '';
    if (b !== journalSavedRef.current) {
      setBodyText(b);
      journalSavedRef.current = b;
    }
  }, [data.journal?.body]); // eslint-disable-line

  // 자동 저장 debounce
  useEffect(() => {
    if (journalSaved) return;
    const timer = setTimeout(() => {
      setData(prev => ({ ...prev, journal: { ...prev.journal, body: bodyText } }));
      journalSavedRef.current = bodyText;
    }, 1500);
    return () => clearTimeout(timer);
  }, [bodyText]); // eslint-disable-line

  const isPerfect = filledCount >= 3 && doneCount === filledCount && !!bodyText.trim();

  // 기획한일 핸들러
  const addTask = () => {
    const title = taskInput.trim();
    if (!title || !onSetTodayTasks) return;
    const newTask = { id: `t_${Date.now()}`, title, done: false };
    const all = [...tasks];
    const emptyIdx = all.findIndex(t => !t.title.trim());
    if (emptyIdx >= 0) all[emptyIdx] = newTask;
    else all.push(newTask);
    onSetTodayTasks(all);
    setTaskInput('');
  };
  const toggleTask = (id) => onSetTodayTasks?.(tasks.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const deleteTask = (id) => onSetTodayTasks?.(tasks.filter(t => t.id !== id));
  const moveTaskToSomeday = (task) => {
    saveSomeday([...(someday || []), { id: `sd${Date.now()}`, title: task.title, done: false }]);
    deleteTask(task.id);
  };

  // 오늘의 할일 섹션만 다른 날짜로 미리보기/입력 (나머지 섹션은 항상 오늘 기준 유지)
  const targetDs = taskDayOffset === 0 ? dateStr : addDays(dateStr, taskDayOffset);
  const targetTasks = taskDayOffset === 0 ? tasks : (plans?.[targetDs]?.tasks || []);
  const setTargetTasks = (next) => {
    if (taskDayOffset === 0) onSetTodayTasks?.(next);
    else onUpdateDayData?.(targetDs, prev => ({ ...prev, tasks: next }));
  };
  const addTargetTask = () => {
    const title = taskInput.trim();
    if (!title) return;
    const newTask = { id: `t_${Date.now()}`, title, done: false };
    const all = [...targetTasks];
    const emptyIdx = all.findIndex(t => !t.title.trim());
    if (emptyIdx >= 0) all[emptyIdx] = newTask;
    else all.push(newTask);
    setTargetTasks(all);
    setTaskInput('');
  };
  const toggleTargetTask = (id) => setTargetTasks(targetTasks.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const deleteTargetTask = (id) => setTargetTasks(targetTasks.filter(t => t.id !== id));
  const moveTargetTaskToSomeday = (task) => {
    saveSomeday([...(someday || []), { id: `sd${Date.now()}`, title: task.title, done: false }]);
    deleteTargetTask(task.id);
  };
  const taskDayLabel = taskDayOffset === 0 ? '오늘' : taskDayOffset === 1 ? '내일' : taskDayOffset === -1 ? '어제' : formatKoreanDate(targetDs);
  const connectGcalFromTask = async () => {
    if (!onGcalConnect || gcalConnecting) return;
    setGcalConnecting(true);
    setToast('구글 로그인 중...');
    const token = await onGcalConnect();
    setGcalConnecting(false);
    setToast(token ? '캘린더 연동 완료 ✅' : '연동 실패');
  };

  // 언젠가할일 핸들러
  const saveSomeday = (list) => setSomeday?.(list);
  const addSomeday = () => {
    const title = somedayInput.trim();
    if (!title) return;
    saveSomeday([...(someday || []), { id: `sd${Date.now()}`, title, done: false }]);
    setSomedayInput('');
  };
  const toggleSomeday = (id) => saveSomeday((someday || []).map(x => x.id === id ? { ...x, done: !x.done } : x));
  const deleteSomeday = (id) => saveSomeday((someday || []).filter(x => x.id !== id));
  const moveSomedayToTask = (item) => {
    if (!onSetTodayTasks) return;
    const newTask = { id: `t_${Date.now()}`, title: item.title, done: false };
    const all = [...tasks];
    const emptyIdx = all.findIndex(t => !t.title.trim());
    if (emptyIdx >= 0) all[emptyIdx] = newTask;
    else all.push(newTask);
    onSetTodayTasks(all);
    deleteSomeday(item.id);
  };

  // 음성 녹음 (메모 전용)
  const startRecording = () => {
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
      if (text) addMemo(text.trim(), getMemoTimeStr());
    };
    r.onerror = () => setRecording(null);
    r.onend = () => setRecording(null);
    r.start();
    setRecording('memo');
  };

  if (showSearch) return <SearchViewer plans={plans} onClose={() => setShowSearch(false)} onOpenDate={onOpenDate} onUpdateDayData={onUpdateDayData} uid={uid} setToast={setToast} />;

  if (longMemo) return (
    <LongMemoEditor
      initialId={longMemo.id}
      initialText={longMemo.text}
      initialPhotoUrl={longMemo.photoUrl}
      initialPhotoPath={longMemo.photoPath}
      onCreate={(text) => addMemo(text, getMemoTimeStr())}
      onUpdate={updateMemo}
      onUpdatePhoto={updateMemoPhoto}
      onClose={() => setLongMemo(null)}
      onSearch={() => { setLongMemo(null); setShowSearch(true); }}
      onOpenKnowledge={onOpenKnowledge ? () => { setLongMemo(null); onOpenKnowledge(); } : undefined}
      uid={uid}
      pathPrefix={uid ? `users/${uid}/memos` : undefined}
      onPhotoError={setToast}
    />
  );

  const habitChecks = data.habitChecks || {};
  const visibleHabits = habits || [];
  const somedayList = someday || [];

  return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}

      <div style={S.topbar}>
        <div style={{ flex: 1 }}>
          <div style={S.title}>오늘의 페이지</div>
          <div style={S.sub}>{formatKoreanDate(dateStr)} · {clock} · {doneCount}/{filledCount || 3} 완료</div>
        </div>
        <button onClick={() => setShowSearch(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: '8px 4px', color: 'var(--dm-muted)' }}>🔍</button>
      </div>

      {/* 📅 주간 일정 */}
      <div style={{ ...S.sectionTitle, justifyContent: 'space-between', paddingRight: 16 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={S.sectionEmoji}>📅</span>주간 일정</span>
        <button onClick={() => setScheduleOpen(v => !v)} style={{ fontSize: 11, fontWeight: 700, color: 'var(--dm-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
          {scheduleOpen ? '접기 ▲' : '펼치기 ▼'}
        </button>
      </div>
      {scheduleOpen && (
        <div style={S.card}>
          <WeeklySchedule
            plans={plans}
            habits={habits || []}
            onOpenDate={onOpenDate}
            onToggleTask={onToggleTask}
            gcalEvents={gcalWeekEvents}
          />
        </div>
      )}

      {isPerfect && (
        <div style={{ ...S.card, background: "linear-gradient(135deg,rgba(74,222,128,.15),rgba(108,142,255,.10))", border: "1.5px solid rgba(74,222,128,.35)" }}>
          <div style={{ fontSize: 32, textAlign: "center", marginBottom: 8 }}>🎉</div>
          <div style={{ fontSize: 14, fontWeight: 900, textAlign: "center", color: "#4ADE80" }}>완벽한 하루!</div>
          <div style={{ fontSize: 12, textAlign: "center", color: "var(--dm-sub)", marginTop: 6 }}>3가지 완료 + 일기 작성. 연속 기록이 쌓이고 있어요 🔥</div>
        </div>
      )}

      {/* 📝 메모 */}
      <div style={{ ...S.sectionTitle, justifyContent: "space-between", paddingRight: 16 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={S.sectionEmoji}>📝</span>메모</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {recording === 'memo' && <span style={{ fontSize: 11, color: "#F87171", fontWeight: 900, animation: "pulse 1s infinite" }}>● 녹음 중</span>}
          <button onClick={() => setLongMemo({ id: null, text: '' })} style={{ fontSize: 11, color: '#4B6FFF', background: 'rgba(255,255,255,0.92)', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 900, padding: '3px 9px' }}>긴 메모</button>
          {onOpenKnowledge && <button onClick={onOpenKnowledge} style={{ fontSize: 11, color: '#6C8EFF', background: 'rgba(108,142,255,0.12)', border: '1px solid rgba(108,142,255,0.3)', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, padding: '3px 8px' }}>지식</button>}
        </div>
      </div>
      <div style={S.card}>
        <MemoTimeline
          memos={data.memos || []}
          onAdd={addMemo}
          onUpdate={updateMemo}
          onDelete={deleteMemo}
          onOpenLongEditor={(item) => setLongMemo({ id: item.id, text: item.text, photoUrl: item.photoUrl, photoPath: item.photoPath })}
          placeholder="메모 입력 후 + 버튼"
          uid={uid}
          pathPrefix={uid ? `users/${uid}/memos` : undefined}
          onUpdatePhoto={updateMemoPhoto}
          onPhotoError={setToast}
          extraAction={
            <button
              onClick={startRecording}
              style={{ width: 42, height: 42, borderRadius: 10, border: `1.5px solid ${recording === 'memo' ? '#F87171' : 'var(--dm-border)'}`, background: recording === 'memo' ? 'rgba(248,113,113,.15)' : 'var(--dm-input)', fontSize: 18, cursor: 'pointer', flexShrink: 0 }}
            >{recording === 'memo' ? '⏹' : '🎤'}</button>
          }
        />
      </div>

      {/* ✅ 오늘의 할일 (이 섹션만 날짜 이동 가능, 나머지는 항상 오늘 기준) */}
      <div style={{ ...S.sectionTitle, justifyContent: 'space-between', paddingRight: 16 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={S.sectionEmoji}>✅</span>{taskDayLabel}의 할일</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {getValidGcalToken && !getValidGcalToken() && onGcalConnect && (
            <button onClick={connectGcalFromTask} disabled={gcalConnecting} aria-label="구글 캘린더 연동" title="구글 캘린더 연동하기" style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(75,111,255,.35)', background: 'rgba(75,111,255,.12)', color: '#6C8EFF', fontSize: 16, cursor: gcalConnecting ? 'default' : 'pointer', opacity: gcalConnecting ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📅</button>
          )}
          <button onClick={() => setTaskDayOffset(o => o - 1)} aria-label="전날 할일" style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--dm-border)', background: 'var(--dm-input)', color: 'var(--dm-sub)', fontSize: 20, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          <button onClick={() => setTaskDayOffset(o => o + 1)} aria-label="다음날 할일" style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--dm-border)', background: 'var(--dm-input)', color: 'var(--dm-sub)', fontSize: 20, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
        </div>
      </div>
      <div style={S.card}>
        {taskDayOffset !== 0 && (
          <div style={{ fontSize: 11, color: '#6C8EFF', fontWeight: 700, marginBottom: 8 }}>{formatKoreanDate(targetDs)} 할일을 보고 있어요</div>
        )}
        {targetTasks.filter(t => t.title.trim()).map(task => (
          <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <button
              onClick={() => toggleTargetTask(task.id)}
              style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${task.done ? 'rgba(74,222,128,.5)' : 'var(--dm-border)'}`, background: task.done ? 'rgba(74,222,128,.15)' : 'var(--dm-input)', fontSize: 11, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4ADE80' }}
            >{task.done ? '✓' : ''}</button>
            <span style={{ flex: 1, fontSize: 14, color: task.done ? 'var(--dm-muted)' : 'var(--dm-text)', textDecoration: task.done ? 'line-through' : 'none', lineHeight: 1.4 }}>{task.title}</span>
            {!task.done && (
              <>
                {editingTimeId === task.id ? (
                  <TimeSelect
                    autoFocus
                    value={task.time}
                    onChange={v => setTargetTasks(targetTasks.map(t => t.id === task.id ? { ...t, time: v || undefined } : t))}
                    onClose={() => setEditingTimeId(null)}
                  />
                ) : (
                  <button
                    onClick={() => setEditingTimeId(task.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 3, background: task.time ? 'rgba(108,142,255,.15)' : 'var(--dm-input)', border: `1px solid ${task.time ? 'rgba(108,142,255,.4)' : 'var(--dm-border)'}`, borderRadius: 8, padding: '4px 7px', fontSize: 11, color: task.time ? '#6C8EFF' : 'var(--dm-muted)', whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}
                  >
                    <span>⏰</span>
                    {task.time && <span style={{ fontWeight: 700 }}>{task.time}</span>}
                  </button>
                )}
                {task.time && (
                  <button onClick={() => setTargetTasks(targetTasks.map(t => t.id === task.id ? { ...t, time: undefined } : t))}
                    style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', cursor: 'pointer', fontSize: 12, padding: '0', flexShrink: 0 }}>✕</button>
                )}
                <button onClick={() => moveTargetTaskToSomeday(task)} style={{ background: 'rgba(108,142,255,.1)', border: '1px solid rgba(108,142,255,.25)', borderRadius: 8, padding: '4px 8px', fontSize: 11, color: '#6C8EFF', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>언젠가</button>
              </>
            )}
            <button onClick={() => deleteTargetTask(task.id)} style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', cursor: 'pointer', fontSize: 16, padding: '0 4px', flexShrink: 0 }}>✕</button>
          </div>
        ))}
        {targetTasks.filter(t => t.title.trim()).length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--dm-muted)', textAlign: 'center', padding: '8px 0 12px' }}>{taskDayLabel} 할 일을 추가해보세요</div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ ...S.input, flex: 1, marginBottom: 0 }}
            value={taskInput}
            onChange={e => setTaskInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTargetTask()}
            placeholder="할 일 추가 후 Enter"
            maxLength={60}
          />
          <button onClick={addTargetTask} style={{ width: 42, height: 42, borderRadius: 10, border: '1.5px solid rgba(108,142,255,.35)', background: 'rgba(108,142,255,.12)', fontSize: 20, cursor: 'pointer', color: '#6C8EFF', flexShrink: 0 }}>+</button>
        </div>
      </div>

      {/* 📋 언젠가할일 */}
      <div style={S.sectionTitle}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={S.sectionEmoji}>📋</span>언젠가할일</span>
      </div>
      <div style={S.card}>
        {somedayList.map(item => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <button onClick={() => toggleSomeday(item.id)} style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${item.done ? 'rgba(74,222,128,.5)' : 'var(--dm-border)'}`, background: item.done ? 'rgba(74,222,128,.15)' : 'var(--dm-input)', fontSize: 11, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4ADE80' }}>{item.done ? '✓' : ''}</button>
            <span style={{ flex: 1, fontSize: 13, color: item.done ? 'var(--dm-muted)' : 'var(--dm-text)', textDecoration: item.done ? 'line-through' : 'none' }}>{item.title}</span>
            <button onClick={() => moveSomedayToTask(item)} style={{ background: 'rgba(108,142,255,.1)', border: '1px solid rgba(108,142,255,.25)', borderRadius: 8, padding: '4px 8px', fontSize: 11, color: '#6C8EFF', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>오늘로</button>
            <button onClick={() => deleteSomeday(item.id)} style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', cursor: 'pointer', fontSize: 16, padding: '0 4px', flexShrink: 0 }}>✕</button>
          </div>
        ))}
        {somedayList.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--dm-muted)', textAlign: 'center', padding: '8px 0 12px' }}>언젠가 하고 싶은 일을 적어두세요</div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ ...S.input, flex: 1, marginBottom: 0 }}
            value={somedayInput}
            onChange={e => setSomedayInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addSomeday()}
            placeholder="언젠가 할 일 추가 후 Enter"
            maxLength={60}
          />
          <button onClick={addSomeday} style={{ width: 42, height: 42, borderRadius: 10, border: '1.5px solid rgba(108,142,255,.35)', background: 'rgba(108,142,255,.12)', fontSize: 20, cursor: 'pointer', color: '#6C8EFF', flexShrink: 0 }}>+</button>
        </div>
      </div>

      {/* 💪 오늘습관 */}
      <div style={{ ...S.sectionTitle, justifyContent: 'space-between', paddingRight: 16 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={S.sectionEmoji}>💪</span>오늘습관</span>
        <button
          onClick={() => { setEditingHabits(v => !v); setNewHabitIcon(''); setNewHabitName(''); }}
          style={{ fontSize: 11, fontWeight: 900, color: editingHabits ? '#4ADE80' : 'var(--dm-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
        >{editingHabits ? '완료 ✓' : '수정'}</button>
      </div>
      <div style={S.card}>
        {editingHabits ? (
          <>
            {visibleHabits.map(h => (
              <div key={h.id} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input
                  value={h.icon || ''} maxLength={2} placeholder="🎯"
                  onChange={e => setHabits?.(prev => prev.map(x => x.id === h.id ? { ...x, icon: e.target.value } : x))}
                  style={{ ...S.input, width: 48, textAlign: 'center', marginBottom: 0, padding: '8px 4px' }}
                />
                <input
                  value={h.name || ''} maxLength={20} placeholder="습관 이름"
                  onChange={e => setHabits?.(prev => prev.map(x => x.id === h.id ? { ...x, name: e.target.value } : x))}
                  style={{ ...S.input, flex: 1, marginBottom: 0 }}
                />
                <button onClick={() => setHabits?.(prev => prev.filter(x => x.id !== h.id))}
                  style={{ background: 'none', border: 'none', color: '#F87171', cursor: 'pointer', fontSize: 20, flexShrink: 0 }}>✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: visibleHabits.length > 0 ? 4 : 0, alignItems: 'center' }}>
              <input value={newHabitIcon} maxLength={2} placeholder="🎯"
                onChange={e => setNewHabitIcon(e.target.value)}
                style={{ ...S.input, width: 48, textAlign: 'center', marginBottom: 0, padding: '8px 4px' }} />
              <input value={newHabitName} maxLength={20} placeholder="새 습관 이름"
                onChange={e => setNewHabitName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newHabitName.trim()) {
                    setHabits?.(prev => [...prev, { id: `h_${Date.now()}`, icon: newHabitIcon || '🎯', name: newHabitName.trim() }]);
                    setNewHabitIcon(''); setNewHabitName('');
                  }
                }}
                style={{ ...S.input, flex: 1, marginBottom: 0 }} />
              <button
                onClick={() => {
                  if (!newHabitName.trim()) return;
                  setHabits?.(prev => [...prev, { id: `h_${Date.now()}`, icon: newHabitIcon || '🎯', name: newHabitName.trim() }]);
                  setNewHabitIcon(''); setNewHabitName('');
                }}
                style={{ width: 42, height: 42, borderRadius: 10, border: '1.5px solid rgba(108,142,255,.35)', background: 'rgba(108,142,255,.12)', fontSize: 20, cursor: 'pointer', color: '#6C8EFF', flexShrink: 0 }}>+</button>
            </div>
            {visibleHabits.length === 0 && !newHabitName && (
              <div style={{ fontSize: 12, color: 'var(--dm-muted)', textAlign: 'center', padding: '8px 0' }}>아이콘과 이름을 입력 후 + 버튼</div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibleHabits.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--dm-muted)', textAlign: 'center', padding: '8px 0' }}>습관을 추가하려면 수정을 눌러보세요</div>
            )}
            {visibleHabits.map(h => {
              const checked = !!habitChecks[h.id];
              return (
                <button key={h.id} onClick={() => onToggleHabit?.(h.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, border: `1.5px solid ${checked ? 'rgba(74,222,128,.4)' : 'var(--dm-border)'}`, background: checked ? 'rgba(74,222,128,.1)' : 'var(--dm-input)', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                  <span style={{ fontSize: 20, minWidth: 24, textAlign: 'center' }}>{h.icon || '🎯'}</span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: checked ? '#4ADE80' : 'var(--dm-text)', fontFamily: 'inherit' }}>{h.name || '이름 없는 습관'}</span>
                  {checked && <span style={{ fontSize: 16, color: '#4ADE80' }}>✓</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 📖 일기 */}
      <div style={S.sectionTitle}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={S.sectionEmoji}>📖</span>일기
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--dm-muted)' }}>(22:00 이후 추천)</span>
        </span>
      </div>
      <div style={S.card}>
        {/* 오늘 한 일 — done tasks 자동 표시 */}
        {doneTasks.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: 'var(--dm-muted)', fontWeight: 700, marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>오늘 한 일</div>
            {doneTasks.map(t => (
              <div key={t.id} style={{ fontSize: 13, color: 'var(--dm-sub)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#4ADE80', fontWeight: 700 }}>✓</span>{t.title}
              </div>
            ))}
          </div>
        )}

        {onOpenVoiceDiary && (
          <button
            onClick={onOpenVoiceDiary}
            style={{
              width: '100%', marginBottom: 12, padding: '10px 14px', borderRadius: 12,
              border: '1.5px solid rgba(108,142,255,.3)', background: 'rgba(108,142,255,.1)',
              color: '#818cf8', fontSize: 13, fontWeight: 800, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >🎙️ 음성으로 일기 쓰기</button>
        )}

        <textarea
          rows={5}
          style={{ ...S.input, resize: 'none', lineHeight: 1.8 }}
          value={bodyText}
          onChange={e => setBodyText(e.target.value)}
          placeholder="오늘 하루를 자유롭게 기록해보세요"
          maxLength={2000}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <div style={{ fontSize: 11, color: journalSaved ? 'var(--dm-muted)' : '#A78BFA', fontWeight: journalSaved ? 400 : 700, transition: 'color 0.3s' }}>
            {journalSaved ? '✓ 자동저장' : '저장 중...'}
          </div>
          {uid && (
            <PhotoAttach
              uid={uid}
              pathPrefix={`users/${uid}/journal`}
              photoUrl={data.journal?.photoUrl}
              photoPath={data.journal?.photoPath}
              onChange={updateJournalPhoto}
              onError={setToast}
              size={34}
            />
          )}
        </div>
      </div>

      <div style={{ height: 12 }} />
    </div>
  );
}

