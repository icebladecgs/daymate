// 🗺️ 영토 (2026-11-09 사용자 확정 — CLAUDE.md "영토 확장 계획")
// 읍·면·동마다 지킴이가 있고, 그 구역에 실제로 있어야 도전할 수 있다. 이기면 내 영토가 되고
// 차지할 때의 내 능력치가 그 땅의 지킴이로 남는다(나중에 성장해도 그대로).
// 이 파일은 화면·서버가 같이 쓰는 계산만 둔다(브라우저·Firebase 기능 없음). 승패는 서버가 runAutoBattle로 낸다.
import { NPCS } from "../data/battle/npcs.js";
import { createNpcFighter, createBattleState, resolveRoundFirstTurn, resolveRoundSecondTurn, pickAutoAction } from "../data/battle/engine.js";

export const TRIES_PER_DAY = 3; // 같은 땅 하루 도전 횟수
export const MAX_ROUNDS = 60;

// 구역 등급 — 이름만으로 정한다(행정구역 이름 끝·시도)
export const TIERS = {
  myeon: { label: "면", range: [1, 5] },
  eup: { label: "읍", range: [4, 9] },
  city: { label: "시 동", range: [7, 12] },
  metro: { label: "광역시 동", range: [10, 15] },
  seoul: { label: "서울·세종 동", range: [13, 18] },
  center: { label: "중심지", range: [19, 21] },
};
// 사람이 많이 모이는 중심지 — 지킴이가 가장 강하다 (전체 이름으로 찾음)
export const CENTERS = new Set([
  "서울특별시 종로구 종로1·2·3·4가동", "서울특별시 중구 명동", "서울특별시 강남구 역삼1동", "서울특별시 마포구 서교동",
  "서울특별시 영등포구 여의동", "서울특별시 송파구 잠실3동", "부산광역시 해운대구 우1동", "부산광역시 중구 남포동",
  "부산광역시 부산진구 부전2동", "대구광역시 중구 성내1동", "전남광주통합특별시 동구 충장동", "대전광역시 중구 은행선화동",
  "경기도 수원시팔달구 행궁동", "제주특별자치도 제주시 일도1동", "인천광역시 부평구 삼산1동",
]);

export function regionTier(fullName) {
  const name = String(fullName || "");
  if (CENTERS.has(name)) return "center";
  const parts = name.split(" ");
  const sido = parts[0] || "", last = parts[parts.length - 1] || "";
  if (last.endsWith("면")) return "myeon";
  if (last.endsWith("읍")) return "eup";
  if (sido === "서울특별시" || sido === "세종특별자치시") return "seoul";
  if (sido.endsWith("광역시") || sido.endsWith("특별시")) return "metro"; // 전남광주통합특별시 포함
  return "city";
}
export const shortName = (fullName) => { const p = String(fullName || "").split(" "); return p[p.length - 1] || ""; };

function hash(str) { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// 기본 지킴이 레벨 — 구역 코드로 고정 (같은 동은 언제 누가 가도 같은 지킴이)
export function keeperLevel(code, fullName) {
  const [lo, hi] = TIERS[regionTier(fullName)].range;
  return lo + (hash(`lv|${code}`) % (hi - lo + 1));
}
// 하루 명성 — 땅 레벨이 높을수록 (Lv1~4 +1 … Lv20~21 +5)
export const fameRate = (level) => 1 + Math.floor((Number(level) || 1) / 5);

// 이름은 직접 지은 것 (다른 게임 이름을 쓰지 않는다)
const TITLES = {
  myeon: ["산지기", "촌장", "이장님", "논두렁 장수", "고개 수문장"],
  eup: ["장터 대장", "수문장", "읍내 호랑이", "다리목 파수꾼"],
  city: ["골목대장", "파수꾼", "터줏대감", "동네 수호자"],
  metro: ["골목대장", "터줏대감", "번화가 수문장", "밤거리 파수꾼"],
  seoul: ["터줏대감", "빌딩숲 수문장", "골목 대장군", "도심 파수꾼"],
  center: ["수호신", "대장군", "천하무적 영주"],
};
const EMOJIS = { myeon: "🧑‍🌾", eup: "🧔", city: "🧢", metro: "🕶️", seoul: "🦸", center: "🐉" };

// 그 레벨의 NPC (같은 레벨이 둘이면 앞의 것) — 능력치·에너지·개성을 그대로 쓴다
const npcAtLevel = (lv) => NPCS.filter((n) => n.level <= lv).sort((a, b) => b.level - a.level)[0] || NPCS[0];

// 기본 지킴이 (아무도 차지하지 않은 땅)
export function keeperDef(code, fullName) {
  const tier = regionTier(fullName);
  const level = keeperLevel(code, fullName);
  const base = npcAtLevel(level);
  const titles = TITLES[tier];
  return {
    id: `keeper_${code}`, isKeeper: true, level, tier,
    name: `${shortName(fullName)} ${titles[hash(`nm|${code}`) % titles.length]}`,
    emoji: EMOJIS[tier], energyMax: base.energyMax, stats: { ...base.stats }, trait: base.trait || null,
  };
}

// 차지할 때 남기는 내 모습 — 플레이어 파이터(장비 포함)에서 숫자만
export function snapshotOf(fighter, nickname) {
  const t = fighter.trait || {};
  return {
    name: String(nickname || "").slice(0, 10) || "이름 없는 영주",
    level: fighter.level, energyMax: fighter.energyMax, stats: { ...fighter.stats },
    gear: { atk: Math.max(0, (fighter.gearDamageMult || 1) - 1), crit: t.critFlatBonus || 0, dodge: t.dodgeFlatBonus || 0, def: t.defenseFlatBonus || 0 },
  };
}
// 다른 사람이 차지한 땅의 지킴이 = 그 사람이 차지할 때의 모습
export function ownerDef(code, snap) {
  const g = snap?.gear || {};
  const hasTrait = g.crit || g.dodge || g.def;
  return {
    id: `owner_${code}`, isOwner: true, level: snap.level, name: snap.name, emoji: "🛡️",
    energyMax: snap.energyMax, stats: { ...snap.stats },
    trait: hasTrait ? { id: "gear", label: "장비", critFlatBonus: g.crit || 0, dodgeFlatBonus: g.dodge || 0, defenseFlatBonus: g.def || 0 } : null,
    gearAtk: g.atk || 0,
  };
}

// 서버가 끝까지 자동으로 싸운다 (한 턴씩 고를 수 없음 — 사용자 동의 2026-11-09). 결과: { won, rounds, log }
export function runAutoBattle(playerFighter, defDef) {
  const npc = createNpcFighter(defDef);
  if (defDef.gearAtk) npc.gearDamageMult = 1 + defDef.gearAtk;
  let state = createBattleState(playerFighter, npc);
  while (state.status === "ongoing" && state.round <= MAX_ROUNDS) {
    const action = pickAutoAction(state.player, state.npc);
    state = resolveRoundFirstTurn(state, action);
    if (state.status !== "ongoing") break;
    state = resolveRoundSecondTurn(state, action);
  }
  // 60라운드 안에 안 끝나면 남은 에너지 비율로 (지킴이가 같으면 지킴이 승)
  const won = state.status === "win" || (state.status === "ongoing" && state.player.energy / state.player.energyMax > state.npc.energy / state.npc.energyMax);
  return { won, rounds: Math.min(state.round, MAX_ROUNDS), log: state.log.slice(-160), playerLeft: state.player.energy, npcLeft: state.npc.energy };
}

// 영토 명성 — 지금 가진 땅마다 (하루 명성 × 가진 날수). 잃으면 그 땅 몫도 빠진다(지켜야 유지)
export function territoryFame(list, nowMs = Date.now()) {
  return (list || []).reduce((sum, t) => {
    const at = Number(t.capturedAtMs) || nowMs;
    const days = Math.max(1, Math.floor((nowMs - at) / 86400000) + 1);
    return sum + fameRate(t.level) * days;
  }, 0);
}

// 위치 판정 — 압축한 경계(api/_data/regions.json)에서 점이 들어 있는 구역. 같은 구역의 모든 고리를 짝홀 규칙으로 센다(구멍 포함)
export function decodeRegions(data) {
  return data.f.map((f) => ({
    c: f.c, n: f.n, b: f.b,
    r: f.r.map((ints) => { const out = new Int32Array(ints.length); let x = 0, y = 0; for (let i = 0; i < ints.length; i += 2) { x += ints[i]; y += ints[i + 1]; out[i] = x; out[i + 1] = y; } return out; }),
  }));
}
function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// 남한 범위(대략) — 밖이면 판정하지 않는다
export const inKorea = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat > 32.8 && lat < 38.7 && lng > 124.5 && lng < 132;
export function locateRegion(regions, lat, lng, q = 1e5) {
  if (!inKorea(lat, lng)) return null;
  const x = Math.round(lng * q), y = Math.round(lat * q);
  for (const f of regions) {
    if (x < f.b[0] || x > f.b[2] || y < f.b[1] || y > f.b[3]) continue;
    let inside = false;
    for (const ring of f.r) if (inRing(ring, x, y)) inside = !inside;
    if (inside) return { code: f.c, name: f.n };
  }
  return null;
}
