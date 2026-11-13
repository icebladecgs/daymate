// 🕘 메모 저장본 기록 (2026-11-13 사용자 승인) — 메모를 고치기 전 내용을 이 기기에 7일 남겨, "이전 내용"에서 골라 되살린다.
// 자동 저장이라 실수로 지우거나 AI 정리로 바꾼 뒤 원래 글이 필요할 때를 위해서. 지금까지는 5초 되돌리기뿐이었다.
// - 이 기기에만(localStorage dm_memo_hist, 계정 동기화 안 함 — 계정을 바꾸면 계정 기록과 함께 보관됨)
// - 계속 쓰는 동안은 5분에 한 번만 남기고, 크게 바뀌면(AI 정리처럼 줄 절반 넘게 바뀜) 바로 남긴다
// - 메모마다 20개, 7일 지나면 지운다, 전체 40만 자 넘으면 오래된 것부터 지운다
// - 잠긴 메모는 남기지 않는다(암호화한 의미가 없어지므로)
const KEY = "dm_memo_hist";
export const HIST_PER_MEMO = 20;
export const HIST_DAYS = 7;
export const HIST_GAP_MS = 5 * 60 * 1000;
const HIST_MAX_CHARS = 400000;

// 줄 절반 넘게 바뀌었나 (AI 정리·붙여넣기로 통째로 바뀐 경우)
export function bigChange(oldText, newText) {
  const a = String(oldText || "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (a.length < 2) return Math.abs(String(newText || "").length - String(oldText || "").length) > Math.max(20, String(oldText || "").length * 0.5);
  const b = new Set(String(newText || "").split("\n").map((l) => l.trim()));
  return a.filter((l) => b.has(l)).length / a.length < 0.5;
}

// 순수 계산 — h: { [메모id]: [{ at, text }] } (최신이 앞). 결과는 새 객체
export function addSnapshot(h, id, text, now = Date.now(), force = false) {
  if (!id || !String(text || "").trim()) return h;
  const list = h[id] || [];
  const last = list[0];
  if (last && last.text === text) return h;
  if (!force && last && now - last.at < HIST_GAP_MS) return h;
  return pruneHistory({ ...h, [id]: [{ at: now, text }, ...list].slice(0, HIST_PER_MEMO) }, now);
}
export function pruneHistory(h, now = Date.now()) {
  const from = now - HIST_DAYS * 86400000;
  const out = {};
  for (const [id, list] of Object.entries(h || {})) {
    const keep = (Array.isArray(list) ? list : []).filter((v) => v && v.at >= from && typeof v.text === "string");
    if (keep.length) out[id] = keep;
  }
  // 전체 크기 상한 — 오래된 기록부터 뺀다
  let total = Object.values(out).reduce((s, l) => s + l.reduce((a, v) => a + v.text.length, 0), 0);
  if (total > HIST_MAX_CHARS) {
    const all = Object.entries(out).flatMap(([id, l]) => l.map((v) => ({ id, v }))).sort((x, y) => x.v.at - y.v.at);
    for (const { id, v } of all) {
      if (total <= HIST_MAX_CHARS) break;
      out[id] = out[id].filter((x) => x !== v);
      if (!out[id].length) delete out[id];
      total -= v.text.length;
    }
  }
  return out;
}
// 날짜 기록이 바뀔 때 — 글이 바뀐 메모의 "바뀌기 전" 글을 남긴다 (prevDay·nextDay는 날짜 기록)
export function changesToRecord(prevDay, nextDay) {
  const next = new Map((nextDay?.memos || []).map((m) => [m.id, m]));
  const out = [];
  for (const m of prevDay?.memos || []) {
    const n = next.get(m.id);
    if (!n || m.locked || n.locked || !m.text?.trim() || n.text === m.text) continue;
    out.push({ id: m.id, text: m.text, force: bigChange(m.text, n.text) });
  }
  return out;
}

// ── 이 기기 저장소 ──
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; } };
const save = (h) => { try { localStorage.setItem(KEY, JSON.stringify(h)); } catch { /* 저장소가 차면 이번 기록은 건너뜀 */ } };
export function snapshotMemo(id, text, force = false) {
  const h = load();
  const next = addSnapshot(h, id, text, Date.now(), force);
  if (next !== h) save(next);
}
export function recordMemoChanges(prevDay, nextDay) {
  const list = changesToRecord(prevDay, nextDay);
  if (!list.length) return;
  let h = load();
  const before = h;
  for (const c of list) h = addSnapshot(h, c.id, c.text, Date.now(), c.force);
  if (h !== before) save(h);
}
export const memoHistoryOf = (id) => (id ? pruneHistory(load())[id] || [] : []);
