// 🗺️ 영토 — 화면 쪽 공용 (영토 칸·전국 지도). 위치는 누를 때만 한 번 읽고, 서버는 어느 동인지만 찾는다(좌표 저장 안 함).
import { chatFetch } from "../api/chatFetch.js";

export const OK_KEY = "dm_territory_ok"; // 위치 안내에 동의한 기기 (accountSwap DEVICE_KEYS)
export const ATTRIBUTION = "행정동 경계: 통계청 SGIS(공공누리 제1유형) · github.com/vuski/admdongkor (CC BY 4.0)";
export const readOk = () => { try { return localStorage.getItem(OK_KEY) === "1"; } catch { return false; } };
export const markOk = () => { try { localStorage.setItem(OK_KEY, "1"); } catch { /* 이번엔 그대로 */ } };

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("이 기기에서는 위치를 쓸 수 없어요")); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(new Error(e.code === 1 ? "위치 권한이 꺼져 있어요. 브라우저(앱) 설정에서 위치를 허용해 주세요" : "위치를 확인하지 못했어요. 밖이나 창가에서 다시 해 보세요")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}
export async function territoryCall(action, body) {
  const r = await chatFetch(`/api/chat?action=${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "잠시 후 다시 시도해 주세요");
  return j;
}

// 지도용 경계 (public/regions-map.json, 약 40m로 단순화·1e4 정수 차분) → [{ c, n, rings: [[[lat,lng],…],…] }]
let mapCache = null;
export async function loadMapRegions() {
  if (mapCache) return mapCache;
  const res = await fetch("/regions-map.json");
  if (!res.ok) throw new Error("지도 자료를 받지 못했어요");
  const data = await res.json();
  const q = data.q || 1e4;
  mapCache = data.f.map((f) => ({
    c: f.c, n: f.n,
    rings: f.r.map((ints) => { const out = []; let x = 0, y = 0; for (let i = 0; i < ints.length; i += 2) { x += ints[i]; y += ints[i + 1]; out.push([y / q, x / q]); } return out; }),
  }));
  return mapCache;
}

// 사람마다 다른 색 (서버가 준 짧은 키로) — 초록은 내 땅이라 피한다
export function ownerColor(k) {
  let h = 0;
  for (const c of String(k)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  let hue = h % 360;
  if (hue > 90 && hue < 160) hue += 80;
  return `hsl(${hue}, 78%, 52%)`;
}
