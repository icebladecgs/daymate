import { useState, useEffect } from "react";
import { saveSettings } from "../firebase.js";
import { store } from "../utils/storage.js";
import { toDateStr } from "../utils/date.js";
import { fetchMarketDataFromServer } from "../api/telegram.js";
import S from "../styles.js";
import Toast from "../components/Toast.jsx";

const PRESET_ASSETS = [
  { sym: "BTC",  label: "비트코인",       src: "coingecko", coinId: "bitcoin",  currency: "USD" },
  { sym: "ETH",  label: "이더리움",       src: "coingecko", coinId: "ethereum", currency: "USD" },
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
  if (d.chgPct != null) return (d.price - d.price / (1 + d.chgPct / 100)) * qty;
  return 0;
}

const PF_CACHE_PREFIX = "dm_portfolio_prices_";

export default function Portfolio({ uid, telegramCfg, setTelegramCfg, authUser, onBack, embedded = false, onOpenDiary }) {
  const cacheKey = PF_CACHE_PREFIX + toDateStr();
  const [holdings, setHoldings] = useState(() => telegramCfg?.holdings || []);
  const [marketData, setMarketData] = useState(() => {
    try { return JSON.parse(localStorage.getItem(PF_CACHE_PREFIX + toDateStr()) || "null"); } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // 입력 폼 상태
  const [fSym, setFSym] = useState("");
  const [fLabel, setFLabel] = useState("");
  const [fQty, setFQty] = useState("");
  const [fAvgPrice, setFAvgPrice] = useState("");
  const [fCurrency, setFCurrency] = useState("USD");
  const [fSrc, setFSrc] = useState("finnhub");

  // 폼 초기화
  const resetForm = () => {
    setFSym(""); setFLabel(""); setFQty(""); setFAvgPrice(""); setFCurrency("USD"); setFSrc("finnhub");
    setEditingId(null); setShowForm(false);
  };

  // 프리셋 선택
  const pickPreset = (p) => {
    setFSym(p.sym); setFLabel(p.label); setFCurrency(p.currency); setFSrc(p.src);
    if (p.coinId) setFSrc("coingecko");
  };

  // 시세 가져오기
  const fetchPrices = async (list = holdings) => {
    if (list.length === 0) return;
    setLoading(true);
    const syms = [...new Set(list.map(h => h.sym))];
    const customRegistry = Object.fromEntries(list.map(h => [h.sym, { label: h.label, src: h.src, ...(h.coinId ? { coinId: h.coinId } : {}) }]));
    const data = await fetchMarketDataFromServer(syms, customRegistry);
    if (Object.keys(data).length > 0) {
      localStorage.setItem(cacheKey, JSON.stringify(data));
      setMarketData(data);
    } else {
      setToast("시세 로드 실패");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!marketData && holdings.length > 0) fetchPrices();
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
    const sym = fSym.trim().toUpperCase();
    const label = fLabel.trim() || sym;
    const qty = parseFloat(fQty.replace(/,/g, ""));
    const avgPrice = parseFloat(fAvgPrice.replace(/,/g, ""));
    if (!sym) { setToast("종목 코드를 입력해주세요"); return; }
    if (isNaN(qty) || qty <= 0) { setToast("수량을 올바르게 입력해주세요"); return; }
    if (isNaN(avgPrice) || avgPrice <= 0) { setToast("평균단가를 올바르게 입력해주세요"); return; }

    const preset = PRESET_ASSETS.find(p => p.sym === sym);
    const holding = {
      id: editingId || `h_${sym}_${Date.now()}`,
      sym, label,
      src: preset?.src || fSrc,
      ...(preset?.coinId ? { coinId: preset.coinId } : {}),
      qty, avgPrice, currency: fCurrency,
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
    setShowForm(true);
  };

  const handleDelete = (id) => {
    const next = holdings.filter(h => h.id !== id);
    setHoldings(next);
    saveHoldings(next);
    setToast("삭제됨");
  };

  // 포트폴리오 요약 계산
  const calcSummary = () => {
    if (!marketData || holdings.length === 0) return null;
    let totalValue = 0, totalCost = 0, totalDailyChange = 0, count = 0;
    const rows = holdings.map(h => {
      const d = marketData[h.sym];
      if (!d) return { ...h, noData: true };
      const value = h.qty * d.price;
      const cost = h.qty * h.avgPrice;
      const dailyChange = getDailyChange(d, h.qty);
      totalValue += value; totalCost += cost; totalDailyChange += dailyChange; count++;
      return { ...h, price: d.price, value, cost, pnl: value - cost, pnlPct: cost > 0 ? ((value - cost) / cost) * 100 : 0, dailyChange };
    });
    if (count === 0) return null;
    const pnl = totalValue - totalCost;
    const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;
    const prevValue = totalValue - totalDailyChange;
    const dailyChangePct = prevValue > 0 ? (totalDailyChange / prevValue) * 100 : 0;
    return { totalValue, totalCost, pnl, pnlPct, totalDailyChange, dailyChangePct, rows };
  };

  const summary = calcSummary();

  const openDiaryWithHolding = (holding, rowData) => {
    if (!onOpenDiary) return;
    onOpenDiary({
      asset: holding.sym,
      currency: holding.currency || "USD",
      quoteSnapshot: rowData?.price != null
        ? {
            ...rowData,
            currency: holding.currency || "USD",
            capturedAt: new Date().toISOString(),
          }
        : null,
      holdingSnapshot: {
        qty: holding.qty,
        avgPrice: holding.avgPrice,
        currency: holding.currency || "USD",
      },
    });
  };

  const inputStyle = { ...S.input, marginBottom: 0 };
  const rootStyle = embedded
    ? { width: "100%", minWidth: 0, boxSizing: "border-box", paddingBottom: 12 }
    : S.content;

  return (
    <div style={rootStyle}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}

      {/* 상단바 */}
      {!embedded && (
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
            {loading ? "..." : "🔄"}
          </button>
        </div>
      )}

      {embedded && (
        <div style={{ ...S.card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)", marginBottom: 4 }}>브리핑을 보고 바로 기록하세요</div>
            <div style={{ fontSize: 11, color: "var(--dm-muted)", lineHeight: 1.5 }}>오늘 손익을 확인한 직후에 판단을 남겨야 복기 품질이 좋아집니다.</div>
          </div>
          {onOpenDiary && (
            <button onClick={onOpenDiary} style={{ ...S.btnGhost, width: "auto", marginTop: 0, padding: "10px 12px", flexShrink: 0 }}>
              기록하기
            </button>
          )}
        </div>
      )}

      {embedded && (
        <div style={{ ...S.card, marginTop: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--dm-muted)", marginBottom: 3 }}>보유 종목</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: "var(--dm-text)" }}>{holdings.length}개</div>
          </div>
          <button
            onClick={() => { localStorage.removeItem(cacheKey); setMarketData(null); fetchPrices(); }}
            style={{ background: "transparent", border: "1px solid var(--dm-border)", color: "var(--dm-muted)", fontSize: 12, cursor: "pointer", borderRadius: 10, padding: "8px 10px" }}
          >
            {loading ? "불러오는 중..." : "시세 새로고침"}
          </button>
        </div>
      )}

      {/* 포트폴리오 요약 */}
      {summary && (
        <div style={{ ...S.card, marginBottom: 10, background: "var(--dm-card)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 4 }}>총 평가금액</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "var(--dm-text)" }}>{fmtUSD(summary.totalValue)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 4 }}>오늘 변동</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: pnlColor(summary.totalDailyChange) }}>
                {summary.totalDailyChange >= 0 ? "+" : ""}{fmtUSD(summary.totalDailyChange)}
              </div>
              <div style={{ fontSize: 12, color: pnlColor(summary.dailyChangePct) }}>{fmtPct(summary.dailyChangePct)}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, paddingTop: 10, borderTop: "1px solid var(--dm-row)" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "var(--dm-muted)" }}>투자원금</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--dm-text)" }}>{fmtUSD(summary.totalCost)}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "var(--dm-muted)" }}>평가손익</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: pnlColor(summary.pnl) }}>
                {summary.pnl >= 0 ? "+" : ""}{fmtUSD(summary.pnl)} ({fmtPct(summary.pnlPct)})
              </div>
            </div>
          </div>
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
          {(summary ? summary.rows : holdings).map((h, i, arr) => (
            <div key={h.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 0",
              borderBottom: i < arr.length - 1 ? "1px solid var(--dm-row)" : "none",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)" }}>{h.label || h.sym}</span>
                  <span style={{ fontSize: 11, color: "var(--dm-muted)" }}>{h.sym}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 2 }}>
                  {h.qty}주 · 매수가 {fmtPrice(h.avgPrice, h.currency)}
                  {!h.noData && h.price != null && (
                    <> · 현재 {fmtPrice(h.price, h.currency)}</>
                  )}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                {!h.noData && h.value != null ? (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)" }}>{fmtUSD(h.value)}</div>
                    <div style={{ fontSize: 11, color: pnlColor(h.pnl) }}>
                      {h.pnl >= 0 ? "+" : ""}{fmtUSD(h.pnl)} ({fmtPct(h.pnlPct)})
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: "var(--dm-muted)" }}>시세 없음</div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                {embedded && onOpenDiary && (
                  <button onClick={() => openDiaryWithHolding(h, h)}
                    style={{ background: "transparent", border: "none", color: "#6C8EFF", cursor: "pointer", fontSize: 12, fontWeight: 800, padding: "2px 4px" }}>기록</button>
                )}
                <button onClick={() => handleEdit(h)}
                  style={{ background: "transparent", border: "none", color: "var(--dm-muted)", cursor: "pointer", fontSize: 13, padding: "2px 4px" }}>✏️</button>
                <button onClick={() => handleDelete(h.id)}
                  style={{ background: "transparent", border: "none", color: "#F87171", cursor: "pointer", fontSize: 13, padding: "2px 4px" }}>🗑</button>
              </div>
            </div>
          ))}
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
              <div>
                <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 4 }}>종목 코드 *</div>
                <input style={inputStyle} value={fSym} onChange={e => setFSym(e.target.value.toUpperCase())}
                  placeholder="예: TSLA, BTC" maxLength={20} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 4 }}>종목 이름</div>
                <input style={inputStyle} value={fLabel} onChange={e => setFLabel(e.target.value)}
                  placeholder="예: 테슬라" maxLength={30} />
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
                <select style={{ ...inputStyle, appearance: "none" }} value={fCurrency} onChange={e => setFCurrency(e.target.value)}>
                  <option value="USD">USD (달러)</option>
                  <option value="KRW">KRW (원화)</option>
                </select>
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

      <div style={{ height: embedded ? 12 : 40 }} />
    </div>
  );
}
