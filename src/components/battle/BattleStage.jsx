import { useEffect, useRef, useState } from "react";
import PixelWarrior from "./PixelWarrior.jsx";
import { ARMOR_TIERS, NPC_ARMOR } from "./armor.js";

// 배틀 전투 장면 (2026-10-30, 영걸전 느낌). 배틀 계산은 그대로 두고, 엔진이 만든 기록 한 줄씩을 짧은 동작으로 보여 준다.
// events: [{ key, entry, icon }] — 새 기록이 생길 때마다 Battle이 뒤에 붙인다. 하나씩 차례로 재생(겹치지 않게).
// 길이(사용자 요청: 짧게): 일반 공격 0.6초, 크리티컬·필살기는 컷인 0.42초를 앞에 붙인다.

const CUTIN_MS = 420;
const durationOf = (ev) => {
  const e = ev.entry;
  const cut = hasCutin(e) ? CUTIN_MS : 0;
  switch (e.kind) {
    case 'attack': return cut + 620;
    case 'miss': return 560;
    case 'fumble': return 480;
    case 'regen': return 420;
    case 'heal': case 'shield': case 'buff': return cut + 560;
    case 'result': return 900;
    default: return 300;
  }
};
// 크리티컬·필살기(스페셜)만 컷인 — 일반 공격은 바로
function hasCutin(e) { return (e.kind === 'attack' && (e.crit || e.special)) || ((e.kind === 'heal' || e.kind === 'shield' || e.kind === 'buff') && !!e.move); }

const SIDE_COLOR = { player: '#4B6FFF', npc: '#DC2626' };

function HpBar({ name, fighter, side, delayMs = 250 }) {
  const pct = fighter.energyMax > 0 ? Math.max(0, Math.min(100, (fighter.energy / fighter.energyMax) * 100)) : 0;
  const color = pct > 50 ? '#22C55E' : pct > 20 ? '#FACC15' : '#EF4444';
  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: side === 'npc' ? 'right' : 'left' }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: '#fff', textShadow: '0 1px 0 #000, 1px 0 0 #000, -1px 0 0 #000, 0 -1px 0 #000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {name} <span style={{ fontSize: 11 }}>Lv.{fighter.level}{fighter.shield ? ' 🛡️' : ''}{fighter.critGuaranteed ? ' ⚡' : ''}</span>
      </div>
      <div style={{ height: 9, marginTop: 3, background: '#1F2937', border: '2px solid #F8FAFC', boxShadow: '0 0 0 1px #000', display: 'flex', justifyContent: side === 'npc' ? 'flex-end' : 'flex-start' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, transition: `width .35s ease ${delayMs}ms, background .3s` }} />
      </div>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#fff', textShadow: '0 1px 0 #000', marginTop: 1 }}>{fighter.energy.toLocaleString()} / {fighter.energyMax.toLocaleString()}</div>
    </div>
  );
}

export default function BattleStage({ events, player, npc, playerLabel, npcLabel, npcEmoji, playerTier, onBusyChange }) {
  const [cur, setCur] = useState(null);
  const [dialog, setDialog] = useState(null); // 아래 대사 창 — 마지막 행동을 남겨 둔다
  const [doneCount, setDoneCount] = useState(0); // 재생을 끝낸 기록 수
  const timer = useRef(null);

  // 다시 도전하면 events가 비므로 처음부터
  useEffect(() => {
    if (events.length >= doneCount) return;
    clearTimeout(timer.current);
    setDoneCount(0); setCur(null); setDialog(null); // eslint-disable-line react-hooks/set-state-in-effect
  }, [events.length, doneCount]);

  useEffect(() => {
    if (cur || doneCount >= events.length) return;
    const ev = events[doneCount];
    setCur(ev); // eslint-disable-line react-hooks/set-state-in-effect
    if (ev.entry.kind !== 'regen') setDialog(ev);
    timer.current = setTimeout(() => { setDoneCount(c => c + 1); setCur(null); }, durationOf(ev));
  }, [events, cur, doneCount]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const busy = !!cur || doneCount < events.length;
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);

  const e = cur?.entry;
  const actor = e?.side;               // 'player' | 'npc'
  const target = actor === 'player' ? 'npc' : actor === 'npc' ? 'player' : null;
  const cut = e && hasCutin(e);
  const delay = cut ? CUTIN_MS : 0;
  const isAttack = e && (e.kind === 'attack' || e.kind === 'miss' || e.kind === 'fumble');
  const playerArmor = ARMOR_TIERS[playerTier] || ARMOR_TIERS[0];

  // 장수 한 명의 움직임 클래스·변수
  const motion = (side) => {
    if (!e) return {};
    const dir = side === 'player' ? 1 : -1;
    if (side === actor && isAttack && e.kind !== 'fumble') return { cls: 'dm-st-dash', vars: { '--dx': `${dir * 92}px`, animationDelay: `${delay}ms` } };
    if (side === actor && e.kind === 'fumble') return { cls: 'dm-st-stumble', vars: {} };
    if (side === target && e.kind === 'attack') return { cls: 'dm-st-hit', vars: { '--kb': `${-dir * 14}px`, animationDelay: `${delay + 200}ms` } };
    if (side === target && e.kind === 'miss') return { cls: 'dm-st-dodge', vars: { '--kb': `${-dir * 22}px`, animationDelay: `${delay + 150}ms` } };
    return {};
  };
  // 결과 줄: 진 쪽이 쓰러진다 (재생이 끝나도 쓰러진 채로)
  const fallen = (f) => f.energy <= 0;

  const sprite = (side) => {
    const m = motion(side);
    const f = side === 'player' ? player : npc;
    return (
      <div key={`${side}-${cur?.key || 'idle'}`} className={m.cls}
        style={{ position: 'absolute', bottom: 26, [side === 'player' ? 'left' : 'right']: '14%', ...m.vars,
          ...(fallen(f) && !(cur && e?.kind !== 'result') ? { transform: `rotate(${side === 'player' ? -90 : 90}deg) translate(${side === 'player' ? '-14px' : '14px'}, 10px)`, opacity: 0.75, transition: 'transform .5s, opacity .5s' } : {}) }}>
        {side === 'npc' && npcEmoji && <div style={{ position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)', fontSize: 18, lineHeight: 1 }}>{npcEmoji}</div>}
        <div className="dm-st-idle" style={{ animationDelay: side === 'npc' ? '.4s' : '0s' }}>
          <PixelWarrior armor={side === 'player' ? playerArmor : NPC_ARMOR} size={72} flip={side === 'npc'} />
        </div>
        {/* 회복·보호막·버프 빛 */}
        {e && side === actor && ['heal', 'regen', 'shield', 'buff'].includes(e.kind) && (
          <div className="dm-st-aura" style={{ animationDelay: `${delay}ms`, borderColor: e.kind === 'shield' ? '#60A5FA' : e.kind === 'buff' ? '#A78BFA' : '#4ADE80' }} />
        )}
        {/* 베기 자국 + 숫자 */}
        {e && side === target && e.kind === 'attack' && (
          <svg className="dm-st-slash" viewBox="0 0 40 40" width="64" height="64" style={{ animationDelay: `${delay + 180}ms`, position: 'absolute', left: 4, top: 0 }}>
            <path d={side === 'npc' ? 'M6 34 L34 6' : 'M34 34 L6 6'} stroke={e.crit ? '#FDE047' : '#fff'} strokeWidth={e.crit ? 5 : 3.5} strokeLinecap="round" />
          </svg>
        )}
        {e && (
          (side === target && (e.kind === 'attack' || e.kind === 'miss')) ||
          (side === actor && ['heal', 'regen', 'fumble', 'shield', 'buff'].includes(e.kind))
        ) && (
          <div className="dm-st-dmg" style={{ animationDelay: `${delay + 220}ms`, color: popColor(e), fontSize: e.crit ? 26 : 20 }}>{popText(e)}</div>
        )}
      </div>
    );
  };

  const speaker = dialog?.entry.side;
  return (
    <div style={{ margin: '0 16px 12px' }}>
      <div key={e?.crit ? `q-${cur.key}` : 'still'} className={e?.crit ? 'dm-st-quake' : undefined} style={{ animationDelay: `${delay + 200}ms`,
        position: 'relative', height: 200, borderRadius: 14, overflow: 'hidden', border: '3px solid #1F2937', boxShadow: '0 0 0 2px #F8FAFC inset',
        // 들판 배경 — 하늘·먼 산·풀밭 (그림 파일 없이 색 면으로)
        background: [
          'linear-gradient(180deg, transparent 70%, #5B7F2E 70%, #4D6B27 100%)',
          'repeating-linear-gradient(90deg, transparent 0 12px, rgba(0,0,0,.06) 12px 14px)',
          'radial-gradient(120% 60% at 20% 78%, #7FA05A 0 40%, transparent 41%)',
          'radial-gradient(90% 50% at 85% 80%, #6E9150 0 40%, transparent 41%)',
          'linear-gradient(180deg, #7DB4E6 0%, #CDE6F7 70%)',
        ].join(','),
      }}>
        <div style={{ position: 'absolute', top: 8, left: 10, right: 10, display: 'flex', gap: 14, zIndex: 3 }}>
          {/* 체력은 맞는 순간(컷인 뒤 베기)에 줄어들게 */}
          <HpBar name={playerLabel} fighter={player} side="player" delayMs={delay + 220} />
          <HpBar name={npcLabel} fighter={npc} side="npc" delayMs={delay + 220} />
        </div>
        {sprite('player')}
        {sprite('npc')}
        {/* 필살기 컷인 — 행동한 장수 얼굴과 기술 이름이 띠로 지나간다 */}
        {e && cut && (
          <div key={`cut-${cur.key}`} className="dm-st-cutin" style={{ '--from': actor === 'player' ? '-100%' : '100%', '--to': actor === 'player' ? '100%' : '-100%',
            position: 'absolute', left: 0, right: 0, top: 70, height: 66, zIndex: 4, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px',
            flexDirection: actor === 'player' ? 'row' : 'row-reverse',
            background: `linear-gradient(90deg, ${SIDE_COLOR[actor]}ee, ${SIDE_COLOR[actor]}aa)`, borderTop: '2px solid #fff', borderBottom: '2px solid #fff' }}>
            <PixelWarrior armor={actor === 'player' ? playerArmor : NPC_ARMOR} size={64} headOnly flip={actor === 'npc'} />
            <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', textShadow: '2px 2px 0 #000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {cur.icon || (e.crit ? '💥' : '✨')} {e.move}{e.crit ? ' 크리티컬!' : '!'}
            </div>
          </div>
        )}
      </div>
      {/* 대사 창 — 얼굴 + 이름 + 한 줄 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, padding: '8px 10px', minHeight: 58, boxSizing: 'border-box',
        background: '#0F172A', border: '3px solid #F8FAFC', boxShadow: '0 0 0 2px #0F172A', borderRadius: 8, color: '#F8FAFC' }}>
        {speaker ? (
          <>
            <div style={{ width: 40, height: 40, flexShrink: 0, background: '#1E293B', border: `2px solid ${SIDE_COLOR[speaker]}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <PixelWarrior armor={speaker === 'player' ? playerArmor : NPC_ARMOR} size={40} headOnly flip={speaker === 'npc'} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: speaker === 'player' ? '#93C5FD' : '#FCA5A5' }}>{speaker === 'player' ? playerLabel : npcLabel}</div>
              <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.35, wordBreak: 'keep-all' }}>{lineOf(dialog.entry)}</div>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 15, fontWeight: 700, width: '100%', textAlign: 'center' }}>
            {dialog ? dialog.entry.text : '공격 버튼을 눌러 배틀을 시작하세요'}
          </div>
        )}
      </div>
    </div>
  );
}

function popText(e) {
  switch (e.kind) {
    case 'attack': return `${e.crit ? '💥' : ''}-${e.amount}`;
    case 'miss': return '회피!';
    case 'fumble': return '실수!';
    case 'heal': case 'regen': return `+${e.amount}`;
    case 'shield': return '🛡️';
    case 'buff': return '⚡';
    default: return '';
  }
}
function popColor(e) {
  if (e.kind === 'attack') return e.crit ? '#FDE047' : '#fff';
  if (e.kind === 'heal' || e.kind === 'regen') return '#4ADE80';
  if (e.kind === 'shield') return '#93C5FD';
  if (e.kind === 'buff') return '#C4B5FD';
  return '#E5E7EB';
}
// 대사 창 문장 — 영걸전처럼 짧은 외침
function lineOf(e) {
  switch (e.kind) {
    case 'attack': return e.crit ? `받아라, ${e.move}! (${e.amount} 크리티컬)` : `${e.move}! (${e.amount} 데미지)`;
    case 'miss': return `${e.move}… 빗나갔다!`;
    case 'fumble': return '앗, 실수다!';
    case 'heal': return `${e.move}! 기력 +${e.amount}`;
    case 'shield': return `${e.move}! 보호막을 펼친다`;
    case 'buff': return `${e.move}! 다음 일격은 크리티컬`;
    default: return e.text;
  }
}
