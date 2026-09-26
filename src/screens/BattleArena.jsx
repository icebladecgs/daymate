import { useState } from "react";
import S from "../styles.js";
import { GROWTH_STATS, calcStatScore } from "../data/growthStats.js";
import { calcLevel } from "../data/stats.js";
import { NPCS, getNpcAvatar } from "../data/battle/npcs.js";

const NICKNAME_MAX = 10;

export default function BattleArena({ totalScore, statXp, battleRecord, battleNickname, onSetBattleNickname, onBack, onStartBattle }) {
  const [showAll, setShowAll] = useState(false);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const levelInfo = calcLevel(totalScore || 0);
  const record = battleRecord || { wins: 0, losses: 0, streak: 0, bestStreak: 0, fame: 0, defeatedNpcIds: [], vsRecord: {} };
  const energyMax = Math.max(150, Math.round(totalScore || 0));
  // 내 레벨보다 너무 높은 상대는 기본적으로 접어두고, 원하면 "더 보기"로 펼쳐서 도전 가능
  const visibleNpcs = showAll ? NPCS : NPCS.filter(n => n.level <= levelInfo.level + 2);
  const hiddenCount = NPCS.length - visibleNpcs.length;

  return (
    <div style={S.content}>
      <div style={S.topbar}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', fontSize: 22, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>←</button>
        <div style={{ flex: 1, paddingLeft: 8 }}>
          <div style={S.title}>⚔️ 일기토</div>
          <div style={S.sub}>내 캐릭터로 NPC와 겨뤄보세요</div>
        </div>
      </div>

      {/* 내 캐릭터 요약 */}
      <div style={{ ...S.card, background: "linear-gradient(135deg,rgba(75,111,255,.15),rgba(108,142,255,.07))", border: "1.5px solid rgba(108,142,255,.35)" }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 20 }}>{levelInfo.icon}</span>
          <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--dm-text)' }}>{levelInfo.title}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#6C8EFF' }}>Lv.{levelInfo.level}</span>
          <span style={{ fontSize: 11, color: 'var(--dm-muted)', marginLeft: 'auto' }}>Energy {energyMax.toLocaleString()}</span>
        </div>

        {/* 배틀 닉네임 — 나중에 사람끼리 붙을 때 쓸 이름 */}
        <div style={{ marginBottom: 12 }}>
          {editingNickname ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={nicknameDraft}
                onChange={e => setNicknameDraft(e.target.value.slice(0, NICKNAME_MAX))}
                placeholder={`배틀 닉네임 (최대 ${NICKNAME_MAX}자)`}
                autoFocus
                style={{ ...S.input, flex: 1, marginBottom: 0, fontSize: 13, padding: '8px 10px' }}
              />
              <button
                onClick={() => { onSetBattleNickname?.(nicknameDraft.trim()); setEditingNickname(false); }}
                style={{ background: '#6C8EFF', border: 'none', borderRadius: 8, padding: '0 14px', color: '#fff', fontWeight: 900, fontSize: 12, cursor: 'pointer' }}
              >저장</button>
              <button
                onClick={() => setEditingNickname(false)}
                style={{ background: 'var(--dm-input)', border: 'none', borderRadius: 8, padding: '0 12px', color: 'var(--dm-muted)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
              >취소</button>
            </div>
          ) : (
            <button
              onClick={() => { setNicknameDraft(battleNickname || ''); setEditingNickname(true); }}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}
            >
              <span style={{ fontSize: 12, color: battleNickname ? 'var(--dm-text)' : 'var(--dm-muted)', fontWeight: battleNickname ? 900 : 400 }}>
                {battleNickname ? `🏷️ ${battleNickname}` : '🏷️ 닉네임을 정해주세요'}
              </span>
              <span style={{ fontSize: 10, color: '#6C8EFF', textDecoration: 'underline' }}>수정</span>
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {GROWTH_STATS.map(stat => {
            const score = calcStatScore(statXp?.[stat.id] || 0);
            return (
              <div key={stat.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, width: 20, textAlign: 'center' }}>{stat.icon}</span>
                <span style={{ fontSize: 11, color: 'var(--dm-sub)', width: 42, flexShrink: 0 }}>{stat.name}</span>
                <div style={{ flex: 1, height: 5, background: 'var(--dm-row)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 4, background: 'linear-gradient(90deg,#4B6FFF,#6C8EFF)', width: `${score}%` }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--dm-text)', width: 24, textAlign: 'right' }}>{score}</span>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, background: 'var(--dm-input)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--dm-muted)' }}>전적</div>
            <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--dm-text)' }}>{record.wins}승 {record.losses}패</div>
          </div>
          <div style={{ flex: 1, background: 'var(--dm-input)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--dm-muted)' }}>연승</div>
            <div style={{ fontSize: 13, fontWeight: 900, color: record.streak > 0 ? '#F97316' : 'var(--dm-text)' }}>{record.streak}연승</div>
          </div>
          <div style={{ flex: 1, background: 'var(--dm-input)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--dm-muted)' }}>명성</div>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#A78BFA' }}>{(record.fame || 0).toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* NPC 목록 */}
      <div style={S.sectionTitle}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={S.sectionEmoji}>🥋</span>도전 상대</span>
      </div>
      {visibleNpcs.map(npc => {
        const defeated = (record.defeatedNpcIds || []).includes(npc.id);
        const vs = record.vsRecord?.[npc.id];
        return (
          <div key={npc.id} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--dm-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
              {getNpcAvatar(npc.id)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--dm-text)' }}>
                Lv.{npc.level} {npc.name} {defeated && <span style={{ fontSize: 10, color: '#4ADE80', fontWeight: 700 }}>· 격파완료</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginTop: 2 }}>
                Energy {npc.energyMax.toLocaleString()} · 「{npc.trait?.label}」
                {vs && <span style={{ color: '#6C8EFF', fontWeight: 700 }}> · 상대전적 {vs.wins || 0}승 {vs.losses || 0}패</span>}
              </div>
            </div>
            <button onClick={() => onStartBattle(npc.id)} style={{ background: 'rgba(75,111,255,.15)', border: '1px solid rgba(108,142,255,.4)', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 900, color: '#6C8EFF', cursor: 'pointer', flexShrink: 0 }}>
            도전
            </button>
          </div>
        );
      })}
      {hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          style={{ ...S.btnGhost, width: '100%', marginTop: 4 }}
        >
          더 강한 상대 보기 (+{hiddenCount}명)
        </button>
      )}
      <div style={{ height: 16 }} />
    </div>
  );
}
