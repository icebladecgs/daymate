// 🎒 배틀 장비 · 🧭 떠돌이 도전자 (2026-11-08 사용자 요청 — "레벨이 안 오르면 깰 수가 없어 지루하고 의외성이 부족")
// 레벨 말고도 강해지는 길(장비)과 매일 다른 상대(떠돌이 도전자). 돈·뽑기 결제 없음, 이름·그림은 직접 만든 것.
// 장비는 할일·습관을 끝낼 때 가끔 떨어진다(실제로 해야 강해짐). 계정 설정 battleGear 하나에 저장.
// battleGear = { items: [{id, slot, rarity, name, atk, hp, crit, dodge, def, at}], equipped: {weapon, armor, charm}, rolled: [키], wander: {date, won}, dropsOff }
// 효과는 배틀 엔진(createPlayerFighter)에서만 쓰고, 능력치·레벨은 건드리지 않는다. 계산은 이 파일 한 곳 (test:data).

export const GEAR_SLOTS = [
  { id: 'weapon', label: '무기', emoji: '🗡️' },
  { id: 'armor', label: '갑옷', emoji: '🛡️' },
  { id: 'charm', label: '부적', emoji: '🔮' },
];
// 등급 5단계 (2026-11-09 사용자 요청 — "희귀템은 정말 구하기 어렵게"). 저장 키는 그대로 두고(예전 장비 유지)
// 일반(예전 '보통')과 희귀 사이에 고급(uncommon)을 넣었다. weight = 할일·습관에서 주울 때 확률(합 100)
export const RARITIES = {
  common: { label: '일반', color: '#8E8E93', weight: 55, mult: 1 },
  uncommon: { label: '고급', color: '#30D158', weight: 30, mult: 1.5 },
  rare: { label: '희귀', color: '#0A84FF', weight: 12, mult: 2 },
  epic: { label: '영웅', color: '#BF5AF2', weight: 2.5, mult: 3.2 },
  legend: { label: '전설', color: '#FF9F0A', weight: 0.5, mult: 5 },
};
export const RARITY_ORDER = ['legend', 'epic', 'rare', 'uncommon', 'common'];
const RARITY_UP = ['common', 'uncommon', 'rare', 'epic', 'legend'];
export const DROP_CHANCE = { task: 0.10, habit: 0.05 };
export const DROPS_PER_DAY = 3;
export const BAG_MAX = 40;
export const WANDER_RARITY = { rare: 70, epic: 27, legend: 3 }; // 떠돌이 도전자를 이기면 희귀 이상 (전설 10% → 3%, 2026-11-09)

// 레벨별 상대를 이기면 상대마다 하루 한 번 장비 1개 (2026-11-09) — 저레벨은 일반·고급, 높을수록 좋은 등급.
// 같은 상대를 계속 이겨 전설을 노리지 못하게 하루 한 번, 전설은 최고 레벨대에서도 3%
export const NPC_RARITY = [
  { max: 5, w: { common: 80, uncommon: 20 } },
  { max: 10, w: { common: 50, uncommon: 38, rare: 12 } },
  { max: 15, w: { common: 25, uncommon: 42, rare: 30, epic: 3 } },
  { max: 20, w: { uncommon: 40, rare: 47, epic: 12, legend: 1 } },
  { max: Infinity, w: { rare: 55, epic: 42, legend: 3 } },
];
export const npcRarityWeights = (level) => NPC_RARITY.find((b) => (Number(level) || 1) <= b.max).w;

// 이름은 직접 지은 것 (다른 게임 아이템 이름을 쓰지 않는다)
const NAMES = {
  weapon: {
    common: ['연습용 목검', '녹슨 단검', '나무 몽둥이'], uncommon: ['무쇠 단검', '사냥꾼의 활', '단단한 곤봉'], rare: ['강철 장검', '은빛 창', '쌍날 도끼'],
    epic: ['청룡의 창', '불꽃 대검', '번개 활'], legend: ['새벽을 가르는 검', '천둥 망치'],
  },
  armor: {
    common: ['헌 가죽옷', '두꺼운 천 조끼', '나무 방패'], uncommon: ['질긴 가죽 갑옷', '징 박은 조끼', '둥근 철방패'], rare: ['사슬 갑옷', '강철 흉갑', '바람막이 망토'],
    epic: ['용비늘 갑옷', '달빛 망토', '얼음 방패'], legend: ['불사조 갑옷', '별의 갑주'],
  },
  charm: {
    common: ['네잎클로버', '행운 동전', '조약돌 목걸이'], uncommon: ['참새 깃털', '은방울', '매듭 팔찌'], rare: ['수호 부적', '바람 깃털', '부엉이 배지'],
    epic: ['여우 구슬', '달의 눈물', '호랑이 발톱'], legend: ['시간의 모래시계', '용의 심장'],
  },
};
const CHARM_KINDS = ['crit', 'dodge', 'def'];

const pick = (arr, r) => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];
const round3 = (v) => Math.round(v * 1000) / 1000;
export function rollRarity(r, weights = Object.fromEntries(Object.entries(RARITIES).map(([k, v]) => [k, v.weight]))) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let x = r * total;
  for (const k of RARITY_UP) {
    if (!weights[k]) continue;
    if (x < weights[k]) return k;
    x -= weights[k];
  }
  return 'common';
}

// 장비 하나 만들기 — rand는 0~1 난수 함수 (테스트에서 고정)
export function makeItem(rarity, rand = Math.random, slot = null) {
  const s = slot || pick(['weapon', 'armor', 'charm'], rand());
  const m = RARITIES[rarity].mult * (0.85 + rand() * 0.3); // 같은 등급도 조금씩 다르게
  const item = { id: `g${Date.now().toString(36)}${Math.floor(rand() * 1e6).toString(36)}`, slot: s, rarity, name: pick(NAMES[s][rarity], rand()), at: '' };
  if (s === 'weapon') item.atk = round3(0.08 * m);
  if (s === 'armor') item.hp = round3(0.10 * m);
  if (s === 'charm') item[pick(CHARM_KINDS, rand())] = round3(0.025 * m);
  // 전설은 효과 하나 더 (크리·회피·방어 +2%p)
  if (rarity === 'legend') { const k = pick(CHARM_KINDS, rand()); item[k] = round3((item[k] || 0) + 0.02); }
  return item;
}

const pct = (v) => `${Math.round(v * 1000) / 10}%`;
export function itemEffects(it) {
  return [
    it.atk && `공격력 +${pct(it.atk)}`, it.hp && `에너지 +${pct(it.hp)}`,
    it.crit && `크리티컬 +${pct(it.crit)}p`, it.dodge && `회피 +${pct(it.dodge)}p`, it.def && `받는 피해 -${pct(it.def)}`,
  ].filter(Boolean);
}

export function normalizeGear(g) {
  const items = (Array.isArray(g?.items) ? g.items : []).filter((x) => x?.id && RARITIES[x.rarity] && GEAR_SLOTS.some((s) => s.id === x.slot)).slice(0, BAG_MAX);
  const ids = new Set(items.map((x) => x.id));
  const eq = g?.equipped || {};
  const equipped = Object.fromEntries(GEAR_SLOTS.map((s) => [s.id, ids.has(eq[s.id]) && items.find((x) => x.id === eq[s.id]).slot === s.id ? eq[s.id] : null]));
  return {
    items, equipped,
    rolled: (Array.isArray(g?.rolled) ? g.rolled : []).slice(-300),
    wander: g?.wander?.date ? { date: String(g.wander.date), won: !!g.wander.won } : null,
    // 레벨별 상대 보상을 받은 날·상대 (하루 한 번씩) — 날이 바뀌면 비운다
    npcDrops: g?.npcDrops?.date ? { date: String(g.npcDrops.date), ids: (Array.isArray(g.npcDrops.ids) ? g.npcDrops.ids : []).map(String).slice(0, 50) } : null,
    dropsOff: !!g?.dropsOff,
  };
}

// 끼운 장비 효과 합계 (엔진에 넘김)
export function gearBonus(gear) {
  const g = normalizeGear(gear);
  const b = { atk: 0, hp: 0, crit: 0, dodge: 0, def: 0 };
  for (const id of Object.values(g.equipped)) {
    const it = g.items.find((x) => x.id === id);
    if (it) for (const k of Object.keys(b)) b[k] += Number(it[k]) || 0;
  }
  return b;
}

// 할일·습관을 끝냈을 때 — 같은 키는 한 번만 굴린다(체크를 풀었다 다시 해도). 결과: { gear, item|null, full }
export function rollDrop(gear, key, source, todayStr, rand = Math.random) {
  const g = normalizeGear(gear);
  if (g.dropsOff || g.rolled.includes(key)) return { gear: g, item: null };
  const next = { ...g, rolled: [...g.rolled, key].slice(-300) };
  const todayCount = g.items.filter((x) => x.at === todayStr).length;
  if (todayCount >= DROPS_PER_DAY || rand() >= (DROP_CHANCE[source] || 0)) return { gear: next, item: null };
  if (g.items.length >= BAG_MAX) return { gear: next, item: null, full: true };
  const item = { ...makeItem(rollRarity(rand()), rand), at: todayStr };
  return { gear: { ...next, items: [...next.items, item] }, item };
}

// 떠돌이 도전자 보상 — 하루 한 번
export function wanderReward(gear, todayStr, rand = Math.random) {
  const g = normalizeGear(gear);
  if (g.wander?.date === todayStr && g.wander.won) return { gear: g, item: null };
  const won = { ...g, wander: { date: todayStr, won: true } };
  if (g.items.length >= BAG_MAX) return { gear: won, item: null, full: true };
  const item = { ...makeItem(rollRarity(rand(), WANDER_RARITY), rand), at: todayStr };
  return { gear: { ...won, items: [...won.items, item] }, item };
}

// 레벨별 상대를 이겼을 때 — 상대마다 하루 한 번. 결과: { gear, item|null, full }
export const npcRewardDone = (gear, npcId, todayStr) => {
  const d = normalizeGear(gear).npcDrops;
  return !!d && d.date === todayStr && d.ids.includes(String(npcId));
};
export function npcReward(gear, npc, todayStr, rand = Math.random) {
  const g = normalizeGear(gear);
  if (!npc?.id || npcRewardDone(g, npc.id, todayStr)) return { gear: g, item: null };
  // 가방이 차면 받은 것으로 치지 않는다 — 정리하고 다시 이기면 받는다
  if (g.items.length >= BAG_MAX) return { gear: g, item: null, full: true };
  const prevIds = g.npcDrops?.date === todayStr ? g.npcDrops.ids : [];
  const marked = { ...g, npcDrops: { date: todayStr, ids: [...prevIds, String(npc.id)] } };
  const item = { ...makeItem(rollRarity(rand(), npcRarityWeights(npc.level)), rand), at: todayStr };
  return { gear: { ...marked, items: [...marked.items, item] }, item };
}

// ── 떠돌이 도전자: 날짜로 정해지는 상대 (같은 날은 같은 상대, 기기가 달라도 같음) ──
function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function seededRand(seed) {
  let a = hash(seed);
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const WANDER_PREFIX = ['떠돌이', '이름 없는', '길 잃은', '수상한', '졸린', '배고픈', '전설을 꿈꾸는'];
const WANDER_JOB = [
  { name: '검객', emoji: '🥷', move: '일섬' }, { name: '궁수', emoji: '🏹', move: '연속 사격' }, { name: '도적', emoji: '🦹', move: '기습' },
  { name: '수도승', emoji: '🧘', move: '장풍' }, { name: '상인', emoji: '🧳', move: '주판 던지기' }, { name: '기사', emoji: '🐴', move: '돌격' },
  { name: '점술가', emoji: '🔮', move: '운명의 카드' }, { name: '요리사', emoji: '🍳', move: '프라이팬 강타' },
];
const WANDER_TRAITS = [
  { id: 'w_sharp', label: '날카로운 칼끝', desc: '크리티컬 +8%p', critFlatBonus: 0.08 },
  { id: 'w_wind', label: '바람걸음', desc: '회피 +7%p', dodgeFlatBonus: 0.07 },
  { id: 'w_wall', label: '철벽', desc: '받는 피해 8% 경감', defenseFlatBonus: 0.08 },
  { id: 'w_rage', label: '광전사', desc: '기본공격 데미지 +20%', basicAttackDamageMult: 1.2 },
  { id: 'sanheunsamil', label: '작심삼일', desc: '4턴째부터 전 능력치 20% 하락' },
];
// player: createPlayerFighter 결과(장비 포함). 에너지는 내 힘의 90~115%, 능력치는 내 능력치 근처에 하나가 특히 높다
export function makeWanderer(dateStr, seed, player) {
  const r = seededRand(`${dateStr}|${seed}`);
  const job = pick(WANDER_JOB, r());
  const name = `${pick(WANDER_PREFIX, r())} ${job.name}`;
  const ids = ['STR', 'INT', 'WEALTH', 'REL', 'ACHIEVE', 'LIFE'];
  const strong = pick(ids, r());
  const stats = Object.fromEntries(ids.map((id) => {
    const base = Number(player?.stats?.[id]) || 0;
    const v = Math.round(base * (0.6 + r() * 0.8)) + (id === strong ? 15 + Math.round(r() * 15) : 0);
    return [id, Math.max(0, Math.min(100, v))];
  }));
  return {
    id: `wander_${dateStr}`, isWanderer: true, level: player?.level || 1, name, emoji: job.emoji, basicMove: job.move,
    energyMax: Math.max(150, Math.round((player?.energyMax || 150) * (0.8 + r() * 0.25))),
    stats, trait: pick(WANDER_TRAITS, r()),
  };
}
