// 아침 잠금화면 알림 문구 (2026-11-06) — api/push-morning.js가 서버에서 부른다. 브라우저 기능을 쓰지 않는다.
// 한 통으로 끝나게: 날씨·우산 → 첫 일정 → 남은 할일. 날씨를 못 받으면 그 줄만 빠진다.
const SHOW_TITLES = 3;

export function morningWeatherLine(wx, dateStr) {
  const today = (wx?.days || []).find((d) => d.date === dateStr);
  if (!today) return "";
  const rain = wx.rainLeft ?? today.rain;
  const parts = [`${wx.icon || today.icon || "🌡️"} ${wx.city ? `${wx.city} ` : ""}${today.min}~${today.max}°`];
  if (rain != null) parts.push(`비 ${rain}%`);
  if (rain >= 60) parts.push("우산 챙기세요");
  else if (rain >= 30) parts.push("작은 우산이 있으면 좋아요");
  return parts.join(" · ");
}

export function buildMorningPush({ tasks = [], wx = null, dateStr, dateLabel }) {
  const real = tasks.filter((t) => t?.title?.trim());
  const left = real.filter((t) => !t.done);
  const first = left.filter((t) => t.time).sort((a, b) => a.time.localeCompare(b.time))[0];
  const lines = [morningWeatherLine(wx, dateStr)];
  if (first) lines.push(`⏰ 첫 일정 ${first.time} ${first.title}`);
  if (!real.length) lines.push("오늘 할일을 아직 정하지 않았어요 📝");
  else if (!left.length) lines.push("오늘 할일을 모두 끝냈어요 🎉");
  else {
    const titles = left.filter((t) => t !== first).slice(0, SHOW_TITLES).map((t) => t.title);
    const others = left.length - (first ? 1 : 0) - titles.length;
    if (titles.length) lines.push(`⬜ ${titles.join(", ")}${others > 0 ? ` 외 ${others}개` : ""}`);
  }
  return {
    title: real.length ? `☀️ ${dateLabel} · 할일 ${left.length}개 남음` : `☀️ 좋은 아침! ${dateLabel}`,
    body: lines.filter(Boolean).join("\n"),
  };
}
