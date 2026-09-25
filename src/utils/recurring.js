// 반복 할일 규칙 (recurringTasks[].days)
//  "daily"      매일
//  "0"~"6"      매주 해당 요일 (0=일)
//  "nth:N:W"    매월 N번째 W요일 (N=1~4, -1=마지막 주) — 예: "nth:2:2" 매월 둘째 화요일

export const NTH_LABELS = { 1: "첫째", 2: "둘째", 3: "셋째", 4: "넷째", "-1": "마지막" };
export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export function parseNth(days) {
  const m = /^nth:(-1|[1-4]):([0-6])$/.exec(String(days || ""));
  return m ? { n: Number(m[1]), w: Number(m[2]) } : null;
}

// dateStr(YYYY-MM-DD)이 이 반복 규칙에 해당하는지
export function matchesRecurring(days, dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  if (days === "daily") return true;
  const nth = parseNth(days);
  if (nth) {
    if (d.getDay() !== nth.w) return false;
    if (nth.n === -1) {
      const next = new Date(d); next.setDate(d.getDate() + 7);
      return next.getMonth() !== d.getMonth(); // 일주일 뒤가 다음 달이면 마지막 주
    }
    return Math.ceil(d.getDate() / 7) === nth.n;
  }
  return String(days) === String(d.getDay());
}

export function recurringLabel(days) {
  if (days === "daily") return "매일";
  const nth = parseNth(days);
  if (nth) return `매월 ${NTH_LABELS[nth.n]} ${WEEKDAY_LABELS[nth.w]}요일`;
  return `매주 ${WEEKDAY_LABELS[Number(days)] ?? ""}요일`;
}
