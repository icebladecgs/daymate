import { SCHEDULE_END } from "./marketEvents.js";
import { LUNAR_LAST_YEAR } from "./holidays.js";

// 📋 업그레이드 할 일 (2026-11-12) — 관리자 화면 탭의 계산 한 곳. 화면은 components/AdminRoadmap.jsx,
// 저장은 Firestore adminRoadmap(앱 관리자만). 개발 목록 원본은 저장소 docs/ROADMAP.md — 여기 적은 것은
// "목록 복사"로 Claude에게 붙여 넣는다(Claude는 운영 Firestore를 못 읽음).

export const ROADMAP_STATUS = [
  { key: "doing", label: "하는 중", color: "#5B7CFA" },
  { key: "todo", label: "할 일", color: "#F59E0B" },
  { key: "done", label: "끝냄", color: "#22C55E" },
];
export const ROADMAP_PRI = [
  { key: "high", label: "급함", mark: "🔴" },
  { key: "normal", label: "보통", mark: "" },
  { key: "low", label: "언젠가", mark: "⚪" },
];
const PRI_ORDER = { high: 0, normal: 1, low: 2 };

// 하는 중 → 할 일 → 끝냄, 같은 상태는 급한 것 먼저, 그다음 오래된 것 먼저(끝낸 것은 최근 끝낸 것 먼저)
export function sortRoadmap(items) {
  const st = { doing: 0, todo: 1, done: 2 };
  return [...(items || [])].sort((a, b) => {
    if (st[a.status] !== st[b.status]) return (st[a.status] ?? 1) - (st[b.status] ?? 1);
    if (a.status === "done") return String(b.doneAt || "").localeCompare(String(a.doneAt || ""));
    const p = (PRI_ORDER[a.pri] ?? 1) - (PRI_ORDER[b.pri] ?? 1);
    if (p) return p;
    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  });
}

// Claude에게 붙여 넣을 글 — 끝내지 않은 것만, 마크다운 체크 목록
export function roadmapToText(items) {
  const open = sortRoadmap(items).filter((i) => i.status !== "done");
  if (!open.length) return "";
  const lines = ["DayMate 업그레이드 할 일 (관리자 화면에서 복사)", ""];
  for (const i of open) {
    const tag = [i.status === "doing" ? "하는 중" : "", i.pri === "high" ? "급함" : i.pri === "low" ? "언젠가" : ""].filter(Boolean).join(", ");
    lines.push(`- [ ] ${i.text}${tag ? ` (${tag})` : ""}`);
    for (const n of String(i.note || "").split("\n").map((s) => s.trim()).filter(Boolean)) lines.push(`    - ${n}`);
  }
  return lines.join("\n");
}

// 기한이 있는 점검 — 앱 안 표가 끝나기 전에 알려 준다. 표가 늘어나면(코드 값이 바뀌면) 저절로 다음 해로 넘어간다.
// state: ok(여유) · soon(알림 90일 전부터) · now(갱신할 때) · late(표가 이미 끝남)
export function roadmapChecks(todayDs) {
  const lastDay = (ym) => {
    const [y, m] = ym.split("-").map(Number);
    return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  };
  const list = [
    {
      id: "market",
      title: "📈 증시 일정 표 늘리기",
      detail: "금통위·FOMC·CPI·고용보고서·미국 휴장 공식 일정을 utils/marketEvents.js 표에 추가 (SCHEDULE_END·SCHEDULE_RANGE도)",
      due: lastDay(SCHEDULE_END),
      warnFrom: `${SCHEDULE_END.slice(0, 4)}-11-01`,
    },
    {
      id: "lunar",
      title: "🎌 공휴일 음력 표 늘리기",
      detail: "설날·부처님오신날·추석 날짜를 utils/holidays.js LUNAR 표에 추가 (공식 월력요항 확인)",
      due: `${LUNAR_LAST_YEAR}-12-31`,
      warnFrom: `${LUNAR_LAST_YEAR}-11-01`,
    },
  ];
  const dayMs = 86400000;
  const toMs = (ds) => new Date(`${ds}T00:00:00`).getTime();
  return list.map((c) => {
    const left = Math.round((toMs(c.due) - toMs(todayDs)) / dayMs);
    const toWarn = Math.round((toMs(c.warnFrom) - toMs(todayDs)) / dayMs);
    const state = left < 0 ? "late" : toWarn <= 0 ? "now" : toWarn <= 90 ? "soon" : "ok";
    return { ...c, left, state };
  });
}
