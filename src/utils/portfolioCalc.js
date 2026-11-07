// 보유자산 계산 공용 유틸 — Portfolio.jsx(관리화면)와 Home.jsx(오늘탭 자산 브리핑)가 동일한 로직을 쓰도록 분리
// (예전엔 두 화면이 각자 계산식을 따로 구현하고 있어서 값이 서로 달라지는 버그가 있었음)

// ── 업비트·빗썸 원화 시세 (2026-11-07, 사용자 승인) ──
// 캡처·검색으로 앱 이름(broker)이 붙은 코인은 그 거래소 원화 시세를 쓴다(거래소 앱과 금액이 맞게).
// 시세 이름은 "WAXP@upbit"처럼 따로 둔다 — 같은 코인을 CoinGecko(직접 입력)·업비트·빗썸에 나눠 가질 수 있어서.
// 저장된 평균단가는 예전처럼 달러라, 계산할 때 원화 시세를 환율로 달러로 바꾼다. 거래소 시세가 없으면 CoinGecko 시세.
const EXCHANGE_OF_BROKER = { 업비트: 'upbit', 빗썸: 'bithumb' };
export const EXCHANGE_NAME = { upbit: '업비트', bithumb: '빗썸' };
export const exchangeOf = (h) => (h?.src === 'coingecko' ? EXCHANGE_OF_BROKER[h.broker] || null : null);
export const exSymOf = (h) => String(h?.exSym || h?.sym || '').toUpperCase().replace(/^KRW-/, '');
export const priceKeyOf = (h) => { const ex = exchangeOf(h); return ex ? `${exSymOf(h)}@${ex}` : h.sym; };

// 시세 요청 목록 — 거래소 코인은 거래소 이름과 CoinGecko 이름 둘 다(대신 쓸 시세)
export function priceRequest(holdings, extra = []) {
  const syms = new Set(extra);
  const registry = {};
  for (const h of holdings || []) {
    syms.add(h.sym);
    registry[h.sym] = { label: h.label, src: h.src, ...(h.coinId ? { coinId: h.coinId } : {}) };
    const ex = exchangeOf(h);
    if (ex) { const k = priceKeyOf(h); syms.add(k); registry[k] = { label: h.label, src: ex, exSym: exSymOf(h) }; }
  }
  return { syms: [...syms], registry };
}

// 그 종목에 쓸 시세 (거래소 원화 → 저장 통화로 환산). exchange: 실제로 거래소 시세를 썼으면 'upbit'|'bithumb'
export function quoteFor(h, marketData, usdKrwRate) {
  const ex = exchangeOf(h);
  const exQ = ex ? marketData?.[priceKeyOf(h)] : null;
  if (exQ && exQ.price > 0) {
    const want = h.currency || 'USD';
    if (want === 'KRW') return { d: { ...exQ, currency: 'KRW' }, exchange: ex, exPrice: exQ.price };
    if (usdKrwRate) {
      return { d: { ...exQ, price: exQ.price / usdKrwRate, change: exQ.change != null ? exQ.change / usdKrwRate : null, currency: 'USD' }, exchange: ex, exPrice: exQ.price };
    }
  }
  return { d: marketData?.[h.sym] || null, exchange: null, exPrice: null };
}

// 시세 API가 실제로 반환한 통화(d.currency, yahoo만 KRW/USD 실측치 포함) 기준으로 판정
export const getMarketCurrency = (h, d) => d?.currency || (h.src === 'yahoo' ? 'KRW' : 'USD');

// 종목 하루 변동액. d.change(절대값)가 있으면 그대로, 없으면 등락률(chgPct)로 역산.
// chgPct는 (현재가-전일가)/전일가*100 이므로, 절대 변동액 = 현재가치 * (chgPct/100) / (1 + chgPct/100).
// (단순히 현재가치*chgPct/100만 쓰면 등락률이 클수록 실제 변동액보다 과대평가됨)
export function getDailyChange(d, qty) {
  if (d.change != null) return d.change * qty;
  if (d.chgPct != null) {
    const value = d.price * qty;
    return value * (d.chgPct / 100) / (1 + d.chgPct / 100);
  }
  return 0;
}

// 통화별 합계에서 손익/변동률 파생값 계산
export function deriveStats(value, cost, dailyChange) {
  const pnl = value - cost;
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
  const prevValue = value - dailyChange;
  const dailyChangePct = prevValue > 0 ? (dailyChange / prevValue) * 100 : 0;
  return { value, cost, pnl, pnlPct, dailyChange, dailyChangePct };
}

// 보유자산 전체 요약. 현재는 USD/KRW 두 통화만 지원한다.
// 각 통화의 원래(native) 합계를 따로 모아두고, 환율이 있으면 상대 통화 쪽 합계에도 환산해 더해서
// 두 가지 기준(USD/KRW) 총액을 모두 제공한다.
// cash = { krw, usd } (2026-11-07): 현금은 총 평가금액(value)에만 더한다. 손익·손익률·오늘 변동률은
// 투자한 종목 기준 그대로(현금 때문에 수익률이 낮아 보이지 않게). stats.cash = 그 통화로 환산한 현금.
export function calcPortfolioSummary(holdings, marketData, usdKrwRate, cash = null) {
  const cashKrw = Math.max(0, Number(cash?.krw) || 0);
  const cashUsd = Math.max(0, Number(cash?.usd) || 0);
  const hasCash = cashKrw > 0 || cashUsd > 0;
  const list = holdings || [];
  if (!hasCash && (!marketData || list.length === 0)) return null;
  let usdValue = 0, usdCost = 0, usdDailyChange = 0, usdCount = 0;
  let krwValue = 0, krwCost = 0, krwDailyChange = 0, krwCount = 0;
  const rows = list.map(h => {
    const { d, exchange, exPrice } = quoteFor(h, marketData, usdKrwRate);
    if (!d) return { ...h, noData: true };
    const marketCurrency = getMarketCurrency(h, d);
    if (h.currency && h.currency !== marketCurrency) {
      return { ...h, price: d.price, marketCurrency, currencyMismatch: true };
    }
    const value = h.qty * d.price;
    const cost = h.qty * h.avgPrice;
    const dailyChange = getDailyChange(d, h.qty);
    const pnl = value - cost;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
    if (marketCurrency === 'KRW') {
      krwValue += value; krwCost += cost; krwDailyChange += dailyChange; krwCount++;
    } else {
      usdValue += value; usdCost += cost; usdDailyChange += dailyChange; usdCount++;
    }
    return { ...h, price: d.price, marketCurrency, value, cost, pnl, pnlPct, dailyChange, ...(exchange ? { priceFrom: exchange, exPrice } : {}) };
  });
  if (usdCount === 0 && krwCount === 0 && !hasCash) return null;

  const rate = usdKrwRate; // 1 USD ≈ rate KRW
  const fxOk = !!rate;
  const statsUSD = deriveStats(
    usdValue + (fxOk ? krwValue / rate : 0),
    usdCost + (fxOk ? krwCost / rate : 0),
    usdDailyChange + (fxOk ? krwDailyChange / rate : 0)
  );
  const statsKRW = deriveStats(
    krwValue + (fxOk ? usdValue * rate : 0),
    krwCost + (fxOk ? usdCost * rate : 0),
    krwDailyChange + (fxOk ? usdDailyChange * rate : 0)
  );
  // 현금 더하기 (환율이 없으면 다른 통화 현금은 그 통화 총액에만)
  const cashInUSD = cashUsd + (fxOk ? cashKrw / rate : 0);
  const cashInKRW = cashKrw + (fxOk ? cashUsd * rate : 0);
  statsUSD.invested = statsUSD.value; statsUSD.cash = cashInUSD; statsUSD.value += cashInUSD;
  statsKRW.invested = statsKRW.value; statsKRW.cash = cashInKRW; statsKRW.value += cashInKRW;

  return {
    rows,
    usdNative: { value: usdValue + cashUsd, count: usdCount },
    krwNative: { value: krwValue + cashKrw, count: krwCount },
    statsUSD, statsKRW, fxOk,
    mixed: (usdCount > 0 || cashUsd > 0) && (krwCount > 0 || cashKrw > 0),
  };
}
