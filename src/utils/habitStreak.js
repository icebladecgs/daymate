// 습관 연속 일수 (2026-11-07) — 오늘 탭 습관 줄의 🔥n
// 오늘 체크했으면 오늘부터, 아직이면 어제부터 거슬러 올라가며 연속으로 체크한 날을 센다
// (오늘 아직 안 했다고 연속이 끊긴 것으로 보이지 않게). plans[날짜].habitChecks[습관id]를 읽기만 한다.
import { addDays } from "./date.js";

export function habitStreak(plans, habitId, todayDs, todayChecked) {
  let n = 0;
  let ds = todayChecked ? todayDs : addDays(todayDs, -1);
  // 최대 400일까지만 (무한 반복 방지)
  for (let i = 0; i < 400; i++) {
    const checked = ds === todayDs ? todayChecked : !!plans?.[ds]?.habitChecks?.[habitId];
    if (!checked) break;
    n++;
    ds = addDays(ds, -1);
  }
  return n;
}
