// 잔고 캡처(키움·업비트·빗썸)로 보유자산 업데이트 — AI가 읽은 종목을 기존 보유 종목과 맞춰 보는 계산
// (화면: components/HoldingsScanSheet.jsx, 읽기: api/chat.js ?action=holdings-scan)
// 원칙: 확인 화면에서 사용자가 고른 것만 반영한다. 캡처에 없는 종목은 지우지 않고 "캡처에 없음"으로만 보여준다.
// 같은 코인을 업비트·빗썸에 나눠 가질 수 있어서, 캡처로 반영한 종목에는 broker(어느 앱)를 붙여 따로 관리한다.

export const normName = (s) => String(s || '')
  .normalize('NFC')
  .replace(/\(주\)|㈜/g, '')
  .replace(/[\s·.\-_()]/g, '')
  .toLowerCase();

// "005930.KS" → "005930", "KRW-BTC" → "BTC"
export const symCore = (s) => String(s || '').toUpperCase().replace(/^KRW-/, '').replace(/\.(KS|KQ)$/, '');

const num = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,\s원$₩]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// 여러 장의 결과를 한 목록으로. 같은 앱 캡처를 스크롤해서 여러 장 찍으면 겹치는 줄이 생기므로
// 같은 앱 안의 같은 종목은 더하지 않고 하나만 남긴다(뒤에 읽은 값). 다른 앱의 같은 종목은 따로 둔다.
export function mergeScanResults(scans) {
  const out = [];
  for (const scan of scans || []) {
    const broker = scan?.broker || '';
    for (const raw of scan?.items || []) {
      const item = {
        broker,
        name: String(raw?.name || '').trim(),
        code: symCore(raw?.code || ''),
        kind: ['kr_stock', 'us_stock', 'coin'].includes(raw?.kind) ? raw.kind : 'kr_stock',
        qty: num(raw?.qty),
        avgPrice: num(raw?.avgPrice),
        currency: raw?.currency === 'USD' ? 'USD' : 'KRW',
      };
      if (!item.name && !item.code) continue;
      const same = (x) => x.broker === broker && (
        (item.code && x.code === item.code) || (item.name && normName(x.name) === normName(item.name)));
      const i = out.findIndex(same);
      if (i >= 0) out[i] = { ...out[i], ...Object.fromEntries(Object.entries(item).filter(([, v]) => v != null && v !== '')) };
      else out.push(item);
    }
  }
  return out;
}

const matchesHolding = (item, h) => {
  const core = symCore(h.sym);
  if (item.code && core === item.code) return true;
  if (item.name && (normName(h.label) === normName(item.name) || normName(h.sym) === normName(item.name))) return true;
  return false;
};

// 통화 맞추기: 업비트·빗썸 코인 평균단가는 원화인데 앱의 코인 시세는 달러라서 현재 환율로 바꾼다.
export function convertPrice(price, from, to, usdKrwRate) {
  if (price == null) return null;
  if (from === to) return price;
  if (!usdKrwRate) return null;
  return from === 'KRW' ? price / usdKrwRate : price * usdKrwRate;
}

const defaultTarget = (kind) => kind === 'coin'
  ? { src: 'coingecko', currency: 'USD' }
  : kind === 'us_stock' ? { src: 'finnhub', currency: 'USD' } : { src: 'yahoo', currency: 'KRW' };

// 기존 보유 종목과 맞춰 본 결과
//  rows: { item, holding(기존, 없으면 null), status: 'update'|'same'|'new', currency, avgPrice(바꾼 값), converted }
//  missing: 이번에 캡처한 앱(broker)의 기존 종목 중 캡처에 없는 것 — 지우지 않고 보여주기만
export function planHoldingsUpdate(holdings, items, usdKrwRate) {
  const used = new Set();
  const rows = (items || []).map((item) => {
    const pool = (holdings || []).filter((h) => !used.has(h.id) && matchesHolding(item, h));
    // 같은 앱 표시가 붙은 종목 → 앱 표시가 없는(손으로 넣은) 종목 순. 다른 앱 종목은 건드리지 않는다.
    const holding = pool.find((h) => h.broker === item.broker) || pool.find((h) => !h.broker) || null;
    if (holding) used.add(holding.id);
    const target = holding ? { currency: holding.currency || defaultTarget(item.kind).currency } : defaultTarget(item.kind);
    const avgPrice = convertPrice(item.avgPrice, item.currency, target.currency, usdKrwRate);
    let status = 'new';
    if (holding) {
      const sameQty = item.qty != null && Math.abs(item.qty - holding.qty) < 1e-9;
      const sameAvg = avgPrice != null && Math.abs(avgPrice - holding.avgPrice) <= Math.max(1e-9, holding.avgPrice * 0.0005);
      status = sameQty && sameAvg && holding.broker === item.broker ? 'same' : 'update';
    }
    return { item, holding, status, currency: target.currency, avgPrice, converted: item.currency !== target.currency };
  });
  const brokers = new Set((items || []).map((i) => i.broker).filter(Boolean));
  const missing = (holdings || []).filter((h) => h.broker && brokers.has(h.broker) && !used.has(h.id));
  return { rows, missing };
}

// 확인 화면에서 고른 줄만 반영. 기존 종목은 id·메모·시세 설정을 그대로 두고 수량·평균단가·앱 표시만 바꾼다.
//  accepted: [{ holding?, qty, avgPrice, broker, sym, label, src, currency, coinId? }]
export function applyHoldingsPlan(holdings, accepted, deleteIds = [], now = Date.now()) {
  const del = new Set(deleteIds);
  const byId = new Map((accepted || []).filter((a) => a.holding).map((a) => [a.holding.id, a]));
  const next = (holdings || [])
    .filter((h) => !del.has(h.id))
    .map((h) => {
      const a = byId.get(h.id);
      if (!a) return h;
      return { ...h, qty: a.qty, avgPrice: a.avgPrice, ...(a.broker ? { broker: a.broker } : {}) };
    });
  (accepted || []).filter((a) => !a.holding).forEach((a, i) => {
    next.push({
      id: `h_${a.sym}_${now}_${i}`,
      sym: a.sym, label: a.label || a.sym, src: a.src,
      ...(a.coinId ? { coinId: a.coinId } : {}),
      qty: a.qty, avgPrice: a.avgPrice,
      currency: a.src === 'yahoo' ? a.currency : 'USD',
      ...(a.broker ? { broker: a.broker } : {}),
    });
  });
  return next;
}

// 새 종목의 시세 코드 찾기 — search는 /api/market?type=search 결과를 돌려주는 함수
export async function resolveScanSymbol(item, search) {
  const q = item.code || item.name;
  if (!q) return null;
  let results = [];
  try { results = (await search(q)) || []; } catch { results = []; }
  if (item.kind === 'coin') {
    const r = results.find((x) => x.src === 'coingecko' && x.sym === item.code)
      || (!item.code && results.find((x) => x.src === 'coingecko'));
    if (r) return { sym: r.sym, label: item.name || r.label, src: 'coingecko', currency: 'USD', coinId: r.coinId };
    return null;
  }
  if (item.kind === 'us_stock') {
    const r = results.find((x) => x.src === 'finnhub' && x.sym === item.code)
      || (!item.code && results.find((x) => x.src === 'finnhub'));
    if (r) return { sym: r.sym, label: item.name || r.label, src: 'finnhub', currency: 'USD' };
    return item.code ? { sym: item.code, label: item.name || item.code, src: 'finnhub', currency: 'USD' } : null;
  }
  const kr = results.filter((x) => x.src === 'yahoo' && x.currency === 'KRW');
  // 이름이 정확히 같은 종목을 먼저 — AI가 화면에 없는 코드를 짐작해 쓸 수 있어서 코드는 그다음
  const r = kr.find((x) => normName(x.label) === normName(item.name))
    || (item.code && kr.find((x) => symCore(x.sym) === item.code))
    || (!item.code && kr.length === 1 ? kr[0] : null);
  if (r) return { sym: r.sym, label: item.name || r.label, src: 'yahoo', currency: 'KRW' };
  if (/^\d{6}$/.test(item.code)) return { sym: `${item.code}.KS`, label: item.name || item.code, src: 'yahoo', currency: 'KRW' };
  return null;
}
