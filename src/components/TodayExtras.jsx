// 오늘 탭 🌤 날씨 · 📌 다가오는 날 (2026-11-05)
import { useEffect, useMemo, useState } from "react";
import S, { boxCard } from "../styles.js";
import { store } from "../utils/storage.js";
import { addDays } from "../utils/date.js";
import { getUpcomingDays } from "../data/contacts.js";
import { DEFAULT_CITY, loadWeather, weatherAdvice, weatherDayLabel, weatherTodayView } from "../utils/weather.js";

const RAIN_COLOR = "#5B7CFA"; // 밝은·어두운 화면 모두에서 보이는 파랑
const OPEN_KEY = "dm_weather_open";
const SHOW_MORE = 10;

// 새 디자인의 칸 접기·펼치기 — 칸 오른쪽 끝 화살표 하나
export function FoldButton({ open, onClick }) {
  return (
    <button onClick={onClick} aria-expanded={open} aria-label={open ? "접기" : "펼치기"} title={open ? "접기" : "펼치기"}
      style={{ width: 28, height: 32, padding: 0, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", color: "var(--dm-muted)", fontSize: 14, cursor: "pointer" }}>
      {open ? "▲" : "▼"}
    </button>
  );
}

// 새 디자인: 제목과 내용을 둥근 칸 하나로 묶는다 (칸 안에 칸을 또 넣지 않는다). 예전 화면은 그대로
export function SectionBox({ on, children }) {
  if (!on) return <>{children}</>;
  return <div style={boxCard}>{children}</div>;
}

export function WeatherCard({ city, dateStr, onSetCity }) {
  const name = (city || "").trim() || DEFAULT_CITY;
  const [state, setState] = useState({ status: "loading" });
  const [open, setOpen] = useState(() => store.get(OPEN_KEY, false) === true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let alive = true;
    loadWeather(name, dateStr).then((r) => { if (alive) setState(r); });
    return () => { alive = false; };
  }, [name, dateStr]);

  const toggle = () => setOpen((v) => { store.set(OPEN_KEY, !v); return !v; });
  const startEdit = () => { setDraft((city || "").trim()); setEditing(true); };
  const saveCity = () => { setEditing(false); setState({ status: "loading" }); onSetCity?.(draft.trim()); };

  const cityEditor = (
    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="도시 이름 (예: 부산)" maxLength={30} autoFocus
        onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) saveCity(); }}
        style={{ ...S.input, flex: 1, minWidth: 0, marginBottom: 0 }} />
      <button onClick={saveCity} style={{ padding: "0 14px", minHeight: 40, fontSize: 14, fontWeight: 800, borderRadius: 10, border: "none", background: RAIN_COLOR, color: "#fff", cursor: "pointer", flexShrink: 0 }}>저장</button>
      <button onClick={() => setEditing(false)} style={{ padding: "0 10px", minHeight: 40, fontSize: 14, fontWeight: 700, borderRadius: 10, border: "1px solid var(--dm-border)", background: "none", color: "var(--dm-muted)", cursor: "pointer", flexShrink: 0 }}>취소</button>
    </div>
  );

  // 불러오는 중·인터넷 없음은 자리를 차지하지 않는다. 고른 도시를 못 찾은 것만 알려 준다.
  if (state.status === "notfound") {
    return (
      <div style={{ ...S.card, padding: "12px 14px", marginTop: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 14, color: "var(--dm-text)" }}>
          <span>"{name}" 날씨를 찾지 못했어요</span>
          <button onClick={startEdit} style={{ padding: "4px 8px", fontSize: 14, fontWeight: 800, color: RAIN_COLOR, background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>도시 바꾸기</button>
        </div>
        {editing && cityEditor}
      </div>
    );
  }
  if (state.status !== "ok") return null;

  const wx = state.data;
  const today = weatherTodayView(wx, dateStr);
  if (!today) return null;
  const advice = weatherAdvice(today);

  return (
    <div style={{ ...S.card, padding: "12px 14px", marginTop: 10 }}>
      <button onClick={toggle} aria-expanded={open} style={{ display: "block", width: "100%", padding: 0, background: "none", border: "none", outline: "none", textAlign: "left", color: "inherit", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>{wx.icon}</span>
          <span style={{ fontSize: 17, fontWeight: 900, color: "var(--dm-text)", flexShrink: 0 }}>{wx.temp}°</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "var(--dm-text)" }}>
            {wx.desc} · {today.max}°/{today.min}°
            {today.rain != null && <span style={{ color: today.rain >= 30 ? RAIN_COLOR : "var(--dm-muted)", fontWeight: today.rain >= 30 ? 800 : 400 }}> · 비 {today.rain}%</span>}
          </span>
          <span style={{ fontSize: 13, color: "var(--dm-muted)", flexShrink: 0 }}>{open ? "접기 ▲" : "7일 ▼"}</span>
        </div>
        {advice && <div style={{ fontSize: 14, color: "var(--dm-sub)", marginTop: 6 }}>{advice}</div>}
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          {wx.days.map((row) => { const d = row.date === dateStr ? today : row; return (
            <div key={d.date} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid var(--dm-row)", fontSize: 15, color: "var(--dm-text)" }}>
              {/* 요일 아래 날짜 — 한 줄에 나란히 두면 좁은 화면에서 날씨 설명이 잘린다 */}
              <span style={{ width: 42, flexShrink: 0, lineHeight: 1.25 }}>
                <span style={{ display: "block", fontWeight: d.date === dateStr ? 900 : 700 }}>{weatherDayLabel(d.date, dateStr)}</span>
                <span style={{ display: "block", fontSize: 13, color: "var(--dm-sub)" }}>{Number(d.date.slice(5, 7))}/{Number(d.date.slice(8, 10))}</span>
              </span>
              <span style={{ width: 26, flexShrink: 0, fontSize: 18, textAlign: "center" }}>{d.icon}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "var(--dm-sub)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.desc}</span>
              {d.rain != null && <span style={{ flexShrink: 0, fontSize: 14, color: d.rain >= 30 ? RAIN_COLOR : "var(--dm-muted)", fontWeight: d.rain >= 30 ? 800 : 400 }}>비 {d.rain}%</span>}
              <span style={{ width: 66, flexShrink: 0, textAlign: "right", fontWeight: 800 }}>{d.max}°/{d.min}°</span>
            </div>
          ); })}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 8, borderTop: "1px solid var(--dm-row)", fontSize: 14, color: "var(--dm-muted)" }}>
            <span>📍 {wx.city}</span>
            <button onClick={startEdit} style={{ padding: "4px 8px", fontSize: 14, fontWeight: 800, color: RAIN_COLOR, background: "none", border: "none", cursor: "pointer" }}>도시 바꾸기</button>
          </div>
          {editing && cityEditor}
        </div>
      )}
    </div>
  );
}

export function UpcomingDays({ contacts, dateStr, excludeWithin, onOpen, heading, boxed }) {
  const [more, setMore] = useState(false);
  const all = useMemo(() => getUpcomingDays(contacts, dateStr, { excludeWithin }), [contacts, dateStr, excludeWithin]);
  if (!all.length) return null; // 등록한 생일·기념일이 없으면 칸을 비워 두지 않는다
  const shown = all.slice(0, more ? SHOW_MORE : 3);
  const moreCount = Math.min(all.length, SHOW_MORE) - 3;
  return (
    <SectionBox on={boxed}>
      {heading}
      <div style={boxed ? {} : { ...S.card, padding: "6px 14px" }}>
        {shown.map((ev, i) => {
          const [, m, d] = addDays(dateStr, ev.dday).split("-").map(Number);
          return (
            <button key={`${ev.contactId}_${ev.type}_${ev.label}_${i}`} onClick={onOpen} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 0", background: "none", border: "none", borderTop: i ? "1px solid var(--dm-row)" : "none", borderRadius: 0, textAlign: "left", color: "var(--dm-text)", cursor: "pointer" }}>
              <span style={{ width: 58, flexShrink: 0, fontSize: 15, fontWeight: 900, color: RAIN_COLOR }}>D-{ev.dday}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.name}님 {ev.label}</span>
              <span style={{ flexShrink: 0, fontSize: 14, color: "var(--dm-muted)" }}>{m}/{d}</span>
            </button>
          );
        })}
        {moreCount > 0 && (
          <button onClick={() => setMore((v) => !v)} style={{ display: "block", width: "100%", padding: "9px 0", background: "none", border: "none", borderTop: "1px solid var(--dm-row)", borderRadius: 0, fontSize: 14, fontWeight: 800, color: RAIN_COLOR, cursor: "pointer" }}>
            {more ? "접기 ▲" : `${moreCount}개 더 보기 ▼`}
          </button>
        )}
      </div>
    </SectionBox>
  );
}
