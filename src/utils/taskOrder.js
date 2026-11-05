// 할일·언젠가할일 순서 바꾸기 (2026-11-05, 상세 창의 ▲▼)
// sorted: 새 디자인 오늘 탭처럼 시간순으로 보여 주는 목록 — 끝낸 여부와 시간이 같은 것끼리만 바꿀 수 있다
// (시간 있는 할일은 시간이 정하므로 바꿔도 보이는 순서가 그대로다). 아니면 제목 있는 항목 모두.
const timeKey = (t) => (/^\d{1,2}:\d{2}$/.test(t.time || "") ? t.time : "");
const isPeer = (a, b, sorted) => !sorted || (!!a.done === !!b.done && timeKey(a) === timeKey(b));

function neighbor(list, id, dir, sorted) {
  const at = list.findIndex((t) => t.id === id);
  if (at < 0) return { at, to: -1 };
  for (let i = at + dir; i >= 0 && i < list.length; i += dir) {
    if (list[i].title?.trim() && isPeer(list[at], list[i], sorted)) return { at, to: i };
  }
  return { at, to: -1 };
}

export const canMoveInList = (list, id, dir, sorted = false) => neighbor(list || [], id, dir, sorted).to >= 0;

// dir: -1 위로, 1 아래로. 못 옮기면 받은 목록 그대로
export function moveInList(list, id, dir, sorted = false) {
  const all = list || [];
  const { at, to } = neighbor(all, id, dir, sorted);
  if (to < 0) return all;
  const next = [...all];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}
