import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { formatKoreanDate, formatShortKoreanDate, getWeekDates, addDays } from "../utils/date.js";
import S from "../styles.js";
import { FoldButton, SectionBox, WeatherCard, UpcomingDays } from "../components/TodayExtras.jsx";
import Toast from "../components/Toast.jsx";
import { genMemoId, getMemoTimeStr } from "../components/MemoTimeline.jsx";
import WeeklySchedule from "../components/WeeklySchedule.jsx";
import { canOpenDashboard } from "../utils/device.js";
import LongMemoEditor from "../components/LongMemoEditor.jsx";
import { gcalFetchWeekEvents } from "../api/gcal.js";
import PhotoAttach from "../components/PhotoAttach.jsx";
import TaskDetailSheet, { TaskDetailBadge, TaskStatIcon } from "../components/TaskDetailSheet.jsx";
import { pickTaskDetail } from "../utils/taskDetail.js";
import { deletePhoto } from "../firebase.js";
import { GROWTH_STATS } from "../data/growthStats.js";
import { store } from "../utils/storage.js";
import { getContactReminders } from "../data/contacts.js";
import { parseSchedule, parseMany, describeSchedule, friendlySchedule } from "../utils/nlSchedule.js";
import { recurringLabel, recurringIdOf } from "../utils/recurring.js";
import NowTaskCard from "../components/NowTaskCard.jsx";
import { findNowTask, useNowMinutes, leftText } from "../utils/nowTask.js";
import WeekStrip from "../components/WeekStrip.jsx";
import TodayTaskRow from "../components/TodayTaskRow.jsx";
import { todayNewLookOn, todayDoneGroupOn, todayHiddenSections, todaySectionOrder } from "../utils/todayLook.js";
import { SectionIcon, DoneSegments, CompactBar } from "../components/TodayLook.jsx";
import { useFlip } from "../utils/useFlip.js";
import FocusTimerModal from "../components/FocusTimerModal.jsx";
import DayWrapUpSheet, { DayWrapUpCard, LeaveCheckCard } from "../components/DayWrapUp.jsx";
import { normalizeWorkHours, isWorkday, planUntilMin, leaveCheckFrom, wrapFromMin, workload } from "../utils/workHours.js";
import UndoBar from "../components/UndoBar.jsx";
import { onThisDay } from "../utils/goalProgress.js";
import { useUndo, putBack } from "../utils/useUndo.js";
import { ExamTodayPanel } from "../components/Exam.jsx";
import { newStudyEntry } from "../utils/exam.js";

import StatSelect, { withStatTag } from "../components/StatSelect.jsx";
import { canMoveInList, moveInList } from "../utils/taskOrder.js";
import { habitStreak } from "../utils/habitStreak.js";
import { canAutoFocus } from "../utils/device.js";
// 할 일 입력 빠른 칩 — 맨 앞에 붙은 같은 종류의 말만 바꿔 넣는다
const LEAD_CHIPS_RE = /^((?:오늘|내일|모레|(?:오전|오후)\s*\d{1,2}시)\s+)+/;
const applyChip = (input, word) => {
  const lead = (input.match(LEAD_CHIPS_RE) || [''])[0];
  const rest = input.slice(lead.length).trimStart();
  const isTime = /시$/.test(word);
  const date = isTime ? (lead.match(/오늘|내일|모레/) || [''])[0] : word;
  const time = isTime ? word : (lead.match(/(?:오전|오후)\s*\d{1,2}시/) || [''])[0];
  return [date, time, rest].filter(Boolean).join(' ');
};
// 순서 편집용 작은 부품 (padding: 0 — 전역 button padding 때문)
function ReorderButtons({ r }) {
  return [[-1, '▲', '위로', r.canUp], [1, '▼', '아래로', r.canDown]].map(([dir, ch, label, can]) => (
    <button key={dir} onClick={() => r.onMove(dir)} disabled={!can} aria-label={label}
      style={{ width: 36, height: 36, padding: 0, border: 'none', background: 'none', fontSize: 17, fontWeight: 800, flexShrink: 0, color: can ? '#5B7CFA' : 'var(--dm-muted)', opacity: can ? 1 : 0.3, cursor: can ? 'pointer' : 'default' }}>{ch}</button>
  ));
}
function ReorderToggle({ on, onClick }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '2px 0 10px' }}>
      <button onClick={onClick}
        style={{ height: 34, padding: '0 14px', borderRadius: 10, border: `1.5px solid ${on ? '#5B7CFA' : 'var(--dm-border)'}`, background: on ? 'rgba(91,124,250,.12)' : 'transparent', color: on ? '#5B7CFA' : 'var(--dm-sub)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
        {on ? '✓ 순서 완료' : '↕ 순서 바꾸기'}
      </button>
    </div>
  );
}

export default function Today({
  dateStr, data, setData, toast, setToast, plans, onOpenDate, hasGoal, onUpdateDayData, recurringTasks, setRecurringTasks, onMoveTaskDate,
  onOpenVoiceDiary,
  habits, onToggleHabit, setHabits,
  someday, setSomeday,
  onSetTodayTasks,
  getValidGcalToken, onGcalConnect,
  autoOpenLongMemo,
  uid,
  onRequireLogin,
  frequentTags,
  myTags,
  onHideTag,
  statFeedback,
  onClearStatFeedback,
  contacts,
  onOpenPeople,
  onBonusXp,
  weatherCity,
  onSetWeatherCity,
  ddays = [],
  setDdays,
  exam, setExam, onStudyXp, wrongDue = 0, onOpenWrong,
  workHours,
  dashboard = false, // PC 대시보드 안: 머리글과 오늘의 할일만 보여 줌 (나머지 칸은 오늘 탭에 그대로)
}) {
  const tasks = data.tasks || [];
  const examOn = !!exam?.on; // 수험생 모드 (설정 → 수험생 모드)
  const contactReminders = useMemo(() => getContactReminders(contacts, plans, 7, dateStr), [contacts, plans, dateStr]);
  const doneCount = tasks.filter((t) => t.done && t.title.trim()).length;
  const filledCount = tasks.filter((t) => t.title.trim()).length;
  const doneTasks = tasks.filter((t) => t.done && t.title.trim());
  // 🔍는 메모 관리자(검색창 포함)를 연다. 사진 모아보기·찾은 단어 이동은 메모 관리자의 상세검색에서
  const openMemoManager = () => window.dispatchEvent(new CustomEvent('dm:navigate', { detail: 'manager' }));
  const [carryDismissed, setCarryDismissed] = useState(() => store.get('dm_carry_dismissed', '') === dateStr); // "어제 못 한 할일" 카드를 오늘 닫았는지
  const [longMemo, setLongMemo] = useState(null); // null | { id: string|null, text: string }

  useEffect(() => {
    if (autoOpenLongMemo) setLongMemo({ id: null, text: '' });
  }, [autoOpenLongMemo]);
  const [taskInput, setTaskInput] = useState('');
  const [nlOff, setNlOff] = useState(false); // 문장 해석 끄기 ("그냥 글자로") — 입력이 바뀌면 다시 켬
  const [taskDayOffset, setTaskDayOffset] = useState(0); // 오늘의 할일 섹션만 다른 날짜로 미리보기
  const nowMin = useNowMinutes(); // "지금 할 일" 카드·목록의 "지금" 표시용 (30초마다)
  const wh = normalizeWorkHours(workHours); // 출퇴근 시간 (설정 → 앱 관리)
  const [planMore, setPlanMore] = useState(false); // 아침 계획: 언젠가할일 더 보기
  const [focus, setFocus] = useState(null); // 집중 타이머 { ds, task } — 지금 할 일 카드·할일 상세에서 시작
  const [journalDayOffset, setJournalDayOffset] = useState(0); // 일기 섹션만 다른 날짜로 미리보기
  const [gcalConnecting, setGcalConnecting] = useState(false);
  const [somedayInput, setSomedayInput] = useState('');
  const [somedayShowAll, setSomedayShowAll] = useState(false); // 언젠가할일은 처음 3개만, "더 보기"로 전체
  const [reorder, setReorder] = useState(null); // 순서 편집 중인 목록: 'tasks' | 'someday' (2026-11-07, 줄마다 ▲▼)
  const [editingHabits, setEditingHabits] = useState(false);
  const [newHabitIcon, setNewHabitIcon] = useState('');
  const [newHabitName, setNewHabitName] = useState('');
  const [wrapOpen, setWrapOpen] = useState(false); // 🌙 하루 마무리 창
  // 👋 처음 쓰는 사람 안내 (2026-11-03) — 할일을 한 번도 안 넣은 사람에게만 처음 띄운다(이미 쓰던 사람은 안 보임).
  // ① 첫 할일 넣기 ② 목표 하나 적기, 둘 다 하거나 ✕로 닫으면 사라진다 (기기마다 dm_onboard)
  const [onboard, setOnboard] = useState(() => {
    const v = store.get('dm_onboard', null);
    if (v) return v;
    const used = Object.values(plans || {}).some(d => (d?.tasks || []).some(t => t.title?.trim()));
    const init = used ? 'done' : 'show';
    store.set('dm_onboard', init);
    return init;
  });
  const closeOnboard = () => { store.set('dm_onboard', 'done'); setOnboard('done'); };
  const onboardStep1 = Object.values(plans || {}).some(d => (d?.tasks || []).some(t => t.title?.trim())) || tasks.some(t => t.title?.trim());
  const onboardStep2 = !!hasGoal;
  useEffect(() => { if (onboard === 'show' && onboardStep1 && onboardStep2) closeOnboard(); }, [onboard, onboardStep1, onboardStep2]); // eslint-disable-line react-hooks/exhaustive-deps
  const undo = useUndo(); // ↩ 지우기·언젠가로 옮기기 되돌리기 (5초)
  // 앱 아이콘을 길게 눌러 "할일 추가"로 열면(?add=1) 입력칸에 바로 커서 — 사용자가 직접 고른 동작이라 휴대폰에서도 키보드를 띄운다
  const taskInputRef = useRef(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('add') !== '1') return;
    const id = setTimeout(() => { taskInputRef.current?.scrollIntoView({ block: 'center' }); taskInputRef.current?.focus(); }, 400);
    return () => clearTimeout(id);
  }, []);
  const [hiddenSec] = useState(todayHiddenSections); // 설정에서 숨긴 칸 (기기마다)
  const [sectionOrder] = useState(todaySectionOrder); // 설정에서 정한 칸 순서 (기기마다)
  const [newLook] = useState(todayNewLookOn); // 오늘 탭 새 화면 (설정 → 앱 관리에서 기기마다 끔)
  // 새 화면은 분 단위 시계 (초가 계속 바뀌면 "완료 n/m"보다 눈에 띄었다)
  const clockText = () => new Date().toLocaleTimeString('ko-KR', newLook ? { hour12: false, hour: '2-digit', minute: '2-digit' } : { hour12: false });
  const [clock, setClock] = useState(clockText);
  useEffect(() => {
    const t = setInterval(() => setClock(clockText()), newLook ? 10000 : 1000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  // 한 번에 여러 개 (2026-11-03) — 쉼표로 나눈 조각 중 둘 이상에 날짜·시간이 있을 때만 (utils/nlSchedule.js parseMany)
  const parsedMany = !nlOff ? parseMany(taskInput) : null;
  const addManyTasks = (list) => {
    const now = Date.now();
    let recurringN = 0;
    list.forEach((p, i) => {
      if (p.recurring && setRecurringTasks) {
        recurringN++;
        setRecurringTasks(prev => [...(prev || []), { id: `r${now}_${i}`, title: p.title.slice(0, 40), days: p.recurring }]);
        return;
      }
      const ds = p.date || targetDs;
      const task = { id: `t_${now}_${i}`, title: p.title.slice(0, 60), done: false, ...(p.time ? { time: p.time } : {}) };
      // 같은 날짜에 연달아 넣어도 앞의 것이 덮이지 않게 최신 기록 기준으로
      onUpdateDayData?.(ds, prev => ({ ...prev, tasks: withNewTask(prev?.tasks, task) }));
    });
    setToast(`📋 ${list.length}개를 넣었어요${recurringN ? ` (반복 ${recurringN}개)` : ''}`);
  };
  const addTargetTask = () => {
    const raw = taskInput.trim();
    if (!raw) return;
    const p = parsedTask;
    const many = parsedMany;
    setTaskInput('');
    setNlOff(false);
    if (many) { addManyTasks(many); return; }
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
  const toggleTargetTask = (id) => {
    const was = targetTasks.find(t => t.id === id);
    setTargetTasks(targetTasks.map(t => t.id === id ? { ...t, done: !t.done } : t));
    // 완료로 체크한 직후 5초 "↩ 되돌리기" (2026-11-07) — 체크 실수 방지. 되돌리기는 날짜 기록 저장 경로(능력치 회수 포함)를 거친다
    if (was && !was.done && was.title?.trim()) {
      undo.offer(`"${shortTitle(was.title)}" 완료했어요`, () => {
        onUpdateDayData?.(targetDs, prev => ({ ...prev, tasks: (prev.tasks || []).map(t => t.id === id ? { ...t, done: false } : t) }));
      });
    }
  };
  const deleteTargetTask = (id, { keepPhotos = false } = {}) => {
    // 할일을 지우면 첨부 사진도 저장소에서 정리 (언젠가로 옮길 때는 사진을 그대로 가져가므로 유지)
    if (!keepPhotos) (targetTasks.find(t => t.id === id)?.photos || []).forEach(p => p?.path && deletePhoto(p.path));
    setTargetTasks(targetTasks.filter(t => t.id !== id));
  };
  const moveTargetTaskToSomeday = (task) => {
    const sdId = `sd${Date.now()}`;
    saveSomeday([...(someday || []), { id: sdId, title: task.title, done: false, ...pickTaskDetail(task) }]);
    deleteTargetTask(task.id, { keepPhotos: true });
    return sdId;
  };
  // 되돌리기 — 지운 할일을 원래 자리에 다시 넣는다 (그사이 바뀐 다른 할일은 그대로)
  const reinsertTask = (ds, task, idx) => onUpdateDayData?.(ds, prev => {
    const list = [...(prev.tasks || [])];
    if (list.some(x => x.id === task.id)) return prev;
    list.splice(Math.max(0, Math.min(idx, list.length)), 0, task);
    return { ...prev, tasks: list };
  });
  const shortTitle = (t) => (t.length > 14 ? `${t.slice(0, 14)}…` : t);
  const somedayWithUndo = (task) => {
    const ds = targetDs, idx = targetTasks.findIndex(x => x.id === task.id);
    const sdId = moveTargetTaskToSomeday(task);
    undo.offer(`"${shortTitle(task.title)}" 언젠가로 옮겼어요`, () => {
      setSomeday?.(prev => (prev || []).filter(x => x.id !== sdId));
      reinsertTask(ds, task, idx);
    });
  };
  // 할일 상세(메모·사진) — 최신 데이터 기준으로 병합 저장 (사진 업로드가 끝나는 시점에도 안전하게)
  const [detailTaskId, setDetailTaskId] = useState(null);
  const [detailSomedayId, setDetailSomedayId] = useState(null); // 언젠가할일 상세
  const detailTask = detailTaskId ? targetTasks.find(t => t.id === detailTaskId) : null;
  const saveTaskDetail = (ds, id, patch) => onUpdateDayData?.(ds, prev => ({ ...prev, tasks: (prev.tasks || []).map(t => t.id === id ? { ...t, ...patch } : t) }));
  // 목록의 삭제 버튼과 할일 상세의 삭제가 함께 쓰는 확인 후 삭제 (취소하면 false)
  // 보통 할일은 확인창 없이 지우고 5초 동안 되돌리기 (사진 파일은 그 뒤에 지움).
  // 구글 캘린더와 연결된 할일은 구글 일정도 지워져 되돌릴 수 없으므로 예전처럼 먼저 묻는다.
  const confirmDeleteTargetTask = (t) => {
    const gcalLinked = t.gcalEventId && !String(t.id || '').startsWith('gcal_') && getValidGcalToken?.();
    if (gcalLinked) {
      if (!window.confirm('이 할일은 구글 캘린더 일정과 연동되어 있어요. 삭제하면 구글 캘린더에서도 삭제됩니다. 삭제할까요?')) return false;
      deleteTargetTask(t.id);
      return;
    }
    const ds = targetDs, idx = targetTasks.findIndex(x => x.id === t.id);
    deleteTargetTask(t.id, { keepPhotos: true });
    undo.offer(`"${shortTitle(t.title)}" 지웠어요`, () => reinsertTask(ds, t, idx),
      () => (t.photos || []).forEach(p => p?.path && deletePhoto(p.path)));
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

  // 목록에서 "지금" 표시할 할일 (오늘을 볼 때만)
  const nowFound = taskDayOffset === 0 ? findNowTask(tasks, nowMin) : { current: null, next: null };
  const nowTaskId = nowFound.current?.task.id || null;
  // 새 화면 목록 순서(보여주기만, 저장 순서는 그대로): 지금 할 일 → 시간 있는 할 일 시간순 → 시간 없는 할 일(추가한 순)
  // 끝낸 할 일은 아래 "완료 n" 묶음으로 (설정에서 끄면 제자리)
  const timeMin = (t) => (/^\d{1,2}:\d{2}$/.test(t.time || '') ? t.time.split(':').reduce((h, m) => h * 60 + Number(m), 0) : Infinity);
  const [doneGroup] = useState(todayDoneGroupOn);
  const [settle, setSettle] = useState(null); // { ids, order } 방금 체크해서 잠깐 제자리에 둔 할 일
  const settleTimer = useRef(null);
  useEffect(() => () => clearTimeout(settleTimer.current), []);
  const listRef = useRef(null);
  const headerRef = useRef(null);
  useFlip(listRef); // 새 화면 목록에만 붙는다
  // 처음 열 때만 줄이 차례로 떠오른다 (8줄까지)
  const [entered, setEntered] = useState(false);
  useEffect(() => { const t = setTimeout(() => setEntered(true), 900); return () => clearTimeout(t); }, []);
  const listAll = targetTasks.filter(t => t.title.trim());
  const sorted = newLook
    ? listAll.map((t, i) => ({ t, i })).sort((a, b) =>
        (doneGroup ? (a.t.done ? 1 : 0) - (b.t.done ? 1 : 0) : 0)
        || (b.t.id === nowTaskId) - (a.t.id === nowTaskId)
        || (timeMin(a.t) - timeMin(b.t) || 0)
        || a.i - b.i).map(x => x.t)
    : listAll;
  // 방금 체크한 할 일은 0.7초(마지막 체크 기준) 제자리에 두었다가 완료 묶음으로 미끄러진다 — 그동안은 체크 직전 순서를 유지
  const listTasks = settle
    ? [...listAll].sort((a, b) => { const ia = settle.order.indexOf(a.id), ib = settle.order.indexOf(b.id); return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib); })
    : sorted;
  const firstDoneIdx = newLook && doneGroup ? listTasks.findIndex(t => t.done && !settle?.ids.includes(t.id)) : -1;
  const toggleRow = (id) => {
    const t = targetTasks.find(x => x.id === id);
    if (t && !t.done) {
      try { navigator.vibrate?.(12); } catch { /* 진동 없는 기기 */ }
      if (doneGroup) {
        setSettle(s => ({ ids: [...(s?.ids || []), id], order: s?.order || listTasks.map(x => x.id) }));
        clearTimeout(settleTimer.current);
        settleTimer.current = setTimeout(() => setSettle(null), 700);
      }
    }
    toggleTargetTask(id);
  };
  const remainCount = filledCount - doneCount;
  // 새 화면 섹션 제목: 입체 이모지 대신 하단 메뉴 같은 선 아이콘. 글씨는 할 일과 같은 17px·진하게(사용자 요청 — 섹션이 잘 보여야 함)
  // 새 디자인은 제목과 내용을 칸 하나(SectionBox)로 묶으므로 제목의 바깥 여백·안쪽 칸 모양을 뺀다
  const secTitle = newLook ? { ...S.sectionTitle, padding: '0 0 10px' } : S.sectionTitle;
  const innerCard = newLook ? { position: 'relative' } : S.card;
  const foldPad = (open) => (newLook && !open ? { paddingBottom: 0 } : {}); // 접힌 칸은 제목 아래 여백을 뺀다
  const secIcon = (name, emoji) => (newLook ? <SectionIcon name={name} size={20} /> : <span style={S.sectionEmoji}>{emoji}</span>);


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

  const habitChecks = data.habitChecks || {};
  const visibleHabits = habits || [];
  const somedayList = someday || [];
  // 순서 편집 (2026-11-07) — 목록 옆 "↕ 순서 바꾸기"를 누르면 줄마다 ▲▼만 보인다. 옮기는 규칙은 상세 창과 같은 taskOrder.js
  const taskReorder = (id) => ({
    canUp: canMoveInList(targetTasks, id, -1, newLook), canDown: canMoveInList(targetTasks, id, 1, newLook),
    onMove: (dir) => setTargetTasks(moveInList(targetTasks, id, dir, newLook)),
  });
  const somedayReorder = (id) => ({
    canUp: canMoveInList(somedayList, id, -1), canDown: canMoveInList(somedayList, id, 1),
    onMove: (dir) => saveSomeday(moveInList(somedayList, id, dir)),
  });
  const anyTaskMovable = targetTasks.some(t => t.title?.trim() && (canMoveInList(targetTasks, t.id, -1, newLook) || canMoveInList(targetTasks, t.id, 1, newLook)));
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
  // ☀️ 아침 "오늘 계획" (2026-11-03) — 정오 전에는 어제 못 한 할일 카드에 오늘 첫 일정 한 줄과 언젠가할일 3개(오늘로)를 같이 보여준다.
  // 시간 있는 할일 목록은 바로 아래 할일 목록에 있으므로 다시 늘어놓지 않고 한 줄로만.
  const morning = nowMin < planUntilMin(wh);
  const timedToday = tasks.filter(t => t.title?.trim() && t.time && !t.done).sort((a, b) => a.time.localeCompare(b.time));
  // 목표에서 나온 언젠가할일을 먼저 (2026-11-06) — 3개 + 더 보기
  const planSomeday = morning ? (someday || []).filter(x => !x.done && x.title?.trim()).sort((a, b) => (b.goalRef ? 1 : 0) - (a.goalRef ? 1 : 0)) : [];
  const morningSomeday = planMore ? planSomeday : planSomeday.slice(0, 3);
  const showPlanCard = !carryDismissed && (carryTasks.length > 0 || morningSomeday.length > 0);
  const dismissCarry = () => { store.set('dm_carry_dismissed', dateStr); setCarryDismissed(true); };

  const saveSomedayDetail = (id, patch) => setSomeday?.(prev => (prev || []).map(x => x.id === id ? { ...x, ...patch } : x));
  // 언젠가할일 지우기도 확인창 대신 5초 되돌리기
  const confirmDeleteSomeday = (item) => {
    const idx = (someday || []).findIndex(x => x.id === item.id);
    deleteSomeday(item.id, { keepPhotos: true });
    undo.offer(`"${shortTitle(item.title)}" 지웠어요`, () => setSomeday?.(prev => {
      const list = [...(prev || [])];
      if (list.some(x => x.id === item.id)) return prev;
      list.splice(Math.max(0, Math.min(idx, list.length)), 0, item);
      return list;
    }), () => (item.photos || []).forEach(p => p?.path && deletePhoto(p.path)));
  };

  const introCards = (
    <>
      {isWorkday(dateStr) && <LeaveCheckCard key={`leave_${dateStr}_${wrapOpen}`} dateStr={dateStr} tasks={tasks} nowMin={nowMin} fromMin={leaveCheckFrom(wh)} toMin={wrapFromMin(wh, dateStr)} onOpen={() => setWrapOpen('leave')} />}
      {onboard === 'show' && (() => {
        const step1 = onboardStep1, step2 = onboardStep2;
        const row = (done, n, label, sub, onClick) => (
          <button onClick={done ? undefined : onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 4px', border: 'none', borderTop: '1px solid var(--dm-row)', background: 'none', cursor: done ? 'default' : 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, background: done ? '#4ADE80' : 'rgba(91,124,250,.15)', color: done ? '#fff' : '#5B7CFA' }}>{done ? '✓' : n}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 16, fontWeight: 800, color: done ? 'var(--dm-muted)' : 'var(--dm-text)', textDecoration: done ? 'line-through' : 'none' }}>{label}</span>
              {!done && <span style={{ display: 'block', fontSize: 13, color: 'var(--dm-sub)', marginTop: 1 }}>{sub}</span>}
            </span>
            {!done && <span style={{ color: '#5B7CFA', fontSize: 18 }}>›</span>}
          </button>
        );
        return (
          <div style={{ ...S.card, border: '1.5px solid rgba(91,124,250,.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ flex: 1, fontSize: 17, fontWeight: 900, color: 'var(--dm-text)', wordBreak: 'keep-all' }}>👋 처음이세요? 두 가지만 해 봐요</span>
              <button onClick={closeOnboard} aria-label="안내 닫기" style={{ width: 32, height: 32, padding: 0, background: 'none', border: 'none', color: 'var(--dm-muted)', fontSize: 16, cursor: 'pointer' }}>✕</button>
            </div>
            {row(step1, 1, '오늘 할 일 하나 넣기', '"내일 오후 3시 회의"처럼 쓰면 날짜·시간도 알아들어요', () => { taskInputRef.current?.scrollIntoView({ block: 'center' }); taskInputRef.current?.focus(); })}
            {row(step2, 2, '이루고 싶은 목표 하나 적기', 'My 탭 → 목표 관리. 목표에서 할 일을 만들면 진행이 쌓여요', () => window.dispatchEvent(new CustomEvent('dm:navigate', { detail: 'my' })))}
          </div>
        );
      })()}
      {tasksOpen && taskDayOffset === 0 && showPlanCard && (
        <div style={{ ...S.card, border: '1px solid rgba(251,191,36,.45)', background: 'rgba(251,191,36,.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: morning ? 4 : 10 }}>
            <span style={{ flex: 1, fontSize: morning ? 16 : 13, fontWeight: 800, color: 'var(--dm-text)' }}>{morning ? '☀️ 오늘 계획' : `⏪ 어제 못 한 할일 ${carryTasks.length}개`}</span>
            {!morning && <button onClick={() => carryToToday(carryTasks)}
              style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(108,142,255,.4)', background: 'rgba(108,142,255,.15)', color: '#6C8EFF', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>모두 오늘로</button>}
            <button onClick={dismissCarry} aria-label="닫기" title="오늘은 그만 보기"
              style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', cursor: 'pointer', fontSize: 16, padding: '0 4px', flexShrink: 0 }}>✕</button>
          </div>
          {morning && (
            <div style={{ fontSize: 14, color: 'var(--dm-sub)', marginBottom: 10 }}>
              {timedToday.length ? `⏰ 시간 정한 일 ${timedToday.length}개 · 첫 일정 ${timedToday[0].time} ${timedToday[0].title}` : '⏰ 오늘은 시간 정한 일이 없어요'}
            </div>
          )}
          {morning && carryTasks.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0 2px' }}>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 800, color: 'var(--dm-text)' }}>⏪ 어제 못 한 일 {carryTasks.length}개</span>
              <button onClick={() => carryToToday(carryTasks)}
                style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(108,142,255,.4)', background: 'rgba(108,142,255,.15)', color: '#5B7CFA', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>모두 오늘로</button>
            </div>
          )}
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
          {morningSomeday.length > 0 && (
            <>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--dm-text)', padding: '10px 0 2px' }}>📋 언젠가에서 오늘 할 것 고르기</div>
              {morningSomeday.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderTop: '1px solid var(--dm-row)' }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: 'var(--dm-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.goalRef ? '🎯 ' : ''}{item.title}</span>
                  <button onClick={() => { moveSomedayToTask(item); setToast('오늘 할일로 옮겼어요 ✅'); }} style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(108,142,255,.3)', background: 'rgba(108,142,255,.1)', color: '#5B7CFA', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>오늘로</button>
                </div>
              ))}
              {planSomeday.length > 3 && (
                <button onClick={() => setPlanMore(v => !v)} style={{ display: 'block', width: '100%', padding: '8px 0 2px', marginTop: 0, background: 'none', border: 'none', borderTop: '1px solid var(--dm-row)', borderRadius: 0, color: 'var(--dm-sub)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {planMore ? '접기 ▲' : `${planSomeday.length - 3}개 더 보기 ▼`}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </>
  );

  // 할일 아래 칸들 — 설정에서 순서를 바꿀 수 있다 (utils/todayLook.js todaySectionOrder)
  const todaySections = {
    // 💌 오늘 챙길 사람 — 내 사람들의 생일·기념일(7일 안)과 사람에게 연결된 할일. 없는 날도 한 줄로 보여서
    // 기능이 있는 걸 알 수 있게 하고, 누르면 내 사람들 화면 (예전엔 없으면 숨겨서 찾을 수 없었다)
    people: !hiddenSec.people && (<SectionBox on={newLook}>
      <div style={newLook ? {} : { margin: '0 16px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: contactReminders.length ? 8 : 0, paddingTop: newLook ? 0 : 4 }}>
          <span onClick={onOpenPeople} style={newLook
            ? { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 17, fontWeight: 900, color: 'var(--dm-text)', fontFamily: S.sectionTitle.fontFamily, cursor: onOpenPeople ? 'pointer' : 'default' }
            : { fontSize: 12, fontWeight: 900, color: 'var(--dm-muted)', letterSpacing: '0.06em', cursor: onOpenPeople ? 'pointer' : 'default' }}>
            {newLook ? <SectionIcon name="people" size={20} /> : '💌 '}오늘 챙길 사람{!contactReminders.length && <span style={{ fontWeight: 400, letterSpacing: 0, ...(newLook ? { fontSize: 13, color: 'var(--dm-muted)' } : {}) }}> · 다가오는 생일·기념일이 없어요</span>}
          </span>
          {onOpenPeople && <button onClick={onOpenPeople} style={{ fontSize: newLook ? 13 : 11, fontWeight: 700, color: 'var(--dm-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', flexShrink: 0 }}>내 사람들 ›</button>}
        </div>
        {contactReminders.length > 0 && (
          <div style={newLook ? {} : { ...S.card, margin: 0, padding: '10px 14px' }}>
            {contactReminders.map((it, i) => (
              <div key={it.key} style={{ fontSize: newLook ? 15 : 13, color: 'var(--dm-text)', padding: '6px 0', borderBottom: i < contactReminders.length - 1 ? '1px solid var(--dm-row)' : 'none' }}>🎂 {it.text}</div>
            ))}
          </div>
        )}
      </div>

      </SectionBox>),
    // 📌 다가오는 날 — 직접 넣은 D-day + 내 사람들의 생일·기념일 (사람은 7일 안이면 위 칸에 있으니 뺀다)
    upcoming: !hiddenSec.upcoming && (
        <UpcomingDays contacts={contacts} ddays={ddays} setDdays={setDdays} dateStr={dateStr} excludeWithin={hiddenSec.people ? -1 : 7} onOpen={onOpenPeople}
          boxed={newLook} heading={<div style={secTitle}>{secIcon('flag', '📌')}다가오는 날</div>} />
      ),
    habits: !hiddenSec.habits && (<SectionBox on={newLook}>
      <div style={{ ...secTitle, justifyContent: 'space-between', paddingRight: newLook ? 0 : 16, ...foldPad(habitsSectionOpen) }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {secIcon('repeat', '💪')}오늘의 습관
          {!newLook && <button onClick={() => setHabitsSectionOpen(v => !v)} style={{ fontSize: 11, fontWeight: 700, color: 'var(--dm-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
            {habitsSectionOpen ? '접기 ▲' : '펼치기 ▼'}
          </button>}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          onClick={() => { setEditingHabits(v => !v); setNewHabitIcon(''); setNewHabitName(''); }}
          style={{ fontSize: newLook ? 14 : 11, fontWeight: 900, color: editingHabits ? '#4ADE80' : 'var(--dm-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
        >{editingHabits ? '완료 ✓' : '수정'}</button>
        {newLook && <FoldButton open={habitsSectionOpen} onClick={() => setHabitsSectionOpen(v => !v)} />}
        </span>
      </div>
      {habitsSectionOpen && (
      <div style={innerCard}>
        {editingHabits ? (
          <>
            {visibleHabits.map(h => (
              <div key={h.id} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input
                  value={h.name || ''} maxLength={20} placeholder="습관 이름"
                  onChange={e => setHabits?.(prev => prev.map(x => x.id === h.id ? { ...x, name: e.target.value } : x))}
                  style={{ ...S.input, flex: 1, minWidth: 0, marginBottom: 0 }}
                />
                <StatSelect value={h.statTag} name={h.name}
                  onChange={v => setHabits?.(prev => prev.map(x => x.id === h.id ? withStatTag(x, v) : x))} />
                <button onClick={() => { const idx = (habits || []).findIndex(x => x.id === h.id); setHabits?.(prev => prev.filter(x => x.id !== h.id)); undo.offer(`"${shortTitle(h.name || '습관')}" 습관을 지웠어요`, () => setHabits?.(prev => putBack(prev, h, idx))); }}
                  style={{ background: 'none', border: 'none', color: '#F87171', cursor: 'pointer', fontSize: 20, flexShrink: 0, padding: '0 2px' }}>✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: visibleHabits.length > 0 ? 4 : 0, alignItems: 'center' }}>
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
                style={{ width: 42, height: 42, borderRadius: 10, border: '1.5px solid rgba(108,142,255,.35)', background: 'rgba(108,142,255,.12)', fontSize: 20, cursor: 'pointer', color: '#6C8EFF', flexShrink: 0, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
            </div>
            {visibleHabits.length === 0 && !newHabitName && (
              <div style={{ fontSize: 12, color: 'var(--dm-muted)', textAlign: 'center', padding: '8px 0' }}>아이콘과 이름을 입력 후 + 버튼</div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibleHabits.length === 0 && (
              newLook
                ? <button onClick={() => setEditingHabits(true)} style={{ display: 'block', width: '100%', padding: '4px 0', background: 'none', border: 'none', borderRadius: 0, textAlign: 'left', fontSize: 15, fontWeight: 800, color: '#5B7CFA', cursor: 'pointer' }}>＋ 습관 추가</button>
                : <div style={{ fontSize: 12, color: 'var(--dm-muted)', textAlign: 'center', padding: '8px 0' }}>습관을 추가하려면 수정을 눌러보세요</div>
            )}
            {visibleHabits.map(h => {
              const checked = !!habitChecks[h.id];
              return (
                <button key={h.id} onClick={() => onToggleHabit?.(h.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, border: `1.5px solid ${checked ? 'rgba(74,222,128,.4)' : 'var(--dm-border)'}`, background: checked ? 'rgba(74,222,128,.1)' : 'var(--dm-input)', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                  {/* 습관 이모지 대신 체크하면 오를 능력치 아이콘 (분류 안 되면 빈자리) */}
                  <span style={{ minWidth: 24, textAlign: 'center', flexShrink: 0 }}><TaskStatIcon task={{ statTag: h.statTag, title: h.name }} size={20} /></span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: checked ? '#4ADE80' : 'var(--dm-text)', fontFamily: 'inherit' }}>{h.name || '이름 없는 습관'}</span>
                  {(() => { const n = habitStreak(plans, h.id, dateStr, checked); return n >= 2 ? <span style={{ fontSize: 14, fontWeight: 800, color: '#F97316', flexShrink: 0 }}>🔥 {n}일</span> : null; })()}
                  {checked && <span style={{ fontSize: 16, color: '#4ADE80' }}>✓</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      )}

      </SectionBox>),
    someday: !hiddenSec.someday && (<SectionBox on={newLook}>
      <div style={{ ...secTitle, ...(newLook ? { justifyContent: 'space-between', paddingBottom: 16 } : {}), ...foldPad(somedayOpen) }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {secIcon('inbox', '📋')}언젠가할일{somedayList.length > 0 ? ` (${somedayList.length})` : ''}
          {!newLook && <button onClick={() => setSomedayOpen(v => !v)} style={{ fontSize: 11, fontWeight: 700, color: 'var(--dm-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
            {somedayOpen ? '접기 ▲' : '펼치기 ▼'}
          </button>}
        </span>
        {newLook && <FoldButton open={somedayOpen} onClick={() => setSomedayOpen(v => !v)} />}
      </div>
      {somedayOpen && (
      <div style={innerCard}>
        {(somedayShowAll || reorder === 'someday' ? somedayList : somedayList.slice(0, 3)).map((item, i, shown) => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, ...(newLook ? { padding: '10px 0', borderBottom: i === shown.length - 1 ? 'none' : '1px solid var(--dm-row)' } : { marginBottom: 12 }) }}>
            <button disabled={reorder === 'someday'} onClick={() => toggleSomeday(item.id)} style={{ width: newLook ? 26 : 20, height: newLook ? 26 : 20, borderRadius: newLook ? 8 : 6, padding: 0, border: `1.5px solid ${item.done ? 'rgba(74,222,128,.5)' : 'var(--dm-border)'}`, background: item.done ? 'rgba(74,222,128,.15)' : 'var(--dm-input)', fontSize: newLook ? 15 : 11, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4ADE80' }}>{item.done ? '✓' : ''}</button>
            <span onClick={() => reorder !== 'someday' && setDetailSomedayId(item.id)} style={{ flexWrap: newLook ? 'wrap' : 'nowrap', flex: 1, minWidth: 0, fontSize: newLook ? 15 : 13, color: item.done ? 'var(--dm-muted)' : 'var(--dm-text)', textDecoration: item.done ? 'line-through' : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ minWidth: 0, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{item.title}</span>
              {item.time && <span style={{ fontSize: newLook ? 13 : 11, color: '#6C8EFF', fontWeight: 700, flexShrink: 0, background: 'rgba(108,142,255,.12)', padding: '1px 6px', borderRadius: 6 }}>{item.time}</span>}
              <TaskStatIcon task={item} />
              <TaskDetailBadge task={item} />
            </span>
            {reorder === 'someday' ? <ReorderButtons r={somedayReorder(item.id)} /> : (<>
              <button onClick={() => moveSomedayToTask(item)} style={{ background: 'rgba(108,142,255,.1)', border: '1px solid rgba(108,142,255,.25)', borderRadius: 8, padding: '4px 8px', fontSize: newLook ? 13 : 11, color: '#6C8EFF', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>오늘로</button>
              <button onClick={() => confirmDeleteSomeday(item)} style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', cursor: 'pointer', fontSize: 16, padding: '0 4px', flexShrink: 0 }}>✕</button>
            </>)}
          </div>
        ))}
        {somedayList.length > 1 && <div style={{ marginTop: newLook ? 6 : 0 }}><ReorderToggle on={reorder === 'someday'} onClick={() => setReorder(reorder === 'someday' ? null : 'someday')} /></div>}
        {somedayList.length > 3 && reorder !== 'someday' && (
          <button onClick={() => setSomedayShowAll(v => !v)}
            style={{ display: 'block', width: '100%', margin: '2px 0 10px', padding: '8px 0', borderRadius: 10, border: '1px dashed var(--dm-border)', background: 'transparent', color: 'var(--dm-sub)', fontSize: newLook ? 14 : 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            {somedayShowAll ? '접기 ▲' : `더 보기 (${somedayList.length - 3}개 더) ▼`}
          </button>
        )}
        {somedayList.length === 0 && (
          <div style={{ fontSize: newLook ? 13 : 12, color: 'var(--dm-muted)', textAlign: 'center', padding: '8px 0 12px' }}>언젠가 하고 싶은 일을 적어두세요</div>
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
          <button onClick={addSomeday} style={{ width: 42, height: 42, borderRadius: 10, border: '1.5px solid rgba(108,142,255,.35)', background: 'rgba(108,142,255,.12)', fontSize: 20, cursor: 'pointer', color: '#6C8EFF', flexShrink: 0, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
        </div>
      </div>
      )}

      </SectionBox>),
    weekly: !hiddenSec.weekly && (<SectionBox on={newLook}>
      <div style={{ ...secTitle, justifyContent: 'space-between', paddingRight: newLook ? 0 : 16, ...foldPad(scheduleOpen) }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{secIcon('cal', '📅')}주간 일정</span>
        {newLook ? <FoldButton open={scheduleOpen} onClick={() => setScheduleOpen(v => !v)} /> : <button onClick={() => setScheduleOpen(v => !v)} style={{ fontSize: 11, fontWeight: 700, color: 'var(--dm-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
          {scheduleOpen ? '접기 ▲' : '펼치기 ▼'}
        </button>}
      </div>
      {scheduleOpen && (
        <div style={innerCard}>
          <WeeklySchedule
            plans={plans}
            habits={habits || []}
            onOpenDate={onOpenDate}
            gcalEvents={gcalWeekEvents}
          />
        </div>
      )}

      </SectionBox>),
    // 🕰 1년 전 오늘 — 1~5년 전 같은 날 남긴 기록 한 줄, 누르면 그날 (2026-11-03). 기록이 없으면 안 보임
    onthisday: !hiddenSec.onthisday && (() => {
        const otd = onThisDay(plans, dateStr);
        if (!otd) return null;
        const line = otd.journal ? `📖 ${otd.journal}` : otd.memo ? `📝 ${otd.memo}${otd.memoCount > 1 ? ` 외 ${otd.memoCount - 1}개` : ''}` : `✅ 할일 ${otd.done}개 끝냄`;
        return (
          <div onClick={() => onOpenDate?.(otd.ds)} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <span style={{ fontSize: 22 }}>🕰</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--dm-sub)' }}>{otd.years}년 전 오늘 · {otd.ds.slice(0, 4)}년 {Number(otd.ds.slice(5, 7))}월 {Number(otd.ds.slice(8))}일</div>
              <div style={{ fontSize: 15, color: 'var(--dm-text)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line}</div>
            </div>
            <span style={{ color: 'var(--dm-muted)', fontSize: 18 }}>›</span>
          </div>
        );
      })(),
    // 📖 일기 (이 섹션만 날짜 이동 가능, 나머지는 항상 오늘 기준) — 🌙 하루 마무리는 저녁에만, 일기 바로 위
    journal: (<>
      <DayWrapUpCard key={`${dateStr}_${wrapOpen}`} dateStr={dateStr} tasks={tasks} plans={plans} nowMin={nowMin} fromMin={wrapFromMin(wh, dateStr)} onOpen={() => setWrapOpen(true)} />
      <SectionBox on={newLook}>
      <div style={{ ...secTitle, justifyContent: 'space-between', paddingRight: newLook ? 0 : 16 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
          {secIcon('book', '📖')}
          {/* 할일 헤더와 동일: 제목은 항상 한 줄, 날짜·안내문구는 자리가 없으면 제목 아래로 */}
          <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 6, minWidth: 0 }}>
            <span style={{ whiteSpace: 'nowrap' }}>{journalDayTitle}</span>
            {[0, 1, -1].includes(journalDayOffset) && !(newLook && journalDayOffset === 0) && (
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--dm-muted)', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{journalDayDateLabel}</span>
            )}
            {journalDayOffset === 0 && (
              <span style={newLook ? { flexBasis: '100%', fontSize: 13, fontWeight: 400, color: 'var(--dm-muted)', lineHeight: 1.3 } : { fontSize: 11, fontWeight: 400, color: 'var(--dm-muted)', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{newLook ? '22:00 이후 추천' : '(22:00 이후 추천)'}</span>
            )}
          </span>
        </span>
        {/* 전역 button 스타일(index.css)의 좌우 padding 1.2em이 폭을 늘리므로 padding:0 명시 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <button onClick={() => { flushJournalSave(); setJournalDayOffset(o => o - 1); }} aria-label="전날 일기" style={{ width: 32, height: 32, padding: 0, borderRadius: 10, border: '1px solid var(--dm-border)', background: 'var(--dm-input)', color: 'var(--dm-sub)', fontSize: 20, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          <button onClick={() => { flushJournalSave(); setJournalDayOffset(o => o + 1); }} aria-label="다음날 일기" style={{ width: 32, height: 32, padding: 0, borderRadius: 10, border: '1px solid var(--dm-border)', background: 'var(--dm-input)', color: 'var(--dm-sub)', fontSize: 20, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
        </div>
      </div>
      <div style={innerCard}>
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
      </SectionBox>
    </>),
  };

  return (
    <div style={S.content}>
      {!dashboard && newLook && filledCount > 0 && <CompactBar watchRef={headerRef} done={doneCount} total={filledCount} />}
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
      <UndoBar bar={undo.bar} onUndo={undo.run} zIndex={detailTask ? 1300 : undefined} />
      {focus && (
        <FocusTimerModal
          task={focus.task}
          onClose={() => setFocus(null)}
          onToggleTask={(id) => { if (focus.ds === targetDs) toggleTargetTask(id); }}
          onXp={(xp) => { onBonusXp?.(xp); setToast(`⏱ 집중 완료 · +${xp} XP`); }}
          subjects={examOn ? exam.subjects : null}
          onFocusTime={(m, sub) => {
            // 할일에 집중 시간을 쌓고, 수험생 모드면 그날 공부 기록(day.study)에도 남긴다 — 한 번에 저장
            const entry = examOn ? newStudyEntry(sub, m, 'timer', focus.task.id) : null;
            onUpdateDayData?.(focus.ds, prev => ({
              ...prev,
              tasks: focus.task.id ? (prev.tasks || []).map(t => t.id === focus.task.id ? { ...t, focusMin: (t.focusMin || 0) + m } : t) : (prev.tasks || []),
              ...(entry ? { study: [...(prev.study || []), entry] } : {}),
            }));
            if (entry) onStudyXp?.(entry.min);
          }}
        />
      )}
      {wrapOpen && (
        <DayWrapUpSheet leave={wrapOpen === 'leave'} dateStr={dateStr} tasks={tasks} plans={plans} journalBody={bodyText}
          onMoveTaskDate={onMoveTaskDate} setData={setData} setSomeday={setSomeday} pickDetail={pickTaskDetail}
          onClose={() => setWrapOpen(false)}
          onFinish={() => { const leaving = wrapOpen === 'leave'; setWrapOpen(false); setToast(leaving ? '오늘도 수고했어요 🏁' : '오늘 하루 수고했어요 🌙'); }} />
      )}
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
          onFocus={(t) => { setDetailTaskId(null); setFocus({ ds: targetDs, task: t }); }}
          onComplete={(t) => toggleRow(t.id)}
          order={{
            canUp: canMoveInList(targetTasks, detailTask.id, -1, newLook),
            canDown: canMoveInList(targetTasks, detailTask.id, 1, newLook),
            onMove: (dir) => setTargetTasks(moveInList(targetTasks, detailTask.id, dir, newLook)),
          }}
          recurring={(() => {
            const rule = (recurringTasks || []).find(r => r.id === recurringIdOf(detailTask.id));
            if (!rule || !setRecurringTasks) return null;
            return {
              label: recurringLabel(rule.days),
              onStop: () => {
                const idx = (recurringTasks || []).findIndex(r => r.id === rule.id);
                setRecurringTasks(prev => (prev || []).filter(r => r.id !== rule.id));
                undo.offer(`"${shortTitle(rule.title)}" 반복을 그만했어요`, () => setRecurringTasks(prev => putBack(prev, rule, idx)));
              },
              onManage: () => { store.set('dm_open_settings_subpage', 'recurring'); window.dispatchEvent(new CustomEvent('dm:navigate', { detail: 'settings' })); },
            };
          })()}
        />
      )}
      {detailSomeday && (
        <TaskDetailSheet
          key={`sd_${detailSomeday.id}`}
          task={detailSomeday}
          order={{
            canUp: canMoveInList(somedayList, detailSomeday.id, -1),
            canDown: canMoveInList(somedayList, detailSomeday.id, 1),
            onMove: (dir) => saveSomeday(moveInList(somedayList, detailSomeday.id, dir)),
          }}
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

      <div ref={headerRef} style={S.topbar}>
        {newLook ? (
          // 새 화면 머리글: 날짜·시각은 작게, 남은 할 일 수를 크게 + 할 일 수만큼 칸
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--dm-sub)', fontWeight: 600 }}>{formatKoreanDate(dateStr)} · {clock}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--dm-text)', margin: '2px 0 8px', lineHeight: 1.3, wordBreak: 'keep-all', display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 }}>
              {!filledCount ? '오늘 할 일 없음' : remainCount ? <span style={{ whiteSpace: 'nowrap' }}>{remainCount}개 남았어요</span> : '모두 끝냈어요 🎉'}
              {filledCount > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--dm-muted)', whiteSpace: 'nowrap' }}>완료 {doneCount}/{filledCount}</span>}
            </div>
            <DoneSegments done={doneCount} total={filledCount} />
          </div>
        ) : (
        <div style={{ flex: 1 }}>
          <div style={S.title}>오늘의 페이지</div>
          <div style={S.sub}>{formatKoreanDate(dateStr)} · {clock} · {filledCount ? `완료 ${doneCount}/${filledCount}` : '할일 없음'}</div>
        </div>
        )}
        {/* 수험생 모드 바로 켜고 끄기 (2026-11-01 사용자 결정 — 모든 사람에게 보임, 설정 → 수험생 모드와 같은 값). 꺼도 D-day·기록은 그대로 */}
        {setExam && !dashboard && (
          <button onClick={() => { setExam(e => ({ ...e, on: !e.on })); setToast(examOn ? '수험생 모드를 껐어요 (기록은 그대로예요)' : '📚 수험생 모드를 켰어요'); }}
            role="switch" aria-checked={examOn} aria-label="수험생 모드" title="수험생 모드 (D-day·공부 시간·오답 노트)"
            style={{ flexShrink: 0, alignSelf: 'center', padding: '6px 10px', borderRadius: 999, border: `1.5px solid ${examOn ? '#5B7CFA' : 'var(--dm-border)'}`, background: examOn ? 'rgba(91,124,250,.14)' : 'var(--dm-input)', color: examOn ? '#5B7CFA' : 'var(--dm-sub)', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
            📚 시험 {examOn ? 'ON' : 'OFF'}
          </button>
        )}
        {!dashboard && canOpenDashboard() && (
          <button onClick={() => window.dispatchEvent(new CustomEvent('dm:navigate', { detail: 'dashboard' }))} aria-label="대시보드" title="대시보드 (넓은 화면으로 보기)" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: '8px 4px', color: 'var(--dm-muted)', marginTop: 0 }}>🖥️</button>
        )}
        {!dashboard && <button onClick={openMemoManager} aria-label="메모 관리자" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: '8px 4px', color: 'var(--dm-muted)' }}>🔍</button>}
      </div>

      {/* 🌤 날씨 — 평소 한 줄, 누르면 7일 (설정에서 끌 수 있음) */}
      {!dashboard && !hiddenSec.weather && <WeatherCard city={weatherCity} dateStr={dateStr} onSetCity={onSetWeatherCity} />}

      {/* 📚 수험생 모드: D-day · 오늘 공부 (설정에서 켰을 때만) */}
      {examOn && !dashboard && (
        <ExamTodayPanel exam={exam} setExam={setExam} dateStr={dateStr} plans={plans} todayData={data}
          onStartStudy={() => setFocus({ ds: dateStr, task: { id: null, title: '📚 공부' } })}
          onAddStudy={(entry) => { onUpdateDayData?.(dateStr, prev => ({ ...prev, study: [...(prev.study || []), entry] })); onStudyXp?.(entry.min); setToast(`📚 ${entry.sub} ${entry.min}분 기록했어요`); }}
          onDeleteStudy={(entry) => { onUpdateDayData?.(dateStr, prev => ({ ...prev, study: (prev.study || []).filter(s => s.id !== entry.id) })); onStudyXp?.(-entry.min); }}
          wrongDue={wrongDue} onOpenWrong={onOpenWrong}
        />
      )}

      {isPerfect && (
        <div style={{ ...S.card, background: "linear-gradient(135deg,rgba(74,222,128,.15),rgba(108,142,255,.10))", border: "1.5px solid rgba(74,222,128,.35)" }}>
          <div style={{ fontSize: 32, textAlign: "center", marginBottom: 8 }}>🎉</div>
          <div style={{ fontSize: 14, fontWeight: 900, textAlign: "center", color: "#4ADE80" }}>완벽한 하루!</div>
          <div style={{ fontSize: 12, textAlign: "center", color: "var(--dm-sub)", marginTop: 6 }}>3가지 완료 + 일기 작성. 연속 기록이 쌓이고 있어요 🔥</div>
        </div>
      )}

      {newLook && introCards}

      {/* ✅ 오늘의 할일 (이 섹션만 날짜 이동 가능, 나머지는 항상 오늘 기준) */}
      <SectionBox on={newLook}>
      <div style={{ ...secTitle, justifyContent: 'space-between', paddingRight: newLook ? 0 : 16, ...foldPad(tasksOpen) }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
          {secIcon('today', '✅')}
          {/* 제목: "오늘의 할일"은 항상 한 줄, "9월 26일 (토) 할일"은 아주 좁은 화면에서만 줄바꿈.
              접기는 제목 옆, 자리가 없으면 제목 아래로. 오늘/내일/어제의 날짜는 그 아래 줄에 작게 */}
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 6 }}>
              <span style={{ whiteSpace: [0, 1, -1].includes(taskDayOffset) ? 'nowrap' : 'normal', wordBreak: 'keep-all' }}>{taskDayTitle}</span>
              {!newLook && <button onClick={() => setTasksOpen(v => !v)} style={{ fontSize: 11, fontWeight: 700, color: 'var(--dm-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {tasksOpen ? '접기 ▲' : '펼치기 ▼'}
              </button>}
            </span>
            {[0, 1, -1].includes(taskDayOffset) && !(newLook && taskDayOffset === 0) && (
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--dm-muted)', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{taskDayDateLabel}</span>
            )}
          </span>
        </span>
        {/* 전역 button 스타일(index.css)의 좌우 padding 1.2em이 폭을 늘리므로 padding:0 명시 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: newLook ? 4 : 12, flexShrink: 0 }}>
          {getValidGcalToken && !getValidGcalToken() && onGcalConnect && (
            <button onClick={connectGcalFromTask} disabled={gcalConnecting} aria-label="구글 캘린더 연동" title="구글 캘린더 연동하기" style={{ width: 32, height: 32, padding: 0, borderRadius: 10, border: '1px solid rgba(75,111,255,.35)', background: 'rgba(75,111,255,.12)', color: '#6C8EFF', fontSize: 16, cursor: gcalConnecting ? 'default' : 'pointer', opacity: gcalConnecting ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📅</button>
          )}
          <button onClick={() => setTaskDayOffset(o => o - 1)} aria-label="전날 할일" style={{ width: 32, height: 32, padding: 0, borderRadius: 10, border: '1px solid var(--dm-border)', background: 'var(--dm-input)', color: 'var(--dm-sub)', fontSize: 20, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          <button onClick={() => setTaskDayOffset(o => o + 1)} aria-label="다음날 할일" style={{ width: 32, height: 32, padding: 0, borderRadius: 10, border: '1px solid var(--dm-border)', background: 'var(--dm-input)', color: 'var(--dm-sub)', fontSize: 20, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
          {newLook && <FoldButton open={tasksOpen} onClick={() => setTasksOpen(v => !v)} />}
        </div>
      </div>
      {/* 월~일 동그라미(누르면 그 날짜 할일) + 지금 할 일(오늘만) */}
      {tasksOpen && !dashboard && <WeekStrip todayDs={dateStr} selectedDs={targetDs} plans={plans} todayTasks={tasks} onSelect={setTaskDayOffset} inBox={newLook} />}
      {/* 오늘 양 경고 — 근무 시간 안에 잡힌 일이 근무 시간보다 많으면 (평일만) */}
      {tasksOpen && isWorkday(targetDs) && (() => {
        const load = workload(targetTasks, wh);
        if (!load.over) return null;
        return <div style={{ margin: newLook ? '8px 0 2px' : '8px 16px 2px', fontSize: 14, fontWeight: 700, color: '#F97316', lineHeight: 1.45, wordBreak: 'keep-all' }}>⚠️ 시간 정한 일이 {leftText(load.planned)}이에요. 근무 시간 {leftText(load.work)}을 넘어요</div>;
      })()}
      {tasksOpen && taskDayOffset === 0 && !newLook && <NowTaskCard tasks={tasks} nowMin={nowMin} onToggle={toggleTargetTask} onOpen={setDetailTaskId} onFocus={(t) => setFocus({ ds: dateStr, task: t })} />}
      {!newLook && introCards}
      {tasksOpen && (
      <div style={innerCard}>
        {/* 목록은 보기 전용 — 체크·언젠가·삭제만 바로 하고, 시간·스탯·메모·사진 등 편집은 할일 상세(줄 누르기)에서 */}
        {newLook && (
          // 줄 순서가 바뀌면 미끄러지게(useFlip) — offsetTop 기준이 이 상자가 되도록 position: relative
          <div ref={listRef} style={{ position: 'relative' }}>
            {listTasks.flatMap((task, i) => [
              i === firstDoneIdx && (
                <div key="__done" data-flip-id="__done" style={{ fontSize: 13, fontWeight: 700, color: 'var(--dm-muted)', padding: i ? '14px 0 2px' : '0 0 2px' }}>완료 {listTasks.length - firstDoneIdx}</div>
              ),
              <TodayTaskRow key={task.id} task={task} last={i === listTasks.length - 1 || i === firstDoneIdx - 1}
                riseDelay={!entered && i < 8 ? i * 45 : null}
                now={task.id === nowTaskId ? { start: nowFound.current.start, end: nowFound.current.end, nowMin } : null}
                next={task.id === nowFound.next?.task.id ? nowFound.next.start - nowMin : null}
                onToggle={toggleRow} onOpen={setDetailTaskId}
                reorder={reorder === 'tasks' ? taskReorder(task.id) : null}
                onSomeday={somedayWithUndo}
                onDelete={confirmDeleteTargetTask}
                onFocus={(t) => setFocus({ ds: dateStr, task: t })} />,
            ])}
          </div>
        )}
        {newLook && listTasks.length > 0 && <div style={{ height: 10 }} />}
        {!newLook && targetTasks.filter(t => t.title.trim()).map(task => (
          <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <button
              disabled={reorder === 'tasks'}
              onClick={() => toggleTargetTask(task.id)}
              aria-label={task.done ? '완료 취소' : '완료'}
              style={{ width: 22, height: 22, padding: 0, borderRadius: 6, border: `1.5px solid ${task.done ? 'rgba(74,222,128,.5)' : 'var(--dm-border)'}`, background: task.done ? 'rgba(74,222,128,.15)' : 'var(--dm-input)', fontSize: 12, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4ADE80' }}
            >{task.done ? '✓' : ''}</button>
            {/* 제목 줄(제목+아이콘) 아래에 시간·"지금"을 작은 줄로 — 한 줄에 다 넣으면 제목이 두 줄로 쪼개졌다 */}
            <div onClick={() => setDetailTaskId(task.id)} style={{ flex: 1, minWidth: 0, cursor: 'pointer', padding: '2px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ minWidth: 0, fontSize: 14, color: task.done ? 'var(--dm-muted)' : 'var(--dm-text)', textDecoration: task.done ? 'line-through' : 'none', lineHeight: 1.4, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{task.title}</span>
                <TaskStatIcon task={task} />
                <TaskDetailBadge task={task} />
              </div>
              {(task.time || task.id === nowTaskId) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  {task.time && <span style={{ fontSize: 11, color: '#6C8EFF', fontWeight: 700, background: 'rgba(108,142,255,.12)', padding: '1px 6px', borderRadius: 6 }}>{task.time}{task.endTime && task.endTime > task.time ? ` ~ ${task.endTime}` : ''}</span>}
                  {task.id === nowTaskId && <span style={{ fontSize: 10, color: '#fff', fontWeight: 900, background: '#6C8EFF', padding: '1px 6px', borderRadius: 6 }}>지금</span>}
                </div>
              )}
            </div>
            {reorder === 'tasks' && <ReorderButtons r={taskReorder(task.id)} />}
            {/* 자주 쓰는 "언젠가로 미루기"(미완료만)와 삭제(확인창)만 목록에 바로 노출. 나머지 편집은 상세에서 */}
            {reorder !== 'tasks' && !task.done && (
              <button
                onClick={() => somedayWithUndo(task)}
                style={{ background: 'rgba(108,142,255,.1)', border: '1px solid rgba(108,142,255,.25)', borderRadius: 8, padding: '4px 8px', fontSize: 11, color: '#6C8EFF', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}
              >언젠가</button>
            )}
            {/* 언젠가할일 목록의 ✕와 같은 모양 */}
            {reorder !== 'tasks' && <button
              onClick={() => confirmDeleteTargetTask(task)}
              aria-label="삭제"
              style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', cursor: 'pointer', fontSize: 16, padding: '0 4px', flexShrink: 0 }}
            >✕</button>}
          </div>
        ))}
        {(reorder === 'tasks' || anyTaskMovable) && <ReorderToggle on={reorder === 'tasks'} onClick={() => setReorder(reorder === 'tasks' ? null : 'tasks')} />}
        {targetTasks.filter(t => t.title.trim()).length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--dm-muted)', textAlign: 'center', padding: '8px 0 12px' }}>{taskDayLabel} 할 일을 추가해보세요</div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={taskInputRef}
            style={{ ...S.input, flex: 1, marginBottom: 0 }}
            value={taskInput}
            onChange={e => { setTaskInput(e.target.value); setNlOff(false); }}
            onKeyDown={e => e.key === 'Enter' && !e.nativeEvent.isComposing && addTargetTask()}
            placeholder="할 일 추가 (예: 내일 오후 3시 회의)"
            maxLength={200}
          />
          <button onClick={addTargetTask} style={{ width: 42, height: 42, borderRadius: 10, border: '1.5px solid rgba(108,142,255,.35)', background: 'rgba(108,142,255,.12)', fontSize: 20, cursor: 'pointer', color: '#6C8EFF', flexShrink: 0, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
        </div>
        {/* 빠른 칩 (2026-11-07) — 글자를 앞에 붙일 뿐이라 해석은 아래 문장 일정 입력(nlSchedule)이 그대로 한다. 같은 종류(날짜끼리·시간끼리)는 바꿔 넣는다 */}
        {taskInput.trim() && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {['오늘', '내일', '모레', '오전 9시', '오후 3시'].map(w => (
              <button key={w} onClick={() => { setTaskInput(applyChip(taskInput, w)); setNlOff(false); if (canAutoFocus()) taskInputRef.current?.focus(); }}
                style={{ height: 34, padding: '0 12px', borderRadius: 17, border: '1px solid var(--dm-border)', background: 'var(--dm-input)', color: '#5B7CFA', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>{w}</button>
            ))}
          </div>
        )}
        {/* 어떻게 들어갈지 저장 전에 보여준다 — 잘못 알아들었으면 "그냥 글자로" (2026-11-03 읽기 쉬운 말로) */}
        {parsedMany && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 8 }}>
            <div style={{ flex: 1, minWidth: 0, background: 'rgba(108,142,255,.1)', border: '1px solid rgba(108,142,255,.3)', borderRadius: 10, padding: '7px 10px' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#5B7CFA', marginBottom: 2 }}>📋 {parsedMany.length}개가 들어가요</div>
              {parsedMany.map((p, i) => (
                <div key={i} style={{ fontSize: 14, color: 'var(--dm-text)', lineHeight: 1.45, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                  {p.recurring ? '🔁' : '📅'} <b style={{ color: '#5B7CFA' }}>{friendlySchedule(p, targetDs, recurringLabel) || '이 날'}</b> · {p.title}
                </div>
              ))}
            </div>
            <button onClick={() => setNlOff(true)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--dm-border)', background: 'var(--dm-input)', color: 'var(--dm-muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>그냥 글자로</button>
          </div>
        )}
        {parsedTask && !parsedMany && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <div style={{ flex: 1, minWidth: 0, background: 'rgba(108,142,255,.1)', border: '1px solid rgba(108,142,255,.3)', borderRadius: 10, padding: '7px 10px' }}>
              <div style={{ fontSize: 14, color: 'var(--dm-text)', lineHeight: 1.45, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                {parsedTask.recurring ? '🔁' : '📅'} <b style={{ color: '#5B7CFA' }}>{friendlySchedule(parsedTask, targetDs, recurringLabel) || describeSchedule(parsedTask, recurringLabel)}</b> · {parsedTask.title}
              </div>
              {(parsedTask.recurring || (parsedTask.date && parsedTask.date !== targetDs)) && (
                <div style={{ fontSize: 12, color: 'var(--dm-sub)', marginTop: 2 }}>{parsedTask.recurring ? '→ 반복 할일로 등록돼요' : '→ 그날 할일로 들어가요'}</div>
              )}
            </div>
            <button onClick={() => setNlOff(true)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--dm-border)', background: 'var(--dm-input)', color: 'var(--dm-muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>그냥 글자로</button>
          </div>
        )}
      </div>
      )}
      </SectionBox>

      {!dashboard && sectionOrder.map(id => <Fragment key={id}>{todaySections[id]}</Fragment>)}

      <div style={{ height: 12 }} />
    </div>
  );
}
