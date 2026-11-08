// 구독 관리 (2026-11-08) — 계정 설정 subscriptions = [{ id, cat, name, amount, cur, cycle, day, month, pay, endDate, trial, memo }]
// 계산은 이 파일 한 곳 — 구독 화면·My 탭 칸·오늘 탭 다가오는 날·달력이 같이 쓴다.
// cycle: 'month'(매월 day일) | 'year'(매년 month월 day일). day 0 = 말일. 그 달에 없는 날(31일 등)은 말일로.
// endDate: 이용 종료일(선택) — 지나면 결제 예정에서 빠지고 합계에서도 빠진다. trial이면 "무료 체험 끝"으로 부른다.
import { addDays } from "./date.js";
import { daysUntil } from "./exam.js";

export const SUB_CATS = [
  { id: "ott", label: "OTT·영상", services: ["넷플릭스", "유튜브 프리미엄", "티빙", "쿠팡플레이", "디즈니+", "웨이브", "왓챠"] },
  { id: "shop", label: "쇼핑", services: ["쿠팡 와우", "네이버플러스 멤버십", "컬리멤버스", "SSG 유니버스"] },
  { id: "book", label: "독서", services: ["밀리의서재", "리디셀렉트", "윌라", "예스24 크레마클럽"] },
  { id: "music", label: "음악", services: ["멜론", "지니", "스포티파이", "애플뮤직", "바이브", "플로"] },
  { id: "food", label: "배달", services: ["배민클럽", "쿠팡이츠", "요기패스"] },
  { id: "ai", label: "AI", services: ["ChatGPT Plus", "Claude Pro", "Gemini", "Perplexity", "Midjourney"] },
  { id: "etc", label: "기타", services: ["iCloud+", "구글 원", "마이크로소프트 365", "통신 부가서비스"] },
];
// 직접 만든 분류 (2026-11-08) — 따로 저장하지 않고 구독의 cat에 "c:이름"으로 붙인다(그 분류의 구독이 없어지면 목록에서도 사라짐)
const CUSTOM = "c:";
export const isCustomCat = (id) => typeof id === "string" && id.startsWith(CUSTOM);
export const customCatId = (label) => `${CUSTOM}${String(label).trim().slice(0, 12)}`;
export const subCatLabel = (id) => (isCustomCat(id) ? id.slice(CUSTOM.length) : (SUB_CATS.find((c) => c.id === id) || SUB_CATS[SUB_CATS.length - 1]).label);
export const customCatIds = (subs) => [...new Set(normalizeSubs(subs).map((s) => s.cat).filter(isCustomCat))];
// 목록·필터에 쓸 분류 — 기본 분류 + 직접 만든 분류
export const allSubCats = (subs) => [...SUB_CATS, ...customCatIds(subs).map((id) => ({ id, label: subCatLabel(id), services: [] }))];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, "0");

export function normalizeSubs(x) {
  if (!Array.isArray(x)) return [];
  return x.filter((s) => s && s.id && s.name && Number(s.amount) > 0).map((s) => ({
    id: s.id, cat: s.cat || "etc", name: String(s.name), amount: Number(s.amount), cur: s.cur === "USD" ? "USD" : "KRW",
    cycle: s.cycle === "year" ? "year" : "month",
    day: Math.max(0, Math.min(31, Number(s.day) || 0)),
    month: Math.max(1, Math.min(12, Number(s.month) || 1)),
    pay: s.pay ? String(s.pay) : "", endDate: DATE_RE.test(s.endDate || "") ? s.endDate : "", trial: !!s.trial, memo: s.memo ? String(s.memo) : "",
  }));
}

export const newSubId = () => `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

const lastDay = (y, m) => new Date(y, m, 0).getDate(); // m: 1~12
const dayIn = (y, m, day) => (day === 0 ? lastDay(y, m) : Math.min(day, lastDay(y, m)));

// 그 달(y, m: 1~12)의 결제일 'YYYY-MM-DD' — 없으면 null
export function billDateIn(sub, y, m) {
  if (sub.cycle === "year" && sub.month !== m) return null;
  const ds = `${y}-${pad(m)}-${pad(dayIn(y, m, sub.day))}`;
  if (sub.endDate) {
    // 무료 체험: 끝나는 날까지는 결제 없음, 그 뒤 결제일부터 결제 (해지 전까지 계속)
    if (sub.trial) { if (ds <= sub.endDate) return null; }
    // 종료일: 그 뒤로 결제 없음
    else if (ds > sub.endDate) return null;
  }
  return ds;
}

// 오늘(포함) 이후 첫 결제일
export function nextBillDate(sub, todayStr) {
  let y = Number(todayStr.slice(0, 4)), m = Number(todayStr.slice(5, 7));
  for (let i = 0; i < 25; i++) {
    const ds = billDateIn(sub, y, m);
    if (ds && ds >= todayStr) return ds;
    if (sub.endDate && !sub.trial && `${y}-${pad(m)}-01` > sub.endDate) return null;
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return null;
}

// 이용 중(종료일 지나면 끝) — 무료 체험은 체험이 끝나도 해지 전까지 이용 중
export const isActive = (sub, todayStr) => !sub.endDate || sub.trial || sub.endDate >= todayStr;
export const inTrial = (sub, todayStr) => !!(sub.trial && sub.endDate && sub.endDate >= todayStr);

// 원화로 — 달러는 환율이 있을 때만(없으면 null)
export const toKrw = (amount, cur, usdKrw) => (cur === "USD" ? (usdKrw ? amount * usdKrw : null) : amount);
export const monthlyOf = (sub) => (sub.cycle === "year" ? sub.amount / 12 : sub.amount);

// 합계: 월 환산(원), 연 환산, 결제수단별·분류별(월 환산), 환율이 없어 못 더한 달러 구독 수
// 무료 체험 중인 구독은 지금 돈이 안 나가므로 합계에서 빼고 trialCount·trialMonthly(끝나면 늘어날 돈)로 따로 준다
export function subsSummary(subs, todayStr, usdKrw) {
  const active = normalizeSubs(subs).filter((s) => isActive(s, todayStr));
  let monthly = 0, missingFx = 0, trialCount = 0, trialMonthly = 0;
  const byPay = {}, byCat = {};
  for (const s of active) {
    const v = toKrw(monthlyOf(s), s.cur, usdKrw);
    if (inTrial(s, todayStr)) { trialCount++; trialMonthly += v || 0; continue; }
    if (v == null) { missingFx++; continue; }
    monthly += v;
    const p = s.pay || "결제수단 미정";
    byPay[p] = (byPay[p] || 0) + v;
    byCat[s.cat] = (byCat[s.cat] || 0) + v;
  }
  const sortObj = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
  return { count: active.length, monthly, yearly: monthly * 12, byPay: sortObj(byPay), byCat: sortObj(byCat), missingFx, trialCount, trialMonthly };
}

// 그 달의 결제 목록(달력 아래 칸·미리보기) — 날짜순
export function billsInMonth(subs, y, m) {
  return normalizeSubs(subs).map((s) => ({ sub: s, ds: billDateIn(s, y, m) })).filter((x) => x.ds).sort((a, b) => a.ds.localeCompare(b.ds) || a.sub.name.localeCompare(b.sub.name));
}
export const billsOnDate = (subs, ds) => billsInMonth(subs, Number(ds.slice(0, 4)), Number(ds.slice(5, 7))).filter((x) => x.ds === ds);

// 오늘 탭 "다가오는 날"에 넣을 것 — within일 안의 결제일과 이용 종료일
export function upcomingSubEvents(subs, todayStr, within = 3) {
  const limit = addDays(todayStr, within);
  const out = [];
  for (const s of normalizeSubs(subs)) {
    const next = nextBillDate(s, todayStr);
    // amount는 따로 — 좁은 화면에서 이름만 줄이고 금액은 늘 보이게 (UpcomingDays)
    if (next && next <= limit) out.push({ key: `sub_${s.id}_${next}`, kind: "sub", id: s.id, title: `💳 ${s.name}`, amount: fmtMoney(s.amount, s.cur), date: next, dday: daysUntil(next, todayStr) });
    if (s.endDate && s.endDate >= todayStr && s.endDate <= limit) {
      out.push({ key: `subend_${s.id}`, kind: "sub", id: s.id, title: `💳 ${s.name} ${s.trial ? "무료 체험 끝" : "이용 종료"}`, date: s.endDate, dday: daysUntil(s.endDate, todayStr) });
    }
  }
  return out;
}

export const fmtMoney = (amount, cur) => (cur === "USD" ? `$${Number(amount).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : `${Math.round(amount).toLocaleString("ko-KR")}원`);
export const fmtKrw = (v) => `${Math.round(v).toLocaleString("ko-KR")}원`;
export const billDayLabel = (sub) => {
  const d = sub.day === 0 ? "말일" : `${sub.day}일`;
  return sub.cycle === "year" ? `매년 ${sub.month}월 ${d}` : `매월 ${d}`;
};

// 결제수단 칩 — 한 번 쓴 별명을 많이 쓴 순으로
export const payOptions = (subs) => {
  const n = {};
  for (const s of normalizeSubs(subs)) if (s.pay) n[s.pay] = (n[s.pay] || 0) + 1;
  return Object.keys(n).sort((a, b) => n[b] - n[a]);
};

// 오늘 탭에 결제일 보이기 — 기기마다 (기본 켬)
export const SUBS_TODAY_KEY = "dm_subs_today";
