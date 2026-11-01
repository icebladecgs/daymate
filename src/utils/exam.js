// 수험생 모드 (2026-11-01) — 시험 D-day · 과목별 공부 시간 · 오답 노트 다시 풀기 계산을 한 곳에.
// 설정은 계정 설정 exam = { on, ddays: [{ id, title, date }], subjects: [과목] } (App.jsx가 동기화)
// 공부 기록은 날짜 기록 day.study = [{ id, sub, min, at, by: 'timer'|'manual', taskId? }]
// 오답은 users/{uid}/wrongNotes/{id} (firebase.js), 다시 풀 날은 아래 WRONG_INTERVALS로 정한다.
import { addDays } from './date.js';

export const EXAM_SUBJECTS = ['국어', '수학', '영어', '탐구1', '탐구2', '기타'];
export const EXAM_DEFAULT = { on: false, ddays: [], subjects: EXAM_SUBJECTS };

// 계정 설정·기기 저장값을 안전한 모양으로 (빈 과목 목록이면 기본 과목)
export function normalizeExam(x) {
  const e = { ...EXAM_DEFAULT, ...(x || {}) };
  return {
    on: !!e.on,
    ddays: Array.isArray(e.ddays) ? e.ddays.filter(d => d && d.title && /^\d{4}-\d{2}-\d{2}$/.test(d.date)) : [],
    subjects: Array.isArray(e.subjects) && e.subjects.filter(Boolean).length ? e.subjects.filter(Boolean) : EXAM_SUBJECTS,
  };
}

// ── D-day ──
const dayNum = (ds) => Math.round(new Date(ds + 'T00:00:00').getTime() / 86400000);
export const daysUntil = (ds, todayDs) => dayNum(ds) - dayNum(todayDs);
export const ddayLabel = (n) => (n === 0 ? 'D-DAY' : n > 0 ? `D-${n}` : `D+${-n}`);
// 오늘 이후(오늘 포함) 시험만 가까운 순
export const upcomingDdays = (ddays, todayDs) => (ddays || [])
  .map(d => ({ ...d, left: daysUntil(d.date, todayDs) }))
  .filter(d => d.left >= 0)
  .sort((a, b) => a.left - b.left);

// ── 공부 시간 ──
export const fmtMin = (m) => {
  const min = Math.max(0, Math.round(m || 0));
  const h = Math.floor(min / 60);
  return h ? `${h}시간${min % 60 ? ` ${min % 60}분` : ''}` : `${min}분`;
};
export const studyOf = (day) => (Array.isArray(day?.study) ? day.study.filter(s => s && s.min > 0) : []);
export const studyTotal = (day) => studyOf(day).reduce((a, s) => a + s.min, 0);
// 과목별 합계 [{ sub, min }] — 과목 목록 순서, 목록에 없는 과목은 뒤에
export function studyBySubject(days, subjects = EXAM_SUBJECTS) {
  const sum = {};
  for (const d of days) for (const s of studyOf(d)) sum[s.sub || '기타'] = (sum[s.sub || '기타'] || 0) + s.min;
  const order = [...subjects, ...Object.keys(sum).filter(k => !subjects.includes(k))];
  return order.filter(k => sum[k] > 0).map(sub => ({ sub, min: sum[sub] }));
}
// 오늘로 끝나는 7일 [{ ds, min }]
export const lastWeekStudy = (plans, todayDs) =>
  Array.from({ length: 7 }, (_, i) => addDays(todayDs, i - 6)).map(ds => ({ ds, min: studyTotal(plans?.[ds]) }));

export const newStudyEntry = (sub, min, by, taskId) => ({
  id: `st_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  sub: sub || '기타', min: Math.max(1, Math.round(min)), at: new Date().toISOString(), by,
  ...(taskId ? { taskId } : {}),
});

// 공부 시간 → 성장 능력치 "지력" — 10분마다 1 XP (코드에 고정, 사용자·운영자가 바꾸지 않음)
export const STUDY_XP_PER_10MIN = 1;
export const studyXp = (min) => Math.floor((min || 0) / 10) * STUDY_XP_PER_10MIN;

// ── 오답 노트 다시 풀기 (간격 반복) ──
// 처음 1일 뒤 → 맞으면 3일 → 7일 → 21일, 4번 연속 맞으면 "졸업". 틀리면 1일부터 다시.
export const WRONG_INTERVALS = [1, 3, 7, 21];
export const WRONG_REASONS = ['계산 실수', '개념 부족', '시간 부족', '문제 잘못 읽음', '기타'];

export const firstDue = (todayDs) => addDays(todayDs, WRONG_INTERVALS[0]);
// 다시 풀어 본 결과로 다음 상태 { step, due, done, reviews }
export function reviewWrongNote(note, correct, todayDs) {
  const reviews = [...(note.reviews || []), { ds: todayDs, ok: !!correct }].slice(-20);
  if (!correct) return { step: 0, due: addDays(todayDs, WRONG_INTERVALS[0]), done: false, reviews };
  const step = (note.step || 0) + 1;
  if (step >= WRONG_INTERVALS.length) return { step, due: null, done: true, reviews };
  return { step, due: addDays(todayDs, WRONG_INTERVALS[step]), done: false, reviews };
}
export const isDue = (note, todayDs) => !note.done && !!note.due && note.due <= todayDs;
