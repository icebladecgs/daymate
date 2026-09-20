import { useEffect, useState } from "react";
import S from "../styles.js";
import { getNpcById } from "../data/battle/npcs.js";
import { createPlayerFighter, createNpcFighter, createBattleState, resolvePlayerAction, getAvailableSpecials, calcBattleReward } from "../data/battle/engine.js";

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

export default function Battle({ totalScore, statXp, npcId, onExit, onBattleEnd }) {
  const npcDef = getNpcById(npcId);
  const [state, setState] = useState(() => createBattleState(
    createPlayerFighter(totalScore, statXp),
    createNpcFighter(npcDef || { id: 'unknown', level: 1, name: '???', energyMax: 100, stats: {}, trait: null })
  ));

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

  const act = (action) => {
    if (status !== 'ongoing') return;
    setState(prev => resolvePlayerAction(prev, action));
  };

  const retryBattle = () => {
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
        <EnergyRow label="나" fighter={player} color="#4B6FFF" />
        <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 900, color: 'var(--dm-muted)', margin: '6px 0' }}>VS</div>
        <EnergyRow label={npc.name} fighter={npc} color="#F87171" />
      </div>

      <div style={{ ...S.card, maxHeight: 190, overflowY: 'auto' }}>
        {log.length === 0 && <div style={{ fontSize: 12, color: 'var(--dm-muted)' }}>전투 기록이 여기 표시됩니다</div>}
        {log.slice(-10).reverse().map((l, i) => (
          <div key={log.length - i} style={{ fontSize: 12, color: 'var(--dm-sub)', padding: '5px 0', borderBottom: i < log.slice(-10).length - 1 ? '1px solid var(--dm-row)' : 'none' }}>{l.text}</div>
        ))}
      </div>

      {status === 'ongoing' ? (
        <div style={{ margin: '0 16px' }}>
          <button onClick={() => act({ type: 'basic' })} style={{ ...S.btn, marginTop: 0, marginBottom: 10 }}>⚔️ 기본공격</button>
          <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--dm-muted)', marginBottom: 8, letterSpacing: '0.06em' }}>SPECIAL</div>
          {availableSpecials.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--dm-muted)', textAlign: 'center', padding: '8px 0' }}>아직 사용 가능한 SPECIAL이 없어요 (능력치 10 이상 필요)</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {availableSpecials.map(sp => (
                <button
                  key={sp.stat}
                  disabled={sp.onCooldown}
                  onClick={() => act({ type: 'special', stat: sp.stat })}
                  title={sp.desc}
                  style={{
                    background: sp.onCooldown ? 'var(--dm-input)' : 'rgba(167,139,250,0.15)',
                    border: `1px solid ${sp.onCooldown ? 'var(--dm-border)' : 'rgba(167,139,250,0.4)'}`,
                    borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700,
                    color: sp.onCooldown ? 'var(--dm-muted)' : '#c4b5fd',
                    cursor: sp.onCooldown ? 'default' : 'pointer', fontFamily: 'inherit',
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
