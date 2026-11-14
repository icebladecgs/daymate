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

// ── 오답 노트 업그레이드 (2026-11-14, 콴다 참고 — AI 없이) ──
// 문제 부분만 보이기: 사진 파일은 그대로 두고 보여 줄 칸만 저장한다 photo.crop = { x, y, w, h, ar }
// x·y·w·h는 원본 대비 비율(0~1), ar = 잘린 칸의 가로÷세로(화면·출력에서 칸 모양을 먼저 잡기 위해)
export function normalizeCrop(c) {
  if (!c) return null;
  const cl = (v) => Math.min(1, Math.max(0, Number(v) || 0));
  const x = cl(c.x), y = cl(c.y);
  const w = Math.min(cl(c.w), 1 - x), h = Math.min(cl(c.h), 1 - y);
  if (w < 0.05 || h < 0.05) return null; // 너무 작으면 자르지 않음
  if (x < 0.01 && y < 0.01 && w > 0.98 && h > 0.98) return null; // 거의 전체면 자르지 않음
  const ar = Number(c.ar) > 0 ? Number(c.ar) : null;
  if (!ar) return null;
  const r = (v) => Math.round(v * 10000) / 10000;
  return { x: r(x), y: r(y), w: r(w), h: r(h), ar: r(ar) };
}
// 잘린 칸 그리기: 칸은 aspect-ratio = ar, 사진은 칸 폭의 1/w배, 왼쪽·위로 밀어 둔다(%, 칸 기준)
export function cropLayout(crop) {
  const c = normalizeCrop(crop);
  if (!c) return null;
  return { ar: c.ar, width: 100 / c.w, left: -(c.x / c.w) * 100, top: -(c.y / c.h) * 100 };
}

// 시험처럼 다시 풀기 결과 [{ id, ok }] → 요약
export function sessionSummary(results, notesAfter = []) {
  const done = (results || []).filter(r => r && typeof r.ok === 'boolean');
  const ok = done.filter(r => r.ok).length;
  const ids = new Set(done.map(r => r.id));
  return {
    total: done.length, ok, wrong: done.length - ok,
    rate: done.length ? Math.round((ok / done.length) * 100) : 0,
    graduated: (notesAfter || []).filter(n => ids.has(n.id) && n.done).length,
  };
}

// 통계: 과목별 졸업률 · 최근 7일 다시 푼 수 · 틀린 이유 · 자주 틀리는 단원
export function wrongStats(notes, todayDs, subjects = EXAM_SUBJECTS) {
  const list = (notes || []).filter(Boolean);
  const weekFrom = addDays(todayDs, -6);
  const bySubMap = {};
  const reasons = {};
  const units = {};
  let weekCount = 0, weekOk = 0;
  for (const n of list) {
    const sub = n.sub || '기타';
    const s = bySubMap[sub] || (bySubMap[sub] = { sub, total: 0, done: 0, due: 0 });
    s.total++;
    if (n.done) s.done++;
    if (isDue(n, todayDs)) s.due++;
    if (n.reason) reasons[n.reason] = (reasons[n.reason] || 0) + 1;
    if (n.unit) { const k = `${sub} · ${n.unit}`; units[k] = (units[k] || 0) + 1; }
    for (const r of n.reviews || []) if (r && r.ds >= weekFrom && r.ds <= todayDs) { weekCount++; if (r.ok) weekOk++; }
  }
  const order = [...subjects, ...Object.keys(bySubMap).filter(k => !subjects.includes(k))];
  const bySub = order.filter(k => bySubMap[k]).map(k => ({ ...bySubMap[k], rate: Math.round((bySubMap[k].done / bySubMap[k].total) * 100) }));
  const done = list.filter(n => n.done).length;
  return {
    total: list.length, done, active: list.length - done,
    rate: list.length ? Math.round((done / list.length) * 100) : 0,
    due: list.filter(n => isDue(n, todayDs)).length,
    week: { count: weekCount, ok: weekOk, rate: weekCount ? Math.round((weekOk / weekCount) * 100) : 0 },
    bySub,
    reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]),
    units: Object.entries(units).filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
}
