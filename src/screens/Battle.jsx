import { useEffect, useState } from "react";
import S from "../styles.js";
import { getNpcById } from "../data/battle/npcs.js";
import { GROWTH_STATS } from "../data/growthStats.js";
import { createPlayerFighter, createNpcFighter, createBattleState, resolveRoundFirstTurn, resolveRoundSecondTurn, getAvailableSpecials, calcBattleReward, getTurnOrder } from "../data/battle/engine.js";

const ROUND_GAP_MS = 1000; // 선공 결과를 보여준 뒤 후공까지의 간격

const FLASH_COLOR = {
  crit: 'rgba(252,211,77,0.55)',   // 크리티컬 — 노랑
  attack: 'rgba(248,113,113,0.45)', // 공격형 스페셜 — 빨강
  heal: 'rgba(74,222,128,0.4)',     // 회복형 스페셜 — 초록
  shield: 'rgba(96,165,250,0.4)',   // 보호막형 스페셜 — 파랑
  buff: 'rgba(167,139,250,0.45)',   // 버프형 스페셜 — 보라
};

function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
}

// 로그 한 줄의 색/굵기 — 내 공격은 파랑, 상대 공격은 빨강 계열로 기본 구분하고
// 크리티컬·스페셜(회복/보호막/버프)은 그 위에 타입별 색으로 강조해서 한눈에 어떤 공격인지 보이게 한다
function logLineStyle(entry) {
  if (entry.kind === 'result') {
    return { color: entry.text.includes('격파') ? '#4ADE80' : '#F87171', fontWeight: 900 };
  }
  if (entry.kind === 'miss' || entry.kind === 'fumble') {
    return { color: 'var(--dm-muted)', fontStyle: 'italic' };
  }
  const sideColor = entry.side === 'player' ? '#6C8EFF' : entry.side === 'npc' ? '#F87171' : 'var(--dm-sub)';
  if (entry.kind === 'attack' && entry.crit) return { color: '#FCD34D', fontWeight: 900 };
  if (entry.kind === 'attack' && entry.special) return { color: sideColor, fontWeight: 700 };
  if (entry.kind === 'heal') return { color: '#4ADE80', fontWeight: 700 };
  if (entry.kind === 'shield') return { color: '#60A5FA', fontWeight: 700 };
  if (entry.kind === 'buff') return { color: '#A78BFA', fontWeight: 700 };
  if (entry.kind === 'regen') return { color: '#4ADE80' };
  return { color: sideColor };
}

function EnergyRow({ label, fighter, color }) {
  const pct = fighter.energyMax > 0 ? Math.max(0, Math.round((fighter.energy / fighter.energyMax) * 100)) : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 4 }}>
        <span>{label} · Lv.{fighter.level}</span>
        <span>{fighter.energy.toLocaleString()} / {fighter.energyMax.toLocaleString()}</span>
      </div>
      <div style={{ height: 10, background: 'var(--dm-row)', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 6, background: color, width: `${pct}%`, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

export default function Battle({ totalScore, statXp, npcId, battleNickname, onExit, onBattleEnd }) {
  const playerLabel = battleNickname?.trim() || '나';
  const npcDef = getNpcById(npcId);
  const [state, setState] = useState(() => createBattleState(
    createPlayerFighter(totalScore, statXp),
    createNpcFighter(npcDef || { id: 'unknown', level: 1, name: '???', energyMax: 100, stats: {}, trait: null })
  ));
  const [resolving, setResolving] = useState(false);
  const [flash, setFlash] = useState(null);
  const [showNpcStats, setShowNpcStats] = useState(true);

  useEffect(() => {
    if (!npcDef) return;
    if (state.status !== 'ongoing') onBattleEnd(npcDef, state.status === 'win');
  }, [state.status]); // eslint-disable-line

  if (!npcDef) {
    return (
      <div style={S.content}>
        <div style={S.topbar}>
          <button onClick={onExit} style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', fontSize: 22, cursor: 'pointer' }}>←</button>
        </div>
        <div style={{ ...S.card, textAlign: 'center', color: 'var(--dm-muted)' }}>상대를 찾을 수 없어요</div>
      </div>
    );
  }

  const { player, npc, status, log } = state;
  const availableSpecials = getAvailableSpecials(player);
  const upcomingOrder = getTurnOrder(player, npc);

  // 방금 새로 추가된 로그 항목들에 대해 진동/색 효과를 판정
  const triggerEffects = (prevLog, newLog) => {
    newLog.slice(prevLog.length).forEach(entry => {
      if (entry.kind === 'attack' && entry.crit) {
        vibrate([40, 30, 40]);
        setFlash({ key: Date.now() + Math.random(), color: FLASH_COLOR.crit });
      } else if (entry.kind === 'attack' && entry.special) {
        vibrate(25);
        setFlash({ key: Date.now() + Math.random(), color: FLASH_COLOR.attack });
      } else if (entry.kind === 'heal' || entry.kind === 'shield' || entry.kind === 'buff') {
        vibrate(20);
        setFlash({ key: Date.now() + Math.random(), color: FLASH_COLOR[entry.kind] });
      }
    });
  };

  const act = (action) => {
    if (status !== 'ongoing' || resolving) return;
    const prevLog = state.log;
    const first = resolveRoundFirstTurn(state, action, playerLabel);
    setState(first);
    triggerEffects(prevLog, first.log);
    if (first.status !== 'ongoing') return; // 선공만으로 승부가 났다면 후공 없이 종료
    setResolving(true);
    setTimeout(() => {
      setState(prev => {
        const second = resolveRoundSecondTurn(prev, action, playerLabel);
        triggerEffects(prev.log, second.log);
        return second;
      });
      setResolving(false);
    }, ROUND_GAP_MS);
  };

  const retryBattle = () => {
    setResolving(false);
    setFlash(null);
    setState(createBattleState(createPlayerFighter(totalScore, statXp), createNpcFighter(npcDef)));
  };

  return (
    <div style={S.content}>
      <div style={S.topbar}>
        <button onClick={onExit} style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', fontSize: 22, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>←</button>
        <div style={{ flex: 1, paddingLeft: 8 }}>
          <div style={S.title}>⚔️ 일기토</div>
          <div style={S.sub}>Lv.{npc.level} {npc.name} · 「{npc.trait?.label}」</div>
        </div>
      </div>

      <div style={S.card}>
        <button onClick={() => setShowNpcStats(v => !v)} style={{ width: '100%', background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
          <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--dm-muted)', letterSpacing: '0.06em' }}>🥊 상대 능력치</span>
          <span style={{ fontSize: 11, color: 'var(--dm-muted)' }}>{showNpcStats ? '접기 ▲' : '펼치기 ▼'}</span>
        </button>
        {showNpcStats && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 14, rowGap: 8, marginTop: 10 }}>
            {GROWTH_STATS.map(stat => {
              const score = npc.stats[stat.id] || 0;
              return (
                <div key={stat.id} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 13, width: 18, textAlign: 'center', flexShrink: 0 }}>{stat.icon}</span>
                  <span style={{ fontSize: 11, color: 'var(--dm-sub)', width: 34, flexShrink: 0 }}>{stat.name}</span>
                  <div style={{ flex: 1, height: 6, background: 'var(--dm-row)', borderRadius: 4, overflow: 'hidden', minWidth: 0 }}>
                    <div style={{ height: '100%', borderRadius: 4, background: 'linear-gradient(90deg,#F87171,#FCA5A5)', width: `${score}%` }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--dm-text)', width: 22, textAlign: 'right', flexShrink: 0 }}>{score}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ ...S.card, position: 'relative', overflow: 'hidden' }}>
        {flash && (
          <div key={flash.key} className="dm-battle-flash" style={{ background: flash.color }} onAnimationEnd={() => setFlash(null)} />
        )}
        <EnergyRow label={playerLabel} fighter={player} color="#4B6FFF" />
        <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 900, color: 'var(--dm-muted)', margin: '6px 0' }}>
          VS {status === 'ongoing' && (
            <span style={{ color: '#A78BFA' }}>· ⚡ {upcomingOrder === 'npc' ? '상대' : playerLabel} 선공</span>
          )}
        </div>
        <EnergyRow label={npc.name} fighter={npc} color="#F87171" />
      </div>

      <div style={{ ...S.card, maxHeight: 190, overflowY: 'auto' }}>
        {log.length === 0 && <div style={{ fontSize: 12, color: 'var(--dm-muted)' }}>전투 기록이 여기 표시됩니다</div>}
        {log.slice(-10).reverse().map((l, i) => (
          <div key={log.length - i} style={{ fontSize: 12, padding: '5px 0', borderBottom: i < log.slice(-10).length - 1 ? '1px solid var(--dm-row)' : 'none', ...logLineStyle(l) }}>{l.text}</div>
        ))}
      </div>

      {status === 'ongoing' ? (
        <div style={{ margin: '0 16px', opacity: resolving ? 0.6 : 1, transition: 'opacity 0.15s' }}>
          <button onClick={() => act({ type: 'basic' })} disabled={resolving} style={{ ...S.btn, marginTop: 0, marginBottom: 10, cursor: resolving ? 'default' : 'pointer' }}>⚔️ 기본공격</button>
          <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--dm-muted)', marginBottom: 8, letterSpacing: '0.06em' }}>SPECIAL</div>
          {availableSpecials.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--dm-muted)', textAlign: 'center', padding: '8px 0' }}>아직 사용 가능한 SPECIAL이 없어요 (능력치 10 이상 필요)</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {availableSpecials.map(sp => (
                <button
                  key={sp.stat}
                  disabled={sp.onCooldown || resolving}
                  onClick={() => act({ type: 'special', stat: sp.stat })}
                  title={sp.desc}
                  style={{
                    background: sp.onCooldown ? 'var(--dm-input)' : 'rgba(167,139,250,0.15)',
                    border: `1px solid ${sp.onCooldown ? 'var(--dm-border)' : 'rgba(167,139,250,0.4)'}`,
                    borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700,
                    color: sp.onCooldown ? 'var(--dm-muted)' : '#c4b5fd',
                    cursor: (sp.onCooldown || resolving) ? 'default' : 'pointer', fontFamily: 'inherit',
                  }}
                >{sp.icon} {sp.name}{sp.onCooldown ? ' (쿨다운)' : ''}</button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ ...S.card, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{status === 'win' ? '🎉' : '💧'}</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: status === 'win' ? '#4ADE80' : '#F87171' }}>
            {status === 'win' ? '승리했습니다!' : '패배했습니다'}
          </div>
          {status === 'win' && (
            <div style={{ fontSize: 12, color: 'var(--dm-muted)', marginTop: 6 }}>명성 +{calcBattleReward(npc, true).fame}</div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={onExit} style={{ ...S.btnGhost, flex: 1, marginTop: 0 }}>나가기</button>
            <button onClick={retryBattle} style={{ ...S.btn, flex: 1, marginTop: 0 }}>다시 도전</button>
          </div>
        </div>
      )}
      <div style={{ height: 16 }} />
    </div>
  );
}
