import { useState, useEffect } from "react";
import { saveSettings } from "../firebase.js";
import { store } from "../utils/storage.js";
import { toDateStr } from "../utils/date.js";
import { fetchMarketDataFromServer } from "../api/telegram.js";
import S from "../styles.js";
import Toast from "../components/Toast.jsx";

const PRESET_ASSETS = [
  { sym: "BTC",  label: "비트코인",       src: "coingecko", coinId: "bitcoin",     currency: "USD" },
  { sym: "ETH",  label: "이더리움",       src: "coingecko", coinId: "ethereum",    currency: "USD" },
  { sym: "SOL",  label: "솔라나",         src: "coingecko", coinId: "solana",      currency: "USD" },
  { sym: "XRP",  label: "리플",           src: "coingecko", coinId: "ripple",      currency: "USD" },
  { sym: "DOGE", label: "도지코인",       src: "coingecko", coinId: "dogecoin",    currency: "USD" },
  { sym: "ADA",  label: "카르다노",       src: "coingecko", coinId: "cardano",     currency: "USD" },
  { sym: "BNB",  label: "바이낸스코인",   src: "coingecko", coinId: "binancecoin", currency: "USD" },
  { sym: "TSLA", label: "테슬라",         src: "finnhub",                       currency: "USD" },
  { sym: "GOOGL",label: "구글",           src: "finnhub",                       currency: "USD" },
  { sym: "QQQ",  label: "나스닥100(QQQ)", src: "finnhub",                       currency: "USD" },
  { sym: "NVDA", label: "엔비디아",       src: "finnhub",                       currency: "USD" },
  { sym: "AAPL", label: "애플",           src: "finnhub",                       currency: "USD" },
];

const fmtNum = (n, decimals = 2) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const fmtUSD = (n) => "$" + fmtNum(n);
const fmtKRW = (n) => Number(n).toLocaleString("ko-KR") + "원";
const fmtPrice = (n, currency) => currency === "KRW" ? fmtKRW(n) : fmtUSD(n);
const fmtPct = (n) => (n >= 0 ? "+" : "") + fmtNum(n) + "%";
const pnlColor = (n) => n > 0 ? "#4ADE80" : n < 0 ? "#F87171" : "var(--dm-muted)";

function getDailyChange(d, qty) {
  if (d.change != null) return d.change * qty;
  if (d.chgPct != null) return (d.price * d.chgPct / 100) * qty;
  return 0;
}

// 시세 API가 실제로 반환한 통화(d.currency, yahoo만 KRW/USD 실측치 포함) 기준으로 판정
const getMarketCurrency = (h, d) => d?.currency || (h.src === 'yahoo' ? 'KRW' : 'USD');

function pad2(n) { return String(n).padStart(2, "0"); }
function formatMemoDate(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const PF_CACHE_PREFIX = "dm_portfolio_prices_";
const FX_CACHE_PREFIX = "dm_fx_usd_krw_";

export default function Portfolio({ telegramCfg, setTelegramCfg, authUser, onBack }) {
  const cacheKey = PF_CACHE_PREFIX + toDateStr();
  const fxCacheKey = FX_CACHE_PREFIX + toDateStr();
  const [holdings, setHoldings] = useState(() => telegramCfg?.holdings || []);
  const [marketData, setMarketData] = useState(() => {
    try { return JSON.parse(localStorage.getItem(PF_CACHE_PREFIX + toDateStr()) || "null"); } catch { return null; }
  });
  const [usdKrwRate, setUsdKrwRate] = useState(() => {
    try { return JSON.parse(localStorage.getItem(FX_CACHE_PREFIX + toDateStr()) || "null"); } catch { return null; }
  });
  const [displayCurrency, setDisplayCurrency] = useState(() => store.get("dm_pf_display_currency", "USD"));
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [memoOpenId, setMemoOpenId] = useState(null);
  const [memoDraft, setMemoDraft] = useState("");

  // 입력 폼 상태
  const [fSym, setFSym] = useState("");
  const [fLabel, setFLabel] = useState("");
  const [fQty, setFQty] = useState("");
  const [fAvgPrice, setFAvgPrice] = useState("");
  const [fCurrency, setFCurrency] = useState("USD");
  const [fSrc, setFSrc] = useState("finnhub");
  const [fCoinId, setFCoinId] = useState("");

  // 이름 검색(종목 이름 → 티커 자동완성)
  const [nameResults, setNameResults] = useState([]);
  const [nameSearching, setNameSearching] = useState(false);
  const [showNameResults, setShowNameResults] = useState(false);

  // 폼 초기화
  const resetForm = () => {
    setFSym(""); setFLabel(""); setFQty(""); setFAvgPrice(""); setFCurrency("USD"); setFSrc("finnhub"); setFCoinId("");
    setNameResults([]); setShowNameResults(false);
    setEditingId(null); setShowForm(false);
  };

  // 종목 이름으로 검색해 티커 자동완성 (신규 등록 시에만 동작, 수정 중엔 비활성)
  useEffect(() => {
    if (editingId) return;
    const q = fLabel.trim();
    if (q.length < 2) { setNameResults([]); setShowNameResults(false); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setNameSearching(true);
      try {
        const res = await fetch(`/api/market?type=search&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!cancelled) { setNameResults(data.results || []); setShowNameResults(true); }
      } catch {
        if (!cancelled) setNameResults([]);
      } finally {
        if (!cancelled) setNameSearching(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [fLabel, editingId]);

  const pickSearchResult = (r) => {
    setFSym(r.sym);
    setFLabel(r.label);
    setFSrc(r.src);
    setFCurrency(r.currency);
    setFCoinId(r.coinId || "");
    setShowNameResults(false);
  };

  // 종목 코드가 한국 주식 형태(숫자 6자리 또는 .KS/.KQ)면 소스/통화를 자동으로 맞춰줌
  useEffect(() => {
    const sym = fSym.trim().toUpperCase();
    const isKr = /^\d{6}$/.test(sym) || /\.(KS|KQ)$/i.test(sym);
    if (isKr && fSrc !== "yahoo") {
      setFSrc("yahoo");
      setFCurrency("KRW");
    }
  }, [fSym]); // eslint-disable-line

  // 프리셋 선택
  const pickPreset = (p) => {
    setFSym(p.sym); setFLabel(p.label); setFCurrency(p.currency); setFSrc(p.src); setFCoinId("");
    setShowNameResults(false);
  };

  // 시세 가져오기
  const fetchPrices = async (list = holdings) => {
    if (list.length === 0) return;
    setLoading(true);
    try {
      const syms = [...new Set(list.map(h => h.sym))];
      const customRegistry = Object.fromEntries(list.map(h => [h.sym, { label: h.label, src: h.src, ...(h.coinId ? { coinId: h.coinId } : {}) }]));
      const data = await fetchMarketDataFromServer(syms, customRegistry);
      if (Object.keys(data).length > 0) {
        localStorage.setItem(cacheKey, JSON.stringify(data));
        setMarketData(data);
      } else {
        setToast("시세 로드 실패");
      }
    } catch { setToast("시세 로드 실패"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!marketData && holdings.length > 0) fetchPrices();
  }, []); // eslint-disable-line

  // 환율 (KRW 종목을 USD 총액에 합산하기 위함)
  const fetchFxRate = async () => {
    try {
      const res = await fetch("/api/market?type=fx&from=USD&to=KRW");
      const data = await res.json();
      if (data?.ok && data.rate) {
        localStorage.setItem(fxCacheKey, JSON.stringify(data.rate));
        setUsdKrwRate(data.rate);
      }
    } catch { /* 환율 조회 실패 시 원화 종목은 총액과 별도로 표시됨 */ }
  };

  useEffect(() => {
    if (usdKrwRate == null && holdings.length > 0) fetchFxRate();
  }, []); // eslint-disable-line

  // 저장
  const saveHoldings = (next) => {
    const cfg = { ...telegramCfg, holdings: next };
    setTelegramCfg(cfg);
    store.set("dm_telegram", cfg);
    if (authUser) saveSettings(authUser.uid, { telegram: cfg }).catch(() => {});
  };

  // 추가 / 수정
  const handleSave = () => {
    let sym = fSym.trim().toUpperCase();
    const label = fLabel.trim() || sym;
    const qty = parseFloat(fQty.replace(/,/g, ""));
    const avgPrice = parseFloat(fAvgPrice.replace(/,/g, ""));
    if (!sym) { setToast("종목 코드를 입력해주세요"); return; }
    if (isNaN(qty) || qty <= 0) { setToast("수량을 올바르게 입력해주세요"); return; }
    if (isNaN(avgPrice) || avgPrice <= 0) { setToast("평균단가를 올바르게 입력해주세요"); return; }
    if (/^\d{6}$/.test(sym)) sym = `${sym}.KS`; // 한국 주식 숫자 코드 → 코스피 심볼로 자동 보정

    const preset = PRESET_ASSETS.find(p => p.sym === sym);
    const src = preset?.src || fSrc;
    const existing = editingId ? holdings.find(h => h.id === editingId) : null;
    const holding = {
      id: editingId || `h_${sym}_${Date.now()}`,
      sym, label, src,
      ...(preset?.coinId || fCoinId ? { coinId: preset?.coinId || fCoinId } : {}),
      qty, avgPrice,
      currency: src === 'yahoo' ? fCurrency : 'USD',
      ...(existing?.memos ? { memos: existing.memos } : {}),
    };

    const next = editingId
      ? holdings.map(h => h.id === editingId ? holding : h)
      : [...holdings, holding];

    setHoldings(next);
    saveHoldings(next);
    resetForm();
    setToast(editingId ? "수정됨 ✅" : "추가됨 ✅");
    localStorage.removeItem(cacheKey);
    fetchPrices(next);
  };

  const handleEdit = (h) => {
    setEditingId(h.id); setFSym(h.sym); setFLabel(h.label || ""); setFQty(String(h.qty));
    setFAvgPrice(String(h.avgPrice)); setFCurrency(h.currency || "USD"); setFSrc(h.src || "finnhub");
    setFCoinId(h.coinId || ""); setShowNameResults(false);
    setShowForm(true);
  };

  const handleDelete = (id) => {
    const next = holdings.filter(h => h.id !== id);
    setHoldings(next);
    saveHoldings(next);
    setToast("삭제됨");
  };

  // 메모
  const handleAddMemo = (holdingId) => {
    const text = memoDraft.trim();
    if (!text) return;
    const next = holdings.map(h => h.id === holdingId
      ? { ...h, memos: [...(h.memos || []), { id: `m_${Date.now()}`, text, createdAt: new Date().toISOString() }] }
      : h);
    setHoldings(next);
    saveHoldings(next);
    setMemoDraft("");
  };

  const handleDeleteMemo = (holdingId, memoId) => {
    const next = holdings.map(h => h.id === holdingId
      ? { ...h, memos: (h.memos || []).filter(m => m.id !== memoId) }
      : h);
    setHoldings(next);
    saveHoldings(next);
  };

  // 통화별 합계에서 손익/변동률 파생값 계산
  const deriveStats = (value, cost, dailyChange) => {
    const pnl = value - cost;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
    const prevValue = value - dailyChange;
    const dailyChangePct = prevValue > 0 ? (dailyChange / prevValue) * 100 : 0;
    return { value, cost, pnl, pnlPct, dailyChange, dailyChangePct };
  };

  // 포트폴리오 요약 계산
  // 현재는 USD/KRW 두 통화만 지원한다. 각 통화의 원래(native) 합계를 따로 모아두고,
  // 환율이 있으면 그걸로 상대 통화 쪽 합계에도 환산해 더해서 두 가지 기준(USD/KRW) 총액을 모두 제공한다.
  const calcSummary = () => {
    if (!marketData || holdings.length === 0) return null;
    let usdValue = 0, usdCost = 0, usdDailyChange = 0, usdCount = 0;
    let krwValue = 0, krwCost = 0, krwDailyChange = 0, krwCount = 0;
    const rows = holdings.map(h => {
      const d = marketData[h.sym];
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
      return { ...h, price: d.price, marketCurrency, value, cost, pnl, pnlPct, dailyChange };
    });
    if (usdCount === 0 && krwCount === 0) return null;

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

    return {
      rows,
      usdNative: { value: usdValue, count: usdCount },
      krwNative: { value: krwValue, count: krwCount },
      statsUSD, statsKRW, fxOk,
      mixed: usdCount > 0 && krwCount > 0,
    };
  };

  const summary = calcSummary();
  const stats = displayCurrency === "KRW" ? summary?.statsKRW : summary?.statsUSD;
  const setDisplayCurrencyPersist = (cur) => { setDisplayCurrency(cur); store.set("dm_pf_display_currency", cur); };

  const inputStyle = { ...S.input, marginBottom: 0 };

  return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}

      {/* 상단바 */}
      <div style={S.topbar}>
        <button onClick={onBack} style={{ background: "transparent", border: "none", color: "var(--dm-text)", fontSize: 22, cursor: "pointer", padding: 0 }}>←</button>
        <div style={{ flex: 1, marginLeft: 10 }}>
          <div style={S.title}>💼 보유자산</div>
          <div style={S.sub}>수량 · 단가 입력 후 평가손익 확인</div>
        </div>
        <button
          onClick={() => { localStorage.removeItem(cacheKey); setMarketData(null); fetchPrices(); }}
          style={{ background: "transparent", border: "none", color: "var(--dm-muted)", fontSize: 13, cursor: "pointer" }}
        >
          {loading ? "로딩 중..." : "🔄"}
        </button>
      </div>

      {/* 포트폴리오 요약 */}
      {summary && stats && (
        <div style={{ ...S.card, marginBottom: 10, background: "var(--dm-card)" }}>
          {stats.value > 0 || stats.cost > 0 ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "var(--dm-muted)" }}>총 평가금액</span>
                    {summary.fxOk && (
                      <div style={{ display: "flex", gap: 2 }}>
                        {["USD", "KRW"].map(cur => (
                          <button key={cur} onClick={() => setDisplayCurrencyPersist(cur)}
                            style={{
                              fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 6, cursor: "pointer",
                              border: `1px solid ${displayCurrency === cur ? "#6C8EFF" : "var(--dm-border)"}`,
                              background: displayCurrency === cur ? "rgba(108,142,255,.14)" : "transparent",
                              color: displayCurrency === cur ? "#6C8EFF" : "var(--dm-muted)",
                            }}>{cur}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "var(--dm-text)" }}>{fmtPrice(stats.value, displayCurrency)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 4 }}>오늘 변동</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: pnlColor(stats.dailyChange) }}>
                    {stats.dailyChange >= 0 ? "+" : ""}{fmtPrice(stats.dailyChange, displayCurrency)}
                  </div>
                  <div style={{ fontSize: 12, color: pnlColor(stats.dailyChangePct) }}>{fmtPct(stats.dailyChangePct)}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, paddingTop: 10, borderTop: "1px solid var(--dm-row)" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "var(--dm-muted)" }}>투자원금</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--dm-text)" }}>{fmtPrice(stats.cost, displayCurrency)}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "var(--dm-muted)" }}>평가손익</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: pnlColor(stats.pnl) }}>
                    {stats.pnl >= 0 ? "+" : ""}{fmtPrice(stats.pnl, displayCurrency)} ({fmtPct(stats.pnlPct)})
                  </div>
                </div>
              </div>
            </>
          ) : null}
          {summary.mixed && (
            <div style={{ display: "flex", gap: 12, paddingTop: 10, marginTop: 10, borderTop: "1px solid var(--dm-row)" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "var(--dm-muted)" }}>달러자산</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--dm-text)" }}>{fmtUSD(summary.usdNative.value)}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "var(--dm-muted)" }}>원화자산</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--dm-text)" }}>{fmtKRW(summary.krwNative.value)}</div>
              </div>
            </div>
          )}
          {summary.mixed && (
            <div style={{ fontSize: 10, color: "var(--dm-muted)", marginTop: 6 }}>
              {summary.fxOk
                ? `현재 환율(1 USD ≈ ${fmtNum(usdKrwRate, 0)}원) 기준으로 환산해 총 평가금액에 반영했습니다`
                : "환율 조회 실패로 두 자산이 총 평가금액에 정확히 합산되지 않았습니다"}
            </div>
          )}
        </div>
      )}

      {/* 로딩 */}
      {loading && (
        <div style={{ textAlign: "center", fontSize: 12, color: "var(--dm-muted)", padding: "12px 0" }}>
          시세 불러오는 중...
        </div>
      )}

      {/* 보유 종목 리스트 */}
      {holdings.length > 0 && (
        <div style={{ ...S.card, marginBottom: 10 }}>
          {(summary ? summary.rows : holdings).map((h, i, arr) => {
            const memos = h.memos || [];
            const memoOpen = memoOpenId === h.id;
            return (
              <div key={h.id} style={{
                padding: "10px 0",
                borderBottom: i < arr.length - 1 ? "1px solid var(--dm-row)" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)" }}>{h.label || h.sym}</span>
                      <span style={{ fontSize: 11, color: "var(--dm-muted)" }}>{h.sym}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 2 }}>
                      {h.qty}주 · 매수가 {fmtPrice(h.avgPrice, h.currency)}
                      {!h.noData && h.price != null && (
                        <> · 현재 {fmtPrice(h.price, h.marketCurrency || 'USD')}</>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    {!h.noData && h.value != null ? (
                      <>
                        <div style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)" }}>{fmtPrice(h.value, h.marketCurrency || 'USD')}</div>
                        <div style={{ fontSize: 11, color: pnlColor(h.pnl) }}>
                          {h.pnl >= 0 ? "+" : ""}{fmtPrice(h.pnl, h.marketCurrency || 'USD')} ({fmtPct(h.pnlPct)})
                        </div>
                      </>
                    ) : h.currencyMismatch ? (
                      <div style={{ fontSize: 11, color: "#F87171", lineHeight: 1.5 }}>통화 불일치<br/>USD로 재입력</div>
                    ) : (
                      <div style={{ fontSize: 11, color: "var(--dm-muted)" }}>시세 없음</div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={() => { setMemoOpenId(memoOpen ? null : h.id); setMemoDraft(""); }}
                      style={{ background: "transparent", border: "none", color: memos.length > 0 ? "#6C8EFF" : "var(--dm-muted)", cursor: "pointer", fontSize: 12, fontWeight: 800, padding: "2px 4px" }}
                    >
                      📝{memos.length > 0 ? ` ${memos.length}` : ""}
                    </button>
                    <button onClick={() => handleEdit(h)}
                      style={{ background: "transparent", border: "none", color: "var(--dm-muted)", cursor: "pointer", fontSize: 13, padding: "2px 4px" }}>✏️</button>
                    <button onClick={() => handleDelete(h.id)}
                      style={{ background: "transparent", border: "none", color: "#F87171", cursor: "pointer", fontSize: 13, padding: "2px 4px" }}>🗑</button>
                  </div>
                </div>

                {memoOpen && (
                  <div style={{ marginTop: 10 }}>
                    {memos.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                        {[...memos].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(m => (
                          <div key={m.id} style={{ background: "var(--dm-input)", borderRadius: 10, padding: "8px 10px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                              <div style={{ fontSize: 12, color: "var(--dm-text)", lineHeight: 1.5, flex: 1 }}>{m.text}</div>
                              <button onClick={() => handleDeleteMemo(h.id, m.id)}
                                style={{ background: "transparent", border: "none", color: "var(--dm-muted)", cursor: "pointer", fontSize: 11, flexShrink: 0 }}>✕</button>
                            </div>
                            <div style={{ fontSize: 10, color: "var(--dm-muted)", marginTop: 4 }}>{formatMemoDate(m.createdAt)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        value={memoDraft}
                        onChange={(e) => setMemoDraft(e.target.value)}
                        placeholder="메모 남기기..."
                        maxLength={200}
                        style={{ ...S.input, marginBottom: 0, flex: 1 }}
                        onKeyDown={(e) => { if (e.key === "Enter") handleAddMemo(h.id); }}
                      />
                      <button onClick={() => handleAddMemo(h.id)} style={{ ...S.btnGhost, width: "auto", marginTop: 0, padding: "0 14px", flexShrink: 0 }}>추가</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {holdings.length === 0 && !showForm && (
        <div style={{ ...S.card, textAlign: "center", color: "var(--dm-muted)", fontSize: 13, padding: "28px 16px" }}>
          보유 종목을 추가해보세요<br />
          <span style={{ fontSize: 11, marginTop: 6, display: "block" }}>수량과 평균단가를 입력하면<br />평가금액과 손익을 자동 계산해요</span>
        </div>
      )}

      {/* 추가 버튼 */}
      {!showForm && (
        <button onClick={() => { resetForm(); setShowForm(true); }} style={{ ...S.btn, marginBottom: 10 }}>
          ＋ 종목 추가
        </button>
      )}

      {/* 입력 폼 */}
      {showForm && (
        <div style={{ ...S.card, marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)", marginBottom: 12 }}>
            {editingId ? "✏️ 종목 수정" : "＋ 종목 추가"}
          </div>

          {/* 프리셋 빠른 선택 */}
          {!editingId && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 6 }}>빠른 선택</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {PRESET_ASSETS.map(p => (
                  <button key={p.sym} onClick={() => pickPreset(p)}
                    style={{
                      fontSize: 12, padding: "4px 10px", borderRadius: 8, cursor: "pointer",
                      border: fSym === p.sym ? "1.5px solid #6C8EFF" : "1px solid var(--dm-border)",
                      background: fSym === p.sym ? "rgba(108,142,255,.12)" : "var(--dm-card)",
                      color: fSym === p.sym ? "#6C8EFF" : "var(--dm-text)", fontWeight: 700,
                    }}>
                    {p.sym}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ position: "relative" }}>
                <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 4 }}>종목 이름</div>
                <input
                  style={inputStyle}
                  value={fLabel}
                  onChange={e => setFLabel(e.target.value)}
                  onFocus={() => { if (nameResults.length > 0) setShowNameResults(true); }}
                  onBlur={() => setTimeout(() => setShowNameResults(false), 150)}
                  placeholder="예: 삼성전자, 테슬라, 솔라나"
                  maxLength={30}
                />
                {!editingId && showNameResults && (nameSearching || nameResults.length > 0) && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, marginTop: 4,
                    background: "var(--dm-card)", border: "1px solid var(--dm-border)", borderRadius: 12,
                    boxShadow: "0 10px 28px rgba(0,0,0,.18)", maxHeight: 240, overflowY: "auto",
                  }}>
                    {nameSearching && (
                      <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--dm-muted)" }}>검색 중...</div>
                    )}
                    {!nameSearching && nameResults.map(r => (
                      <div
                        key={`${r.src}_${r.sym}`}
                        onMouseDown={() => pickSearchResult(r)}
                        style={{ padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid var(--dm-row)", display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--dm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</div>
                          <div style={{ fontSize: 10, color: "var(--dm-muted)" }}>{r.sym} · {r.exchange}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 4 }}>종목 코드 *</div>
                <input style={inputStyle} value={fSym} onChange={e => setFSym(e.target.value.toUpperCase())}
                  placeholder="검색해서 선택하거나 직접 입력" maxLength={20} />
                {/^\d{6}$/.test(fSym.trim()) && (
                  <div style={{ fontSize: 10, color: "var(--dm-muted)", marginTop: 4 }}>
                    한국 주식으로 인식했어요 (코스피 기준 .KS 자동 적용, 코스닥은 코드 뒤에 직접 .KQ를 붙여주세요)
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 4 }}>보유 수량 *</div>
                <input style={inputStyle} value={fQty} onChange={e => setFQty(e.target.value)}
                  placeholder="예: 10" inputMode="decimal" />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 4 }}>평균매수가 *</div>
                <input style={inputStyle} value={fAvgPrice} onChange={e => setFAvgPrice(e.target.value)}
                  placeholder="예: 250.00" inputMode="decimal" />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 4 }}>통화</div>
                {fSrc !== 'yahoo' ? (
                  <div style={{ fontSize: 12, color: "var(--dm-sub)", padding: "8px 12px", background: "var(--dm-row)", borderRadius: 10, border: "1px solid var(--dm-border)" }}>
                    USD 고정 (시세 통화)
                  </div>
                ) : (
                  <select style={{ ...inputStyle, appearance: "none" }} value={fCurrency} onChange={e => setFCurrency(e.target.value)}>
                    <option value="KRW">KRW (원화)</option>
                    <option value="USD">USD (달러)</option>
                  </select>
                )}
              </div>
              {!PRESET_ASSETS.find(p => p.sym === fSym) && fSym && (
                <div>
                  <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 4 }}>데이터 소스</div>
                  <select style={{ ...inputStyle, appearance: "none" }} value={fSrc} onChange={e => setFSrc(e.target.value)}>
                    <option value="finnhub">미국 주식/ETF</option>
                    <option value="coingecko">코인 (CoinGecko)</option>
                    <option value="yahoo">한국 주식 (Yahoo)</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={handleSave} style={{ ...S.btn, flex: 1 }}>
              {editingId ? "수정 저장" : "추가"}
            </button>
            <button onClick={resetForm} style={{ ...S.btnGhost, flex: 1 }}>취소</button>
          </div>
        </div>
      )}

      <div style={{ height: 40 }} />
    </div>
  );
}
