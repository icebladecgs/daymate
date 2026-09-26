import { useEffect, useMemo, useRef, useState } from "react";
import { formatKoreanDate, formatShortKoreanDate, getWeekDates, addDays, toDateStr } from "../utils/date.js";
import S from "../styles.js";
import Toast from "../components/Toast.jsx";
import SearchViewer from "./SearchViewer.jsx";
import { genMemoId, getMemoTimeStr } from "../components/MemoTimeline.jsx";
import WeeklySchedule from "../components/WeeklySchedule.jsx";
import LongMemoEditor from "../components/LongMemoEditor.jsx";
import { gcalFetchWeekEvents } from "../api/gcal.js";
import PhotoAttach from "../components/PhotoAttach.jsx";
import TaskDetailSheet, { TaskDetailBadge, TaskStatIcon } from "../components/TaskDetailSheet.jsx";
import { pickTaskDetail } from "../utils/taskDetail.js";
import { deletePhoto } from "../firebase.js";
import { GROWTH_STATS, calcStatScore } from "../data/growthStats.js";
import { calcDayScore, calcLevel, calcStreak, LEVEL_ICONS, LEVEL_TITLES } from "../data/stats.js";
import { store } from "../utils/storage.js";
import { getContactReminders } from "../data/contacts.js";
import { chatFetch } from "../api/chatFetch.js";
import { parseSchedule, describeSchedule } from "../utils/nlSchedule.js";
import { recurringLabel } from "../utils/recurring.js";

import StatSelect, { withStatTag } from "../components/StatSelect.jsx";
export default function Today({
  dateStr, data, setData, toast, setToast, plans, onOpenDate, onUpdateDayData, setRecurringTasks, onMoveTaskDate,
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
  myRank,
  onOpenStats,
  onOpenBattle,
  user,
  onOpenSettings,
  battleNickname,
  onSetBattleNickname,
  contacts,
  birthDate: birthDateProp,
  birthTime: birthTimeProp,
}) {
  const tasks = data.tasks || [];
  const contactReminders = useMemo(() => getContactReminders(contacts, plans, 7, dateStr), [contacts, plans, dateStr]);
  const doneCount = tasks.filter((t) => t.done && t.title.trim()).length;
  const filledCount = tasks.filter((t) => t.title.trim()).length;
  const doneTasks = tasks.filter((t) => t.done && t.title.trim());
  const [showSearch, setShowSearch] = useState(false);
  const [carryDismissed, setCarryDismissed] = useState(() => store.get('dm_carry_dismissed', '') === dateStr); // "어제 못 한 할일" 카드를 오늘 닫았는지
  const [longMemo, setLongMemo] = useState(null); // null | { id: string|null, text: string }

  useEffect(() => {
    if (autoOpenLongMemo) setLongMemo({ id: null, text: '' });
  }, [autoOpenLongMemo]);
  const [taskInput, setTaskInput] = useState('');
  const [nlOff, setNlOff] = useState(false); // 문장 해석 끄기 ("그냥 글자로") — 입력이 바뀌면 다시 켬
  const [taskDayOffset, setTaskDayOffset] = useState(0); // 오늘의 할일 섹션만 다른 날짜로 미리보기
  const [journalDayOffset, setJournalDayOffset] = useState(0); // 일기 섹션만 다른 날짜로 미리보기
  const [gcalConnecting, setGcalConnecting] = useState(false);
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
  // 섹션 펼침 상태 — 마지막으로 둔 상태를 기억 (기본값: 펼쳐짐)
  const [scheduleOpen, setScheduleOpen] = useState(() => store.get('dm_section_open_schedule', false));
  const [tasksOpen, setTasksOpen] = useState(() => store.get('dm_section_open_tasks', true));
  const [somedayOpen, setSomedayOpen] = useState(() => store.get('dm_section_open_someday', true));
  const [habitsSectionOpen, setHabitsSectionOpen] = useState(() => store.get('dm_section_open_habits', true));
  useEffect(() => { store.set('dm_section_open_schedule', scheduleOpen); }, [scheduleOpen]);
  useEffect(() => { store.set('dm_section_open_tasks', tasksOpen); }, [tasksOpen]);
  useEffect(() => { store.set('dm_section_open_someday', somedayOpen); }, [somedayOpen]);
  useEffect(() => { store.set('dm_section_open_habits', habitsSectionOpen); }, [habitsSectionOpen]);
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
  const updateMemoFiles = (id, files) => setData(prev => ({
    ...prev,
    memos: (prev.memos || []).map(m => m.id === id ? { ...m, files } : m),
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

  // 일기 섹션 날짜 이동 — 오늘(offset 0)은 위 bodyText 로직 그대로 쓰고, 다른 날짜만 별도 상태로 처리
  const journalTargetDs = journalDayOffset === 0 ? dateStr : addDays(dateStr, journalDayOffset);
  const journalTargetDay = journalDayOffset === 0 ? data : (plans?.[journalTargetDs] || {});
  const journalDayDateLabel = formatShortKoreanDate(journalTargetDs);
  const journalDayLabel = journalDayOffset === 0 ? '오늘' : journalDayOffset === 1 ? '내일' : journalDayOffset === -1 ? '어제' : journalDayDateLabel;
  // 헤더 제목: "오늘의 일기" / 그 외 날짜는 "9월 26일 (토) 일기"
  const journalDayTitle = [0, 1, -1].includes(journalDayOffset) ? `${journalDayLabel}의 일기` : `${journalDayDateLabel} 일기`;
  const journalDoneTasks = journalDayOffset === 0 ? doneTasks : (journalTargetDay.tasks || []).filter(t => t.done && t.title.trim());

  const [otherJournalBody, setOtherJournalBody] = useState('');
  const otherJournalSavedRef = useRef('');
  useEffect(() => {
    if (journalDayOffset === 0) return;
    const b = journalTargetDay.journal?.body ?? '';
    setOtherJournalBody(b);
    otherJournalSavedRef.current = b;
  }, [journalDayOffset, journalTargetDs]); // eslint-disable-line
  useEffect(() => {
    if (journalDayOffset === 0 || otherJournalBody === otherJournalSavedRef.current) return;
    const timer = setTimeout(() => {
      onUpdateDayData?.(journalTargetDs, prev => ({ ...prev, journal: { ...prev.journal, body: otherJournalBody } }));
      otherJournalSavedRef.current = otherJournalBody;
    }, 1500);
    return () => clearTimeout(timer);
  }, [otherJournalBody]); // eslint-disable-line

  const displayedJournalBody = journalDayOffset === 0 ? bodyText : otherJournalBody;
  const setDisplayedJournalBody = journalDayOffset === 0 ? setBodyText : setOtherJournalBody;
  const displayedJournalSaved = journalDayOffset === 0 ? journalSaved : otherJournalBody === otherJournalSavedRef.current;
  // 날짜 이동 시 디바운스 타이머가 취소되기 전에 대기 중인 변경을 먼저 저장
  const flushJournalSave = () => {
    if (journalDayOffset === 0 || otherJournalBody === otherJournalSavedRef.current) return;
    onUpdateDayData?.(journalTargetDs, prev => ({ ...prev, journal: { ...prev.journal, body: otherJournalBody } }));
    otherJournalSavedRef.current = otherJournalBody;
  };
  const updateJournalPhotoForTarget = (photo) => {
    if (journalDayOffset === 0) { updateJournalPhoto(photo); return; }
    onUpdateDayData?.(journalTargetDs, prev => ({ ...prev, journal: { ...prev.journal, photoUrl: photo?.url || null, photoPath: photo?.path || null } }));
  };
  // 자동저장 debounce(1.5초)를 기다리지 않고 즉시 저장하는 버튼용 핸들러
  const handleManualJournalSave = () => {
    if (journalDayOffset === 0) {
      if (!journalSaved) {
        setData(prev => ({ ...prev, journal: { ...prev.journal, body: bodyText } }));
        journalSavedRef.current = bodyText;
      }
    } else {
      flushJournalSave();
    }
    setToast?.('저장됨 ✅');
  };

  // My탭과 동일한 계산(기존 XP/레벨/티어) — 오늘 화면에서도 함께 보여주기 위함, 기존 로직/저장방식은 그대로
  const todayScore = useMemo(() => calcDayScore(data, habits), [data, habits]);
  const totalScore = useMemo(() => Object.values(scores || {}).reduce((a, b) => a + b, 0) + todayScore + (inviteBonus || 0), [scores, todayScore, inviteBonus]);
  const levelInfo = useMemo(() => calcLevel(totalScore), [totalScore]);
  const streak = useMemo(() => calcStreak(plans), [plans]);
  const monthScore = useMemo(() => {
    const prefix = dateStr.slice(0, 7);
    return Object.entries(scores || {}).filter(([ds]) => ds.startsWith(prefix)).reduce((a, [, v]) => a + v, 0) + todayScore;
  }, [scores, todayScore, dateStr]);
  const [xpHelpOpen, setXpHelpOpen] = useState(false);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');

  // ── 운세 · 로또 (마이탭에서 이동) ────────────────────────────
  const [fortuneModalOpen, setFortuneModalOpen] = useState(false);
  const [fortuneTab, setFortuneTab] = useState('daily'); // daily | saju | tojeong
  const [fortuneData, setFortuneData] = useState(null);
  const [fortuneLoading, setFortuneLoading] = useState(false);
  const [fortuneError, setFortuneError] = useState(false);
  const [sajuData, setSajuData] = useState(() => store.get('dm_saju_result', null));
  const [tojeongData, setTojeongData] = useState(() => store.get('dm_tojeong_result', null));
  const lottoKey = `dm_lotto_${dateStr}`;
  const [lottoNums, setLottoNums] = useState(() => store.get(lottoKey, null));
  const [lottoAnim, setLottoAnim] = useState(false);
  const drawLotto = () => {
    if (lottoNums) return;
    setLottoAnim(true);
    setTimeout(() => {
      const pool = Array.from({ length: 45 }, (_, i) => i + 1);
      const picked = [];
      while (picked.length < 6) {
        const idx = Math.floor(Math.random() * pool.length);
        picked.push(pool.splice(idx, 1)[0]);
      }
      picked.sort((a, b) => a - b);
      store.set(lottoKey, picked);
      setLottoNums(picked);
      setLottoAnim(false);
    }, 900);
  };
  const birthDate = birthDateProp || '';
  const birthTime = birthTimeProp || '';
  const fortuneCacheKey = `dm_fortune_${dateStr}`;
  const fortuneXpKey = `dm_fortune_xp_${dateStr}`;
  const avgFortuneScore = (fd) => {
    if (!fd?.overall) return null;
    const { overall, money, health, relation } = fd;
    return (overall + (money ?? overall) + (health ?? overall) + (relation ?? overall)) / 4;
  };
  const todayFortuneScore = (() => {
    try { return avgFortuneScore(store.get(fortuneCacheKey, null)); } catch { return null; }
  })();
  const loadFortune = async () => {
    if (!birthDate) return;
    const cached = store.get(fortuneCacheKey, null);
    if (cached) { setFortuneData(cached); return; }
    setFortuneLoading(true);
    setFortuneError(false);
    try {
      const res = await chatFetch('/api/chat?action=fortune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birthDate, birthTime, userName: user?.name || '사용자', today: dateStr }),
      });
      if (!res.ok) throw new Error(`fortune ${res.status}`);
      const fd = await res.json();
      store.set(fortuneCacheKey, fd);
      setFortuneData(fd);
    } catch {
      setFortuneError(true);
    }
    setFortuneLoading(false);
  };
  useEffect(() => {
    if (fortuneData?.overall && !store.get(fortuneXpKey, null)) {
      const xp = Math.round(fortuneData.overall * 2);
      store.set(fortuneXpKey, xp);
      setToast(`🔮 오늘의 운세 확인 · +${xp} XP`);
    }
  }, [fortuneData]); // eslint-disable-line
  const loadSaju = async () => {
    if (!birthDate) return;
    setFortuneLoading(true);
    try {
      const res = await chatFetch('/api/chat?action=saju', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birthDate, birthTime, userName: user?.name || '사용자' }),
      });
      if (!res.ok) throw new Error(`saju ${res.status}`);
      const sd = await res.json();
      store.set('dm_saju_result', sd);
      setSajuData(sd);
    } catch { setFortuneError(true); }
    setFortuneLoading(false);
  };
  const loadTojeong = async () => {
    if (!birthDate) return;
    setFortuneLoading(true);
    try {
      const year = new Date().getFullYear();
      const res = await chatFetch('/api/chat?action=tojeong', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birthDate, birthTime, userName: user?.name || '사용자', year }),
      });
      if (!res.ok) throw new Error(`tojeong ${res.status}`);
      const td = await res.json();
      store.set('dm_tojeong_result', td);
      setTojeongData(td);
    } catch { setFortuneError(true); }
    setFortuneLoading(false);
  };
  const starRating = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
  const fortuneLevel = (score) => {
    if (!score) return { label: '🔮', color: '#A78BFA', desc: '운세보기' };
    const pts = Math.round(score * 20);
    if (pts >= 80) return { label: '대길 ★', color: '#4ADE80', desc: `${pts}점` };
    if (pts >= 60) return { label: '길 ☆', color: '#FCD34D', desc: `${pts}점` };
    if (pts >= 40) return { label: '평 △', color: '#94A3B8', desc: `${pts}점` };
    return { label: '흉 ▽', color: '#F87171', desc: `${pts}점` };
  };
  const fortuneWeekHistory = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const ds = toDateStr(d);
      const cached = store.get(`dm_fortune_${ds}`, null);
      const dow = '일월화수목금토'[d.getDay()];
      return { dateStr: ds, overall: avgFortuneScore(cached), dow };
    });
  }, []); // eslint-disable-line
  useEffect(() => {
    const handler = () => { if (fortuneModalOpen) setFortuneModalOpen(false); };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [fortuneModalOpen]);

  // 오늘의 할일 섹션만 다른 날짜로 미리보기/입력 (나머지 섹션은 항상 오늘 기준 유지)
  const targetDs = taskDayOffset === 0 ? dateStr : addDays(dateStr, taskDayOffset);
  const targetTasks = taskDayOffset === 0 ? tasks : (plans?.[targetDs]?.tasks || []);
  const setTargetTasks = (next) => {
    if (taskDayOffset === 0) onSetTodayTasks?.(next);
    else onUpdateDayData?.(targetDs, prev => ({ ...prev, tasks: next }));
  };
  const withNewTask = (list, newTask) => {
    const all = [...(list || [])];
    const emptyIdx = all.findIndex(t => !t.title?.trim());
    if (emptyIdx >= 0) all[emptyIdx] = newTask;
    else all.push(newTask);
    return all;
  };
  // 문장으로 일정 입력 — "내일 오후 3시 회의"는 그 날짜·시간으로, "매월 둘째 화요일 월례회의"는 반복 할일로 (utils/nlSchedule.js)
  const parsedTask = !nlOff ? parseSchedule(taskInput) : null;
  const addTargetTask = () => {
    const raw = taskInput.trim();
    if (!raw) return;
    const p = parsedTask;
    setTaskInput('');
    setNlOff(false);
    if (p?.recurring && setRecurringTasks) {
      setRecurringTasks(prev => [...(prev || []), { id: `r${Date.now()}`, title: p.title.slice(0, 40), days: p.recurring }]);
      setToast(`🔁 반복 할일로 등록했어요 (${recurringLabel(p.recurring)})`);
      return;
    }
    const newTask = { id: `t_${Date.now()}`, title: p ? p.title : raw, done: false, ...(p?.time ? { time: p.time } : {}) };
    if (p?.date && p.date !== targetDs) {
      onUpdateDayData?.(p.date, prev => ({ ...prev, tasks: withNewTask(prev?.tasks, newTask) }));
      setToast(`📅 ${describeSchedule(p)}에 추가했어요`);
      return;
    }
    setTargetTasks(withNewTask(targetTasks, newTask));
  };
  const toggleTargetTask = (id) => setTargetTasks(targetTasks.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const deleteTargetTask = (id, { keepPhotos = false } = {}) => {
    // 할일을 지우면 첨부 사진도 저장소에서 정리 (언젠가로 옮길 때는 사진을 그대로 가져가므로 유지)
    if (!keepPhotos) (targetTasks.find(t => t.id === id)?.photos || []).forEach(p => p?.path && deletePhoto(p.path));
    setTargetTasks(targetTasks.filter(t => t.id !== id));
  };
  const moveTargetTaskToSomeday = (task) => {
    saveSomeday([...(someday || []), { id: `sd${Date.now()}`, title: task.title, done: false, ...pickTaskDetail(task) }]);
    deleteTargetTask(task.id, { keepPhotos: true });
  };
  // 할일 상세(메모·사진) — 최신 데이터 기준으로 병합 저장 (사진 업로드가 끝나는 시점에도 안전하게)
  const [detailTaskId, setDetailTaskId] = useState(null);
  const [detailSomedayId, setDetailSomedayId] = useState(null); // 언젠가할일 상세
  const detailTask = detailTaskId ? targetTasks.find(t => t.id === detailTaskId) : null;
  const saveTaskDetail = (ds, id, patch) => onUpdateDayData?.(ds, prev => ({ ...prev, tasks: (prev.tasks || []).map(t => t.id === id ? { ...t, ...patch } : t) }));
  // 목록의 삭제 버튼과 할일 상세의 삭제가 함께 쓰는 확인 후 삭제 (취소하면 false)
  const confirmDeleteTargetTask = (t) => {
    const msg = t.gcalEventId && !String(t.id || '').startsWith('gcal_') && getValidGcalToken?.()
      ? '이 할일은 구글 캘린더 일정과 연동되어 있어요. 삭제하면 구글 캘린더에서도 삭제됩니다. 삭제할까요?'
      : `"${t.title}" 할일을 삭제할까요?`;
    if (!window.confirm(msg)) return false;
    deleteTargetTask(t.id);
  };
  const taskDayDateLabel = formatShortKoreanDate(targetDs);
  const taskDayLabel = taskDayOffset === 0 ? '오늘' : taskDayOffset === 1 ? '내일' : taskDayOffset === -1 ? '어제' : taskDayDateLabel;
  // 헤더 제목: "오늘의 할일" / 그 외 날짜는 "9월 26일 (토) 할일"
  const taskDayTitle = [0, 1, -1].includes(taskDayOffset) ? `${taskDayLabel}의 할일` : `${taskDayDateLabel} 할일`;
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
  const deleteSomeday = (id, { keepPhotos = false } = {}) => {
    if (!keepPhotos) ((someday || []).find(x => x.id === id)?.photos || []).forEach(p => p?.path && deletePhoto(p.path));
    saveSomeday((someday || []).filter(x => x.id !== id));
  };
  const moveSomedayToTask = (item) => {
    if (!onSetTodayTasks) return;
    const newTask = { id: `t_${Date.now()}`, title: item.title, done: false, ...pickTaskDetail(item) };
    const all = [...tasks];
    const emptyIdx = all.findIndex(t => !t.title.trim());
    if (emptyIdx >= 0) all[emptyIdx] = newTask;
    else all.push(newTask);
    onSetTodayTasks(all);
    deleteSomeday(item.id, { keepPhotos: true });
  };

  // 데스크탑 앱의 "메모 검색" 단축키 — 오늘 화면으로 이동한 뒤 검색창을 연다.
  // 화면이 뜨기 전에 신호가 오면 놓치지 않게 window.__dmOpenSearchPending 표시도 확인
  useEffect(() => {
    const open = () => { window.__dmOpenSearchPending = false; setShowSearch(true); };
    if (window.__dmOpenSearchPending) open();
    window.addEventListener('dm:open-search', open);
    return () => window.removeEventListener('dm:open-search', open);
  }, []);

  if (showSearch) return <SearchViewer plans={plans} onClose={() => setShowSearch(false)} onOpenDate={onOpenDate} onUpdateDayData={onUpdateDayData} uid={uid} setToast={setToast} hiddenTags={hiddenTags} onHideTag={onHideTag} />;

  if (longMemo) return (
    <LongMemoEditor
      initialId={longMemo.id}
      initialText={longMemo.text}
      initialPhotos={longMemo.photos || []}
      initialFiles={longMemo.files || []}
      initialStarred={longMemo.starred || false}
      onCreate={(text) => addMemo(text, getMemoTimeStr())}
      onUpdate={updateMemo}
      onUpdatePhotos={updateMemoPhotos}
      onUpdateFiles={updateMemoFiles}
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
  // 언젠가할일도 할일과 같은 상세 창 사용 (최신 목록 기준으로 병합 저장)
  const detailSomeday = detailSomedayId ? somedayList.find(x => x.id === detailSomedayId) : null;
  // 어제 못 한 할일 넘기기 (Microsoft To Do·Sunsama 참고) — 오늘로 옮기면 어제 기록에서는 빠지고 상세 정보도 함께 옮김.
  // 반복 할일(오늘도 자동 생성)과 구글 캘린더에서 가져온 일정(지난 회의 등)은 넘길 대상에서 뺀다.
  const yesterdayDs = addDays(dateStr, -1);
  const carryTasks = (plans?.[yesterdayDs]?.tasks || []).filter(t =>
    t.title?.trim() && !t.done && !String(t.id).startsWith('gcal_') && !/^r.+_\d{4}-\d{2}-\d{2}$/.test(String(t.id)));
  const removeFromYesterday = (ids) => onUpdateDayData?.(yesterdayDs, prev => ({ ...prev, tasks: (prev.tasks || []).filter(t => !ids.includes(t.id)) }));
  const carryToToday = (list) => {
    const now = Date.now();
    const all = [...tasks];
    list.forEach((t, i) => {
      const moved = { id: `t_${now}_${i}`, title: t.title, done: false, checkedAt: null, priority: !!t.priority, ...pickTaskDetail(t) };
      const emptyIdx = all.findIndex(x => !x.title.trim());
      if (emptyIdx >= 0) all[emptyIdx] = moved; else all.push(moved);
    });
    onSetTodayTasks?.(all);
    removeFromYesterday(list.map(t => t.id));
    setToast(`어제 할일 ${list.length}개를 오늘로 옮겼어요`);
  };
  const carryToSomeday = (t) => {
    saveSomeday([...(someday || []), { id: `sd${Date.now()}`, title: t.title, done: false, ...pickTaskDetail(t) }]);
    removeFromYesterday([t.id]);
  };
  const carryDelete = (t) => {
    (t.photos || []).forEach(p => p?.path && deletePhoto(p.path));
    removeFromYesterday([t.id]);
  };
  const dismissCarry = () => { store.set('dm_carry_dismissed', dateStr); setCarryDismissed(true); };

  const saveSomedayDetail = (id, patch) => setSomeday?.(prev => (prev || []).map(x => x.id === id ? { ...x, ...patch } : x));
  const confirmDeleteSomeday = (item) => {
    if (!window.confirm(`"${item.title}" 언젠가할일을 삭제할까요?`)) return false;
    deleteSomeday(item.id);
  };

  return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
      {detailTask && (
        <TaskDetailSheet
          key={detailTask.id}
          task={detailTask}
          uid={uid}
          onSave={(patch) => saveTaskDetail(targetDs, detailTask.id, patch)}
          onClose={() => setDetailTaskId(null)}
          onError={setToast}
          onDelete={confirmDeleteTargetTask}
          dateStr={targetDs}
          onMoveDate={onMoveTaskDate && ((t, to) => { const ok = onMoveTaskDate(t, targetDs, to); if (ok) setToast(`📅 ${formatShortKoreanDate(to)} 할일로 옮겼어요`); return ok; })}
        />
      )}
      {detailSomeday && (
        <TaskDetailSheet
          key={`sd_${detailSomeday.id}`}
          task={detailSomeday}
          uid={uid}
          onSave={(patch) => saveSomedayDetail(detailSomeday.id, patch)}
          onClose={() => setDetailSomedayId(null)}
          onError={setToast}
          onDelete={confirmDeleteSomeday}
          onMoveDate={onMoveTaskDate && ((t, to) => { const ok = onMoveTaskDate(t, null, to); if (ok) setToast(`📅 ${formatShortKoreanDate(to)} 할일로 옮겼어요`); return ok; })}
        />
      )}
      {statFeedback && (() => {
        const stat = GROWTH_STATS.find(s => s.id === statFeedback.statId);
        if (!stat) return null;
        return (
          <div key={statFeedback.key} className="xp-float" style={{ top: '18%', left: '50%' }}
            onAnimationEnd={onClearStatFeedback}>
            +{statFeedback.xp}XP {stat.icon} {stat.name}
            {statFeedback.scoreDelta > 0 && <> · 능력치 +{statFeedback.scoreDelta}</>}
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
            {onSetBattleNickname && (
              <button
                onClick={() => { setNicknameDraft(battleNickname || ''); setEditingNickname(v => !v); }}
                title="배틀 닉네임 설정"
                style={{ background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.35)", borderRadius: 999, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit" }}
              >
                <span style={{ fontSize: 10, color: "#c4b5fd", fontWeight: 700 }}>🏷️ {battleNickname || "닉네임"}</span>
              </button>
            )}
            {streak > 0 && <span style={{ fontSize: 11, color: "#F97316", fontWeight: 900, marginLeft: "auto" }}>🔥{streak}</span>}
          </div>
          {editingNickname && (
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              <input
                value={nicknameDraft}
                onChange={e => setNicknameDraft(e.target.value.slice(0, 10))}
                placeholder="배틀 닉네임 (최대 10자)"
                autoFocus
                style={{ ...S.input, flex: 1, marginBottom: 0, fontSize: 13, padding: "8px 10px" }}
              />
              <button
                onClick={() => { onSetBattleNickname(nicknameDraft.trim()); setEditingNickname(false); }}
                style={{ background: "#6C8EFF", border: "none", borderRadius: 8, padding: "0 14px", color: "#fff", fontWeight: 900, fontSize: 12, cursor: "pointer" }}
              >저장</button>
              <button
                onClick={() => setEditingNickname(false)}
                style={{ background: "var(--dm-input)", border: "none", borderRadius: 8, padding: "0 12px", color: "var(--dm-muted)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
              >취소</button>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            {myRank ? (
              <button onClick={onOpenStats} style={{ background: "rgba(75,111,255,.15)", border: "1px solid rgba(108,142,255,.4)", borderRadius: 20, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: "#6C8EFF" }}>🏆 전체 {myRank.rank}위</span>
                <span style={{ fontSize: 10, color: "var(--dm-muted)", marginLeft: 4 }}>{myRank.total}명 중</span>
              </button>
            ) : <span />}
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: "var(--dm-text)" }}>{totalScore.toLocaleString()}</span>
              <span style={{ fontSize: 11, color: "#6C8EFF", fontWeight: 700 }}>XP</span>
              <button onClick={() => setXpHelpOpen(true)} style={{ background: "rgba(108,142,255,.18)", border: "1px solid rgba(108,142,255,.4)", borderRadius: 999, width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 10, color: "#6C8EFF", fontWeight: 900, padding: 0, lineHeight: 1 }}>?</button>
            </div>
          </div>
          <div style={{ height: 4, background: "var(--dm-row)", borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
            <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#4B6FFF,#6C8EFF)", width: `${levelInfo.progress}%`, transition: "width 0.4s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontSize: 10, color: "var(--dm-muted)" }}>다음 레벨까지 {(levelInfo.nextFloor - totalScore).toLocaleString()} XP</span>
            <span style={{ fontSize: 10, color: "var(--dm-muted)" }}>오늘 +{todayScore}pt · 이달 {monthScore}pt</span>
          </div>
          <div style={{ fontSize: 12, fontWeight: 900, color: "var(--dm-muted)", letterSpacing: "0.06em", marginBottom: 10 }}>🌱 나의 성장 능력치</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 14, rowGap: 8 }}>
            {GROWTH_STATS.map(stat => {
              const score = calcStatScore(statXp[stat.id] || 0);
              return (
                <div key={stat.id} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 13, width: 18, textAlign: "center", flexShrink: 0 }}>{stat.icon}</span>
                  <span style={{ fontSize: 11, color: "var(--dm-sub)", width: 34, flexShrink: 0 }}>{stat.name}</span>
                  <div style={{ flex: 1, height: 6, background: "var(--dm-row)", borderRadius: 4, overflow: "hidden", minWidth: 0 }}>
                    <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#4B6FFF,#6C8EFF)", width: `${score}%`, transition: "width 0.4s" }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 900, color: "var(--dm-text)", width: 22, textAlign: "right", flexShrink: 0 }}>{score}</span>
                </div>
              );
            })}
          </div>
          {onOpenBattle && (
            <button onClick={onOpenBattle} style={{ width: '100%', marginTop: 14, background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.4)', borderRadius: 12, padding: '10px 0', fontSize: 13, fontWeight: 900, color: '#c4b5fd', cursor: 'pointer', fontFamily: 'inherit' }}>
              ⚔️ 일기토
            </button>
          )}
        </div>
      )}

      {/* 💌 오늘 챙길 사람 — 표시할 내용 없으면 영역째로 숨김 */}
      {contactReminders.length > 0 && (
        <div style={{ margin: '0 16px 10px' }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--dm-muted)', letterSpacing: '0.06em', marginBottom: 8, paddingTop: 4 }}>💌 오늘 챙길 사람</div>
          <div style={{ ...S.card, margin: 0, padding: '10px 14px' }}>
            {contactReminders.map((it, i) => (
              <div key={it.key} style={{ fontSize: 13, color: 'var(--dm-text)', padding: '6px 0', borderBottom: i < contactReminders.length - 1 ? '1px solid var(--dm-row)' : 'none' }}>🎂 {it.text}</div>
            ))}
          </div>
        </div>
      )}

      {/* 🔮 운세 · 로또 */}
      {(() => {
        const fl = fortuneLevel(todayFortuneScore);
        return (
        <div style={{ margin: '0 16px 10px' }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--dm-muted)', letterSpacing: '0.06em', marginBottom: 8, paddingTop: 4 }}>🔮 운세 · 로또</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { if (!fortuneData && birthDate) loadFortune(); setFortuneModalOpen(true); history.pushState({ modal: 'fortune' }, ''); }}
              style={{ flex: 1, background: `${fl.color}22`, border: `1px solid ${fl.color}55`, borderRadius: 12, padding: '9px 12px', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ fontSize: 10, color: 'var(--dm-muted)', fontWeight: 700, marginBottom: 3 }}>오늘의 운세</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 900, color: fl.color }}>{fl.label}</span>
                <span style={{ fontSize: 11, color: 'var(--dm-muted)' }}>{fl.desc}</span>
              </div>
            </button>
            <div style={{ flex: 1.2, background: 'var(--dm-card)', border: '1px solid var(--dm-border)', borderRadius: 12, padding: '9px 12px' }}>
              <div style={{ fontSize: 10, color: 'var(--dm-muted)', fontWeight: 700, marginBottom: 5 }}>🎱 오늘의 로또</div>
              {lottoNums ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
                  {lottoNums.map((n, i) => {
                    const bg = n <= 10 ? "#F87171" : n <= 20 ? "#FBBF24" : n <= 30 ? "#4ADE80" : n <= 40 ? "#60A5FA" : "#A78BFA";
                    return <div key={i} style={{ aspectRatio: '1', borderRadius: 999, background: bg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900 }}>{n}</div>;
                  })}
                </div>
              ) : (
                <button onClick={drawLotto} disabled={lottoAnim}
                  style={{ background: lottoAnim ? 'var(--dm-input)' : 'linear-gradient(135deg,#7C3AED,#A78BFA)', border: 'none', borderRadius: 8, padding: '6px 0', fontSize: 12, color: '#fff', fontWeight: 700, cursor: 'pointer', width: '100%' }}>
                  {lottoAnim ? '추출 중...' : '번호 뽑기'}
                </button>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── 운세 팝업 모달 ──────────────────────────────────── */}
      {fortuneModalOpen && (() => {
        const isFsTab = fortuneTab === 'saju' || fortuneTab === 'tojeong';
        return (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.75)", display: "flex", alignItems: isFsTab ? "stretch" : "flex-end", justifyContent: "center" }}
          onClick={() => setFortuneModalOpen(false)}>
          <div style={{ background: "var(--dm-card)", border: "1px solid rgba(255,255,255,.1)", borderRadius: isFsTab ? 0 : "24px 24px 0 0", padding: 0, width: "100%", maxHeight: isFsTab ? "100%" : "calc(90vh - 84px)", marginBottom: isFsTab ? 0 : 84, overflowY: "auto", display: "flex", flexDirection: "column" }}
            onClick={e => e.stopPropagation()}>
            {/* 헤더 — sticky */}
            <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--dm-card)", borderRadius: isFsTab ? 0 : "24px 24px 0 0", padding: "18px 16px 12px", borderBottom: "1px solid var(--dm-border)", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: birthDate ? 12 : 0 }}>
                <div style={{ fontSize: 15, fontWeight: 900 }}>🔮 오늘의 운세</div>
                <button onClick={() => setFortuneModalOpen(false)}
                  style={{ background: "none", border: "none", color: "var(--dm-muted)", fontSize: 20, cursor: "pointer", padding: "0 4px" }}>✕</button>
              </div>
              {/* 탭 */}
              {birthDate && (
                <div style={{ display: "flex", gap: 4, background: "var(--dm-input)", borderRadius: 999, padding: 4 }}>
                {[{ key: 'daily', label: '오늘의 운세' }, { key: 'saju', label: '평생 사주' }, { key: 'tojeong', label: '토정비결' }].map(t => (
                  <button key={t.key} onClick={() => {
                    setFortuneTab(t.key);
                    if (t.key === 'daily' && !fortuneData) loadFortune();
                    if (t.key === 'saju' && !sajuData) loadSaju();
                    if (t.key === 'tojeong' && !tojeongData) loadTojeong();
                  }} style={{
                    flex: 1, padding: "8px 0", borderRadius: 999, fontSize: 12, fontWeight: 800, cursor: "pointer",
                    border: "none", transition: "all .2s",
                    background: fortuneTab === t.key ? "#6C8EFF" : "transparent",
                    color: fortuneTab === t.key ? "#fff" : "var(--dm-muted)",
                    boxShadow: fortuneTab === t.key ? "0 2px 8px rgba(108,142,255,.4)" : "none",
                  }}>{t.label}</button>
                ))}
              </div>
              )}
            </div>
            {/* 컨텐츠 스크롤 영역 */}
            <div style={{ padding: "16px 16px 24px", overflowY: "auto" }}>
            {!birthDate ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: 13, color: "var(--dm-muted)", marginBottom: 12 }}>생년월일을 입력하면 오늘의 운세를 볼 수 있어요</div>
                <button onClick={() => { setFortuneModalOpen(false); onOpenSettings?.(); }}
                  style={{ ...S.btn, width: "auto", padding: "10px 24px", fontSize: 13 }}>⚙️ 설정에서 입력하기</button>
              </div>
            ) : fortuneLoading ? (
              <div style={{ padding: "4px 0" }}>
                <div style={{ textAlign: 'center', padding: '18px 0 14px' }}>
                  <div className="dm-spin" style={{ fontSize: 36 }}>🔮</div>
                  <div style={{ fontSize: 13, color: 'var(--dm-muted)', marginTop: 10, fontWeight: 700 }}>운세를 읽는 중<span style={{ display: 'inline-block', minWidth: 18, textAlign: 'left' }}>...</span></div>
                </div>
                <div className="dm-skeleton" style={{ height: 80, borderRadius: 14, marginBottom: 14 }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                  {[1,2,3,4].map(i => <div key={i} className="dm-skeleton" style={{ height: 72, borderRadius: 10 }} />)}
                </div>
                <div className="dm-skeleton" style={{ height: 68, borderRadius: 10, marginBottom: 10 }} />
                <div className="dm-skeleton" style={{ height: 44, borderRadius: 10, marginBottom: 10 }} />
                <div style={{ display: "flex", gap: 10 }}>
                  <div className="dm-skeleton" style={{ flex: 1, height: 52, borderRadius: 10 }} />
                  <div className="dm-skeleton" style={{ flex: 1, height: 52, borderRadius: 10 }} />
                </div>
              </div>
            ) : fortuneError ? (
              <div style={{ textAlign: "center", padding: "24px 16px" }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>😶‍🌫️</div>
                <div style={{ fontSize: 13, color: "var(--dm-muted)", marginBottom: 14 }}>운세를 불러오지 못했어요.<br/>네트워크를 확인하고 다시 시도해보세요.</div>
                <button onClick={loadFortune} style={{ ...S.btn, width: "auto", padding: "10px 24px", fontSize: 13 }}>🔄 다시 시도</button>
              </div>
            ) : fortuneTab === 'daily' ? (
              fortuneData ? (() => {
                const cats = [
                  { label: "전체운", val: fortuneData.overall || 3 },
                  { label: "금전운", val: fortuneData.money || 3 },
                  { label: "건강운", val: fortuneData.health || 3 },
                  { label: "인간관계", val: fortuneData.relation || 3 },
                ];
                const avgScore = avgFortuneScore(fortuneData);
                const totalFortunePts = avgScore ? Math.round(avgScore * 20) : 0;
                const scoreColor = fortuneLevel(avgScore).color;
                return (
                  <div style={S.card}>
                    {/* 주간 운세 히스토리 미니 차트 */}
                    {fortuneWeekHistory.some(d => d.overall !== null) && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 10, color: "var(--dm-muted)", fontWeight: 700, marginBottom: 6, textAlign: "center" }}>7일 운세 흐름</div>
                        <div style={{ display: "flex", gap: 4, alignItems: "flex-end", justifyContent: "center", height: 36 }}>
                          {fortuneWeekHistory.map((d, i) => {
                            const pts = d.overall ? d.overall * 20 : 0;
                            const isToday = i === 6;
                            const barColor = pts >= 80 ? "#4ADE80" : pts >= 60 ? "#FCD34D" : pts > 0 ? "#F87171" : "var(--dm-row)";
                            return (
                              <div key={d.dateStr} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flex: 1 }}>
                                <div style={{ width: "100%", maxWidth: 28, height: d.overall ? `${Math.max(4, pts * 0.32)}px` : 4, background: barColor, borderRadius: 3, opacity: isToday ? 1 : 0.6, border: isToday ? `1.5px solid ${barColor}` : "none" }} />
                                <div style={{ fontSize: 9, color: isToday ? "var(--dm-text)" : "var(--dm-muted)", fontWeight: isToday ? 900 : 400 }}>{d.dow}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14, gap: 12 }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700, marginBottom: 2 }}>종합 운세 점수</div>
                        <div style={{ fontSize: 36, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{totalFortunePts}<span style={{ fontSize: 16 }}>점</span></div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                      {cats.map(item => {
                        const pct = item.val * 20;
                        const c = pct >= 80 ? "#4ADE80" : pct >= 60 ? "#FCD34D" : "#F87171";
                        return (
                          <div key={item.label} style={{ background: "var(--dm-input)", borderRadius: 10, padding: "10px 12px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                              <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700 }}>{item.label}</div>
                              <div style={{ fontSize: 13, fontWeight: 900, color: c }}>{pct}점</div>
                            </div>
                            <div style={{ fontSize: 13, color: "#FCD34D", letterSpacing: 1, marginBottom: 4 }}>{starRating(item.val)}</div>
                            <div style={{ height: 4, background: "var(--dm-row)", borderRadius: 2, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: c, borderRadius: 2, transition: "width 0.4s" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--dm-text)", lineHeight: 1.7, marginBottom: 12 }}>{fortuneData.message}</div>
                    <div style={{ background: "var(--dm-input)", borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "#6C8EFF", marginBottom: 4 }}>💡 오늘의 조언</div>
                      <div style={{ fontSize: 13, color: "var(--dm-text)" }}>{fortuneData.advice}</div>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <div style={{ flex: 1, background: "var(--dm-input)", borderRadius: 10, padding: "8px 12px", textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700 }}>행운의 색</div>
                        <div style={{ fontSize: 14, fontWeight: 900, marginTop: 2 }}>{fortuneData.luckyColor}</div>
                      </div>
                      <div style={{ flex: 1, background: "var(--dm-input)", borderRadius: 10, padding: "8px 12px", textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700 }}>행운의 숫자</div>
                        <div style={{ fontSize: 14, fontWeight: 900, marginTop: 2 }}>{fortuneData.luckyNumber}</div>
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <div style={{ textAlign: "center", padding: "20px 16px" }}>
                  <button onClick={loadFortune} style={{ ...S.btn, width: "auto", padding: "10px 24px" }}>🔮 오늘의 운세 보기</button>
                </div>
              )
            ) : fortuneTab === 'saju' ? (
              sajuData ? (
                <div style={S.card}>
                  <div style={{ background: "var(--dm-input)", borderRadius: 10, padding: "10px 14px", marginBottom: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700, marginBottom: 2 }}>사주팔자</div>
                    <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: 2 }}>{sajuData.pillars}</div>
                    <div style={{ fontSize: 12, color: "#6C8EFF", marginTop: 4 }}>일간: {sajuData.dayMaster}</div>
                  </div>
                  {[
                    { label: "🧠 성격 & 기질", content: sajuData.personality },
                    { label: "💼 적합한 직업", content: sajuData.career },
                    { label: "💰 재물운", content: sajuData.wealth },
                    { label: "❤️ 건강", content: sajuData.health },
                    { label: "🌟 인생 조언", content: sajuData.lifeAdvice },
                  ].map(sec => (
                    <div key={sec.label} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "var(--dm-sub)", marginBottom: 4 }}>{sec.label}</div>
                      <div style={{ fontSize: 13, color: "var(--dm-text)", lineHeight: 1.7 }}>{sec.content}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "20px 16px" }}>
                  <button onClick={loadSaju} style={{ ...S.btn, width: "auto", padding: "10px 24px" }}>🌟 평생 사주 보기</button>
                </div>
              )
            ) : (
              tojeongData ? (
                <div style={S.card}>
                  <div style={{ background: "var(--dm-input)", borderRadius: 10, padding: "12px 14px", marginBottom: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700, marginBottom: 2 }}>{new Date().getFullYear()}년 토정비결</div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: "#FCD34D" }}>{tojeongData.hexagram}</div>
                    <div style={{ fontSize: 13, color: "var(--dm-text)", marginTop: 6 }}>{tojeongData.summary}</div>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--dm-text)", lineHeight: 1.8, marginBottom: 12 }}>{tojeongData.overall}</div>
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "20px 16px" }}>
                  <button onClick={loadTojeong} style={{ ...S.btn, width: "auto", padding: "10px 24px" }}>📖 토정비결 보기</button>
                </div>
              )
            )}
            {/* ── 로또 번호 (운세 탭 하단) ── */}
            {fortuneTab === 'daily' && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--dm-border)", paddingTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: "var(--dm-sub)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  🎱 오늘의 로또 번호
                  {lottoNums && <span style={{ fontSize: 10, color: "var(--dm-muted)", fontWeight: 400 }}>· 오늘 1회 추출 완료</span>}
                </div>
                {lottoNums ? (
                  <>
                    {todayFortuneScore >= 80 && (
                      <div style={{ fontSize: 11, color: "#FBBF24", fontWeight: 700, marginBottom: 8 }}>🍀 오늘 운이 좋으니 한번 사보세요!</div>
                    )}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {lottoNums.map((n, i) => {
                        const bg = n <= 10 ? "#F87171" : n <= 20 ? "#FBBF24" : n <= 30 ? "#4ADE80" : n <= 40 ? "#60A5FA" : "#A78BFA";
                        return (
                          <div key={i} style={{ width: 36, height: 36, borderRadius: 999, background: bg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, boxShadow: `0 2px 8px ${bg}66` }}>{n}</div>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 8 }}>내일 새 번호를 뽑을 수 있어요</div>
                  </>
                ) : (
                  <button onClick={drawLotto} disabled={lottoAnim}
                    style={{ ...S.btn, background: lottoAnim ? "var(--dm-input)" : "linear-gradient(135deg,#7C3AED,#A78BFA)", fontSize: 14, marginTop: 0 }}>
                    {lottoAnim ? "🎱 추출 중..." : "🎱 번호 뽑기"}
                  </button>
                )}
              </div>
            )}
            </div>
          </div>
        </div>
        );
      })()}

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
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
          <span style={S.sectionEmoji}>✅</span>
          {/* 제목: "오늘의 할일"은 항상 한 줄, "9월 26일 (토) 할일"은 아주 좁은 화면에서만 줄바꿈.
              접기는 제목 옆, 자리가 없으면 제목 아래로. 오늘/내일/어제의 날짜는 그 아래 줄에 작게 */}
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 6 }}>
              <span style={{ whiteSpace: [0, 1, -1].includes(taskDayOffset) ? 'nowrap' : 'normal', wordBreak: 'keep-all' }}>{taskDayTitle}</span>
              <button onClick={() => setTasksOpen(v => !v)} style={{ fontSize: 11, fontWeight: 700, color: 'var(--dm-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {tasksOpen ? '접기 ▲' : '펼치기 ▼'}
              </button>
            </span>
            {[0, 1, -1].includes(taskDayOffset) && (
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--dm-muted)', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{taskDayDateLabel}</span>
            )}
          </span>
        </span>
        {/* 전역 button 스타일(index.css)의 좌우 padding 1.2em이 폭을 늘리므로 padding:0 명시 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {getValidGcalToken && !getValidGcalToken() && onGcalConnect && (
            <button onClick={connectGcalFromTask} disabled={gcalConnecting} aria-label="구글 캘린더 연동" title="구글 캘린더 연동하기" style={{ width: 32, height: 32, padding: 0, borderRadius: 10, border: '1px solid rgba(75,111,255,.35)', background: 'rgba(75,111,255,.12)', color: '#6C8EFF', fontSize: 16, cursor: gcalConnecting ? 'default' : 'pointer', opacity: gcalConnecting ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📅</button>
          )}
          <button onClick={() => setTaskDayOffset(o => o - 1)} aria-label="전날 할일" style={{ width: 32, height: 32, padding: 0, borderRadius: 10, border: '1px solid var(--dm-border)', background: 'var(--dm-input)', color: 'var(--dm-sub)', fontSize: 20, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          <button onClick={() => setTaskDayOffset(o => o + 1)} aria-label="다음날 할일" style={{ width: 32, height: 32, padding: 0, borderRadius: 10, border: '1px solid var(--dm-border)', background: 'var(--dm-input)', color: 'var(--dm-sub)', fontSize: 20, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
        </div>
      </div>
      {tasksOpen && taskDayOffset === 0 && !carryDismissed && carryTasks.length > 0 && (
        <div style={{ ...S.card, border: '1px solid rgba(251,191,36,.45)', background: 'rgba(251,191,36,.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: 'var(--dm-text)' }}>⏪ 어제 못 한 할일 {carryTasks.length}개</span>
            <button onClick={() => carryToToday(carryTasks)}
              style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(108,142,255,.4)', background: 'rgba(108,142,255,.15)', color: '#6C8EFF', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>모두 오늘로</button>
            <button onClick={dismissCarry} aria-label="닫기" title="오늘은 그만 보기"
              style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', cursor: 'pointer', fontSize: 16, padding: '0 4px', flexShrink: 0 }}>✕</button>
          </div>
          {carryTasks.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderTop: '1px solid var(--dm-row)' }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--dm-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.title}{t.time ? <span style={{ fontSize: 11, color: '#6C8EFF', marginLeft: 6 }}>{t.time}</span> : null}
              </span>
              <button onClick={() => carryToToday([t])} style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid rgba(108,142,255,.3)', background: 'rgba(108,142,255,.1)', color: '#6C8EFF', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>오늘로</button>
              <button onClick={() => carryToSomeday(t)} style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid var(--dm-border)', background: 'var(--dm-input)', color: 'var(--dm-sub)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>언젠가</button>
              <button onClick={() => carryDelete(t)} aria-label="삭제" style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', cursor: 'pointer', fontSize: 16, padding: '0 4px', flexShrink: 0 }}>✕</button>
            </div>
          ))}
        </div>
      )}
      {tasksOpen && (
      <div style={S.card}>
        {/* 목록은 보기 전용 — 체크·언젠가·삭제만 바로 하고, 시간·스탯·메모·사진 등 편집은 할일 상세(줄 누르기)에서 */}
        {targetTasks.filter(t => t.title.trim()).map(task => (
          <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <button
              onClick={() => toggleTargetTask(task.id)}
              aria-label={task.done ? '완료 취소' : '완료'}
              style={{ width: 22, height: 22, padding: 0, borderRadius: 6, border: `1.5px solid ${task.done ? 'rgba(74,222,128,.5)' : 'var(--dm-border)'}`, background: task.done ? 'rgba(74,222,128,.15)' : 'var(--dm-input)', fontSize: 12, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4ADE80' }}
            >{task.done ? '✓' : ''}</button>
            <div onClick={() => setDetailTaskId(task.id)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '2px 0' }}>
              <span style={{ minWidth: 0, fontSize: 14, color: task.done ? 'var(--dm-muted)' : 'var(--dm-text)', textDecoration: task.done ? 'line-through' : 'none', lineHeight: 1.4, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{task.title}</span>
              {task.time && <span style={{ fontSize: 11, color: '#6C8EFF', fontWeight: 700, flexShrink: 0, background: 'rgba(108,142,255,.12)', padding: '1px 6px', borderRadius: 6 }}>{task.time}</span>}
              <TaskStatIcon task={task} />
              <TaskDetailBadge task={task} />
            </div>
            {/* 자주 쓰는 "언젠가로 미루기"(미완료만)와 삭제(확인창)만 목록에 바로 노출. 나머지 편집은 상세에서 */}
            {!task.done && (
              <button
                onClick={() => { moveTargetTaskToSomeday(task); setToast('언젠가 할일로 이동 ✅'); }}
                style={{ background: 'rgba(108,142,255,.1)', border: '1px solid rgba(108,142,255,.25)', borderRadius: 8, padding: '4px 8px', fontSize: 11, color: '#6C8EFF', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}
              >언젠가</button>
            )}
            {/* 언젠가할일 목록의 ✕와 같은 모양 */}
            <button
              onClick={() => confirmDeleteTargetTask(task)}
              aria-label="삭제"
              style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', cursor: 'pointer', fontSize: 16, padding: '0 4px', flexShrink: 0 }}
            >✕</button>
          </div>
        ))}
        {targetTasks.filter(t => t.title.trim()).length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--dm-muted)', textAlign: 'center', padding: '8px 0 12px' }}>{taskDayLabel} 할 일을 추가해보세요</div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ ...S.input, flex: 1, marginBottom: 0 }}
            value={taskInput}
            onChange={e => { setTaskInput(e.target.value); setNlOff(false); }}
            onKeyDown={e => e.key === 'Enter' && !e.nativeEvent.isComposing && addTargetTask()}
            placeholder="할 일 추가 (예: 내일 오후 3시 회의)"
            maxLength={60}
          />
          <button onClick={addTargetTask} style={{ width: 42, height: 42, borderRadius: 10, border: '1.5px solid rgba(108,142,255,.35)', background: 'rgba(108,142,255,.12)', fontSize: 20, cursor: 'pointer', color: '#6C8EFF', flexShrink: 0 }}>+</button>
        </div>
        {parsedTask && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, color: 'var(--dm-sub)' }}>
            <span style={{ flex: 1, minWidth: 0, background: 'rgba(108,142,255,.1)', border: '1px solid rgba(108,142,255,.25)', borderRadius: 8, padding: '5px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {parsedTask.recurring ? '🔁' : '📅'} <b style={{ color: '#6C8EFF' }}>{describeSchedule(parsedTask, recurringLabel)}</b> · {parsedTask.title}
            </span>
            <button onClick={() => setNlOff(true)} style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid var(--dm-border)', background: 'var(--dm-input)', color: 'var(--dm-muted)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>그냥 글자로</button>
          </div>
        )}
      </div>
      )}

      {/* 📋 언젠가할일 */}
      <div style={S.sectionTitle}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={S.sectionEmoji}>📋</span>언젠가할일
          <button onClick={() => setSomedayOpen(v => !v)} style={{ fontSize: 11, fontWeight: 700, color: 'var(--dm-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
            {somedayOpen ? '접기 ▲' : '펼치기 ▼'}
          </button>
        </span>
      </div>
      {somedayOpen && (
      <div style={S.card}>
        {somedayList.map(item => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <button onClick={() => toggleSomeday(item.id)} style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${item.done ? 'rgba(74,222,128,.5)' : 'var(--dm-border)'}`, background: item.done ? 'rgba(74,222,128,.15)' : 'var(--dm-input)', fontSize: 11, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4ADE80' }}>{item.done ? '✓' : ''}</button>
            <span onClick={() => setDetailSomedayId(item.id)} style={{ flex: 1, minWidth: 0, fontSize: 13, color: item.done ? 'var(--dm-muted)' : 'var(--dm-text)', textDecoration: item.done ? 'line-through' : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ minWidth: 0, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{item.title}</span>
              {item.time && <span style={{ fontSize: 11, color: '#6C8EFF', fontWeight: 700, flexShrink: 0, background: 'rgba(108,142,255,.12)', padding: '1px 6px', borderRadius: 6 }}>{item.time}</span>}
              <TaskStatIcon task={item} />
              <TaskDetailBadge task={item} />
            </span>
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
      )}

      {/* 💪 오늘습관 */}
      <div style={{ ...S.sectionTitle, justifyContent: 'space-between', paddingRight: 16 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={S.sectionEmoji}>💪</span>오늘습관
          <button onClick={() => setHabitsSectionOpen(v => !v)} style={{ fontSize: 11, fontWeight: 700, color: 'var(--dm-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
            {habitsSectionOpen ? '접기 ▲' : '펼치기 ▼'}
          </button>
        </span>
        <button
          onClick={() => { setEditingHabits(v => !v); setNewHabitIcon(''); setNewHabitName(''); }}
          style={{ fontSize: 11, fontWeight: 900, color: editingHabits ? '#4ADE80' : 'var(--dm-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
        >{editingHabits ? '완료 ✓' : '수정'}</button>
      </div>
      {habitsSectionOpen && (
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
                  style={{ ...S.input, flex: 1, minWidth: 0, marginBottom: 0 }}
                />
                <StatSelect value={h.statTag} name={h.name}
                  onChange={v => setHabits?.(prev => prev.map(x => x.id === h.id ? withStatTag(x, v) : x))} />
                <button onClick={() => setHabits?.(prev => prev.filter(x => x.id !== h.id))}
                  style={{ background: 'none', border: 'none', color: '#F87171', cursor: 'pointer', fontSize: 20, flexShrink: 0, padding: '0 2px' }}>✕</button>
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
      )}

      {/* 📖 일기 (이 섹션만 날짜 이동 가능, 나머지는 항상 오늘 기준) */}
      <div style={{ ...S.sectionTitle, justifyContent: 'space-between', paddingRight: 16 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
          <span style={S.sectionEmoji}>📖</span>
          {/* 할일 헤더와 동일: 제목은 항상 한 줄, 날짜·안내문구는 자리가 없으면 제목 아래로 */}
          <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 6, minWidth: 0 }}>
            <span style={{ whiteSpace: 'nowrap' }}>{journalDayTitle}</span>
            {[0, 1, -1].includes(journalDayOffset) && (
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--dm-muted)', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{journalDayDateLabel}</span>
            )}
            {journalDayOffset === 0 && (
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--dm-muted)', whiteSpace: 'nowrap', lineHeight: 1.3 }}>(22:00 이후 추천)</span>
            )}
          </span>
        </span>
        {/* 전역 button 스타일(index.css)의 좌우 padding 1.2em이 폭을 늘리므로 padding:0 명시 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <button onClick={() => { flushJournalSave(); setJournalDayOffset(o => o - 1); }} aria-label="전날 일기" style={{ width: 32, height: 32, padding: 0, borderRadius: 10, border: '1px solid var(--dm-border)', background: 'var(--dm-input)', color: 'var(--dm-sub)', fontSize: 20, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          <button onClick={() => { flushJournalSave(); setJournalDayOffset(o => o + 1); }} aria-label="다음날 일기" style={{ width: 32, height: 32, padding: 0, borderRadius: 10, border: '1px solid var(--dm-border)', background: 'var(--dm-input)', color: 'var(--dm-sub)', fontSize: 20, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
        </div>
      </div>
      <div style={S.card}>
        {/* {label} 한 일 — done tasks 자동 표시 */}
        {journalDoneTasks.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: 'var(--dm-muted)', fontWeight: 700, marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{journalDayLabel} 한 일</div>
            {journalDoneTasks.map(t => (
              <div key={t.id} style={{ fontSize: 13, color: 'var(--dm-sub)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#4ADE80', fontWeight: 700 }}>✓</span>{t.title}
              </div>
            ))}
          </div>
        )}

        {journalDayOffset === 0 && onOpenVoiceDiary && (
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
          value={displayedJournalBody}
          onChange={e => setDisplayedJournalBody(e.target.value)}
          placeholder="하루를 자유롭게 기록해보세요"
          maxLength={2000}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <div style={{ fontSize: 11, color: displayedJournalSaved ? 'var(--dm-muted)' : '#A78BFA', fontWeight: displayedJournalSaved ? 400 : 700, transition: 'color 0.3s' }}>
            {displayedJournalSaved ? '✓ 자동저장' : '저장 중...'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleManualJournalSave}
              style={{
                background: 'rgba(167,139,250,0.2)', border: '1px solid rgba(167,139,250,0.4)', borderRadius: 10,
                padding: '7px 16px', fontSize: 12, fontWeight: 900, color: '#A78BFA', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >저장</button>
            {uid && (
              <PhotoAttach
                uid={uid}
                pathPrefix={`users/${uid}/journal`}
                photoUrl={journalTargetDay.journal?.photoUrl}
                photoPath={journalTargetDay.journal?.photoPath}
                onChange={updateJournalPhotoForTarget}
                onError={setToast}
                size={34}
              />
            )}
          </div>
        </div>
      </div>

      <div style={{ height: 12 }} />

      {xpHelpOpen && (() => {
        const LEVELS = Array.from({ length: 21 }, (_, i) => {
          const lv = i + 1;
          const floor = Math.pow(lv - 1, 2) * 100;
          return { lv, icon: LEVEL_ICONS[i], title: LEVEL_TITLES[i], floor };
        });
        const XP_ITEMS = [
          { label: '할일 완료 1개', pt: '+10 XP' },
          { label: '할일 전체 완료 보너스', pt: '+20 XP' },
          { label: '습관 체크 1개', pt: '+5 XP' },
          { label: '습관 전체 완료 보너스', pt: '+15 XP' },
          { label: '일기/메모 작성', pt: '+15 XP' },
          { label: '완벽한 하루 달성', pt: '+25 XP' },
          { label: '7일 연속 보너스', pt: '+50 XP~' },
          { label: '타이머 챌린지 (5/15/25/50분)', pt: '5·15·30·70 XP' },
        ];
        return (
          <div onClick={() => setXpHelpOpen(false)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
            zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 20px",
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: "var(--dm-bg)", border: "1px solid var(--dm-border2)",
              borderRadius: 22, width: "100%", maxWidth: 360,
              maxHeight: "80vh", display: "flex", flexDirection: "column",
              boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
              animation: "modalPop 0.18s ease-out", overflow: "hidden",
            }}>
              <div style={{ padding: "20px 22px 14px", borderBottom: "1px solid var(--dm-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "var(--dm-text)" }}>⚡ XP & 레벨 안내</div>
                <button onClick={() => setXpHelpOpen(false)} style={{ background: "transparent", border: "none", color: "var(--dm-muted)", fontSize: 20, cursor: "pointer", padding: 4, lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px" }}>
                <div style={{ background: "linear-gradient(135deg,rgba(75,111,255,.15),rgba(108,142,255,.07))", border: "1.5px solid rgba(108,142,255,.3)", borderRadius: 14, padding: "14px 16px", marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 36 }}>{levelInfo.icon}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)" }}>{levelInfo.title} · Lv.{levelInfo.level}</div>
                    <div style={{ fontSize: 11, color: "#6C8EFF", fontWeight: 700, marginTop: 2 }}>{totalScore.toLocaleString()} XP 보유</div>
                    <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 1 }}>다음 레벨까지 {(levelInfo.nextFloor - totalScore).toLocaleString()} XP 남음</div>
                  </div>
                </div>

                <div style={{ fontSize: 12, fontWeight: 900, color: "var(--dm-sub)", marginBottom: 8 }}>📌 XP 획득 방법</div>
                <div style={{ borderRadius: 12, border: "1px solid var(--dm-border)", overflow: "hidden", marginBottom: 18 }}>
                  {XP_ITEMS.map((it, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px",
                      background: i % 2 === 0 ? "transparent" : "var(--dm-row)",
                      borderBottom: i < XP_ITEMS.length - 1 ? "1px solid var(--dm-border)" : "none" }}>
                      <span style={{ fontSize: 13, color: "var(--dm-text)" }}>{it.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 900, color: "#6C8EFF" }}>{it.pt}</span>
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: 12, fontWeight: 900, color: "var(--dm-sub)", marginBottom: 8 }}>🏆 전체 등급표</div>
                <div style={{ borderRadius: 12, border: "1px solid var(--dm-border)", overflow: "hidden" }}>
                  {LEVELS.map((lv, i) => {
                    const isCurrent = lv.lv === levelInfo.level;
                    return (
                      <div key={lv.lv} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px",
                        background: isCurrent ? "rgba(75,111,255,.15)" : i % 2 === 0 ? "transparent" : "var(--dm-row)",
                        borderBottom: i < LEVELS.length - 1 ? "1px solid var(--dm-border)" : "none",
                        border: isCurrent ? "1.5px solid rgba(108,142,255,.5)" : undefined,
                      }}>
                        <span style={{ fontSize: 18 }}>{lv.icon}</span>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 13, fontWeight: isCurrent ? 900 : 700, color: isCurrent ? "#6C8EFF" : "var(--dm-text)" }}>
                            Lv.{lv.lv} {lv.title}
                          </span>
                        </div>
                        <span style={{ fontSize: 11, color: isCurrent ? "#6C8EFF" : "var(--dm-muted)", fontWeight: 700 }}>
                          {lv.floor.toLocaleString()} XP~
                        </span>
                        {isCurrent && <span style={{ fontSize: 10, background: "#4B6FFF", color: "#fff", borderRadius: 999, padding: "2px 7px", fontWeight: 900 }}>현재</span>}
                      </div>
                    );
                  })}
                </div>
                <div style={{ height: 8 }} />
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

