// 🎒 배틀 장비 · 🧭 떠돌이 도전자 (2026-11-08 사용자 요청 — "레벨이 안 오르면 깰 수가 없어 지루하고 의외성이 부족")
// 레벨 말고도 강해지는 길(장비)과 매일 다른 상대(떠돌이 도전자). 돈·뽑기 결제 없음, 이름·그림은 직접 만든 것.
// 장비는 할일·습관을 끝낼 때 가끔 떨어진다(실제로 해야 강해짐). 계정 설정 battleGear 하나에 저장.
// battleGear = { items: [{id, slot, rarity, name, atk, hp, crit, dodge, def, at}], equipped: {weapon, armor, charm}, rolled: [키], wander: {date, won}, dropsOff,
//               gold, earned: {date, task, battle}, shop: {date, bought: [칸]} }  (골드·상점 2026-11-10)
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

// 레벨별 상대를 이기면 상대마다 딱 한 번(처음 이겼을 때) 장비 1개 (2026-11-09) — 저레벨은 일반·고급, 높을수록 좋은 등급.
// 같은 상대를 계속 이겨 장비를 모으지 못하게 한 번만(사용자 결정), 전설은 최고 레벨대에서도 3%
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
export function itemEffects(raw) {
  const it = itemStats(raw);
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
    // 레벨별 상대 보상은 상대마다 딱 한 번 (2026-11-09 사용자 결정 — 처음엔 하루 한 번이었다).
    // 받은 상대 id를 영구로 남긴다. 예전 하루 기록(npcDrops)에 있던 상대도 받은 것으로 친다(그 기능은 같은 날 배포돼 그 전 기록은 없음)
    npcClaimed: [...new Set([
      ...(Array.isArray(g?.npcClaimed) ? g.npcClaimed : []),
      ...(Array.isArray(g?.npcDrops?.ids) ? g.npcDrops.ids : []),
    ].map(String))].slice(0, 100),
    dropsOff: !!g?.dropsOff,
    // 🪙 골드·상점 (2026-11-10) — gold: 가진 골드, earned: 오늘 받은 양(상한 확인용), shop: 오늘 상점에서 산 칸
    gold: Math.max(0, Math.floor(Number(g?.gold) || 0)),
    earned: g?.earned?.date ? { date: String(g.earned.date), task: Math.max(0, Number(g.earned.task) || 0), battle: Math.max(0, Number(g.earned.battle) || 0) } : null,
    shop: g?.shop?.date ? { date: String(g.shop.date), bought: (Array.isArray(g.shop.bought) ? g.shop.bought : []).map(Number).filter((i) => i >= 0 && i < SHOP_SIZE) } : null,
    // 📜 주간 퀘스트 (2026-11-10) — quests: 이번 주 받은 칸, weekWins: 이번 주 배틀 승리 수
    quests: g?.quests?.week ? { week: String(g.quests.week), claimed: (Array.isArray(g.quests.claimed) ? g.quests.claimed : []).map(Number).filter((i) => i >= 0 && i < QUEST_COUNT), box: !!g.quests.box } : null,
    weekWins: g?.weekWins?.week ? { week: String(g.weekWins.week), n: Math.max(0, Math.floor(Number(g.weekWins.n) || 0)) } : null,
    // 📖 도감 — 한 번이라도 가져 본 장비 이름(지금 가방에 있는 것 포함, 팔아도 남는다)
    seen: [...new Set([...(Array.isArray(g?.seen) ? g.seen : []), ...items.map((x) => x.name)].map(String))].slice(0, 200),
    // 🏅 칭호 기록 — maxPlus: 가장 높게 강화한 단계, questWeeks: 퀘스트 3개를 다 끝낸 주 수
    stats: { maxPlus: Math.max(0, Math.min(ENHANCE_MAX, Number(g?.stats?.maxPlus) || 0), ...items.map((x) => Number(x.plus) || 0)), questWeeks: Math.max(0, Math.floor(Number(g?.stats?.questWeeks) || 0)) },
    title: typeof g?.title === 'string' ? g.title : '',
  };
}

// 강화한 만큼 커진 장비 효과 (원래 수치는 그대로 두고 보여 줄 때·계산할 때만 곱한다)
const STAT_KEYS = ['atk', 'hp', 'crit', 'dodge', 'def'];
export function itemStats(it) {
  const f = 1 + ENHANCE_STEP * Math.max(0, Math.min(ENHANCE_MAX, Number(it?.plus) || 0));
  const out = {};
  for (const k of STAT_KEYS) if (it?.[k]) out[k] = round3(Number(it[k]) * f);
  return out;
}
export const itemDisplayName = (it) => `${it?.plus ? `+${it.plus} ` : ''}${it?.name || ''}`;

// 끼운 장비 효과 합계 (엔진에 넘김) — 강화·세트 효과 포함
export function gearBonus(gear) {
  const g = normalizeGear(gear);
  const b = { atk: 0, hp: 0, crit: 0, dodge: 0, def: 0 };
  for (const id of Object.values(g.equipped)) {
    const it = g.items.find((x) => x.id === id);
    if (it) { const s = itemStats(it); for (const k of Object.keys(b)) b[k] += s[k] || 0; }
  }
  for (const { set, count } of equippedSets(g)) {
    const add = count >= 3 ? set.bonus3 : count >= 2 ? set.bonus2 : null;
    if (add) for (const k of Object.keys(add)) b[k] += add[k];
  }
  for (const k of Object.keys(b)) b[k] = round3(b[k]);
  return b;
}

// ── ⛓️ 세트 장비 (2026-11-10) — 습관을 7일 이어 할 때마다 세트 조각 1개 (하루 최대 1개).
// 같은 세트를 2개·3개 끼우면 효과가 더 붙는다. 조각 자체는 희귀 등급 수치. 이름은 직접 지은 것
export const SET_STREAK = 7;
export const SETS = [
  { id: 'iron', name: '강철 의지', emoji: '⛓️', pieces: { weapon: '강철 의지의 검', armor: '강철 의지의 흉갑', charm: '강철 의지의 인장' },
    bonus2: { atk: 0.04 }, bonus3: { atk: 0.08, def: 0.03 } },
  { id: 'dawn', name: '새벽 현자', emoji: '🌅', pieces: { weapon: '새벽 현자의 지팡이', armor: '새벽 현자의 로브', charm: '새벽 현자의 수정' },
    bonus2: { crit: 0.03 }, bonus3: { crit: 0.06, hp: 0.05 } },
  { id: 'wind', name: '바람 나그네', emoji: '🍃', pieces: { weapon: '바람 나그네의 단도', armor: '바람 나그네의 외투', charm: '바람 나그네의 방울' },
    bonus2: { dodge: 0.03 }, bonus3: { dodge: 0.05, hp: 0.06 } },
];
export const setById = (id) => SETS.find((s) => s.id === id) || null;
export const setBonusText = (b) => itemEffects(b).join(' · ');
export function equippedSets(gear) {
  const g = normalizeGear(gear);
  const counts = {};
  for (const id of Object.values(g.equipped)) {
    const it = g.items.find((x) => x.id === id);
    if (it?.set && setById(it.set)) counts[it.set] = (counts[it.set] || 0) + 1;
  }
  return Object.entries(counts).map(([id, count]) => ({ set: setById(id), count }));
}
function makeSetItem(setId, slot, rand) {
  const base = makeItem('rare', rand, slot);
  return { ...base, name: setById(setId).pieces[slot], set: setId };
}
// 습관 연속 일수가 7의 배수가 된 날 — 가진 조각이 있는 세트의 빠진 조각부터(완성하기 쉽게). 다 모았으면 아무 조각.
// 같은 날은 한 번만(rolled 'set:날짜'). 결과 { gear, item|null, full }
export function setPieceReward(gear, streak, todayStr, rand = Math.random) {
  const g = normalizeGear(gear);
  if (!streak || streak % SET_STREAK !== 0) return { gear: g, item: null };
  const key = `set:${todayStr}`;
  if (g.rolled.includes(key)) return { gear: g, item: null };
  if (g.items.length >= BAG_MAX) return { gear: g, item: null, full: true }; // 받은 것으로 치지 않는다
  const owned = new Set(g.items.filter((x) => x.set).map((x) => `${x.set}|${x.slot}`));
  const missing = SETS.flatMap((s) => GEAR_SLOTS.map((sl) => ({ set: s.id, slot: sl.id }))).filter((p) => !owned.has(`${p.set}|${p.slot}`));
  const started = missing.filter((p) => GEAR_SLOTS.some((sl) => owned.has(`${p.set}|${sl.id}`)));
  const pool = started.length ? started : missing.length ? missing : SETS.flatMap((s) => GEAR_SLOTS.map((sl) => ({ set: s.id, slot: sl.id })));
  const p = pick(pool, rand());
  const item = { ...makeSetItem(p.set, p.slot, rand), at: todayStr };
  return { gear: { ...g, rolled: [...g.rolled, key].slice(-300), items: [...g.items, item] }, item };
}

// ── 🔨 강화 (2026-11-10) — 골드를 내고 +1씩, 최대 +5. 실패하면 골드만 쓰고 장비는 그대로(깨지지 않는다).
// 한 단계마다 원래 효과의 +10%(+5 = 1.5배). 되돌리기는 없다(되돌리면 실패를 다시 굴릴 수 있어서)
export const ENHANCE_MAX = 5;
export const ENHANCE_STEP = 0.1;
export const ENHANCE_RATE = [1, 0.85, 0.7, 0.55, 0.4];             // +1·+2·+3·+4·+5가 될 확률
export const ENHANCE_COST = { common: 10, uncommon: 25, rare: 60, epic: 150, legend: 300 }; // × (지금 단계 + 1)
export const ENHANCE_REFUND = 0.3; // 강화한 장비를 팔면 쓴 골드의 30%를 더 돌려준다
export function enhanceCost(it) {
  const p = Number(it?.plus) || 0;
  if (!it || p >= ENHANCE_MAX) return null;
  return { gold: (ENHANCE_COST[it.rarity] || 10) * (p + 1), rate: ENHANCE_RATE[p], next: p + 1 };
}
// 결과 { gear, ok, error: 'max'|'gold'|'none', item }
export function enhanceItem(gear, itemId, rand = Math.random) {
  const g = normalizeGear(gear);
  const it = g.items.find((x) => x.id === itemId);
  if (!it) return { gear: g, error: 'none' };
  const c = enhanceCost(it);
  if (!c) return { gear: g, error: 'max' };
  if (g.gold < c.gold) return { gear: g, error: 'gold' };
  const ok = rand() < c.rate;
  const next = { ...it, spent: (Number(it.spent) || 0) + c.gold, ...(ok ? { plus: c.next } : {}) };
  const items = g.items.map((x) => (x.id === itemId ? next : x));
  return { gear: { ...g, gold: g.gold - c.gold, items, stats: { ...g.stats, maxPlus: Math.max(g.stats.maxPlus, Number(next.plus) || 0) } }, ok, item: next, cost: c.gold };
}
export const sellPriceOf = (it) => (SELL_PRICE[it?.rarity] || 0) + Math.floor((Number(it?.spent) || 0) * ENHANCE_REFUND);

// ── 📜 주간 퀘스트 (2026-11-10) — 월요일마다 3개(날짜+계정으로 정해짐). 실제 생활 기록(할일·습관·집중·일기)으로 센다.
// 하나 끝낼 때마다 골드, 3개 다 받으면 장비 상자 1개. 퀘스트 골드는 하루 상한과 따로(주 단위로 이미 정해진 양)
export const QUEST_COUNT = 3;
export const QUEST_GOLD = 80;
export const QUEST_BOX_RARITY = { uncommon: 40, rare: 45, epic: 13, legend: 2 };
const QUEST_POOL = [
  { id: 'tasks', emoji: '✅', targets: [10, 15, 20], label: (n) => `할일 ${n}개 끝내기` },
  { id: 'taskDays', emoji: '📅', targets: [4, 5], label: (n) => `할일을 끝낸 날 ${n}일` },
  { id: 'habits', emoji: '💪', targets: [7, 12, 18], label: (n) => `습관 ${n}번 체크`, needHabits: true },
  { id: 'focus', emoji: '⏱️', targets: [60, 120], label: (n) => `집중 타이머 ${n}분` },
  { id: 'journal', emoji: '📖', targets: [3, 4], label: (n) => `일기 쓴 날 ${n}일` },
  { id: 'wins', emoji: '⚔️', targets: [3, 5], label: (n) => `배틀 ${n}번 이기기` },
];
// 이번 주 월요일 날짜 (YYYY-MM-DD, 일요일은 그 전 월요일)
export function weekOf(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}
const weekDays = (week) => Array.from({ length: 7 }, (_, i) => { const [y, m, d] = week.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10); });
export function weekQuests(week, seed, hasHabits = true) {
  const r = seededRand(`quest|${week}|${seed}`);
  const pool = QUEST_POOL.filter((q) => hasHabits || !q.needHabits).map((q) => [q, r()]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  return pool.slice(0, QUEST_COUNT).map((q) => { const target = pick(q.targets, r()); return { id: q.id, emoji: q.emoji, target, label: q.label(target) }; });
}
// plans: 날짜 기록 { [YYYY-MM-DD]: day } — 이번 주 월~오늘만 센다
export function questProgress(plans, week, todayStr, gear) {
  const days = weekDays(week).filter((ds) => ds <= todayStr);
  const c = { tasks: 0, taskDays: 0, habits: 0, focus: 0, journal: 0, wins: 0 };
  for (const ds of days) {
    const day = plans?.[ds];
    if (!day) continue;
    const done = (day.tasks || []).filter((t) => t?.title?.trim() && t.done).length;
    c.tasks += done;
    if (done) c.taskDays += 1;
    c.habits += Object.values(day.habitChecks || {}).filter(Boolean).length;
    c.focus += (day.tasks || []).reduce((s, t) => s + (Number(t?.focusMin) || 0), 0);
    if (String(day.journal?.body || '').trim() || (day.wins || []).some((w) => String(w || '').trim())) c.journal += 1;
  }
  const g = normalizeGear(gear);
  c.wins = g.weekWins?.week === week ? g.weekWins.n : 0;
  return c;
}
export function addWeekWin(gear, todayStr) {
  const g = normalizeGear(gear);
  const week = weekOf(todayStr);
  return { ...g, weekWins: { week, n: (g.weekWins?.week === week ? g.weekWins.n : 0) + 1 } };
}
export const questClaimed = (gear, week) => { const q = normalizeGear(gear).quests; return q?.week === week ? q.claimed : []; };
export const questBoxClaimed = (gear, week) => { const q = normalizeGear(gear).quests; return q?.week === week && q.box; };
// 결과 { gear, gold } 또는 { gear, error: 'notyet'|'claimed' }
export function claimQuest(gear, week, index, progress, quests) {
  const g = normalizeGear(gear);
  const q = quests[index];
  if (!q || (progress[q.id] || 0) < q.target) return { gear: g, error: 'notyet' };
  const claimed = questClaimed(g, week);
  if (claimed.includes(index)) return { gear: g, error: 'claimed' };
  const nextClaimed = [...claimed, index];
  const allDone = nextClaimed.length >= QUEST_COUNT;
  return { gear: { ...g, gold: g.gold + QUEST_GOLD, quests: { week, claimed: nextClaimed, box: questBoxClaimed(g, week) },
    stats: allDone ? { ...g.stats, questWeeks: g.stats.questWeeks + 1 } : g.stats }, gold: QUEST_GOLD };
}
// 3개 다 받은 주에 한 번 — 결과 { gear, item } 또는 { gear, error: 'notyet'|'claimed'|'full' }
export function claimQuestBox(gear, week, todayStr, rand = Math.random) {
  const g = normalizeGear(gear);
  if (questClaimed(g, week).length < QUEST_COUNT) return { gear: g, error: 'notyet' };
  if (questBoxClaimed(g, week)) return { gear: g, error: 'claimed' };
  if (g.items.length >= BAG_MAX) return { gear: g, error: 'full' };
  const item = { ...makeItem(rollRarity(rand(), QUEST_BOX_RARITY), rand), at: todayStr };
  return { gear: { ...g, items: [...g.items, item], quests: { ...g.quests, box: true } }, item };
}

// ── 📖 도감 · 🏅 칭호 (2026-11-10) ──
// 도감 = 장비 이름 전부(등급별 + 세트 조각). 한 번 가져 본 이름은 팔아도 채워진 채로 남는다
export const DEX = [
  ...RARITY_UP.flatMap((r) => GEAR_SLOTS.flatMap((s) => NAMES[s.id][r].map((name) => ({ name, rarity: r, slot: s.id })))),
  ...SETS.flatMap((st) => GEAR_SLOTS.map((s) => ({ name: st.pieces[s.id], rarity: 'rare', slot: s.id, set: st.id }))),
];
export function dexInfo(gear) {
  const seen = new Set(normalizeGear(gear).seen);
  const list = DEX.map((d) => ({ ...d, got: seen.has(d.name) }));
  return { list, got: list.filter((d) => d.got).length, total: list.length };
}
const hasSeenRarity = (ctx, r) => ctx.dex.list.some((d) => d.got && d.rarity === r && !d.set);
export const TITLES = [
  { id: 'rare', label: '반짝이는 눈', how: '희귀 장비 처음 얻기', ok: (c) => hasSeenRarity(c, 'rare') },
  { id: 'epic', label: '영웅의 길', how: '영웅 장비 처음 얻기', ok: (c) => hasSeenRarity(c, 'epic') },
  { id: 'legend', label: '전설을 만난 자', how: '전설 장비 처음 얻기', ok: (c) => hasSeenRarity(c, 'legend') },
  { id: 'set', label: '세트 수집가', how: '한 세트 3개를 모두 모으기', ok: (c) => SETS.some((st) => GEAR_SLOTS.every((s) => c.gear.items.some((x) => x.set === st.id && x.slot === s.id))) },
  { id: 'smith', label: '대장장이', how: '장비를 +5까지 강화하기', ok: (c) => c.gear.stats.maxPlus >= ENHANCE_MAX },
  { id: 'quest', label: '꾸준한 모험가', how: '주간 퀘스트 3개를 다 끝낸 주 4번', ok: (c) => c.gear.stats.questWeeks >= 4 },
  { id: 'dexHalf', label: '수집가', how: '도감 절반 채우기', ok: (c) => c.dex.got * 2 >= c.dex.total },
  { id: 'dexFull', label: '박물관장', how: '도감 모두 채우기', ok: (c) => c.dex.got >= c.dex.total },
  { id: 'wins100', label: '백전노장', how: '배틀 100승', ok: (c) => (Number(c.record?.wins) || 0) >= 100 },
  { id: 'streak10', label: '파죽지세', how: '10연승', ok: (c) => (Number(c.record?.bestStreak) || 0) >= 10 },
];
export function titleList(gear, record) {
  const g = normalizeGear(gear);
  const ctx = { gear: g, dex: dexInfo(g), record };
  return TITLES.map((t) => ({ id: t.id, label: t.label, how: t.how, ok: !!t.ok(ctx) }));
}
// 고른 칭호 (조건을 못 채운 칭호는 보이지 않는다)
export function currentTitle(gear, record) {
  const g = normalizeGear(gear);
  return g.title ? titleList(g, record).find((t) => t.id === g.title && t.ok)?.label || '' : '';
}

// 할일·습관을 끝냈을 때 — 같은 키는 한 번만 굴린다(체크를 풀었다 다시 해도). 결과: { gear, item|null, full }
export function rollDrop(gear, key, source, todayStr, rand = Math.random) {
  const g = normalizeGear(gear);
  if (g.rolled.includes(key)) return { gear: g, item: null, gold: 0 };
  // 골드는 장비 줍기를 꺼도 받는다 (같은 키는 한 번만 — 체크를 풀었다 다시 해도 같음)
  const paid = addGold(g, todayStr, 'task', GOLD[source] || 0);
  const next = { ...paid.gear, rolled: [...g.rolled, key].slice(-300) };
  const gold = paid.added;
  if (g.dropsOff) return { gear: next, item: null, gold };
  const todayCount = g.items.filter((x) => x.at === todayStr && !x.set).length; // 세트 조각은 따로(습관 7일 보상)
  if (todayCount >= DROPS_PER_DAY || rand() >= (DROP_CHANCE[source] || 0)) return { gear: next, item: null, gold };
  if (g.items.length >= BAG_MAX) return { gear: next, item: null, full: true, gold };
  const item = { ...makeItem(rollRarity(rand()), rand), at: todayStr };
  return { gear: { ...next, items: [...next.items, item] }, item, gold };
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

// 레벨별 상대를 이겼을 때 — 상대마다 딱 한 번(처음 이겼을 때). 결과: { gear, item|null, full }
export const npcRewardDone = (gear, npcId) => normalizeGear(gear).npcClaimed.includes(String(npcId));
export function npcReward(gear, npc, todayStr, rand = Math.random) {
  const g = normalizeGear(gear);
  if (!npc?.id || npcRewardDone(g, npc.id)) return { gear: g, item: null };
  // 가방이 차면 받은 것으로 치지 않는다 — 정리하고 다시 이기면 받는다
  if (g.items.length >= BAG_MAX) return { gear: g, item: null, full: true };
  const marked = { ...g, npcClaimed: [...g.npcClaimed, String(npc.id)] };
  const item = { ...makeItem(rollRarity(rand(), npcRarityWeights(npc.level)), rand), at: todayStr };
  return { gear: { ...marked, items: [...marked.items, item] }, item };
}

// ── 🪙 골드·상점 (2026-11-10 사용자 요청 — "배틀에서 이기면 골드, 그 골드로 장비를 산다") ──
// 원칙: 골드는 할일·습관에서 주로, 배틀은 보너스(하루 상한). 자동 배틀로 끝없이 모으지 못하게 상한을 둔다.
// 상점은 날마다 바뀌는 3칸(떠돌이 도전자처럼 날짜+계정으로 정해짐), 일반~희귀 + 가끔 영웅, 전설은 팔지 않는다(줍기·떠돌이에서만).
export const GOLD = { task: 5, habit: 3 };
export const TASK_GOLD_CAP = 60;    // 할일·습관 골드 하루 최대 (할일을 만들고 지우며 모으지 못하게)
export const BATTLE_GOLD_CAP = 50;  // 배틀 골드 하루 최대 (2026-11-10 사용자 결정 100→50 — 골드는 할일·습관에서 주로)
// 배틀 골드 (2026-11-10 사용자 확정) — 기본 10 + 상대 레벨, 나보다 높은 상대는 레벨 차이 1당 +30%(최대 2배),
// 나보다 5레벨 이상 낮은 상대는 절반. 강한 상대를 넘으면 크게, 약한 상대만 돌리면 손해.
export function battleGoldFor(npcLevel, myLevel = npcLevel) {
  const lv = Math.max(1, Number(npcLevel) || 1), me = Math.max(1, Number(myLevel) || 1);
  const diff = lv - me;
  const mult = diff > 0 ? Math.min(2, 1 + 0.3 * diff) : diff <= -5 ? 0.5 : 1;
  return { base: 10 + lv, mult, amount: Math.round((10 + lv) * mult) };
}
// 이긴 판의 골드 — 처음 이기는 상대·떠돌이 도전자는 전액, 이미 이긴 상대는 0~100% 난수(평균 절반, 최소 1G).
// 결과 { amount, pct(난수일 때만), mult, first }
export function battleWinGold(npcLevel, myLevel, first, rand = Math.random) {
  const { amount, mult } = battleGoldFor(npcLevel, myLevel);
  if (first) return { amount, pct: null, mult, first: true };
  const pct = Math.round(rand() * 100);
  return { amount: Math.max(1, Math.round(amount * pct / 100)), pct, mult, first: false };
}
export const SHOP_SIZE = 3;
export const SHOP_RARITY = { common: 45, uncommon: 35, rare: 17, epic: 3 };
export const SHOP_PRICE = { common: 60, uncommon: 150, rare: 400, epic: 1000 }; // 모의 전투(2026-11-10): 고급 3개만 껴도 바로 위 레벨 승률이 20%대→80~90%대라 줍기(희귀 3개 ≈ 50일)보다 너무 빠르지 않게

// kind: 'task'(할일·습관) | 'battle'. 하루 상한을 넘는 만큼은 버린다. 결과 { gear, added }
export function addGold(gear, todayStr, kind, amount) {
  const g = normalizeGear(gear);
  const earned = g.earned?.date === todayStr ? g.earned : { date: todayStr, task: 0, battle: 0 };
  const cap = kind === 'battle' ? BATTLE_GOLD_CAP : TASK_GOLD_CAP;
  const added = Math.max(0, Math.min(Math.floor(amount) || 0, cap - earned[kind]));
  if (!added) return { gear: g, added: 0 };
  return { gear: { ...g, gold: g.gold + added, earned: { ...earned, [kind]: earned[kind] + added } }, added };
}
export const battleGoldLeft = (gear, todayStr) => { const e = normalizeGear(gear).earned; return BATTLE_GOLD_CAP - (e?.date === todayStr ? e.battle : 0); };

// 팔기 (2026-11-10 사용자 확정 — "버리기" 자리) — 상점 값의 약 1/4이라 사서 바로 팔면 손해. 전설은 상점엔 없지만 팔 수는 있다(화면에서 한 번 더 묻는다).
// 판 골드는 하루 상한에 넣지 않는다(줍기가 하루 3개라 저절로 제한). 결과 { gear, gold } — 끼운 장비면 빼고 판다
export const SELL_PRICE = { common: 15, uncommon: 35, rare: 100, epic: 250, legend: 600 };
export function sellItem(gear, itemId) {
  const g = normalizeGear(gear);
  const it = g.items.find((x) => x.id === itemId);
  if (!it) return { gear: g, gold: 0 };
  const gold = sellPriceOf(it); // 강화했으면 쓴 골드의 30% 더
  const equipped = Object.fromEntries(Object.entries(g.equipped).map(([k, v]) => [k, v === itemId ? null : v]));
  return { gear: { ...g, gold: g.gold + gold, items: g.items.filter((x) => x.id !== itemId), equipped }, gold };
}

// 오늘 상점 — 같은 날·같은 계정이면 기기가 달라도 같은 3칸. 칸마다 무기·갑옷·부적이 겹치지 않게
export function shopItems(dateStr, seed) {
  const r = seededRand(`shop|${dateStr}|${seed}`);
  const slots = ['weapon', 'armor', 'charm'].map((x) => [x, r()]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  return slots.slice(0, SHOP_SIZE).map((slot, i) => {
    const rarity = rollRarity(r(), SHOP_RARITY);
    const item = makeItem(rarity, r, slot);
    return { ...item, id: `shop_${dateStr}_${i}`, price: SHOP_PRICE[rarity] };
  });
}
export const shopBought = (gear, dateStr) => { const s = normalizeGear(gear).shop; return s?.date === dateStr ? s.bought : []; };

// 사기 — 결과 { gear, item } 또는 { gear, error: 'bought'|'gold'|'full' }
export function buyShopItem(gear, dateStr, seed, index) {
  const g = normalizeGear(gear);
  const it = shopItems(dateStr, seed)[index];
  if (!it) return { gear: g, error: 'bought' };
  const bought = shopBought(g, dateStr);
  if (bought.includes(index)) return { gear: g, error: 'bought' };
  if (g.gold < it.price) return { gear: g, error: 'gold' };
  if (g.items.length >= BAG_MAX) return { gear: g, error: 'full' };
  const { price, ...rest } = it;
  const item = { ...rest, id: `g${Date.now().toString(36)}s${index}`, at: dateStr, bought: price };
  return { gear: { ...g, gold: g.gold - price, items: [...g.items, item], shop: { date: dateStr, bought: [...bought, index] } }, item };
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
