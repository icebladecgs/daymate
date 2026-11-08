// 오늘 탭 🌤 날씨 · 📌 다가오는 날 (2026-11-05)
import { useEffect, useMemo, useState } from "react";
import S, { boxCard } from "../styles.js";
import { store } from "../utils/storage.js";
import { buildUpcomingDays, ddayDateLabel, newDday, pastDdays } from "../utils/ddays.js";
import { ddayLabel } from "../utils/exam.js";
import { upcomingSubEvents, SUBS_TODAY_KEY } from "../utils/subscriptions.js";
import { upcomingDreamEvents, bucketToDream } from "../utils/dreams.js";
import { airGrade, DEFAULT_CITY, loadWeather, weatherAdvice, weatherDayLabel, weatherTodayView } from "../utils/weather.js";
import UndoBar from "./UndoBar.jsx";
import { useUndo, putBack } from "../utils/useUndo.js";

const RAIN_COLOR = "var(--dm-accent, #5B7CFA)"; // 밝은·어두운 화면 모두에서 보이는 파랑
const OPEN_KEY = "dm_weather_open";
const SHOW_MORE = 10;

// 새 디자인의 칸 접기·펼치기 — 칸 오른쪽 끝 화살표 하나
export function FoldButton({ open, onClick }) {
  return (
    <button className="dm-hit" onClick={onClick} aria-expanded={open} aria-label={open ? "접기" : "펼치기"} title={open ? "접기" : "펼치기"}
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
  const air = airGrade(wx.air);
  const advice = weatherAdvice(today, wx.air);

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
        {(air || advice) && (
          <div style={{ fontSize: 14, color: "var(--dm-sub)", marginTop: 6, wordBreak: "keep-all" }}>
            {air && <span style={{ color: air.color, fontWeight: 800 }}>미세먼지 {air.label}</span>}
            {air && advice ? " · " : ""}{advice}
          </div>
        )}
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
          {air && (
            <div style={{ padding: "8px 0", borderTop: "1px solid var(--dm-row)", fontSize: 14, color: "var(--dm-sub)", lineHeight: 1.5, wordBreak: "keep-all" }}>
              <span style={{ color: air.color, fontWeight: 800 }}>미세먼지 {air.label}</span> · PM10 {wx.air.pm10} · PM2.5 {wx.air.pm25} ㎍/㎥
              <span style={{ display: "block", fontSize: 13, color: "var(--dm-muted)" }}>예측값이라 공식 측정치와 다를 수 있어요</span>
            </div>
          )}
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

// 직접 넣는 D-day 입력 (새로 넣기·고치기 같이 씀)
function DdayForm({ initial, minDate, onSave, onDelete, onCancel, first }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [date, setDate] = useState(initial?.date || "");
  const ok = title.trim() && date;
  const save = () => { if (ok) onSave(title, date); };
  return (
    <div style={{ padding: first ? "0 0 10px" : "10px 0", borderTop: first ? "none" : "1px solid var(--dm-row)" }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="이름 (예: 가족 여행)" maxLength={30} autoFocus
        onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) save(); }}
        style={{ ...S.input, marginBottom: 8 }} />
      <input type="date" value={date} min={initial ? undefined : minDate} onChange={(e) => setDate(e.target.value)} aria-label="날짜" style={{ ...S.input, marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 8 }}>
        {onDelete && <button onClick={onDelete} style={{ padding: "0 14px", minHeight: 40, fontSize: 14, fontWeight: 800, borderRadius: 10, border: "1px solid rgba(239,68,68,.4)", background: "none", color: "#EF4444", cursor: "pointer" }}>삭제</button>}
        <span style={{ flex: 1 }} />
        <button onClick={onCancel} style={{ padding: "0 14px", minHeight: 40, fontSize: 14, fontWeight: 700, borderRadius: 10, border: "1px solid var(--dm-border)", background: "none", color: "var(--dm-muted)", cursor: "pointer" }}>취소</button>
        <button onClick={save} disabled={!ok} style={{ padding: "0 16px", minHeight: 40, fontSize: 14, fontWeight: 800, borderRadius: 10, border: "none", background: RAIN_COLOR, color: "#fff", cursor: ok ? "pointer" : "default", opacity: ok ? 1 : 0.5 }}>저장</button>
      </div>
    </div>
  );
}

export function UpcomingDays({ contacts, ddays, setDdays, subs = [], onOpenSubs, wishes = [], places = [], bucketList = [], onOpenDreams, dateStr, excludeWithin, onOpen, heading, boxed }) {
  const [more, setMore] = useState(false);
  const undo = useUndo();
  const [editing, setEditing] = useState(null); // 'new' 또는 고치는 D-day id
  const [pastOpen, setPastOpen] = useState(false);
  const past = useMemo(() => pastDdays(ddays, dateStr), [ddays, dateStr]);
  // 💳 구독 결제일·체험 끝나는 날은 3일 전부터 (구독 화면에서 이 기기만 끌 수 있음, 2026-11-08)
  const subsOn = store.get(SUBS_TODAY_KEY, true) !== false;
  // 🛒·📍 "언제쯤"을 정한 갖고 싶은 것·가고 싶은 곳은 7일 전부터 (2026-11-08)
  const all = useMemo(() => [
    ...buildUpcomingDays(contacts, ddays, dateStr, { excludeWithin }),
    ...(subsOn ? upcomingSubEvents(subs, dateStr, 3) : []),
    ...upcomingDreamEvents(wishes, "wish", dateStr), ...upcomingDreamEvents(places, "place", dateStr),
    ...upcomingDreamEvents((bucketList || []).map(bucketToDream).filter(Boolean), "bucket", dateStr),
  ].sort((a, b) => a.dday - b.dday),
  [contacts, ddays, dateStr, excludeWithin, subs, subsOn, wishes, places, bucketList]);
  const shown = all.slice(0, more ? SHOW_MORE : 3);
  const moreCount = Math.min(all.length, SHOW_MORE) - 3;

  const addDday = (title, date) => { setDdays((prev) => [...prev, newDday(title, date)]); setEditing(null); };
  const saveDday = (id, title, date) => { setDdays((prev) => prev.map((d) => (d.id === id ? { ...d, title: title.trim(), date } : d))); setEditing(null); };
  const removeDday = (d) => {
    const saved = (ddays || []).find((x) => x.id === d.id);
    const idx = (ddays || []).findIndex((x) => x.id === d.id);
    setDdays((prev) => prev.filter((x) => x.id !== d.id));
    setEditing(null);
    if (saved) undo.offer(`"${d.title}" D-day를 지웠어요`, () => setDdays((prev) => putBack(prev, saved, idx)));
  };

  // heading이 함수면 제목 줄 오른쪽에 "＋ 추가"를 넣고, 맨 아래 "＋ D-day 추가" 줄은 뺀다(새 디자인)
  const headerAdd = typeof heading === "function";
  const adding = editing === "new";
  const addBtn = (
    <button className="dm-hit" onClick={() => setEditing(adding ? null : "new")} aria-expanded={adding}
      style={{ height: 32, padding: "0 10px", marginLeft: "auto", borderRadius: 10, border: "none", background: adding ? "var(--dm-accent-soft, rgba(91,124,250,.12))" : "transparent", color: RAIN_COLOR, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
      ＋ 추가
    </button>
  );

  return (
    <SectionBox on={boxed}>
      <UndoBar bar={undo.bar} onUndo={undo.run} />
      {headerAdd ? heading(addBtn) : heading}
      <div style={boxed ? {} : { ...S.card, padding: "6px 14px" }}>
        {headerAdd && all.length === 0 && !adding && (
          <div style={{ padding: "2px 0 4px", fontSize: 14, color: "var(--dm-muted)" }}>다가오는 날이 없어요</div>
        )}
        {shown.map((ev, i) => (
          editing === ev.id && ev.kind === "dday" ? (
            <DdayForm key={ev.key} initial={ev} onSave={(t, d) => saveDday(ev.id, t, d)} onDelete={() => removeDday(ev)} onCancel={() => setEditing(null)} />
          ) : (
            <button key={ev.key} onClick={ev.kind === "dday" ? () => setEditing(ev.id) : ev.kind === "sub" ? onOpenSubs : ev.kind === "dream" ? () => onOpenDreams?.(ev.dreamKind) : onOpen} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 0", background: "none", border: "none", borderTop: i ? "1px solid var(--dm-row)" : "none", borderRadius: 0, textAlign: "left", color: "var(--dm-text)", cursor: "pointer" }}>
              <span style={{ width: 62, flexShrink: 0, fontSize: 15, fontWeight: 900, color: ev.dday <= 7 ? "#EF4444" : RAIN_COLOR }}>{ddayLabel(ev.dday)}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</span>
              {ev.amount && <span style={{ flexShrink: 0, fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{ev.amount}</span>}
              <span style={{ flexShrink: 0, fontSize: 14, color: "var(--dm-muted)" }}>{ddayDateLabel(ev.date, dateStr)}</span>
            </button>
          )
        ))}
        {moreCount > 0 && (
          <button onClick={() => setMore((v) => !v)} style={{ display: "block", width: "100%", padding: "9px 0", background: "none", border: "none", borderTop: "1px solid var(--dm-row)", borderRadius: 0, fontSize: 14, fontWeight: 800, color: RAIN_COLOR, cursor: "pointer" }}>
            {more ? "접기 ▲" : `${moreCount}개 더 보기 ▼`}
          </button>
        )}
        {adding ? (
          <DdayForm minDate={dateStr} onSave={addDday} onCancel={() => setEditing(null)} first={headerAdd && all.length === 0} />
        ) : headerAdd ? null : (
          <button className={boxed ? 'dm-hit' : undefined} onClick={() => setEditing("new")} style={{ display: "block", width: "100%", padding: "9px 0", background: "none", border: "none", borderTop: all.length ? "1px solid var(--dm-row)" : "none", borderRadius: 0, textAlign: "left", fontSize: 15, fontWeight: 800, color: RAIN_COLOR, cursor: "pointer" }}>
            ＋ D-day 추가
          </button>
        )}
        {past.length > 0 && (
          <button onClick={() => setPastOpen((v) => !v)} style={{ display: "block", width: "100%", padding: "9px 0", marginTop: 0, background: "none", border: "none", borderTop: "1px solid var(--dm-row)", borderRadius: 0, color: "var(--dm-sub)", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            {pastOpen ? "지난 D-day 접기 ▲" : `지난 D-day ${past.length}개 ▼`}
          </button>
        )}
        {pastOpen && past.map((ev) => (
          editing === ev.id ? (
            <DdayForm key={ev.key} initial={ev} onSave={(t, d) => saveDday(ev.id, t, d)} onDelete={() => removeDday(ev)} onCancel={() => setEditing(null)} />
          ) : (
            <button key={ev.key} onClick={() => setEditing(ev.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 0", marginTop: 0, background: "none", border: "none", borderTop: "1px solid var(--dm-row)", borderRadius: 0, color: "var(--dm-sub)", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
              <span style={{ width: 62, flexShrink: 0, fontSize: 15, fontWeight: 900, color: "var(--dm-muted)" }}>{ddayLabel(ev.dday)}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</span>
              <span style={{ flexShrink: 0, fontSize: 14, color: "var(--dm-muted)" }}>{ddayDateLabel(ev.date, dateStr)}</span>
            </button>
          )
        ))}
      </div>
    </SectionBox>
  );
}
