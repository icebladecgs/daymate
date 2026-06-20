import { useEffect, useRef, useState, useMemo } from "react";
import { formatKoreanDate, getWeekDates } from "../utils/date.js";
import S from "../styles.js";
import Toast from "../components/Toast.jsx";
import SearchViewer from "./SearchViewer.jsx";
import { parseWikiLinks, extractKeywords } from "../utils/knowledge.js";
import MemoTimeline, { genMemoId, getMemoTimeStr } from "../components/MemoTimeline.jsx";
import WeeklySchedule from "../components/WeeklySchedule.jsx";
import { gcalFetchWeekEvents } from "../api/gcal.js";

export default function Today({
  dateStr, data, setData, toast, setToast, plans, onOpenDate, onUpdateDayData,
  onOpenInvest, onOpenKnowledge,
  habits, onToggleHabit, setHabits,
  someday, setSomeday,
  onSetTodayTasks,
  getValidGcalToken,
  onToggleTask,
}) {
  const tasks = data.tasks || [];
  const doneCount = tasks.filter((t) => t.done && t.title.trim()).length;
  const filledCount = tasks.filter((t) => t.title.trim()).length;
  const doneTasks = tasks.filter((t) => t.done && t.title.trim());
  const [showSearch, setShowSearch] = useState(false);
  const [recording, setRecording] = useState(null);
  const recognitionRef = useRef(null);
  const [tagInput, setTagInput] = useState('');
  const tagInputRef = useRef(null);
  const [taskInput, setTaskInput] = useState('');
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

  const addMemo = (text, time) => setData(prev => ({
    ...prev,
    memos: [...(prev.memos || []), { id: genMemoId(), text, createdAt: time }],
  }));
  const updateMemo = (id, text) => setData(prev => ({
    ...prev,
    memos: (prev.memos || []).map(m => m.id === id ? { ...m, text } : m),
  }));
  const deleteMemo = (id) => setData(prev => ({
    ...prev,
    memos: (prev.memos || []).filter(m => m.id !== id),
  }));

  const memoText = (data.memos || []).map(m => m.text).join(' ');

  // 일기 3개 필드 상태
  const [goodText, setGoodText] = useState(data.journal?.good ?? '');
  const [regretText, setRegretText] = useState(data.journal?.regret ?? '');
  const [tomorrowText, setTomorrowText] = useState(data.journal?.tomorrow ?? '');
  const journalSavedRef = useRef({ good: goodText, regret: regretText, tomorrow: tomorrowText });
  const journalSaved = goodText === journalSavedRef.current.good
    && regretText === journalSavedRef.current.regret
    && tomorrowText === journalSavedRef.current.tomorrow;

  // Firebase 데이터 로드 후 동기화
  useEffect(() => {
    const g = data.journal?.good ?? '';
    const r = data.journal?.regret ?? '';
    const t = data.journal?.tomorrow ?? '';
    const ref = journalSavedRef.current;
    if (g !== ref.good || r !== ref.regret || t !== ref.tomorrow) {
      setGoodText(g); setRegretText(r); setTomorrowText(t);
      journalSavedRef.current = { good: g, regret: r, tomorrow: t };
    }
  }, [data.journal?.good, data.journal?.regret, data.journal?.tomorrow]); // eslint-disable-line

  // 자동 저장 debounce
  useEffect(() => {
    if (journalSaved) return;
    const timer = setTimeout(() => {
      setData(prev => ({ ...prev, journal: { ...prev.journal, good: goodText, regret: regretText, tomorrow: tomorrowText } }));
      journalSavedRef.current = { good: goodText, regret: regretText, tomorrow: tomorrowText };
    }, 1500);
    return () => clearTimeout(timer);
  }, [goodText, regretText, tomorrowText]); // eslint-disable-line

  const isPerfect = filledCount >= 3 && doneCount === filledCount
    && !!(goodText.trim() || regretText.trim() || tomorrowText.trim());

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

  if (showSearch) return <SearchViewer plans={plans} onClose={() => setShowSearch(false)} onOpenDate={onOpenDate} onUpdateDayData={onUpdateDayData} />;

  const habitChecks = data.habitChecks || {};
  const visibleHabits = habits || [];
  const somedayList = someday || [];

  return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}

      <div style={S.topbar}>
        <div>
          <div style={S.title}>오늘의 페이지</div>
          <div style={S.sub}>{formatKoreanDate(dateStr)} · {clock} · {doneCount}/{filledCount || 3} 완료</div>
        </div>
        <button onClick={() => setShowSearch(true)} style={{ ...S.btnGhost, marginTop: 0, padding: '6px 12px', fontSize: 11, width: 'auto' }}>🔍 검색</button>
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
              onClick={startRecording}
              style={{ width: 42, height: 42, borderRadius: 10, border: `1.5px solid ${recording === 'memo' ? '#F87171' : 'var(--dm-border)'}`, background: recording === 'memo' ? 'rgba(248,113,113,.15)' : 'var(--dm-input)', fontSize: 18, cursor: 'pointer', flexShrink: 0 }}
            >{recording === 'memo' ? '⏹' : '🎤'}</button>
          }
        />
      </div>

      {/* ✅ 기획한일 */}
      <div style={S.sectionTitle}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={S.sectionEmoji}>✅</span>기획한일</span>
      </div>
      <div style={S.card}>
        {tasks.filter(t => t.title.trim()).map(task => (
          <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <button
              onClick={() => toggleTask(task.id)}
              style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${task.done ? 'rgba(74,222,128,.5)' : 'var(--dm-border)'}`, background: task.done ? 'rgba(74,222,128,.15)' : 'var(--dm-input)', fontSize: 14, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4ADE80' }}
            >{task.done ? '✓' : ''}</button>
            <span style={{ flex: 1, fontSize: 14, color: task.done ? 'var(--dm-muted)' : 'var(--dm-text)', textDecoration: task.done ? 'line-through' : 'none', lineHeight: 1.4 }}>{task.title}</span>
            <button onClick={() => deleteTask(task.id)} style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', cursor: 'pointer', fontSize: 16, padding: '0 4px', flexShrink: 0 }}>✕</button>
          </div>
        ))}
        {tasks.filter(t => t.title.trim()).length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--dm-muted)', textAlign: 'center', padding: '8px 0 12px' }}>오늘 할 일을 추가해보세요</div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ ...S.input, flex: 1, marginBottom: 0 }}
            value={taskInput}
            onChange={e => setTaskInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()}
            placeholder="할 일 추가 후 Enter"
            maxLength={60}
          />
          <button onClick={addTask} style={{ width: 42, height: 42, borderRadius: 10, border: '1.5px solid rgba(108,142,255,.35)', background: 'rgba(108,142,255,.12)', fontSize: 20, cursor: 'pointer', color: '#6C8EFF', flexShrink: 0 }}>+</button>
        </div>
      </div>

      {/* 📋 언젠가할일 */}
      <div style={S.sectionTitle}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={S.sectionEmoji}>📋</span>언젠가할일</span>
      </div>
      <div style={S.card}>
        {somedayList.map(item => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <button onClick={() => toggleSomeday(item.id)} style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${item.done ? 'rgba(74,222,128,.5)' : 'var(--dm-border)'}`, background: item.done ? 'rgba(74,222,128,.15)' : 'var(--dm-input)', fontSize: 14, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4ADE80' }}>{item.done ? '✓' : ''}</button>
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

        {/* 잘한 일 */}
        <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 6 }}>잘한 일</div>
        <textarea
          rows={3}
          style={{ ...S.input, resize: 'none', lineHeight: 1.6 }}
          value={goodText}
          onChange={e => setGoodText(e.target.value)}
          placeholder="오늘 잘한 일을 써봐요"
          maxLength={400}
        />

        {/* 아쉬운 점 */}
        <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 6, marginTop: 14 }}>아쉬운 점</div>
        <textarea
          rows={3}
          style={{ ...S.input, resize: 'none', lineHeight: 1.6 }}
          value={regretText}
          onChange={e => setRegretText(e.target.value)}
          placeholder="아쉬웠던 점을 써봐요"
          maxLength={400}
        />

        {/* 내일 다짐 */}
        <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 6, marginTop: 14 }}>내일 다짐</div>
        <textarea
          rows={3}
          style={{ ...S.input, resize: 'none', lineHeight: 1.6 }}
          value={tomorrowText}
          onChange={e => setTomorrowText(e.target.value)}
          placeholder="내일을 위한 다짐을 적어봐요"
          maxLength={400}
        />

        <div style={{ fontSize: 11, color: journalSaved ? 'var(--dm-muted)' : '#A78BFA', fontWeight: journalSaved ? 400 : 700, marginTop: 8, transition: 'color 0.3s' }}>
          {journalSaved ? '✓ 자동저장' : '저장 중...'}
        </div>

        {/* 기분 선택 */}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--dm-border)' }}>
          <div style={{ fontSize: 11, color: 'var(--dm-muted)', fontWeight: 700, marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>오늘 기분은?</div>
          <div style={{ display: 'flex', justifyContent: 'space-around' }}>
            {[['😊','행복'],['😌','평온'],['🤔','보통'],['😴','피곤'],['😔','우울']].map(([emoji, label]) => {
              const selected = data.journal?.mood === label;
              return (
                <button key={label}
                  onClick={() => setData(prev => ({ ...prev, journal: { ...prev.journal, mood: selected ? null : label } }))}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: selected ? 'rgba(184,195,255,0.12)' : 'transparent', border: 'none', cursor: 'pointer', padding: '6px 10px', borderRadius: 12, transition: 'all 0.2s', boxShadow: selected ? 'inset 0 0 0 1px rgba(184,195,255,0.25)' : 'none' }}>
                  <span style={{ fontSize: 24, display: 'inline-block', filter: selected ? 'none' : 'grayscale(0.6)', transform: selected ? 'scale(1.15)' : 'scale(1)', transition: 'all 0.2s' }}>{emoji}</span>
                  <span style={{ fontSize: 10, color: selected ? '#b8c3ff' : 'var(--dm-muted)', fontWeight: selected ? 700 : 400, transition: 'color 0.2s' }}>{label}</span>
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
        journalText={goodText + ' ' + regretText + ' ' + tomorrowText}
        tagInput={tagInput}
        setTagInput={setTagInput}
        tagInputRef={tagInputRef}
        onOpenKnowledge={onOpenKnowledge}
      />

      {/* 투자 허브 바로가기 */}
      {onOpenInvest && (
        <div onClick={onOpenInvest} style={{ ...S.card, marginTop: 4, cursor: 'pointer', background: 'linear-gradient(135deg,rgba(167,139,250,0.12),rgba(108,142,255,0.08))', border: '1.5px solid rgba(167,139,250,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>💹</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--dm-text)' }}>투자 허브</div>
              <div style={{ fontSize: 11, color: 'var(--dm-muted)' }}>브리핑 확인 후 판단을 기록하세요</div>
            </div>
          </div>
          <span style={{ fontSize: 18, color: 'var(--dm-muted)' }}>›</span>
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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: hasContent ? 10 : 0 }}>
        {existingTags.map(tag => (
          <span
            key={tag}
            style={{ background: 'rgba(108,142,255,0.18)', border: '1px solid rgba(108,142,255,0.35)', borderRadius: 999, padding: '5px 10px 5px 12px', fontSize: 12, color: '#b8c3ff', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              style={{ background: 'none', border: 'none', color: 'rgba(184,195,255,0.5)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0, fontFamily: 'inherit' }}
            >×</button>
          </span>
        ))}

        <input
          ref={tagInputRef}
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={existingTags.length === 0 ? '태그 추가...' : '+'}
          style={{ background: 'none', border: 'none', outline: 'none', fontSize: 12, color: 'var(--dm-text)', fontFamily: 'inherit', minWidth: 80, flex: 1, padding: '5px 4px' }}
        />
        {tagInput.trim() && (
          <button
            onClick={() => addTag(tagInput)}
            style={{ background: 'rgba(108,142,255,0.2)', border: '1px solid rgba(108,142,255,0.3)', borderRadius: 999, padding: '4px 10px', fontSize: 11, color: '#6C8EFF', cursor: 'pointer', fontWeight: 900, fontFamily: 'inherit' }}
          >추가</button>
        )}
      </div>

      {suggested.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--dm-muted)', fontWeight: 700, marginBottom: 6 }}>추천 키워드 (탭하여 추가)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {suggested.map(kw => (
              <button
                key={kw}
                onClick={() => addTag(kw)}
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px dashed var(--dm-border)', borderRadius: 999, padding: '4px 11px', fontSize: 11, color: 'var(--dm-muted)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
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
