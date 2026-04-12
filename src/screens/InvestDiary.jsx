import { useEffect, useState } from "react";
import { saveInvestLog, loadInvestLogs, deleteInvestLog } from "../firebase.js";
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

export default function InvestDiary({ uid, telegramCfg, onBack, embedded = false, onOpenBriefing }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);

  // 포트폴리오 시세
  const todayStr = toDateStr();
  const portfolioCacheKey = `dm_portfolio_${todayStr}`;
  const [portfolioData, setPortfolioData] = useState(() => { try { return JSON.parse(localStorage.getItem(portfolioCacheKey) || 'null'); } catch { return null; } });
  const [portfolioLoading, setPortfolioLoading] = useState(false);

  const loadPortfolio = async () => {
    const selectedAssets = telegramCfg?.assets || [];
    const customAssets = telegramCfg?.customAssets || [];
    if (selectedAssets.length === 0) return;
    setPortfolioLoading(true);
    try {
      const customRegistry = Object.fromEntries(customAssets.map(a => [a.sym, a]));
      const res = await fetch('/api/market', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assets: selectedAssets, customRegistry }),
      });
      const data = await res.json();
      localStorage.setItem(portfolioCacheKey, JSON.stringify(data));
      setPortfolioData(data);
    } catch {}
    setPortfolioLoading(false);
  };

  useEffect(() => {
    if (!portfolioData && (telegramCfg?.assets?.length > 0)) loadPortfolio();
  }, []); // eslint-disable-line

  // 입력 폼 상태
  const [asset, setAsset] = useState("BTC");
  const [action, setAction] = useState("BUY");
  const [amountKRW, setAmountKRW] = useState("");
  const [amountUSD, setAmountUSD] = useState("");
  const [reason, setReason] = useState("");
  const [marketNote, setMarketNote] = useState("");
  const [confidence, setConfidence] = useState(3);
  const [showExtra, setShowExtra] = useState(false);
  const [saving, setSaving] = useState(false);

  // 자산 목록: 프리셋 + telegramCfg 커스텀 자산
  const assets = [
    ...PRESET_ASSETS,
    ...((telegramCfg?.customAssets || []).map(a => ({
      sym: a.sym, label: a.label,
      category: a.src === "coingecko" ? "crypto" : "stock",
    }))),
  ];

  useEffect(() => {
    if (!uid) return;
    loadInvestLogs(uid)
      .then(setLogs)
      .catch(() => setToast("로드 실패"))
      .finally(() => setLoading(false));
  }, [uid]);

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

  const handleSave = async () => {
    if (!reason.trim()) { setToast("이유를 입력해주세요"); return; }
    setSaving(true);
    try {
      const assetInfo = assets.find(a => a.sym === asset) || { sym: asset, label: asset, category: "other" };
      const log = {
        date: toDateStr(),
        asset,
        assetLabel: assetInfo.label,
        category: assetInfo.category,
        action,
        amountKRW: amountKRW ? Number(amountKRW.replace(/,/g, "")) : null,
        amountUSD: amountUSD ? Number(amountUSD) : null,
        reason: reason.trim(),
        marketNote: marketNote.trim(),
        confidence,
        review: null,
      };
      const id = await saveInvestLog(uid, log);
      setLogs(prev => [{ ...log, id, createdAt: new Date().toISOString() }, ...prev]);
      // 폼 초기화
      setReason(""); setMarketNote(""); setAmountKRW(""); setAmountUSD("");
      setConfidence(3); setShowExtra(false);
      setToast("기록 완료 ✅");
    } catch { setToast("저장 실패"); }
    setSaving(false);
  };

  const handleDelete = async (logId) => {
    await deleteInvestLog(uid, logId);
    setLogs(prev => prev.filter(l => l.id !== logId));
    setSelectedLog(null);
    setToast("삭제됨");
  };

  const handleReviewSaved = (logId, review) => {
    setLogs(prev => prev.map(l => l.id === logId ? { ...l, review } : l));
    setSelectedLog(prev => prev ? { ...prev, review } : null);
  };

  if (selectedLog) {
    return (
      <InvestDetail
        log={selectedLog}
        uid={uid}
        onBack={() => setSelectedLog(null)}
        onDelete={handleDelete}
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
      {(telegramCfg?.assets?.length > 0) && (
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
            {assets.map(a => (
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

        {/* 금액 (KRW + USD) */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "var(--dm-muted)", marginBottom: 4, fontWeight: 700 }}>₩ 원화 (선택)</div>
            <input
              type="number"
              value={amountKRW}
              onChange={e => setAmountKRW(e.target.value)}
              placeholder="0"
              style={{ ...S.input, marginBottom: 0 }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "var(--dm-muted)", marginBottom: 4, fontWeight: 700 }}>$ 달러 (선택)</div>
            <input
              type="number"
              value={amountUSD}
              onChange={e => setAmountUSD(e.target.value)}
              placeholder="0.00"
              style={{ ...S.input, marginBottom: 0 }}
            />
          </div>
        </div>

        {/* 이유 */}
        <input
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="한줄 이유 (필수) — 왜 이 판단을 했나요?"
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
          return (
            <div key={log.id} onClick={() => setSelectedLog(log)} style={{
              ...S.card, marginBottom: 8, cursor: "pointer",
              border: pending ? "1.5px solid #FCD34D" : log.review?.result === "WIN" ? "1.5px solid rgba(74,222,128,0.3)" : log.review?.result === "LOSE" ? "1.5px solid rgba(248,113,113,0.3)" : "1.5px solid var(--dm-border)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 900, fontSize: 14, color: "var(--dm-text)" }}>{log.asset}</span>
                  <span style={{ fontSize: 12, fontWeight: 900, color: ACTION_COLOR[log.action], background: `${ACTION_COLOR[log.action]}22`, borderRadius: 6, padding: "2px 8px" }}>{log.action}</span>
                  {log.amountKRW && <span style={{ fontSize: 11, color: "var(--dm-muted)" }}>₩{Number(log.amountKRW).toLocaleString()}</span>}
                  {log.amountUSD && <span style={{ fontSize: 11, color: "var(--dm-muted)" }}>${log.amountUSD}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {pending && <span style={{ fontSize: 10, color: "#FCD34D", fontWeight: 900, background: "rgba(252,211,77,0.12)", borderRadius: 6, padding: "2px 6px" }}>복기 대기</span>}
                  {log.review?.result && <span style={{ fontSize: 11, fontWeight: 900, color: RESULT_COLOR[log.review.result] }}>{RESULT_LABEL[log.review.result]}</span>}
                  <span style={{ fontSize: 11, color: "var(--dm-muted)" }}>{formatDate(log.createdAt)}</span>
                </div>
              </div>
              <div style={{ fontSize: 13, color: "var(--dm-text)", marginBottom: 4 }}>{log.reason}</div>
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
