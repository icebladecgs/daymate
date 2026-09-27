import { useEffect, useState } from "react";

// 오늘 탭 "지금 할 일" 계산 — 할일에는 시작 시각(time)만 있어서, 끝은 1시간 뒤(다음 시간 할일이 먼저 시작하면 거기까지)
const toMin = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + (m || 0); };

// 지금 할일·다음 할일 계산 (목록의 "지금" 표시에도 쓴다)
export function findNowTask(tasks, nowMin) {
  const timed = (tasks || [])
    .filter(t => t.title?.trim() && /^\d{1,2}:\d{2}$/.test(t.time || ""))
    .map(t => ({ task: t, start: toMin(t.time), endAt: /^\d{1,2}:\d{2}$/.test(t.endTime || "") ? toMin(t.endTime) : null }))
    .sort((a, b) => a.start - b.start);
  let current = null;
  timed.forEach((x, i) => {
    const nextStart = timed.slice(i + 1).find(y => y.start > x.start)?.start;
    // 끝 시간을 넣었으면 그대로, 없으면 최대 1시간(다음 할일이 먼저면 거기까지)
    const end = x.endAt != null && x.endAt > x.start ? x.endAt : Math.min(nextStart ?? Infinity, x.start + 60);
    if (!x.task.done && x.start <= nowMin && nowMin < end) current = { ...x, end };
  });
  const next = timed.find(x => !x.task.done && x.start > nowMin && x.task.id !== current?.task.id) || null;
  return { current, next };
}

export function useNowMinutes() {
  const [now, setNow] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });
  useEffect(() => {
    const tick = () => { const d = new Date(); setNow(d.getHours() * 60 + d.getMinutes()); };
    const t = setInterval(tick, 30000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, []);
  return now;
}
