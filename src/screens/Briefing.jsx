import { useEffect, useState } from "react";
import { loadBriefing } from "../firebase.js";
import { toDateStr } from "../utils/date.js";
import S, { UI, boxCard } from "../styles.js";
import { SectionHeading } from "../components/TodayLook.jsx";
import { changeColor, formatChange, formatIndicator } from "../utils/briefing.js";
import { marketEventsOf } from "../utils/marketEvents.js";
import { DEFAULT_CITY, loadWeather, weatherAdvice, weatherTodayView, airGrade } from "../utils/weather.js";

// 📰 오늘의 브리핑 (2026-11-12, 소셜 탭 자유게시판 자리) — 서버가 아침 6시에 만든 briefings/{날짜}를 읽기만 한다.
// 링크로 내보내지 않고 앱 안에서 읽는다(사용자 결정). 출처 언론사 이름은 글자로 남긴다. 원칙은 utils/briefing.js 맨 위.
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const CAT_COLOR = { 경제: "#F59E0B", 증시: "#EF4444", 부동산: "#14B8A6", 산업: "#8B5CF6", 사회: "#22C55E", 정치: "#64748B", 국제: "#5B7CFA", "IT·과학": "#06B6D4", 생활: "#EC4899" };

const dayLabel = (ds) => {
  const [y, m, d] = ds.split("-").map(Number);
  return `${m}월 ${d}일 (${DOW[new Date(y, m - 1, d).getDay()]})`;
};
const prevDay = (ds) => {
  const [y, m, d] = ds.split("-").map(Number);
  return toDateStr(new Date(y, m - 1, d - 1));
};
const madeAt = (ts) => {
  const d = ts?.toDate?.();
  if (!d) return "";
  const h = d.getHours();
  return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} 정리`;
};

export default function Briefing({ authUser, weatherCity }) {
  const today = toDateStr(new Date());
  const [state, setState] = useState({ status: "loading", data: null, date: today });
  const [wx, setWx] = useState(null);

  useEffect(() => {
    if (!authUser) return;
    let alive = true;
    (async () => {
      try {
        const t = await loadBriefing(today);
        if (t) { if (alive) setState({ status: "ok", data: t, date: today }); return; }
        const y = await loadBriefing(prevDay(today));
        if (alive) setState({ status: y ? "old" : "none", data: y, date: prevDay(today) });
      } catch {
        if (alive) setState({ status: "error", data: null, date: today });
      }
    })();
    return () => { alive = false; };
  }, [authUser, today]);

  useEffect(() => {
    let alive = true;
    loadWeather(weatherCity || DEFAULT_CITY, today).then((r) => { if (alive && r.status === "ok") setWx(r.data); });
    return () => { alive = false; };
  }, [weatherCity, today]);

  const [y, m] = today.split("-").map(Number);
  const events = marketEventsOf(y, m - 1, ["kr", "us"]).filter((e) => e.ds === today);
  const b = state.data;
  const wxDay = wx ? weatherTodayView(wx, today) : null;
  const wxAdvice = wxDay ? weatherAdvice(wxDay, wx.air) : "";
  const air = wx?.air ? airGrade(wx.air) : null;
  const subStyle = { fontSize: UI.sub, color: "var(--dm-muted)", lineHeight: 1.6 };

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ padding: "14px 16px 8px" }}>
        <div className="dm-page-title" style={S.title}>오늘의 브리핑</div>
        <div style={{ ...S.sub, fontSize: UI.sub, wordBreak: "keep-all" }}>매일 아침 6시, 주요 뉴스와 시장을 AI가 정리해 드려요</div>
      </div>

      {/* 날짜 + 한 줄 요약 */}
      <div style={{ ...boxCard }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: UI.group, fontWeight: 900, color: "var(--dm-text)" }}>{dayLabel(today)}</span>
          {state.status === "ok" && <span style={subStyle}>{madeAt(b?.createdAt)}</span>}
        </div>
        {state.status === "loading" && <div style={{ ...subStyle, marginTop: 8 }}>불러오는 중…</div>}
        {state.status === "old" && <div style={{ ...subStyle, marginTop: 8 }}>오늘 브리핑은 아침 6시에 준비돼요. 아래는 어제({dayLabel(state.date)}) 브리핑이에요.</div>}
        {state.status === "none" && <div style={{ ...subStyle, marginTop: 8 }}>아직 준비된 브리핑이 없어요. 매일 아침 6시에 새로 만들어져요.</div>}
        {state.status === "error" && <div style={{ ...subStyle, marginTop: 8 }}>브리핑을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</div>}
        {b?.headline && <div style={{ marginTop: 10, fontSize: UI.item + 1, fontWeight: 800, color: "var(--dm-text)", lineHeight: 1.5, wordBreak: "keep-all" }}>{b.headline}</div>}
      </div>

      {/* 날씨 — 오늘 탭 날씨와 같은 값 */}
      {wxDay && (
        <div style={{ ...boxCard }}>
          <SectionHeading icon="globe">오늘 날씨 · {wx.city || weatherCity || DEFAULT_CITY}</SectionHeading>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span aria-hidden style={{ fontSize: 34, lineHeight: 1 }}>{wxDay.icon}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: UI.item, fontWeight: 800, color: "var(--dm-text)" }}>
                {wx.temp}° {wxDay.desc} <span style={{ fontWeight: 600, color: "var(--dm-sub)" }}>· 최고 {wxDay.max}° 최저 {wxDay.min}°</span>
              </div>
              <div style={{ ...subStyle, color: "var(--dm-sub)" }}>
                {wxDay.rain != null ? `비 ${wxDay.rain}%` : ""}{air ? ` · 미세먼지 ${air.label}` : ""}{wxAdvice ? ` · ${wxAdvice}` : ""}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 주요 지표 */}
      {b?.markets?.length > 0 && (
        <div style={{ ...boxCard }}>
          <SectionHeading icon="wallet">주요 지표</SectionHeading>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px 14px" }}>
            {b.markets.map((mk) => (
              <div key={mk.key} style={{ minWidth: 0 }}>
                <div style={{ fontSize: UI.sub, color: "var(--dm-muted)", fontWeight: 700 }}>{mk.label}</div>
                <div style={{ fontSize: UI.item, fontWeight: 800, color: "var(--dm-text)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{formatIndicator(mk)}</div>
                <div style={{ fontSize: UI.sub, fontWeight: 800, color: changeColor(mk.chgPct), fontVariantNumeric: "tabular-nums" }}>{formatChange(mk.chgPct)}</div>
              </div>
            ))}
          </div>
          {b.marketNote && <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--dm-row)", fontSize: 15, color: "var(--dm-sub)", lineHeight: 1.65, wordBreak: "keep-all" }}>{b.marketNote}</div>}
          <div style={{ ...subStyle, marginTop: 8 }}>{state.status === "old" ? "어제 아침" : "아침 6시"} 기준 · 전날 대비</div>
        </div>
      )}

      {/* 주요 뉴스 */}
      {b?.news?.length > 0 && (
        <div style={{ ...boxCard }}>
          <SectionHeading icon="megaphone">주요 뉴스</SectionHeading>
          {b.news.map((n, i) => (
            <div key={i} style={{ padding: "12px 0", borderTop: i ? "1px solid var(--dm-row)" : "none" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ flexShrink: 0, marginTop: 2, padding: "2px 8px", borderRadius: 999, fontSize: UI.sub, fontWeight: 800, color: CAT_COLOR[n.cat] || "#5B7CFA", border: `1.5px solid ${CAT_COLOR[n.cat] || "#5B7CFA"}` }}>{n.cat}</span>
                <span style={{ fontSize: UI.item, fontWeight: 800, color: "var(--dm-text)", lineHeight: 1.45, wordBreak: "keep-all" }}>{n.title}</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 15, color: "var(--dm-sub)", lineHeight: 1.7, wordBreak: "keep-all" }}>{n.body}</div>
              {n.sources?.length > 0 && <div style={{ ...subStyle, marginTop: 6 }}>출처 {n.sources.join(" · ")}</div>}
            </div>
          ))}
        </div>
      )}

      {/* 오늘 볼 경제 일정 — 달력 탭 증시 일정 표와 같은 곳 */}
      <div style={{ ...boxCard }}>
        <SectionHeading icon="cal">오늘 경제 일정</SectionHeading>
        {events.length === 0 && <div style={{ fontSize: 15, color: "var(--dm-sub)" }}>오늘은 큰 일정이 없어요</div>}
        {events.map((e, i) => (
          <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "6px 0", fontSize: 15, color: "var(--dm-text)" }}>
            <span style={{ flexShrink: 0, fontSize: UI.sub, fontWeight: 800, color: e.market === "kr" ? "#EF4444" : "#5B7CFA" }}>{e.market === "kr" ? "한국" : "미국"}</span>
            <span style={{ fontWeight: 700, wordBreak: "keep-all" }}>{e.title}</span>
            {e.time && <span style={{ ...subStyle, marginLeft: "auto", flexShrink: 0 }}>{e.time}</span>}
          </div>
        ))}
      </div>

      {b && (
        <div style={{ ...subStyle, padding: "4px 20px 0", wordBreak: "keep-all" }}>
          AI가 {b.sources?.length ? b.sources.join("·") : "언론사"} 보도를 바탕으로 자기 말로 정리한 내용이에요. 틀린 내용이 있을 수 있고, 투자 판단의 근거로 쓰지 마세요.
        </div>
      )}
    </div>
  );
}
