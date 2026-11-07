// 보유자산 부가 기능 (2026-11-07, 더리치 참고) — 금액 숨기기 · 자산군 비중 · 자산 추이 · 배당 예상
// 화면: screens/Portfolio.jsx, screens/Home.jsx(My 탭 자산 브리핑), components/PortfolioCharts.jsx
// 계산만 두고 화면·서버 호출은 넣지 않는다(test:data에서 그대로 불러 검증).

import { store } from "./storage.js";

// ── 금액 숨기기 👁 — 기기마다(accountSwap DEVICE_KEYS). 수익률(%)은 그대로 보인다 ──
const HIDE_KEY = "dm_pf_hide";
export const HIDE_EVENT = "dm:pf-hide";
export const MASK = "•••••";
export const isPfHidden = () => store.get(HIDE_KEY, false) === true;
export function setPfHidden(on) {
  store.set(HIDE_KEY, !!on);
  try { window.dispatchEvent(new CustomEvent(HIDE_EVENT, { detail: !!on })); } catch { /* 화면 없음 */ }
}

// ── 자산군 비중 ──
// 색은 index.css의 --dm-viz-1~4 (밝은·어두운 화면 각각 검증한 값). 순서를 바꾸지 않는다(색은 자산군을 따라간다)
export const ASSET_CLASSES = [
  { id: "kr", name: "국내주식", color: "var(--dm-viz-1)" },
  { id: "us", name: "미국주식", color: "var(--dm-viz-2)" },
  { id: "coin", name: "코인", color: "var(--dm-viz-3)" },
  { id: "cash", name: "현금", color: "var(--dm-viz-4)" },
];

export function assetClassOf(h) {
  if (h?.src === "coingecko") return "coin";
  if (h?.src === "yahoo") {
    if (/\.(KS|KQ)$/i.test(h.sym || "") || (h.marketCurrency || h.currency) === "KRW") return "kr";
    return "us";
  }
  return "us"; // finnhub = 미국 주식·ETF
}

const toCur = (v, from, to, rate) => {
  if (from === to) return v;
  if (!rate) return null;
  return to === "KRW" ? v * rate : v / rate;
};

// rows: calcPortfolioSummary(...).rows (value·marketCurrency가 있는 줄만 센다), cash: { krw, usd }
// 환율이 없어 바꿀 수 없는 금액은 빼고 ok=false로 알린다
export function allocation(rows, cash, currency, rate) {
  const sums = { kr: 0, us: 0, coin: 0, cash: 0 };
  let ok = true;
  for (const r of rows || []) {
    if (r.value == null || r.noData || r.currencyMismatch) continue;
    const v = toCur(r.value, r.marketCurrency || "USD", currency, rate);
    if (v == null) { ok = false; continue; }
    sums[assetClassOf(r)] += v;
  }
  for (const [amt, cur] of [[Number(cash?.krw) || 0, "KRW"], [Number(cash?.usd) || 0, "USD"]]) {
    if (!amt) continue;
    const v = toCur(amt, cur, currency, rate);
    if (v == null) { ok = false; continue; }
    sums.cash += v;
  }
  const total = Object.values(sums).reduce((a, b) => a + b, 0);
  const parts = ASSET_CLASSES.map((c) => ({ ...c, value: sums[c.id], pct: total > 0 ? (sums[c.id] / total) * 100 : 0 }))
    .filter((p) => p.value > 0);
  return { parts, total, ok };
}

// ── 자산 추이 — 실계좌 총 평가금액을 하루 한 점 (앱을 연 날만) ──
// points = { 'YYYY-MM-DD': { u: 달러 총액, k: 원화 총액|null, t: 기록 시각 } }
// 같은 날은 마지막 값으로 바꾸되, 0.1% 넘게 달라졌을 때만 다시 저장(서버 쓰기를 줄이려고)
export function nextHistoryPoint(points, ds, valueUSD, valueKRW, now = Date.now()) {
  if (!(valueUSD > 0)) return null;
  const prev = points?.[ds];
  if (prev && Math.abs(prev.u - valueUSD) <= prev.u * 0.001 && (prev.k != null || valueKRW == null)) return null;
  return { u: Math.round(valueUSD * 100) / 100, k: valueKRW > 0 ? Math.round(valueKRW) : null, t: now };
}

// 두 기기의 기록 합치기 — 같은 날은 나중에 기록한 쪽
export function mergeHistory(a, b) {
  const out = { ...(a || {}) };
  for (const [ds, p] of Object.entries(b || {})) {
    if (!p || !(p.u > 0)) continue;
    if (!out[ds] || (p.t || 0) > (out[ds].t || 0)) out[ds] = p;
  }
  return out;
}

// 기간 안의 점을 날짜순으로 [{ ds, v }] — currency가 KRW인데 원화값이 없는 날은 뺀다
export function historySeries(points, { days = null, today, currency = "USD" } = {}) {
  const from = days && today ? shiftDs(today, -days) : null;
  return Object.entries(points || {})
    .filter(([ds]) => !from || ds >= from)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ds, p]) => ({ ds, v: currency === "KRW" ? p.k : p.u }))
    .filter((x) => x.v > 0);
}

export function shiftDs(ds, days) {
  const [y, m, d] = ds.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}
const addYearDs = (ds, n) => `${Number(ds.slice(0, 4)) + n}${ds.slice(4)}`.replace(/-02-29$/, "-02-28");

// ── 배당 예상 (Yahoo 배당 기록, api/market.js type=dividends) ──
// 코인은 없음. 미국 종목 코드의 점은 Yahoo에서 하이픈(BRK.B → BRK-B)
export function dividendSymOf(h) {
  if (!h?.sym || h.src === "coingecko") return null;
  return h.src === "finnhub" ? h.sym.replace(/\./g, "-") : h.sym;
}

// 지난 1년 배당을 그대로 1년 뒤로 옮겨 "앞으로 1년" 예상을 만든다(배당락일 기준 — 실제 입금은 보통 몇 주 뒤)
// holdings: 실제 종목 목록(앱별로 나뉜 것도 그대로 — 수량이 더해진다), divData: { [yahooSym]: { currency, list:[{d,a}] } }
// 세후는 원천징수만 뺀 대략값: 국내 15.4%, 미국 15%
export function projectDividends(holdings, divData, today) {
  const yearAgo = shiftDs(today, -365);
  const events = [];
  const perHolding = new Map();
  for (const h of holdings || []) {
    const ysym = dividendSymOf(h);
    const data = ysym && divData?.[ysym];
    if (!data?.list?.length) continue;
    const currency = data.currency || (h.src === "yahoo" ? "KRW" : "USD");
    // 평소의 3배가 넘는 한 번짜리(특별배당·데이터 오류)는 해마다 오지 않으니 예상에서 뺀다
    // (실제 Yahoo 기록: 삼성전자 2026-09-29 4,601원 — 평소 분기 약 370원)
    const amounts = data.list.map((x) => x.a).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)];
    const regular = (x) => amounts.length < 3 || x.a <= median * 3;
    const past = data.list.filter((x) => x.d > yearAgo && x.d <= today && regular(x));
    if (!past.length) continue;
    const qty = Number(h.qty) || 0;
    const key = `${h.sym}|${currency}`;
    const cur = perHolding.get(key) || { sym: h.sym, label: h.label || h.sym, currency, qty: 0, perShare: 0, count: past.length };
    cur.qty += qty;
    cur.perShare = past.reduce((s, x) => s + x.a, 0);
    perHolding.set(key, cur);
    for (const x of past) {
      events.push({ d: addYearDs(x.d, 1), sym: h.sym, label: h.label || h.sym, currency, perShare: x.a, amount: x.a * qty });
    }
  }
  // 같은 날·같은 종목(여러 앱에 나뉜 것)은 한 줄로
  const merged = new Map();
  for (const e of events) {
    const k = `${e.d}|${e.sym}|${e.currency}`;
    const m = merged.get(k);
    if (m) m.amount += e.amount; else merged.set(k, { ...e });
  }
  const list = [...merged.values()].sort((a, b) => a.d.localeCompare(b.d) || a.label.localeCompare(b.label));
  const holdingsOut = [...perHolding.values()].map((p) => ({ ...p, annual: p.perShare * p.qty })).sort((a, b) => b.annual - a.annual);
  return { events: list, perHolding: holdingsOut };
}

export const TAX_RATE = { KRW: 0.154, USD: 0.15 };
export const afterTax = (amount, currency) => amount * (1 - (TAX_RATE[currency] ?? 0.15));

// 앞으로 12달 월별 합계(표시 통화로) — [{ ym:'2026-12', label:'12월', v }]
export function dividendMonths(events, today, currency, rate) {
  const out = [];
  const [y, m] = today.split("-").map(Number);
  for (let i = 0; i < 12; i++) {
    const dt = new Date(Date.UTC(y, m - 1 + i, 1));
    const ym = dt.toISOString().slice(0, 7);
    out.push({ ym, label: `${dt.getUTCMonth() + 1}월`, v: 0, missing: false });
  }
  for (const e of events || []) {
    const slot = out.find((o) => e.d.startsWith(o.ym));
    if (!slot) continue;
    const v = toCur(e.amount, e.currency, currency, rate);
    if (v == null) slot.missing = true; else slot.v += v;
  }
  return out;
}

export function dividendTotal(events, currency, rate, { tax = false } = {}) {
  let sum = 0, ok = true;
  for (const e of events || []) {
    const amt = tax ? afterTax(e.amount, e.currency) : e.amount;
    const v = toCur(amt, e.currency, currency, rate);
    if (v == null) ok = false; else sum += v;
  }
  return { sum, ok };
}

// ── 지수 비교 — 복사한 날 QQQ 시세·총액을 기준으로 "그날 같은 돈을 QQQ에 넣었다면" ──
export const INDEX_SYM = "QQQ";
export const indexWhatIf = (base, qqqNow) => (base?.qqq > 0 && base?.usd > 0 && qqqNow > 0 ? base.usd * (qqqNow / base.qqq) : null);
