// 서버 알림 시간표 (2026-11-12, Vercel Pro 전환 — 사용자 승인 "추천대로")
// Hobby 때는 cron이 하루 1번·±59분이라 알림이 정해진 시각에만 갔고, 설정 화면에서 고른 시간(텔레그램 브리핑·할일)은 무시됐다.
// 이제 api/notify-dispatch.js가 5분마다 돌며 "지금이 이 사람이 정한 시간인가"를 여기서 묻고, 하루 한 번만 보낸다.
// 서버·화면(설정 안내)이 같이 쓴다 — 브라우저 기능을 쓰지 않는다.
import { normalizeWorkHours, toMin, wrapFromMin } from "./workHours.js";

export const DUE_WINDOW_MIN = 15; // 정한 시각부터 15분 안(5분마다 도니 실패해도 두 번 더 해 본다)

const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const validTime = (v, fallback) => (toMin(v) != null ? v : fallback);

// 저녁 알림은 하루 마무리와 같은 기준 — 21시, 늦게 퇴근하면 퇴근 1시간 뒤, 일요일은 18시
export const eveningTime = (settings, ds) => fromMin(wrapFromMin(settings?.workHours, ds));
// 텔레그램 아침 인사는 출근 30분 전(기본 09:00 출근 → 08:30, 예전 고정값과 같음)
export const greetingTime = (settings) => fromMin(Math.max(0, toMin(normalizeWorkHours(settings?.workHours).start) - 30));

// id: 보낸 기록 이름, path: 실제로 보내는 기존 함수, time(settings, ds): 'HH:MM' (한국 시각)
export const NOTIFY_JOBS = [
  { id: "pushMorning", path: "/api/push-morning", label: "잠금화면 아침 알림", time: (s) => validTime(s?.alarmTimes?.pushMorning, "07:00") },
  { id: "tgBriefing", path: "/api/notify?type=briefing", label: "텔레그램 자산 브리핑", time: (s) => validTime(s?.telegram?.briefingTime, "07:00") },
  { id: "tgTodo", path: "/api/notify?type=todo", label: "텔레그램 할일 알림", time: (s) => validTime(s?.telegram?.todoTime, "07:05") },
  { id: "tgMorning", path: "/api/notify?type=morning", label: "텔레그램 아침 인사", time: (s) => greetingTime(s) },
  { id: "pushEvening", path: "/api/push-cron", label: "저녁 할일 푸시", time: (s, ds) => eveningTime(s, ds) },
  { id: "smartEvening", path: "/api/smart-notify", label: "텔레그램 저녁 알림", time: (s, ds) => eveningTime(s, ds) },
];

// 한국 날짜·분 (서버는 UTC로 돈다)
export function kstNow(date = new Date()) {
  const k = new Date(date.getTime() + 9 * 3600_000);
  const p = (n) => String(n).padStart(2, "0");
  return { ds: `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())}`, min: k.getUTCHours() * 60 + k.getUTCMinutes() };
}

// 지금 보낼 알림 — 정한 시각 ~ +15분 안이고 오늘 아직 안 보낸 것
export function dueJobs(settings, now, sent = {}) {
  return NOTIFY_JOBS.filter((job) => {
    if (sent[job.id] === now.ds) return false;
    const t = toMin(job.time(settings, now.ds));
    return t != null && now.min >= t && now.min < t + DUE_WINDOW_MIN;
  });
}
