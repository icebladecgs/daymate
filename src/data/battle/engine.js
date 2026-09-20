// 일기토 배틀 엔진 — 순수 함수 모음, React/UI에 의존하지 않음
// 기존 XP/레벨/6대능력치 시스템은 전혀 수정하지 않고 "읽기"만 한다.
import { GROWTH_STATS, calcStatScore } from "../growthStats.js";
import { calcLevel } from "../stats.js";
import { SPECIALS_TIER10, SPECIAL_COOLDOWN } from "./specials.js";

const STAT_IDS = GROWTH_STATS.map(s => s.id);

// ── 밸런스 상수 ──
// 기본 데미지를 totalScore(=Energy)에 비례하게 잡아서, 레벨이 올라 Energy가 커져도
// 공격력도 같은 비율로 커지므로 "비슷한 레벨끼리는 턴 수가 레벨과 무관하게 일정"해진다.
export const BASE_DAMAGE_RATIO = 0.07;
export const STAT_BONUS_K = 1.4;           // 0~100 스탯 점수 → 최대 +140 보너스
export const DEFENSE_PCT_PER_POINT = 0.0035; // 생활력 100 → 최대 35% 경감
export const DEFENSE_PCT_CAP = 0.35;
export const DODGE_BASE = 0.05;
export const DODGE_PER_REL_POINT = 0.0015;   // 관계력 100 → 최대 20% 회피
export const DODGE_CAP = 0.20;
export const CRIT_BASE = 0.05;
export const CRIT_PER_ACHIEVE_POINT = 0.002; // 성취력 100 → 최대 25% 크리
export const CRIT_CAP = 0.30;
export const CRIT_MULT = 1.75;
export const FUMBLE_CHANCE = 0.04;           // 치명적 실수
export const AWAKEN_ENERGY_THRESHOLD = 0.3;  // Energy 30% 이하일 때만
export const AWAKEN_CHANCE = 0.08;
export const AWAKEN_MULT = 1.3;

const STAT_PRIORITY = ['STR', 'INT', 'WEALTH', 'REL', 'ACHIEVE', 'LIFE'];

export function getPrimaryStat(stats) {
  let best = STAT_PRIORITY[0];
  STAT_PRIORITY.forEach(id => { if ((stats[id] || 0) > (stats[best] || 0)) best = id; });
  return best;
}

function emptyCooldowns() {
  return Object.fromEntries(STAT_IDS.map(id => [id, 0]));
}

// ── 파이터 생성 ──
// 실제 XP/스탯을 "읽기만" 해서 전투용 스냅샷을 만든다. 원본 상태는 절대 변경하지 않는다.
export function createPlayerFighter(totalScore, statXp) {
  const stats = Object.fromEntries(GROWTH_STATS.map(s => [s.id, calcStatScore(statXp?.[s.id] || 0)]));
  const energyMax = Math.max(150, Math.round(totalScore || 0));
  return {
    id: 'player', name: '나', isNpc: false, level: calcLevel(totalScore || 0).level,
    energyMax, energy: energyMax, stats, primaryStat: getPrimaryStat(stats),
    cooldowns: emptyCooldowns(), shield: null, critGuaranteed: false, trait: null, debuffMult: 1,
  };
}

export function createNpcFighter(npcDef) {
  const stats = { ...npcDef.stats };
  return {
    id: npcDef.id, name: npcDef.name, isNpc: true, level: npcDef.level,
    energyMax: npcDef.energyMax, energy: npcDef.energyMax, stats, primaryStat: getPrimaryStat(stats),
    cooldowns: emptyCooldowns(), shield: null, critGuaranteed: false, trait: npcDef.trait || null, debuffMult: 1,
  };
}

export function createBattleState(player, npc) {
  return { player, npc, round: 1, status: 'ongoing', log: [{ text: `${npc.name}과(와)의 일기토 시작!` }] };
}

export function getAvailableSpecials(fighter) {
  return STAT_IDS.map(id => SPECIALS_TIER10[id])
    .filter(sp => (fighter.stats[sp.stat] || 0) >= sp.requireScore)
    .map(sp => ({ ...sp, onCooldown: (fighter.cooldowns[sp.stat] || 0) > 0 }));
}

// ── 판정 함수들 ──
// defenseFlatBonus/critFlatBonus/dodgeFlatBonus: 레벨 높은 NPC 개성을 위한 소폭 고정 보정치 (trait에서 옵션으로 부여)
function defensePct(defender) {
  const base = (defender.stats.LIFE || 0) * DEFENSE_PCT_PER_POINT + (defender.trait?.defenseFlatBonus || 0);
  return Math.min(0.5, base);
}
function dodgeChance(defender) {
  const base = DODGE_BASE + (defender.stats.REL || 0) * DODGE_PER_REL_POINT + (defender.trait?.dodgeFlatBonus || 0);
  return Math.min(0.3, base);
}
function critChance(attacker) {
  const base = CRIT_BASE + (attacker.stats.ACHIEVE || 0) * CRIT_PER_ACHIEVE_POINT + (attacker.trait?.critFlatBonus || 0);
  return Math.min(0.4, base);
}
function baseAttackPower(fighter) {
  return fighter.energyMax * BASE_DAMAGE_RATIO;
}
function statBonus(fighter, statId) {
  return (fighter.stats[statId] || 0) * STAT_BONUS_K;
}

function resolveAttack(attacker, defender, { useStat, mult = 1, ignoreDefense = false, forceCrit = false } = {}) {
  if (Math.random() < FUMBLE_CHANCE) return { fumble: true, damage: 0 };
  if (Math.random() < dodgeChance(defender)) return { miss: true, damage: 0 };

  const base = baseAttackPower(attacker);
  const bonus = statBonus(attacker, useStat);
  const variance = 0.85 + Math.random() * 0.3;
  const isCrit = forceCrit || Math.random() < critChance(attacker);
  const isAwaken = attacker.energy <= attacker.energyMax * AWAKEN_ENERGY_THRESHOLD && Math.random() < AWAKEN_CHANCE;

  let dmg = (base + bonus) * variance;
  if (isCrit) dmg *= CRIT_MULT;
  if (isAwaken) dmg *= AWAKEN_MULT;
  dmg *= mult;
  if (attacker.trait?.basicAttackDamageMult && useStat === attacker.primaryStat && mult === 1) {
    dmg *= attacker.trait.basicAttackDamageMult;
  }
  if (attacker.debuffMult) dmg *= attacker.debuffMult;

  dmg *= (1 - (ignoreDefense ? 0 : defensePct(defender)));

  if (defender.shield) {
    if (defender.shield.type === 'pct') dmg *= (1 - defender.shield.value);
    else dmg = Math.max(0, dmg - defender.shield.value);
  }

  return { damage: Math.max(5, Math.round(dmg)), crit: isCrit, awaken: isAwaken };
}

function formatAttackLog(actorLabel, moveName, r) {
  if (r.fumble) return { text: `${actorLabel}: ${moveName} → 치명적 실수! 공격 무효` };
  if (r.miss) return { text: `${actorLabel}: ${moveName} → 상대가 회피했다!` };
  const tags = [r.crit && '크리티컬!', r.awaken && '각성!'].filter(Boolean).join(' ');
  return { text: `${actorLabel}: ${moveName} → ${tags ? tags + ' ' : ''}${r.damage} 데미지` };
}

function decrementCooldowns(f) {
  Object.keys(f.cooldowns).forEach(k => { if (f.cooldowns[k] > 0) f.cooldowns[k] -= 1; });
}

// glassMental 트레이트: 한 방에 최대 Energy의 15% 이상 맞으면 30% 확률로 1회성 전 스탯 25% 하락
function tickDamageTraits(fighter, damageTaken) {
  if (fighter.trait?.glassMental && !fighter._glassBroken && damageTaken >= fighter.energyMax * 0.15) {
    if (Math.random() < 0.3) {
      Object.keys(fighter.stats).forEach(k => { fighter.stats[k] = Math.round(fighter.stats[k] * 0.75); });
      fighter._glassBroken = true;
    }
  }
}

function applyDamage(target, damage) {
  target.energy = Math.max(0, target.energy - damage);
  target.shield = null; // 실드는 1회성 소모
  tickDamageTraits(target, damage);
}

function performAction(actor, target, action, log, actorLabel) {
  decrementCooldowns(actor);
  if (actor.shield === undefined) actor.shield = null;

  if (action.type === 'basic') {
    const forceCrit = actor.critGuaranteed;
    actor.critGuaranteed = false;
    const r = resolveAttack(actor, target, { useStat: actor.primaryStat, forceCrit });
    applyDamage(target, r.damage);
    log.push(formatAttackLog(actorLabel, '기본공격', r));
    return;
  }

  const special = SPECIALS_TIER10[action.stat];
  if (!special || (actor.stats[special.stat] || 0) < special.requireScore || (actor.cooldowns[special.stat] || 0) > 0) {
    // 방어적으로 처리: 조건 안 맞으면 기본공격으로 대체
    performAction(actor, target, { type: 'basic' }, log, actorLabel);
    return;
  }
  actor.cooldowns[special.stat] = SPECIAL_COOLDOWN + 1;

  if (special.type === 'attack') {
    const forceCrit = actor.critGuaranteed;
    actor.critGuaranteed = false;
    const r = resolveAttack(actor, target, { useStat: special.stat, mult: special.mult || 1, ignoreDefense: !!special.ignoreDefense, forceCrit });
    applyDamage(target, r.damage);
    log.push(formatAttackLog(actorLabel, special.name, r));
  } else if (special.type === 'heal') {
    const amount = Math.round(actor.energyMax * special.healPct);
    actor.energy = Math.min(actor.energyMax, actor.energy + amount);
    log.push({ text: `${actorLabel}: ${special.name}! Energy +${amount}` });
  } else if (special.type === 'shield') {
    actor.shield = special.shieldPct
      ? { type: 'pct', value: special.shieldPct }
      : { type: 'flat', value: Math.round(actor.energyMax * special.shieldFlatRatio) };
    log.push({ text: `${actorLabel}: ${special.name}! 다음 피격에 보호막 준비` });
  } else if (special.type === 'buff') {
    actor.critGuaranteed = true;
    log.push({ text: `${actorLabel}: ${special.name}! 다음 공격 크리티컬 확정` });
  }
}

function tickTraits(fighter, round) {
  if (fighter.trait?.id === 'sanheunsamil' && round >= 4 && !fighter._debuffApplied) {
    Object.keys(fighter.stats).forEach(k => { fighter.stats[k] = Math.round(fighter.stats[k] * 0.8); });
    fighter._debuffApplied = true;
  }
}

function pickNpcAction(npc) {
  const available = STAT_IDS.filter(id => (npc.stats[id] || 0) >= 10 && (npc.cooldowns[id] || 0) === 0);
  if (available.length > 0 && npc.energy > npc.energyMax * 0.15 && Math.random() < 0.35) {
    return { type: 'special', stat: available[Math.floor(Math.random() * available.length)] };
  }
  return { type: 'basic' };
}

function cloneFighter(f) {
  return { ...f, stats: { ...f.stats }, cooldowns: { ...f.cooldowns }, shield: f.shield ? { ...f.shield } : null };
}

// ── 한 라운드(내 행동 + NPC 자동 행동) 진행 ──
export function resolvePlayerAction(state, action) {
  const next = { ...state, player: cloneFighter(state.player), npc: cloneFighter(state.npc), log: [] };
  const { player, npc } = next;

  tickTraits(npc, next.round);

  performAction(player, npc, action, next.log, '나');
  if (npc.energy <= 0) {
    next.status = 'win';
    next.log.push({ text: `${npc.name} 격파! 승리했다 🎉` });
    next.log = [...state.log, ...next.log];
    return next;
  }

  const npcAction = pickNpcAction(npc);
  performAction(npc, player, npcAction, next.log, npc.name);
  if (player.energy <= 0) {
    next.status = 'lose';
    next.log.push({ text: `패배했다... 다음엔 이길 수 있을 거예요` });
  }

  next.round = state.round + 1;
  next.log = [...state.log, ...next.log];
  return next;
}

export function calcBattleReward(npc, won) {
  if (!won) return { fame: 0 };
  return { fame: 10 * npc.level };
}
