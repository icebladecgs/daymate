// 협동 보스전 (2026-11-08) — 커뮤니티마다 한 주에 보스 하나를 멤버들이 같이 쓰러뜨린다.
// 공격 = 이번 주에 오른 능력치 XP × 10. 주가 시작될 때 능력치 값을 계정 설정(raidBase)에 남기고 지금 값과 비교한다.
// 따로 누르는 공격 버튼은 없다 — 할일·습관·공부 등 XP가 생기는 모든 길이 그대로 공격이 된다.
// 저장: communities/{id}/raids/{주 월요일} = 보스, 그 아래 hits/{uid} = 멤버별 공격량 (규칙: 멤버만, 본인 것만).
// 계산은 이 파일 한 곳 (scripts/data-test.mjs에 테스트).
import { GROWTH_STATS } from '../data/growthStats.js';

// 이 기기에서 보스 칸 숨기기 (설정 → 앱 관리, 기기마다 — accountSwap DEVICE_KEYS)
export const RAID_HIDDEN_KEY = 'dm_raid_hidden';
export const raidHiddenOn = () => { try { return localStorage.getItem(RAID_HIDDEN_KEY) === 'true'; } catch { return false; } };

export const RAID_DMG_PER_XP = 10;
// 멤버 한 명당 보스 체력 — 평소 쓰는 사람이 한 주에 얻는 XP는 대략 50~100(할일 3·습관 1)이라,
// 활동하는 멤버 절반 남짓이 평소대로 하면 쓰러지는 정도
export const RAID_HP_PER_MEMBER = 500;
export const RAID_MAX_MEMBERS = 10;      // 큰 커뮤니티라도 체력은 10명분까지
export const RAID_REWARD_XP = 10;        // 처치 보상 — 이달 목표 체크와 같은 크기(배틀 균형 때문에 작게)

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// 주 = 그 주 월요일 날짜(기기 시간 기준)
export function raidWeekOf(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
}
export function prevRaidWeek(week) {
  const [y, m, d] = week.split('-').map(Number);
  return ymd(new Date(y, m - 1, d - 7));
}
// 일요일 밤 12시까지 남은 날 (오늘 포함 아님: 일요일이면 0)
export function raidDaysLeft(date = new Date()) {
  return (7 - date.getDay()) % 7;
}

// 이번 주 공격량: 능력치별로 오른 만큼(내려간 건 0) × 10
export function raidDamage(base, now) {
  const byStat = {};
  let total = 0;
  for (const s of GROWTH_STATS) {
    const up = Math.max(0, Math.round((Number(now?.[s.id]) || 0) - (Number(base?.[s.id]) || 0)));
    if (up > 0) { byStat[s.id] = up * RAID_DMG_PER_XP; total += up * RAID_DMG_PER_XP; }
  }
  return { dmg: total, byStat };
}

// 이번 주 기준값: 저장된 게 이번 주 것이면 그대로, 아니면 지금 능력치로 새로
export function nextRaidBase(saved, week, statXp) {
  if (saved?.week === week && saved.xp && typeof saved.xp === 'object') return saved;
  const xp = {};
  for (const s of GROWTH_STATS) xp[s.id] = Number(statXp?.[s.id]) || 0;
  return { week, xp };
}

export const raidHpFor = (level, members) =>
  Math.round(RAID_HP_PER_MEMBER * Math.min(RAID_MAX_MEMBERS, Math.max(1, members || 1)) * (1 + 0.1 * (Math.max(1, level) - 1)));

// 다음 주 레벨: 지난주 보스를 쓰러뜨렸으면 +1, 아니면 그대로 (벌점 없음)
export function nextRaidLevel(prev, prevHits) {
  if (!prev) return 1;
  const level = Math.max(1, Number(prev.level) || 1);
  return raidTotal(prevHits) >= (Number(prev.hpMax) || Infinity) ? level + 1 : level;
}

export const raidTotal = (hits) => (hits || []).reduce((sum, h) => sum + (Number(h.dmg) || 0), 0);
export const raidDefeated = (raid, hits) => !!raid && raidTotal(hits) >= (Number(raid.hpMax) || Infinity);

// 보상: 이번 주에 가장 많이 오른 능력치에 (공격을 한 사람만)
export function raidRewardStat(byStat) {
  let best = null;
  for (const [id, v] of Object.entries(byStat || {})) if (!best || v > byStat[best]) best = id;
  return best;
}

// 보스 — 나쁜 습관을 캐릭터로 (직접 그린 12×12 도트, 다른 게임 그림 아님). 레벨 순서대로 돌아간다.
// 글자: . 비움 · b 몸 · d 어두운 몸 · h 밝은 점 · w 눈 흰자 · k 눈동자 · r 입·포인트
const BOSSES = [
  { id: 'slime', name: '미루기 슬라임', colors: { b: '#8E5CF6', d: '#5B2DB8', h: '#C9B2FF', r: '#3B1A80' },
    map: ['....bbbb....', '..bbhbbbbb..', '.bbhhbbbbbb.', '.bbhbbbbbbb.', 'bbwwbbbbwwbb', 'bbwkbbbbwkbb', 'bbbbbbbbbbbb', 'bbbbbrrbbbbb', 'bbbbrbbrbbbb', 'bbbbbbbbbbbb', '.dbbbbbbbbd.', '..dddddddd..'] },
  { id: 'bat', name: '딴짓 박쥐', colors: { b: '#636366', d: '#3A3A3C', h: '#8E8E93', r: '#FF453A' },
    map: ['.d........d.', '.dd.b..b.dd.', 'ddd.bbbb.ddd', 'dddbbbbbbddd', 'ddbwkbbwkbdd', 'dddbbbbbbddd', 'dd.bbrrbb.dd', 'd..bbbbbb..d', 'd...bhhb...d', '.....bb.....', '....b..b....', '............'] },
  { id: 'ghost', name: '걱정 유령', colors: { b: '#E5E5EA', d: '#AEAEB2', h: '#FFFFFF', r: '#5E5CE6' },
    map: ['....bbbb....', '..bbhhbbbb..', '.bbhbbbbbbb.', '.bbbbbbbbbb.', 'bbkkbbbbkkbb', 'bbkkbbbbkkbb', 'bbbbbbbbbbbb', 'bbbbbrrbbbbb', 'bbbbrrrrbbbb', 'bbbbbbbbbbbb', 'bdbbdbbdbbdb', 'd..d..d..d..'] },
  { id: 'goblin', name: '야식 고블린', colors: { b: '#30D158', d: '#1E8E3E', h: '#7EE29A', r: '#FF9F0A' },
    map: ['............', 'd..bbbbbb..d', 'db.bhbbbb.bd', '.bbbbbbbbbb.', '.bwkbbbbwkb.', '.bbbbbbbbbb.', '..bbbddbbb..', '..brwrwrwb..', '..bbrrrrbb..', '...bbbbbb...', '..dd....dd..', '.ddd....ddd.'] },
];
export function raidBoss(level) {
  const b = BOSSES[(Math.max(1, level) - 1) % BOSSES.length];
  return { ...b, level: Math.max(1, level) };
}
// 도트 칸 색 목록(144개)
export function bossPixels(boss, hitFlash = false) {
  const c = { '.': 'transparent', w: '#FFFFFF', k: '#1C1C1E', ...boss.colors };
  return boss.map.join('').split('').map(ch => (hitFlash && ch !== '.' && ch !== 'w' && ch !== 'k') ? '#FF6B6B' : (c[ch] || 'transparent'));
}
