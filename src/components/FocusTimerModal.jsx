import { useEffect, useRef, useState } from 'react';
import S from '../styles.js';
import { playSound } from '../utils/sound.js';

const TIMER_OPTIONS = [
  { label: '5분',  sec:  5 * 60, xp:  5 },
  { label: '15분', sec: 15 * 60, xp: 15 },
  { label: '25분', sec: 25 * 60, xp: 30 },
  { label: '50분', sec: 50 * 60, xp: 70 },
];

export default function FocusTimerModal({ task, onClose, onToggleTask, onXp }) {
  const [timerIdx, setTimerIdx] = useState(2);
  const [sec, setSec] = useState(TIMER_OPTIONS[2].sec);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const interval = useRef(null);

  const opt = TIMER_OPTIONS[timerIdx];
  const pct = ((opt.sec - sec) / opt.sec) * 100;
  const min = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss  = String(sec % 60).padStart(2, '0');

  useEffect(() => {
    if (running && sec > 0) {
      interval.current = setInterval(() => setSec(s => s - 1), 1000);
    } else if (sec === 0 && running) {
      setRunning(false);
      setDone(true);
      [0, 300, 600].forEach(d => setTimeout(() => playSound(880, 400), d));
    }
    return () => clearInterval(interval.current);
  }, [running, sec]);

  const reset = () => {
    clearInterval(interval.current);
    setSec(TIMER_OPTIONS[timerIdx].sec);
    setRunning(false);
    setDone(false);
  };

  const changeTimer = (i) => {
    setTimerIdx(i);
    setSec(TIMER_OPTIONS[i].sec);
    setRunning(false);
    setDone(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(10,12,30,0.97)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <button onClick={onClose} style={{ position: 'absolute', top: 20, right: 20, background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 28, cursor: 'pointer', lineHeight: 1 }}>✕</button>
      <div style={{ fontSize: 15, color: 'var(--dm-sub)', marginBottom: 8, fontWeight: 700, textAlign: 'center' }}>집중 중</div>
      <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 40, textAlign: 'center', maxWidth: 280 }}>{task.title}</div>

      <div style={{ position: 'relative', width: 220, height: 220, marginBottom: 40 }}>
        <svg width="220" height="220" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="110" cy="110" r="100" fill="none" stroke="var(--dm-input)" strokeWidth="10" />
          <circle cx="110" cy="110" r="100" fill="none"
            stroke={done ? '#4ADE80' : '#A78BFA'} strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 100}`}
            strokeDashoffset={`${2 * Math.PI * 100 * (1 - pct / 100)}`}
            style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {done ? (
            <div style={{ fontSize: 48 }}>🎉</div>
          ) : (
            <>
              <div style={{ fontSize: 48, fontWeight: 900, color: 'var(--dm-text)', letterSpacing: 2 }}>{min}:{ss}</div>
              <div style={{ fontSize: 12, color: 'var(--dm-muted)', marginTop: 4 }}>남음</div>
            </>
          )}
        </div>
      </div>

      {done ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#4ADE80', marginBottom: 8 }}>{opt.label} 집중 완료! 🌟</div>
          <div style={{ fontSize: 14, color: '#FCD34D', fontWeight: 900, marginBottom: 20 }}>+{opt.xp} XP 획득!</div>
          <button onClick={() => { onToggleTask(task.id); onXp?.(opt.xp); onClose(); }}
            style={{ ...S.btn, marginBottom: 10, background: 'linear-gradient(135deg,#4ADE80,#22c55e)' }}>
            ✅ 할일 완료 + XP 받기
          </button>
          <button onClick={() => { onXp?.(opt.xp); onClose(); }}
            style={{ ...S.btnGhost, marginBottom: 0 }}>XP만 받고 닫기</button>
        </div>
      ) : (
        <>
          {!running && sec === opt.sec && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
              {TIMER_OPTIONS.map((o, i) => (
                <button key={o.label} onClick={() => changeTimer(i)} style={{
                  padding: '6px 10px', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1.5px solid ${timerIdx === i ? '#A78BFA' : 'var(--dm-border)'}`,
                  background: timerIdx === i ? 'rgba(167,139,250,.2)' : 'var(--dm-input)',
                  color: timerIdx === i ? '#A78BFA' : 'var(--dm-muted)',
                }}>
                  {o.label}
                  <div style={{ fontSize: 10, color: timerIdx === i ? '#A78BFA' : 'var(--dm-muted)', marginTop: 1 }}>+{o.xp}XP</div>
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setRunning(r => !r)} style={{
              ...S.btn, width: 120,
              background: running ? 'linear-gradient(135deg,#F87171,#ef4444)' : 'linear-gradient(135deg,#A78BFA,#7c3aed)',
            }}>
              {running ? '⏸ 일시정지' : '▶ 시작'}
            </button>
            <button onClick={reset} style={{ ...S.btnGhost, width: 80 }}>🔄 초기화</button>
          </div>
        </>
      )}
    </div>
  );
}
