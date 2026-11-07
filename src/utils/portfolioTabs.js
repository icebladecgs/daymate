// 보유자산 탭 (2026-11-07, 클래시로얄 덱 복사 방식) — 탭 하나 = 포트폴리오 하나(키움·업비트 등 모두 통합)
// 저장 위치: 계정 설정 telegram 안
//   holdings   — 실계좌 탭의 종목 (예전 그대로. My 탭 자산 브리핑이 이것만 읽는다)
//   pfTabs     — [{ id, name, updatedAt, holdings? }] 탭 순서. 실계좌 탭은 holdings를 따로 두지 않는다(위 holdings가 그 탭)
//   pfRealId   — 실계좌 탭 id. 실계좌는 하나뿐이고, "실계좌로"를 누르면 이전 실계좌는 비교용이 된다
// pfTabs가 없으면(이 기능 전) 지금 종목을 "계좌1"(실계좌) 하나로 본다 — 기존 기록은 옮기지도 지우지도 않는다.
// saveSettings는 merge라서 목록은 모두 배열로 저장한다(CLAUDE.md 15).

export const PF_MAX_TABS = 10;
const DEFAULT_ID = 'main';

const cleanHoldings = (list) => (Array.isArray(list) ? list : []);

export function readTabs(cfg) {
  const raw = Array.isArray(cfg?.pfTabs) && cfg.pfTabs.length ? cfg.pfTabs : [{ id: DEFAULT_ID, name: '계좌1' }];
  const realId = raw.some((t) => t.id === cfg?.pfRealId) ? cfg.pfRealId : raw[0].id;
  const tabs = raw.map((t) => ({ id: t.id, name: t.name || '계좌', updatedAt: t.updatedAt || null, real: t.id === realId }));
  return { tabs, realId };
}

// 탭의 종목 — 실계좌는 cfg.holdings
export function tabHoldings(cfg, id) {
  const { realId } = readTabs(cfg);
  if (id === realId) return cleanHoldings(cfg?.holdings);
  const t = (cfg?.pfTabs || []).find((x) => x.id === id);
  return cleanHoldings(t?.holdings);
}

// 탭 목록을 저장용 모양으로 (실계좌 탭에는 holdings를 두지 않는다)
const withTabs = (cfg, tabs, realId, holdings) => ({
  ...cfg,
  holdings: cleanHoldings(holdings),
  pfRealId: realId,
  pfTabs: tabs.map((t) => {
    const out = { id: t.id, name: t.name };
    if (t.updatedAt) out.updatedAt = t.updatedAt;
    if (t.id !== realId) out.holdings = cleanHoldings(t.holdings);
    return out;
  }),
});

// 지금 상태를 [{ id, name, updatedAt, holdings }] 전부 꺼내기
function fullTabs(cfg) {
  const { tabs, realId } = readTabs(cfg);
  return { realId, tabs: tabs.map((t) => ({ id: t.id, name: t.name, updatedAt: t.updatedAt, holdings: tabHoldings(cfg, t.id) })) };
}

export function setTabHoldings(cfg, id, holdings, now = Date.now()) {
  const { tabs, realId } = fullTabs(cfg);
  const next = tabs.map((t) => (t.id === id ? { ...t, holdings: cleanHoldings(holdings), updatedAt: now } : t));
  return withTabs(cfg, next, realId, next.find((t) => t.id === realId).holdings);
}

const newId = (now) => `pf_${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// 새 탭 — fromId가 있으면 그 탭을 통째로 복사(종목·수량·평균단가·메모). 이름은 겹치지 않게
export function addTab(cfg, { fromId = null, now = Date.now() } = {}) {
  const { tabs, realId } = fullTabs(cfg);
  if (tabs.length >= PF_MAX_TABS) return { cfg, id: null };
  const names = new Set(tabs.map((t) => t.name));
  const src = fromId ? tabs.find((t) => t.id === fromId) : null;
  let name;
  if (src) {
    name = `${src.name} 복사`;
    for (let n = 2; names.has(name); n++) name = `${src.name} 복사${n}`;
  } else {
    let n = tabs.length + 1;
    while (names.has(`계좌${n}`)) n++;
    name = `계좌${n}`;
  }
  const id = newId(now);
  const holdings = src ? JSON.parse(JSON.stringify(src.holdings)) : [];
  const next = [...tabs, { id, name, updatedAt: now, holdings }];
  return { cfg: withTabs(cfg, next, realId, next.find((t) => t.id === realId).holdings), id };
}

export function renameTab(cfg, id, name) {
  const clean = String(name || '').trim().slice(0, 20);
  if (!clean) return cfg;
  const { tabs, realId } = fullTabs(cfg);
  const next = tabs.map((t) => (t.id === id ? { ...t, name: clean } : t));
  return withTabs(cfg, next, realId, next.find((t) => t.id === realId).holdings);
}

// 실계좌 탭은 지울 수 없다(먼저 다른 탭을 실계좌로). 되돌리기용으로 지운 탭과 자리를 돌려준다
export function removeTab(cfg, id) {
  const { tabs, realId } = fullTabs(cfg);
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx < 0 || id === realId) return { cfg, removed: null, idx: -1 };
  const next = tabs.filter((t) => t.id !== id);
  return { cfg: withTabs(cfg, next, realId, next.find((t) => t.id === realId).holdings), removed: tabs[idx], idx };
}

export function restoreTab(cfg, tab, idx) {
  const { tabs, realId } = fullTabs(cfg);
  if (tabs.some((t) => t.id === tab.id)) return cfg;
  const next = [...tabs];
  next.splice(Math.max(0, Math.min(idx, next.length)), 0, tab);
  return withTabs(cfg, next, realId, next.find((t) => t.id === realId).holdings);
}

// "실계좌로" — 이 탭의 종목이 holdings(자산 브리핑 기준)가 되고, 이전 실계좌는 비교용 탭으로 남는다
export function makeReal(cfg, id) {
  const { tabs } = fullTabs(cfg);
  const target = tabs.find((t) => t.id === id);
  if (!target) return cfg;
  return withTabs(cfg, tabs, id, target.holdings);
}

// 같은 종목이 여러 앱(업비트·빗썸 등)에 있으면 화면에서 한 줄로 — 수량은 더하고 평균단가는 수량 기준 평균.
// 저장은 그대로 나눠 둔다(캡처 업데이트가 앱별로 수량을 바꿔야 해서). 통화·시세 출처가 다르면 합치지 않는다.
export function groupHoldings(holdings) {
  const groups = new Map();
  for (const h of cleanHoldings(holdings)) {
    const key = `${h.sym}|${h.src || ''}|${h.currency || ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(h);
  }
  return [...groups.entries()].map(([key, parts]) => {
    if (parts.length === 1) return { ...parts[0], parts };
    const qty = parts.reduce((s, h) => s + (Number(h.qty) || 0), 0);
    const cost = parts.reduce((s, h) => s + (Number(h.qty) || 0) * (Number(h.avgPrice) || 0), 0);
    const first = parts[0];
    return {
      id: `g:${key}`,
      sym: first.sym,
      label: first.label,
      src: first.src,
      ...(first.coinId ? { coinId: first.coinId } : {}),
      currency: first.currency,
      qty: roundQty(qty),
      avgPrice: qty > 0 ? cost / qty : 0,
      memos: parts.flatMap((h) => (h.memos || []).map((m) => ({ ...m, _hid: h.id }))),
      parts,
    };
  });
}

// 0.1 + 0.2 같은 소수 오차를 화면에 보이지 않게
export const roundQty = (n) => Number(Number(n).toFixed(8));

// 여러 탭에 있는 종목 전부 (시세를 한 번에 받기 위함)
export function allTabHoldings(cfg) {
  return fullTabs(cfg).tabs.flatMap((t) => t.holdings);
}
