// 오늘 탭 날씨 (2026-11-05) — 예보는 서버(api/market.js type=weather)가 주고, 여기는 저장·조언 문구만 맡는다.
// 조언은 외부 AI 없이 규칙으로 만든다.
import { store } from "./storage.js";

const CACHE_KEY = "dm_weather_cache";
const CACHE_MS = 60 * 60 * 1000; // 1시간
export const DEFAULT_CITY = "서울";

export const weatherToday = (wx, dateStr) => (wx?.days || []).find((d) => d.date === dateStr) || null;

// 오늘 줄: 비 확률은 남은 시간 기준, 하늘 상태는 지금 날씨 (지나간 비 때문에 맑은 오후에 우산 안내가 뜨지 않게)
export function weatherTodayView(wx, dateStr) {
  const today = weatherToday(wx, dateStr);
  if (!today) return null;
  if (wx.days[0]?.date !== dateStr) return today;
  return { ...today, rain: wx.rainLeft ?? today.rain, desc: wx.desc ?? today.desc, icon: wx.icon ?? today.icon };
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
export function weatherDayLabel(date, todayStr) {
  if (date === todayStr) return "오늘";
  const [y, m, d] = date.split("-").map(Number);
  const [ty, tm, td] = todayStr.split("-").map(Number);
  if (Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000) === 1) return "내일";
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

// 미세먼지 등급 — 환경부 기준(㎍/㎥). PM10·PM2.5 중 나쁜 쪽을 쓴다. Open-Meteo 예측값이라 참고용.
const AIR_GRADES = [
  { label: "좋음", color: "#5B7CFA", pm10: 30, pm25: 15 },
  { label: "보통", color: "#16A34A", pm10: 80, pm25: 35 },
  { label: "나쁨", color: "#F97316", pm10: 150, pm25: 75 },
  { label: "매우 나쁨", color: "#EF4444", pm10: Infinity, pm25: Infinity },
];
export function airGrade(air) {
  if (!air || air.pm10 == null || air.pm25 == null) return null;
  const at = (key, v) => AIR_GRADES.findIndex((g) => v <= g[key]);
  const i = Math.max(at("pm10", air.pm10), at("pm25", air.pm25));
  return { ...AIR_GRADES[i], bad: i >= 2 };
}

const isSnow = (code) => [71, 73, 75, 77, 85, 86].includes(code);
const isThunder = (code) => [95, 96, 99].includes(code);

export function weatherAdvice(day, air = null) {
  if (!day) return "";
  const rain = day.rain ?? 0;
  const stillComing = day.rain == null || day.rain >= 30; // 이미 지나간 눈·천둥은 안내하지 않는다
  if (isThunder(day.code) && stillComing) return "천둥·번개 소식이 있어요. 외출 때 조심하세요";
  if (isSnow(day.code) && stillComing) return "눈 소식이 있어요. 길 미끄러움 조심하세요";
  if (rain >= 60) return "비 올 가능성이 높아요. 우산 챙기세요";
  if (rain >= 30) return "비가 올 수도 있어요. 작은 우산이 있으면 좋아요";
  if (airGrade(air)?.bad) return "마스크 챙기세요";
  if (day.max >= 30) return "더운 날이에요. 물 자주 드세요";
  if (day.min <= -5) return "많이 추워요. 따뜻하게 입으세요";
  if (day.max - day.min >= 12) return "일교차가 커요. 겉옷 챙기세요";
  if (day.max >= 15 && day.max <= 26) return "나들이하기 좋은 날씨예요";
  return "";
}

const readCache = (city) => {
  const c = store.get(CACHE_KEY, null);
  return c && c.city === city ? c : null;
};

// 저장해 둔 예보가 1시간 안이고 오늘 것이 들어 있으면 서버에 묻지 않는다.
export async function loadWeather(city, dateStr, { force = false } = {}) {
  const name = (city || "").trim() || DEFAULT_CITY;
  const cached = readCache(name);
  const usable = cached && weatherToday(cached.data, dateStr);
  if (!force && usable && Date.now() - cached.at < CACHE_MS) return { status: "ok", data: cached.data };
  try {
    const r = await fetch(`/api/market?type=weather&city=${encodeURIComponent(name)}`);
    const j = r.ok ? await r.json() : null;
    if (j?.ok && j.days?.length) {
      store.set(CACHE_KEY, { city: name, at: Date.now(), data: j });
      return { status: "ok", data: j };
    }
    // 서버가 "못 찾음"이라고 답한 것 — 인터넷 문제와 구분해서 도시를 고칠 수 있게 한다
    if (j && !j.ok) return usable ? { status: "ok", data: cached.data } : { status: "notfound" };
  } catch { /* 인터넷 없음 — 아래에서 저장해 둔 예보를 쓴다 */ }
  return usable ? { status: "ok", data: cached.data } : { status: "offline" };
}
