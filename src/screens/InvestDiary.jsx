import { useEffect, useState } from "react";
import { saveInvestLog, loadInvestLogs } from "../firebase.js";
import S from "../styles.js";
import Toast from "../components/Toast.jsx";
import InvestDetail from "./InvestDetail.jsx";

const PRESET_ASSETS = [
  { sym: "BTC",   label: "비트코인",      category: "crypto" },
  { sym: "ETH",   label: "이더리움",      category: "crypto" },
  { sym: "TSLA",  label: "테슬라",        category: "stock"  },
  { sym: "GOOGL", label: "구글",          category: "stock"  },
  { sym: "QQQ",   label: "나스닥100",     category: "etf"    },
  { sym: "IVR",   label: "IVR",           category: "stock"  },
];

const ACTIONS = ["BUY", "HOLD", "SELL"];
const ACTION_COLOR = { BUY: "#4ADE80", HOLD: "#FCD34D", SELL: "#F87171" };
const RESULT_COLOR = { WIN: "#4ADE80", LOSE: "#F87171", UNKNOWN: "var(--dm-muted)" };
const RESULT_LABEL = { WIN: "✅ 맞음", LOSE: "❌ 틀림", UNKNOWN: "❓ 모름" };

function dedupeAssets(items) {
  const seen = new Map();
  items.forEach((item) => {
    if (!item?.sym) return;
    const sym = item.sym.toUpperCase();
    if (seen.has(sym)) return;
    seen.set(sym, { ...item, sym });
  });
  return Array.from(seen.values());
}

function parseNumericInput(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value, currency = "USD") {
  if (value === null || value === undefined) return "-";
  if (currency === "KRW") return `₩${Number(value).toLocaleString("ko-KR")}`;
  return `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatQuantity(value) {
  if (value === null || value === undefined) return "-";
  return Number(value).toLocaleString("ko-KR", { maximumFractionDigits: 8 });
}

function getCategoryFromSource(src = "") {
  if (src === "coingecko") return "crypto";
  if (src === "yahoo") return "stock";
  return "stock";
}

function buildQuoteSnapshot(quote, fallbackCurrency, fallbackLabel) {
  if (!quote || quote.price == null) return null;
  return {
    label: quote.label || fallbackLabel,
    price: Number(quote.price),
    changePercent: quote.changePercent ?? quote.chgPct ?? quote.change ?? null,
    currency: quote.currency || fallbackCurrency || "USD",
    capturedAt: quote.capturedAt || new Date().toISOString(),
  };
}

function pad2(n) { return String(n).padStart(2, "0"); }
function toDateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function needsReview(log) {
  if (log.review) return false;
  const created = new Date(log.createdAt);
  const diff = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 3;
}

export default function InvestDiary({ uid, telegramCfg, onBack, embedded = false, onOpenBriefing, diaryDraft = null }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);

  // 포트폴리오 시세
  const todayStr = toDateStr();
  const portfolioCacheKey = `dm_portfolio_${todayStr}`;
  const [portfolioData, setPortfolioData] = useState(() => { try { return JSON.parse(localStorage.getItem(portfolioCacheKey) || 'null'); } catch { return null; } });
  const [portfolioLoading, setPortfolioLoading] = useState(false);

  const holdings = telegramCfg?.holdings || [];
  const availableAssets = dedupeAssets([
    ...holdings.map((holding) => ({
      sym: holding.sym,
      label: holding.label || holding.sym,
      category: getCategoryFromSource(holding.src),
      src: holding.src || "finnhub",
      currency: holding.currency || "USD",
      ...(holding.coinId ? { coinId: holding.coinId } : {}),
    })),
    ...((telegramCfg?.customAssets || []).map((assetItem) => ({
      sym: assetItem.sym,
      label: assetItem.label || assetItem.sym,
      category: getCategoryFromSource(assetItem.src),
      src: assetItem.src || "finnhub",
      currency: assetItem.currency || "USD",
      ...(assetItem.coinId ? { coinId: assetItem.coinId } : {}),
    }))),
    ...PRESET_ASSETS.map((assetItem) => ({ ...assetItem, currency: assetItem.sym === "BTC" || assetItem.sym === "ETH" ? "USD" : "USD", src: assetItem.category === "crypto" ? "coingecko" : "finnhub" })),
  ]);
  const assetKey = availableAssets.map((assetItem) => assetItem.sym).join("|");

  const loadPortfolio = async () => {
    if (availableAssets.length === 0) return;
    setPortfolioLoading(true);
    try {
      const customRegistry = Object.fromEntries(availableAssets.map((assetItem) => [assetItem.sym, {
        label: assetItem.label,
        src: assetItem.src || "finnhub",
        ...(assetItem.coinId ? { coinId: assetItem.coinId } : {}),
      }]));
      const res = await fetch('/api/market', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assets: availableAssets.map((assetItem) => assetItem.sym), customRegistry }),
      });
      const data = await res.json();
      localStorage.setItem(portfolioCacheKey, JSON.stringify(data));
      setPortfolioData(data);
    } catch {}
    setPortfolioLoading(false);
  };

  useEffect(() => {
    if (assetKey) loadPortfolio();
    else setPortfolioData(null);
  }, [assetKey]); // eslint-disable-line

  // 입력 폼 상태
  const [asset, setAsset] = useState(() => availableAssets[0]?.sym || "BTC");
  const [action, setAction] = useState("BUY");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [reason, setReason] = useState("");
  const [marketNote, setMarketNote] = useState("");
  const [confidence, setConfidence] = useState(3);
  const [showExtra, setShowExtra] = useState(false);
  const [saving, setSaving] = useState(false);
  const [queuedSnapshot, setQueuedSnapshot] = useState(null);

  useEffect(() => {
    if (!uid) return;
    loadInvestLogs(uid)
      .then(setLogs)
      .catch(() => setToast("로드 실패"))
      .finally(() => setLoading(false));
  }, [uid]);

  useEffect(() => {
    if (!availableAssets.length) return;
    if (!availableAssets.some((assetItem) => assetItem.sym === asset)) {
      setAsset(availableAssets[0].sym);
    }
  }, [asset, assetKey]); // eslint-disable-line

  const selectedAssetInfo = availableAssets.find((assetItem) => assetItem.sym === asset) || { sym: asset, label: asset, category: "other", src: "finnhub", currency: "USD" };
  const currentHolding = holdings.find((holding) => holding.sym === asset) || null;
  const currentQuote = portfolioData?.[asset] || null;
  const defaultCurrency = currentHolding?.currency || selectedAssetInfo.currency || "USD";
  const isTradeAction = action !== "HOLD";
  const numericQuantity = parseNumericInput(quantity);
  const numericUnitPrice = parseNumericInput(unitPrice);
  const computedAmount = isTradeAction && numericQuantity && numericUnitPrice ? numericQuantity * numericUnitPrice : null;

  useEffect(() => {
    setCurrency(defaultCurrency);
  }, [asset]); // eslint-disable-line

  useEffect(() => {
    if (!diaryDraft?.requestedAt) return;
    if (diaryDraft.asset) setAsset(diaryDraft.asset.toUpperCase());
    if (diaryDraft.action) setAction(diaryDraft.action);
    if (diaryDraft.currency) setCurrency(diaryDraft.currency);
    if (diaryDraft.unitPrice != null) setUnitPrice(String(diaryDraft.unitPrice));
    else if (diaryDraft.quoteSnapshot?.price != null) setUnitPrice(String(diaryDraft.quoteSnapshot.price));
    if (diaryDraft.marketNote) {
      setShowExtra(true);
      setMarketNote((prev) => prev || diaryDraft.marketNote);
    }
    setQueuedSnapshot(diaryDraft.quoteSnapshot || null);
  }, [diaryDraft?.requestedAt]); // eslint-disable-line

  // 통계
  const now = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
  const thisWeekLogs = logs.filter(l => new Date(l.createdAt) >= weekStart);
  const reviewed = logs.filter(l => l.review?.result && l.review.result !== "UNKNOWN");
  const wins = reviewed.filter(l => l.review.result === "WIN").length;
  const winRate = reviewed.length > 0 ? Math.round((wins / reviewed.length) * 100) : null;
  const pendingReview = logs.filter(needsReview).length;
  const rootStyle = embedded
    ? { width: "100%", minWidth: 0, boxSizing: "border-box", paddingBottom: 12 }
    : S.content;

  const resetForm = () => {
    setQuantity("");
    setUnitPrice("");
    setReason("");
    setMarketNote("");
    setConfidence(3);
    setShowExtra(false);
    setQueuedSnapshot(null);
  };

  const handleSave = async () => {
    if (!uid) { setToast("로그인 후 기록할 수 있어요"); return; }
    if (!reason.trim()) { setToast("이유를 입력해주세요"); return; }
    if (isTradeAction && (!numericQuantity || numericQuantity <= 0)) { setToast("수량을 입력해주세요"); return; }
    if (isTradeAction && (!numericUnitPrice || numericUnitPrice <= 0)) { setToast("단가를 입력해주세요"); return; }
    setSaving(true);
    try {
      const assetInfo = selectedAssetInfo;
      const effectiveCurrency = currency || defaultCurrency || "USD";
      const effectiveSnapshot = buildQuoteSnapshot(currentQuote || queuedSnapshot, effectiveCurrency, assetInfo.label);
      const log = {
        date: toDateStr(),
        asset,
        assetLabel: assetInfo.label,
        category: assetInfo.category,
        action,
        currency: effectiveCurrency,
        quantity: isTradeAction ? numericQuantity : null,
        unitPrice: isTradeAction ? numericUnitPrice : null,
        amountKRW: isTradeAction && effectiveCurrency === "KRW" ? computedAmount : null,
        amountUSD: isTradeAction && effectiveCurrency !== "KRW" ? computedAmount : null,
        reason: reason.trim(),
        marketNote: marketNote.trim(),
        confidence,
        marketSnapshot: effectiveSnapshot,
        holdingSnapshot: currentHolding ? {
          qty: currentHolding.qty,
          avgPrice: currentHolding.avgPrice,
          currency: currentHolding.currency || effectiveCurrency,
        } : null,
        review: null,
      };
      const id = await saveInvestLog(uid, log);
      setLogs(prev => [{ ...log, id, createdAt: new Date().toISOString() }, ...prev]);
      resetForm();
      setToast("기록 완료 ✅");
    } catch { setToast("저장 실패"); }
    setSaving(false);
  };

  const handleDelete = (logId) => {
    setLogs(prev => prev.filter(l => l.id !== logId));
    setSelectedLog(null);
    setToast("삭제됨");
  };

  const handleReviewSaved = (logId, review) => {
    setLogs(prev => prev.map(l => l.id === logId ? { ...l, review } : l));
    setSelectedLog(prev => prev ? { ...prev, review } : null);
  };

  const handleLogUpdated = (logId, patch) => {
    setLogs((prev) => prev.map((logItem) => logItem.id === logId ? { ...logItem, ...patch } : logItem));
    setSelectedLog((prev) => prev?.id === logId ? { ...prev, ...patch } : prev);
    setToast("수정됨 ✅");
  };

  if (selectedLog) {
    return (
      <InvestDetail
        log={selectedLog}
        uid={uid}
        onBack={() => setSelectedLog(null)}
        onDelete={handleDelete}
        onLogUpdated={handleLogUpdated}
        onReviewSaved={handleReviewSaved}
      />
    );
  }

  return (
    <div style={rootStyle}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}

      {/* 상단바 */}
      {!embedded && (
        <div style={S.topbar}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
            <button onClick={onBack} style={{ background: "transparent", border: "none", color: "var(--dm-text)", fontSize: 22, cursor: "pointer", padding: 0 }}>←</button>
            <div>
              <div style={S.title}>💹 투자일기</div>
              <div style={S.sub}>판단을 기록하고 복기하세요</div>
            </div>
          </div>
        </div>
      )}

      {embedded && (
        <div style={{ ...S.card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)", marginBottom: 4 }}>기록 전에 브리핑을 다시 볼 수 있습니다</div>
            <div style={{ fontSize: 11, color: "var(--dm-muted)", lineHeight: 1.5 }}>시세와 평가손익을 함께 보면 왜 매수·보유·매도를 선택했는지 더 선명하게 남길 수 있습니다.</div>
          </div>
          {onOpenBriefing && (
            <button onClick={onOpenBriefing} style={{ ...S.btnGhost, width: "auto", marginTop: 0, padding: "10px 12px", flexShrink: 0 }}>
              브리핑 보기
            </button>
          )}
        </div>
      )}

      {/* 포트폴리오 시세 */}
      {availableAssets.length > 0 && (
        <div style={{ ...S.card, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)" }}>📈 관심 종목</div>
            <button onClick={() => { localStorage.removeItem(portfolioCacheKey); setPortfolioData(null); loadPortfolio(); }}
              style={{ fontSize: 11, color: "var(--dm-muted)", background: "transparent", border: "none", cursor: "pointer" }}>
              🔄 새로고침
            </button>
          </div>
          {portfolioLoading && <div style={{ textAlign: "center", fontSize: 12, color: "var(--dm-muted)", padding: "8px 0" }}>시세 불러오는 중...</div>}
          {!portfolioLoading && portfolioData && Object.entries(portfolioData).map(([sym, d], i, arr) => {
            const chg = d.changePercent ?? d.change ?? 0;
            const isUp = chg > 0;
            const isDown = chg < 0;
            const color = isUp ? "#4ADE80" : isDown ? "#F87171" : "var(--dm-muted)";
            const rowHolding = holdings.find((holding) => holding.sym === sym) || null;
            const rowAssetInfo = availableAssets.find((assetItem) => assetItem.sym === sym) || null;
            const rowCurrency = rowHolding?.currency || rowAssetInfo?.currency || "USD";
            return (
              <div key={sym} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                borderBottom: i < arr.length - 1 ? "1px solid var(--dm-row)" : "none" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)" }}>{d.label || sym}</div>
                  <div style={{ fontSize: 10, color: "var(--dm-muted)" }}>{sym}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)" }}>
                    ${Number(d.price || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color }}>
                    {isUp ? "▲" : isDown ? "▼" : "—"} {Math.abs(chg).toFixed(2)}%
                  </div>
                </div>
                <button
                  onClick={() => {
                    setAsset(sym);
                    setQueuedSnapshot(buildQuoteSnapshot({ ...d, currency: rowCurrency, capturedAt: new Date().toISOString() }, rowCurrency, d.label || sym));
                    setCurrency(rowCurrency);
                    setUnitPrice(d.price != null ? String(d.price) : "");
                  }}
                  style={{ background: "transparent", border: "1px solid var(--dm-border)", color: "#6C8EFF", borderRadius: 10, padding: "6px 8px", fontSize: 11, fontWeight: 800, cursor: "pointer" }}
                >
                  선택
                </button>
              </div>
            );
          })}
          {!portfolioLoading && !portfolioData && (
            <button onClick={loadPortfolio} style={{ ...S.btn, fontSize: 12, marginTop: 0 }}>시세 불러오기</button>
          )}
        </div>
      )}

      {/* 통계 헤더 */}
      <div style={{ ...S.card, marginBottom: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            { label: "이번주", value: `${thisWeekLogs.length}건`, color: "#6C8EFF" },
            { label: "승률", value: winRate !== null ? `${winRate}%` : "-", color: winRate >= 60 ? "#4ADE80" : winRate !== null ? "#F87171" : "var(--dm-muted)" },
            { label: "복기 대기", value: `${pendingReview}건`, color: pendingReview > 0 ? "#FCD34D" : "var(--dm-muted)" },
          ].map(item => (
            <div key={item.label} style={{ textAlign: "center", background: "var(--dm-input)", borderRadius: 10, padding: "10px 4px" }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: item.color }}>{item.value}</div>
              <div style={{ fontSize: 10, color: "var(--dm-muted)", marginTop: 2 }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 입력 폼 */}
      <div style={S.sectionTitle}><span style={S.sectionEmoji}>✍️</span>새 기록</div>
      <div style={S.card}>
        {/* 자산 + 액션 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <select
            value={asset}
            onChange={e => setAsset(e.target.value)}
            style={{ ...S.input, flex: 1, marginBottom: 0, cursor: "pointer" }}
          >
            {availableAssets.map(a => (
              <option key={a.sym} value={a.sym}>{a.sym} · {a.label}</option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            {ACTIONS.map(a => (
              <button key={a} onClick={() => setAction(a)} style={{
                padding: "0 12px", height: 44, borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 900, fontSize: 13,
                background: action === a ? ACTION_COLOR[a] : "var(--dm-input)",
                color: action === a ? "#0a0c1e" : "var(--dm-muted)",
                transition: "all 0.15s",
              }}>{a}</button>
            ))}
          </div>
        </div>

        <div style={{ ...S.card, margin: "0 0 10px", padding: "12px 12px", borderRadius: 14, background: "rgba(108,142,255,0.08)", border: "1px solid rgba(108,142,255,0.16)", boxShadow: "none" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--dm-text)", marginBottom: 8 }}>{selectedAssetInfo.label} 컨텍스트</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--dm-muted)", marginBottom: 3 }}>현재가</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--dm-text)" }}>{currentQuote?.price != null ? formatMoney(currentQuote.price, currentQuote.currency || defaultCurrency) : "-"}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--dm-muted)", marginBottom: 3 }}>보유 현황</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--dm-text)" }}>
                {currentHolding ? `${formatQuantity(currentHolding.qty)} · 평단 ${formatMoney(currentHolding.avgPrice, currentHolding.currency || defaultCurrency)}` : "미보유"}
              </div>
            </div>
          </div>
        </div>

        {isTradeAction && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: "var(--dm-muted)", marginBottom: 4, fontWeight: 700 }}>수량 *</div>
                <input
                  type="number"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  placeholder="예: 3.5"
                  style={{ ...S.input, marginBottom: 0 }}
                />
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--dm-muted)", marginBottom: 4, fontWeight: 700 }}>체결 단가 *</div>
                <input
                  type="number"
                  value={unitPrice}
                  onChange={e => setUnitPrice(e.target.value)}
                  placeholder="예: 182.50"
                  style={{ ...S.input, marginBottom: 0 }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: "var(--dm-muted)", marginBottom: 4, fontWeight: 700 }}>통화</div>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ ...S.input, marginBottom: 0, appearance: "none" }}>
                  <option value="USD">USD</option>
                  <option value="KRW">KRW</option>
                </select>
              </div>
              <div style={{ ...S.card, margin: 0, padding: "12px 12px", borderRadius: 14, boxShadow: "none", background: "var(--dm-input)" }}>
                <div style={{ fontSize: 10, color: "var(--dm-muted)", marginBottom: 4, fontWeight: 700 }}>예상 총액</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: "var(--dm-text)" }}>{computedAmount ? formatMoney(computedAmount, currency) : "수량과 단가를 입력하세요"}</div>
              </div>
            </div>
          </>
        )}

        {!isTradeAction && (
          <div style={{ ...S.card, margin: "0 0 10px", padding: "12px 12px", borderRadius: 14, boxShadow: "none", background: "var(--dm-input)" }}>
            <div style={{ fontSize: 12, color: "var(--dm-muted)", lineHeight: 1.6 }}>
              `HOLD`는 거래 체결 기록이 아니라 현재 판단을 남기는 메모형 기록입니다.
            </div>
          </div>
        )}

        {/* 이유 */}
        <input
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder={action === "BUY" ? "매수 이유 (필수) — 왜 지금 진입하나요?" : action === "SELL" ? "매도 이유 (필수) — 왜 지금 정리하나요?" : "보유 이유 (필수) — 왜 계속 들고 가나요?"}
          maxLength={100}
          style={{ ...S.input, marginBottom: 10 }}
        />

        {/* 확신도 */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 6, fontWeight: 700 }}>확신도</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => setConfidence(n)} style={{
                flex: 1, height: 36, borderRadius: 8, border: "none", cursor: "pointer",
                background: n <= confidence ? "#FCD34D" : "var(--dm-input)",
                fontSize: 16, transition: "all 0.15s",
              }}>⭐</button>
            ))}
          </div>
        </div>

        {/* 확장 입력 토글 */}
        <button onClick={() => setShowExtra(v => !v)} style={{ background: "transparent", border: "none", color: "var(--dm-muted)", fontSize: 12, cursor: "pointer", marginBottom: showExtra ? 10 : 0, padding: 0 }}>
          {showExtra ? "▲ 시장 메모 접기" : "▼ 시장 메모 추가 (선택)"}
        </button>
        {showExtra && (
          <textarea
            rows={3}
            value={marketNote}
            onChange={e => setMarketNote(e.target.value)}
            placeholder="시장 상황, 추가 판단 근거..."
            maxLength={300}
            style={{ ...S.input, resize: "none", marginBottom: 10 }}
          />
        )}

        <button onClick={handleSave} disabled={saving} style={{ ...S.btn, opacity: saving ? 0.6 : 1 }}>
          {saving ? "저장 중..." : "기록하기"}
        </button>
      </div>

      {/* 기록 리스트 */}
      <div style={S.sectionTitle}><span style={S.sectionEmoji}>📋</span>기록 ({logs.length}건)</div>
      {loading ? (
        <div style={{ textAlign: "center", color: "var(--dm-muted)", padding: 24 }}>불러오는 중...</div>
      ) : logs.length === 0 ? (
        <div style={{ ...S.card, textAlign: "center", color: "var(--dm-muted)", fontSize: 13 }}>
          첫 투자 기록을 남겨보세요 💹
        </div>
      ) : (
        logs.map(log => {
          const pending = needsReview(log);
          const logCurrency = log.currency || (log.amountKRW != null ? "KRW" : "USD");
          const tradeSummary = log.action !== "HOLD" && log.quantity != null && log.unitPrice != null
            ? `${formatQuantity(log.quantity)} · 단가 ${formatMoney(log.unitPrice, logCurrency)}`
            : null;
          const snapshotSummary = log.marketSnapshot?.price != null
            ? `기록 당시 ${formatMoney(log.marketSnapshot.price, log.marketSnapshot.currency || logCurrency)}`
            : null;
          return (
            <div key={log.id} onClick={() => setSelectedLog(log)} style={{
              ...S.card, marginBottom: 8, cursor: "pointer",
              border: pending ? "1.5px solid #FCD34D" : log.review?.result === "WIN" ? "1.5px solid rgba(74,222,128,0.3)" : log.review?.result === "LOSE" ? "1.5px solid rgba(248,113,113,0.3)" : "1.5px solid var(--dm-border)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 900, fontSize: 14, color: "var(--dm-text)" }}>{log.asset}</span>
                  <span style={{ fontSize: 12, fontWeight: 900, color: ACTION_COLOR[log.action], background: `${ACTION_COLOR[log.action]}22`, borderRadius: 6, padding: "2px 8px" }}>{log.action}</span>
                  {log.amountKRW && <span style={{ fontSize: 11, color: "var(--dm-muted)" }}>{formatMoney(log.amountKRW, "KRW")}</span>}
                  {log.amountUSD && <span style={{ fontSize: 11, color: "var(--dm-muted)" }}>{formatMoney(log.amountUSD, "USD")}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {pending && <span style={{ fontSize: 10, color: "#FCD34D", fontWeight: 900, background: "rgba(252,211,77,0.12)", borderRadius: 6, padding: "2px 6px" }}>복기 대기</span>}
                  {log.review?.result && <span style={{ fontSize: 11, fontWeight: 900, color: RESULT_COLOR[log.review.result] }}>{RESULT_LABEL[log.review.result]}</span>}
                  <span style={{ fontSize: 11, color: "var(--dm-muted)" }}>{formatDate(log.createdAt)}</span>
                </div>
              </div>
              <div style={{ fontSize: 13, color: "var(--dm-text)", marginBottom: 4 }}>{log.reason}</div>
              {(tradeSummary || snapshotSummary) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
                  {tradeSummary && <span style={{ fontSize: 11, color: "var(--dm-sub)" }}>{tradeSummary}</span>}
                  {snapshotSummary && <span style={{ fontSize: 11, color: "var(--dm-muted)" }}>{snapshotSummary}</span>}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "var(--dm-muted)" }}>확신</span>
                {"⭐".repeat(log.confidence)}
              </div>
            </div>
          );
        })
      )}
      <div style={{ height: embedded ? 12 : 20 }} />
    </div>
  );
}
