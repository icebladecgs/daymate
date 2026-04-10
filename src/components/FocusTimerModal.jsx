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
  const [viewportHeight, setViewportHeight] = useState(() => window.visualViewport?.height || window.innerHeight || 800);
  const interval = useRef(null);

  const opt = TIMER_OPTIONS[timerIdx];
  const pct = ((opt.sec - sec) / opt.sec) * 100;
  const min = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss  = String(sec % 60).padStart(2, '0');
  const isCompact = viewportHeight < 780;
  const timerSize = isCompact ? 180 : 220;
  const timerRadius = isCompact ? 80 : 100;

  useEffect(() => {
    const updateViewport = () => setViewportHeight(window.visualViewport?.height || window.innerHeight || 800);
    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('resize', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('resize', updateViewport);
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    interval.current = setInterval(() => {
      setSec(s => {
        if (s <= 1) {
          clearInterval(interval.current);
          setRunning(false);
          setDone(true);
          [0, 300, 600].forEach(d => setTimeout(() => playSound(880, 400), d));
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval.current);
  }, [running]);

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
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1000,
      background: 'rgba(10,12,30,0.97)',
      overflowY: 'auto',
      paddingTop: 'max(18px, env(safe-area-inset-top))',
      paddingRight: 16,
      paddingLeft: 16,
      paddingBottom: 'calc(116px + env(safe-area-inset-bottom))',
      boxSizing: 'border-box',
    }}>
      <div style={{
        minHeight: 'calc(100dvh - 134px - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        maxWidth: 360,
        margin: '0 auto',
      }}>
      <button onClick={onClose} style={{ position: 'absolute', top: 'max(18px, env(safe-area-inset-top))', right: 18, background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 28, cursor: 'pointer', lineHeight: 1 }}>✕</button>
      <div style={{ fontSize: isCompact ? 14 : 15, color: 'var(--dm-sub)', marginBottom: 6, fontWeight: 700, textAlign: 'center' }}>집중 중</div>
      <div style={{ fontSize: isCompact ? 18 : 20, fontWeight: 900, color: 'var(--dm-text)', marginBottom: isCompact ? 22 : 32, textAlign: 'center', maxWidth: 280, lineHeight: 1.45 }}>{task.title}</div>

      {!running && !done && (
        <div style={{
          width: '100%',
          maxWidth: 320,
          marginBottom: isCompact ? 16 : 22,
          padding: isCompact ? '10px 12px' : '12px 14px',
          borderRadius: 16,
          border: '1px solid rgba(167,139,250,.26)',
          background: 'rgba(167,139,250,.09)',
          textAlign: 'left',
        }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#C4B5FD', marginBottom: 6 }}>집중 모드 안내</div>
          <div style={{ fontSize: isCompact ? 12 : 13, color: 'var(--dm-text)', lineHeight: 1.65 }}>
            정해진 시간 동안 이 할 일 하나에만 집중해서 끝내는 모드입니다.
            <br />
            집중을 마치고 할 일을 완수하면 추가 XP 보너스를 받을 수 있어요.
          </div>
        </div>
      )}

      <div style={{ position: 'relative', width: timerSize, height: timerSize, marginBottom: isCompact ? 20 : 30 }}>
        <svg width={timerSize} height={timerSize} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={timerSize / 2} cy={timerSize / 2} r={timerRadius} fill="none" stroke="var(--dm-input)" strokeWidth={isCompact ? 9 : 10} />
          <circle cx={timerSize / 2} cy={timerSize / 2} r={timerRadius} fill="none"
            stroke={done ? '#4ADE80' : '#A78BFA'} strokeWidth={isCompact ? 9 : 10}
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * timerRadius}`}
            strokeDashoffset={`${2 * Math.PI * timerRadius * (1 - pct / 100)}`}
            style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {done ? (
            <div style={{ fontSize: isCompact ? 38 : 48 }}>🎉</div>
          ) : (
            <>
              <div style={{ fontSize: isCompact ? 38 : 48, fontWeight: 900, color: 'var(--dm-text)', letterSpacing: 2 }}>{min}:{ss}</div>
              <div style={{ fontSize: 12, color: 'var(--dm-muted)', marginTop: 4 }}>남음</div>
            </>
          )}
        </div>
      </div>

      {done ? (
        <div style={{ textAlign: 'center', width: '100%' }}>
          <div style={{ fontSize: isCompact ? 16 : 18, fontWeight: 900, color: '#4ADE80', marginBottom: 8 }}>{opt.label} 집중 완료! 🌟</div>
          <div style={{ fontSize: 14, color: '#FCD34D', fontWeight: 900, marginBottom: isCompact ? 14 : 20 }}>+{opt.xp} XP 획득!</div>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, marginBottom: isCompact ? 16 : 20, width: '100%' }}>
              {TIMER_OPTIONS.map((o, i) => (
                <button key={o.label} onClick={() => changeTimer(i)} style={{
                  padding: isCompact ? '6px 8px' : '6px 10px', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
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
          <div style={{ display: 'flex', gap: 10, width: '100%' }}>
            <button onClick={() => setRunning(r => !r)} style={{
              ...S.btn, flex: 1, marginTop: 0,
              background: running ? 'linear-gradient(135deg,#F87171,#ef4444)' : 'linear-gradient(135deg,#A78BFA,#7c3aed)',
            }}>
              {running ? '⏸ 일시정지' : '▶ 시작'}
            </button>
            <button onClick={reset} style={{ ...S.btnGhost, width: isCompact ? 88 : 96, marginTop: 0 }}>🔄 초기화</button>
          </div>
        </>
      )}
      </div>
    </div>
  );
}
