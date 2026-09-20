import { useEffect, useMemo, useRef, useState } from "react";
import { formatKoreanDate, getWeekDates, addDays } from "../utils/date.js";
import S from "../styles.js";
import Toast from "../components/Toast.jsx";
import SearchViewer from "./SearchViewer.jsx";
import { genMemoId, getMemoTimeStr } from "../components/MemoTimeline.jsx";
import WeeklySchedule from "../components/WeeklySchedule.jsx";
import LongMemoEditor from "../components/LongMemoEditor.jsx";
import { gcalFetchWeekEvents } from "../api/gcal.js";
import PhotoAttach from "../components/PhotoAttach.jsx";
import TimeSelect from "../components/TimeSelect.jsx";
import { GROWTH_STATS, GROWTH_STAT_MAP, calcStatScore, classifyTodoStat } from "../data/growthStats.js";
import { calcDayScore, calcLevel, calcStreak } from "../data/stats.js";

export default function Today({
  dateStr, data, setData, toast, setToast, plans, onOpenDate, onUpdateDayData,
  onOpenInvest, onOpenKnowledge, onOpenVoiceDiary,
  habits, onToggleHabit, setHabits,
  someday, setSomeday,
  onSetTodayTasks,
  getValidGcalToken, onGcalConnect,
  autoOpenLongMemo,
  uid,
  onRequireLogin,
  frequentTags,
  myTags,
  hiddenTags,
  onHideTag,
  statXp,
  statFeedback,
  onClearStatFeedback,
  scores,
  inviteBonus,
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
  const [taskInput, setTaskInput] = useState('');
  const [taskDayOffset, setTaskDayOffset] = useState(0); // 오늘의 할일 섹션만 다른 날짜로 미리보기
  const [gcalConnecting, setGcalConnecting] = useState(false);
  const [editingTimeId, setEditingTimeId] = useState(null);
  const [editingStatTaskId, setEditingStatTaskId] = useState(null);
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

  const addMemo = (text, time, id = genMemoId()) => {
    setData(prev => ({
      ...prev,
      memos: [...(prev.memos || []), { id, text, createdAt: time }],
    }));
    return id;
  };
  const updateMemo = (id, text) => setData(prev => ({
    ...prev,
    memos: (prev.memos || []).map(m => m.id === id ? { ...m, text } : m),
  }));
  const updateMemoPhotos = (id, photos) => setData(prev => ({
    ...prev,
    memos: (prev.memos || []).map(m => m.id === id ? { ...m, photos } : m),
  }));
  const updateMemoStarred = (id, starred) => setData(prev => ({
    ...prev,
    memos: (prev.memos || []).map(m => m.id === id ? { ...m, starred } : m),
  }));
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

  // My탭과 동일한 계산(기존 XP/레벨/티어) — 오늘 화면에서도 함께 보여주기 위함, 기존 로직/저장방식은 그대로
  const todayScore = useMemo(() => calcDayScore(data, habits), [data, habits]);
  const totalScore = useMemo(() => Object.values(scores || {}).reduce((a, b) => a + b, 0) + todayScore + (inviteBonus || 0), [scores, todayScore, inviteBonus]);
  const levelInfo = useMemo(() => calcLevel(totalScore), [totalScore]);
  const streak = useMemo(() => calcStreak(plans), [plans]);

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

  if (showSearch) return <SearchViewer plans={plans} onClose={() => setShowSearch(false)} onOpenDate={onOpenDate} onUpdateDayData={onUpdateDayData} uid={uid} setToast={setToast} hiddenTags={hiddenTags} onHideTag={onHideTag} />;

  if (longMemo) return (
    <LongMemoEditor
      initialId={longMemo.id}
      initialText={longMemo.text}
      initialPhotos={longMemo.photos || []}
      initialStarred={longMemo.starred || false}
      onCreate={(text) => addMemo(text, getMemoTimeStr())}
      onUpdate={updateMemo}
      onUpdatePhotos={updateMemoPhotos}
      onUpdateStarred={updateMemoStarred}
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

  const habitChecks = data.habitChecks || {};
  const visibleHabits = habits || [];
  const somedayList = someday || [];

  return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
      {statFeedback && (() => {
        const stat = GROWTH_STATS.find(s => s.id === statFeedback.statId);
        if (!stat) return null;
        return (
          <div key={statFeedback.key} className="xp-float" style={{ top: '18%', left: '50%' }}
            onAnimationEnd={onClearStatFeedback}>
            +{statFeedback.xp} {stat.icon} {stat.name}
          </div>
        );
      })()}

      <div style={S.topbar}>
        <div style={{ flex: 1 }}>
          <div style={S.title}>오늘의 페이지</div>
          <div style={S.sub}>{formatKoreanDate(dateStr)} · {clock} · {doneCount}/{filledCount || 3} 완료</div>
        </div>
        <button onClick={() => setShowSearch(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: '8px 4px', color: 'var(--dm-muted)' }}>🔍</button>
      </div>

      {/* 🌱 나의 성장 능력치 (+ My탭과 동일한 레벨/XP 요약) */}
      {statXp && (
        <div style={{ ...S.card, background: "linear-gradient(135deg,rgba(75,111,255,.12),rgba(108,142,255,.05))", border: "1.5px solid rgba(108,142,255,.3)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 20 }}>{levelInfo.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)" }}>{levelInfo.title}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#6C8EFF" }}>Lv.{levelInfo.level}</span>
            <span style={{ fontSize: 11, color: "var(--dm-muted)" }}>· {totalScore.toLocaleString()} XP</span>
            {streak > 0 && <span style={{ fontSize: 11, color: "#F97316", fontWeight: 900, marginLeft: "auto" }}>🔥{streak}</span>}
          </div>
          <div style={{ height: 4, background: "var(--dm-row)", borderRadius: 4, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#4B6FFF,#6C8EFF)", width: `${levelInfo.progress}%`, transition: "width 0.4s" }} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 900, color: "var(--dm-muted)", letterSpacing: "0.06em", marginBottom: 10 }}>🌱 나의 성장 능력치</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {GROWTH_STATS.map(stat => {
              const score = calcStatScore(statXp[stat.id] || 0);
              return (
                <div key={stat.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, width: 22, textAlign: "center" }}>{stat.icon}</span>
                  <span style={{ fontSize: 12, color: "var(--dm-sub)", width: 46, flexShrink: 0 }}>{stat.name}</span>
                  <div style={{ flex: 1, height: 6, background: "var(--dm-row)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#4B6FFF,#6C8EFF)", width: `${score}%`, transition: "width 0.4s" }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 900, color: "var(--dm-text)", width: 28, textAlign: "right" }}>{score}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
        {targetTasks.filter(t => t.title.trim()).map(task => {
          const resolvedStatId = task.statTag || classifyTodoStat(task.title);
          const statInfo = GROWTH_STAT_MAP[resolvedStatId];
          return (
          <div key={task.id} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => toggleTargetTask(task.id)}
              style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${task.done ? 'rgba(74,222,128,.5)' : 'var(--dm-border)'}`, background: task.done ? 'rgba(74,222,128,.15)' : 'var(--dm-input)', fontSize: 11, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4ADE80' }}
            >{task.done ? '✓' : ''}</button>
            <button
              onClick={() => setEditingStatTaskId(id => id === task.id ? null : task.id)}
              title="성장 스탯 변경"
              style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid var(--dm-border)', background: 'var(--dm-input)', fontSize: 12, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
            >{statInfo ? statInfo.icon : '❔'}</button>
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
          {editingStatTaskId === task.id && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, marginLeft: 30 }}>
              <button
                onClick={() => { setTargetTasks(targetTasks.map(t => t.id === task.id ? { ...t, statTag: undefined } : t)); setEditingStatTaskId(null); }}
                style={{ fontSize: 11, padding: '4px 8px', borderRadius: 8, border: !task.statTag ? '1.5px solid #6C8EFF' : '1px solid var(--dm-border)', background: !task.statTag ? 'rgba(108,142,255,.15)' : 'var(--dm-input)', color: 'var(--dm-sub)', cursor: 'pointer', fontFamily: 'inherit' }}
              >자동</button>
              {GROWTH_STATS.map(s => (
                <button
                  key={s.id}
                  onClick={() => { setTargetTasks(targetTasks.map(t => t.id === task.id ? { ...t, statTag: s.id } : t)); setEditingStatTaskId(null); }}
                  style={{ fontSize: 11, padding: '4px 8px', borderRadius: 8, border: task.statTag === s.id ? '1.5px solid #6C8EFF' : '1px solid var(--dm-border)', background: task.statTag === s.id ? 'rgba(108,142,255,.15)' : 'var(--dm-input)', color: 'var(--dm-sub)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                >{s.icon} {s.name}</button>
              ))}
            </div>
          )}
          </div>
        );})}
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

