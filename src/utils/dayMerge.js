// 날짜 기록 병합·메모 휴지통 처리 — App.jsx에서 옮김(동작 동일). 기록이 사라지지 않는지 scripts/data-test.mjs가 검증한다

import { withMemoList } from "../components/MemoTimeline.jsx";

// 메모가 새로 생기거나 글·사진·파일이 바뀌면 수정 시각을 남긴다 (메모 관리자의 "수정일").
// 또 메모가 목록에서 사라지면(어느 화면에서 지웠든) 날짜 기록의 memoTrash(휴지통)로 옮기고, 30일 지난 것은 비운다.
// 모든 날짜 저장이 여기(setDayData/setTodayData)를 거치므로 삭제 화면마다 따로 처리하지 않아도 된다.
const MEMO_TRASH_DAYS = 30;
export function stampMemoUpdates(prevDay, nextDay) {
  const nextMemos = nextDay?.memos;
  if (!Array.isArray(nextMemos) || nextMemos === prevDay?.memos) return nextDay;
  const prevMap = new Map((prevDay?.memos || []).map(m => [m.id, m]));
  const now = new Date().toISOString();
  let changed = false;
  const memos = nextMemos.map(m => {
    const p = prevMap.get(m.id);
    if (p && p.text === m.text && p.photos === m.photos && p.files === m.files && p.locked === m.locked) return m;
    if (!p && m.updatedAt) return m; // 새로 넣는 메모에 이미 시각이 있으면 그대로 (휴지통에서 되살리기 등)
    changed = true;
    return { ...m, updatedAt: now };
  });
  const nextIds = new Set(nextMemos.map(m => m.id));
  const removed = (prevDay?.memos || []).filter(m => !nextIds.has(m.id) && (m.text?.trim() || m.photos?.length || m.files?.length || m.locked));
  const cutoff = Date.now() - MEMO_TRASH_DAYS * 86400000;
  const oldTrash = nextDay.memoTrash || [];
  const trash = [...oldTrash, ...removed.map(m => ({ ...m, deletedAt: now }))].filter(t => Date.parse(t.deletedAt) > cutoff);
  const trashChanged = removed.length > 0 || trash.length !== oldTrash.length;
  if (!changed && !trashChanged) return nextDay;
  return { ...nextDay, ...(changed ? { memos } : {}), ...(trashChanged ? { memoTrash: trash } : {}) };
}

// 서버에 못 올린 변경이 있는 날짜: 할일은 mergeImportedGcalTasks(localWins)로 합치고, 나머지(메모·일기·습관 체크 등)도
// 이 기기 내용을 우선한다. 메모는 같은 id면 이 기기 것, 서버에만 있는 메모(그 사이 다른 기기에서 쓴 것)는 뒤에 붙인다.
// 예전엔 할일만 지켜서, 데스크탑 간편 메모를 만든 직후 서버 내용을 받으면 새 메모가 사라졌다(2026-09-25).
export function keepUnsyncedLocal(mergedDay, localDay) {
  if (!localDay) return mergedDay;
  const localMemos = Array.isArray(localDay.memos) ? localDay.memos : [];
  const localIds = new Set(localMemos.map(m => m.id));
  const remoteOnly = (mergedDay?.memos || []).filter(m => !localIds.has(m.id));
  return { ...mergedDay, ...localDay, tasks: mergedDay?.tasks || localDay.tasks, memos: [...localMemos, ...remoteOnly] };
}

// 서버 할일에는 없고 이 기기 할일(같은 ID)에만 남은 메모·사진·파일을 되살린다
export function restoreLostTaskDetails(day, localDay) {
  const localMap = new Map((localDay?.tasks || []).map(t => [String(t.id), t]));
  let changed = false;
  const tasks = (day?.tasks || []).map(t => {
    const lt = localMap.get(String(t.id));
    if (!lt) return t;
    const add = {};
    if (!t.note?.trim() && lt.note?.trim()) add.note = lt.note;
    if (!t.photos?.length && lt.photos?.length) add.photos = lt.photos;
    if (!t.files?.length && lt.files?.length) add.files = lt.files;
    if (!Object.keys(add).length) return t;
    changed = true;
    return { ...t, ...add };
  });
  return changed ? { ...day, tasks } : day;
}

export const isImportedGcalTask = (task) => !!(task?.gcalEventId && String(task.id || '').startsWith('gcal_'));

export const dedupeDayTasks = (dayData) => {
  if (!dayData?.tasks?.length) return dayData;
  const seenTaskIds = new Set();
  const seenGcalIds = new Set();
  let changed = false;
  const tasks = [];
  for (const task of dayData.tasks) {
    const taskId = String(task?.id || '');
    const gcalId = task?.gcalEventId || null;
    if (taskId && seenTaskIds.has(taskId)) {
      changed = true;
      continue;
    }
    if (gcalId && seenGcalIds.has(gcalId)) {
      changed = true;
      continue;
    }
    if (taskId) seenTaskIds.add(taskId);
    if (gcalId) seenGcalIds.add(gcalId);
    tasks.push(task);
  }
  return changed ? { ...dayData, tasks } : dayData;
};

export const mergeTasksIntoDay = (dayData, incomingTasks = []) => {
  const normalizedDay = dedupeDayTasks(dayData);
  if (!incomingTasks.length) return normalizedDay;
  const tasks = [...(normalizedDay?.tasks || [])];
  const remaining = [...incomingTasks];
  for (let i = 0; i < tasks.length && remaining.length > 0; i++) {
    if (!tasks[i].title?.trim()) tasks[i] = remaining.shift();
  }
  return dedupeDayTasks({ ...normalizedDay, tasks: [...tasks, ...remaining] });
};

// id가 `t<생성시각ms>...` 또는 `t_<생성시각ms>...`(오늘 탭에서 추가) 형식이고, 아주 최근(5분 이내)에
// 생성된 것으로 보이면 "아직 Firestore에 안 올라간 신규 로컬 태스크"로 간주한다.
// 오래된 로컬 태스크까지 무조건 되살리면 다른 기기에서 지운 태스크가 부활할 수 있어 시간창을 좁게 둔다.
export const isRecentLocalOnlyTask = (task) => {
  const match = String(task?.id || '').match(/^t_?(\d{10,})/);
  if (!match) return false;
  const createdAt = Number(match[1]);
  return Number.isFinite(createdAt) && (Date.now() - createdAt) < 5 * 60 * 1000;
};

// localWins: 같은 ID 태스크를 로컬 버전으로 덮을지 — 이 기기에 서버에 못 올린 변경이 있는 날짜만 true.
// 항상 로컬을 우선하면 다른 기기(PC)에서 입력한 메모·사진이 이 기기의 옛 버전에 가려지고,
// 그 옛 버전이 다시 서버에 저장돼 PC 입력분까지 지워진다 (2026-09-25).
export const mergeImportedGcalTasks = (baseDay, localDay, localWins = true) => {
  const normalizedBaseDay = dedupeDayTasks(baseDay);
  const normalizedLocalDay = dedupeDayTasks(localDay);
  const localTaskMap = new Map(localWins ? (normalizedLocalDay?.tasks || []).map(t => [String(t.id), t]) : []);
  const baseWithLocalOverride = normalizedBaseDay
    ? { ...normalizedBaseDay, tasks: (normalizedBaseDay.tasks || []).map(t => localTaskMap.get(String(t.id)) || t) }
    : normalizedBaseDay;
  // remote(base)에 아직 없는 로컬 전용 태스크: gcal 가져오기 태스크는 항상, 그 외 수동 태스크는
  // 방금 생성된 것만 병합 대상으로 삼는다 (remote에 없는 이유가 "아직 동기화 안 됨"인지
  // "다른 기기에서 삭제됨"인지 구분할 수 없어서, 최근 생성분만 안전하게 살린다)
  const existingIds = new Set((baseWithLocalOverride?.tasks || []).map((task) => String(task.id)));
  const localCandidateTasks = (normalizedLocalDay?.tasks || []).filter((task) =>
    !existingIds.has(String(task.id)) && (isImportedGcalTask(task) || isRecentLocalOnlyTask(task))
  );
  if (!localCandidateTasks.length) return baseWithLocalOverride;
  const existingGcalIds = new Set((baseWithLocalOverride?.tasks || []).map((task) => task.gcalEventId).filter(Boolean));
  // 수동 태스크(gcalEventId 없음)의 제목만 체크 — gcal 태스크끼리는 gcalEventId로만 비교
  const existingManualTitles = new Set(
    (baseWithLocalOverride?.tasks || [])
      .filter((task) => !task.gcalEventId)
      .map((task) => task.title?.trim().toLowerCase())
      .filter(Boolean)
  );
  const missingTasks = localCandidateTasks.filter((task) =>
    task.gcalEventId
      ? !existingGcalIds.has(task.gcalEventId)
      : !existingManualTitles.has(task.title?.trim().toLowerCase())
  );
  if (!missingTasks.length) return baseWithLocalOverride;
  return mergeTasksIntoDay(baseWithLocalOverride, missingTasks);
};

// 휴지통의 메모를 원래 날짜 메모로 되살린다 (메모 관리자 ↩ 되살리기). 수정 시각은 그대로 유지
export function restoreMemoFromTrash(day, id) {
  const t = (day?.memoTrash || []).find(m => m.id === id);
  if (!t) return day;
  const { deletedAt, ...memo } = t; // eslint-disable-line no-unused-vars
  const memos = withMemoList(day);
  return {
    ...day,
    memos: memos.some(m => m.id === memo.id) ? memos : [...memos, memo],
    memoTrash: (day.memoTrash || []).filter(m => m.id !== id),
  };
}
