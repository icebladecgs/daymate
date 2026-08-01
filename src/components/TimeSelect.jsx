import { useState } from "react";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

const selectStyle = {
  fontSize: 13, padding: '3px 4px', borderRadius: 8, border: '1px solid rgba(108,142,255,.4)',
  background: 'var(--dm-input)', color: 'var(--dm-text)', fontFamily: 'inherit', cursor: 'pointer',
};

function snapMinute(m) {
  if (MINUTES.includes(m)) return m;
  if (!m) return '00';
  return String(Math.round(Number(m) / 5) * 5 % 60).padStart(2, '0');
}

// 시/분 드롭다운 조합 — 마우스로도 조작 가능한 시간 선택기 (네이티브 <input type="time"> 대체)
export default function TimeSelect({ value, onChange, onClose, autoFocus }) {
  const [h, m] = (value || '').split(':');
  const [hour, setHour] = useState(HOURS.includes(h) ? h : '00');
  const [minute, setMinute] = useState(snapMinute(m));

  const commit = (nh, nm) => {
    setHour(nh);
    setMinute(nm);
    onChange(`${nh}:${nm}`);
  };

  return (
    <div
      style={{ display: 'flex', gap: 4, alignItems: 'center' }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) onClose?.();
      }}
    >
      <select autoFocus={autoFocus} value={hour} onChange={(e) => commit(e.target.value, minute)} style={selectStyle}>
        {HOURS.map((hh) => <option key={hh} value={hh}>{hh}</option>)}
      </select>
      <span style={{ color: 'var(--dm-muted)' }}>:</span>
      <select value={minute} onChange={(e) => commit(hour, e.target.value)} style={selectStyle}>
        {MINUTES.map((mm) => <option key={mm} value={mm}>{mm}</option>)}
      </select>
    </div>
  );
}
