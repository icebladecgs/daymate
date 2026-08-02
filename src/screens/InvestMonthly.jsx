import { useMemo, useState } from "react";
import S from "../styles.js";

function fmt(val, currency = "USD") {
  if (val === null || val === undefined || isNaN(val)) return "-";
  const abs = Math.abs(val);
  const prefix = val >= 0 ? "+" : "-";
  if (currency === "KRW") return `${prefix}₩${Math.round(abs).toLocaleString("ko-KR")}`;
  return `${prefix}$${abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const pnlColor = (v) => (v === null || v === undefined || isNaN(v) ? "var(--dm-muted)" : v > 0 ? "#4ADE80" : v < 0 ? "#F87171" : "var(--dm-muted)");

export default function InvestMonthly({ logs = [] }) {
  const [selectedMonth, setSelectedMonth] = useState(null);

  const monthlyStats = useMemo(() => {
    const map = {};
    logs.forEach(log => {
      const ym = log.date?.slice(0, 7);
      if (!ym) return;
      if (!map[ym]) map[ym] = { ym, buyUSD: 0, sellUSD: 0, buyKRW: 0, sellKRW: 0, trades: 0, wins: 0, loses: 0, unknowns: 0 };
      const m = map[ym];
      m.trades++;
      const usd = Number(log.amountUSD) || 0;
      const krw = Number(log.amountKRW) || 0;
      if (log.action === "BUY") { m.buyUSD += usd; m.buyKRW += krw; }
      else if (log.action === "SELL") { m.sellUSD += usd; m.sellKRW += krw; }
      if (log.review?.result === "WIN") m.wins++;
      else if (log.review?.result === "LOSE") m.loses++;
      else if (log.review?.result === "UNKNOWN") m.unknowns++;
    });
    return Object.values(map).sort((a, b) => b.ym.localeCompare(a.ym));
  }, [logs]);

  const selectedLogs = useMemo(() => {
    if (!selectedMonth) return [];
    return logs.filter(l => l.date?.startsWith(selectedMonth)).sort((a, b) => b.date.localeCompare(a.date));
  }, [logs, selectedMonth]);

  if (logs.length === 0) {
    return (
      <div style={{ margin: "16px 16px 0", borderRadius: 16, background: "linear-gradient(135deg,rgba(75,111,255,.08),rgba(108,142,255,.04))", border: "1.5px dashed rgba(108,142,255,.3)", padding: "24px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>📈</div>
        <div style={{ fontSize: 15, fontWeight: 900, color: "var(--dm-text)", marginBottom: 6 }}>투자 기록이 없어요</div>
        <div style={{ fontSize: 12, color: "var(--dm-muted)" }}>투자 기록 탭에서 매매를 기록하면 여기에 손익이 집계됩니다</div>
      </div>
    );
  }

  const ACTION_COLOR = { BUY: "#4ADE80", HOLD: "#FCD34D", SELL: "#F87171" };
  const ACTION_LABEL = { BUY: "매수", HOLD: "보유", SELL: "매도" };
  const RESULT_LABEL = { WIN: "✅", LOSE: "❌", UNKNOWN: "❓" };

  return (
    <div style={{ paddingBottom: 32 }}>
      <div style={{ margin: "0 16px 8px", fontSize: 12, color: "var(--dm-muted)" }}>
        매도-매수 금액 기준 실현손익 · 탭하면 해당 월 상세
      </div>

      {monthlyStats.map(m => {
        const pnlUSD = m.sellUSD - m.buyUSD;
        const pnlKRW = m.sellKRW - m.buyKRW;
        const hasPnl = m.sellUSD > 0 || m.sellKRW > 0 || m.buyUSD > 0 || m.buyKRW > 0;
        const reviewedCount = m.wins + m.loses;
        const winRate = reviewedCount > 0 ? Math.round((m.wins / reviewedCount) * 100) : null;
        const isOpen = selectedMonth === m.ym;

        return (
          <div key={m.ym} style={{ margin: "0 16px 8px", borderRadius: 14, background: "var(--dm-card)", border: `1.5px solid ${isOpen ? "rgba(108,142,255,.4)" : "var(--dm-border)"}` }}>
            <div onClick={() => setSelectedMonth(isOpen ? null : m.ym)} style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: "var(--dm-text)", marginBottom: 2 }}>{m.ym.replace("-", "년 ")}월</div>
                <div style={{ fontSize: 11, color: "var(--dm-muted)" }}>
                  거래 {m.trades}건{reviewedCount > 0 ? ` · 승률 ${winRate}%` : ""}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                {hasPnl && (m.sellUSD > 0 || m.buyUSD > 0) && (
                  <div style={{ fontSize: 15, fontWeight: 900, color: pnlColor(pnlUSD) }}>
                    {fmt(pnlUSD, "USD")}
                  </div>
                )}
                {hasPnl && (m.sellKRW > 0 || m.buyKRW > 0) && (
                  <div style={{ fontSize: 13, fontWeight: 900, color: pnlColor(pnlKRW) }}>
                    {fmt(pnlKRW, "KRW")}
                  </div>
                )}
                {!hasPnl && <div style={{ fontSize: 12, color: "var(--dm-muted)" }}>보유/검토만</div>}
              </div>
              <div style={{ fontSize: 12, color: "var(--dm-muted)" }}>{isOpen ? "▲" : "▼"}</div>
            </div>

            {/* 상세 매매 목록 */}
            {isOpen && (
              <div style={{ borderTop: "1px solid var(--dm-border)", padding: "8px 0" }}>
                {/* 월간 집계 요약 */}
                <div style={{ display: "flex", gap: 8, padding: "8px 16px 12px", flexWrap: "wrap" }}>
                  {[
                    { label: "매수", val: m.buyUSD > 0 ? fmt(m.buyUSD, "USD") : fmt(m.buyKRW, "KRW"), color: "#F87171" },
                    { label: "매도", val: m.sellUSD > 0 ? fmt(m.sellUSD, "USD") : fmt(m.sellKRW, "KRW"), color: "#4ADE80" },
                    winRate !== null ? { label: "승률", val: `${winRate}%`, color: winRate >= 60 ? "#4ADE80" : winRate >= 40 ? "#FCD34D" : "#F87171" } : null,
                  ].filter(Boolean).map(item => (
                    <div key={item.label} style={{ background: "var(--dm-input)", borderRadius: 8, padding: "6px 10px", textAlign: "center", minWidth: 70 }}>
                      <div style={{ fontSize: 13, fontWeight: 900, color: item.color }}>{item.val}</div>
                      <div style={{ fontSize: 10, color: "var(--dm-muted)", marginTop: 2 }}>{item.label}</div>
                    </div>
                  ))}
                </div>

                {selectedLogs.map(log => {
                  const amount = log.amountUSD ? `$${Number(log.amountUSD).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : log.amountKRW ? `₩${Number(log.amountKRW).toLocaleString("ko-KR")}` : null;
                  return (
                    <div key={log.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderTop: "1px solid var(--dm-row)" }}>
                      <div style={{ fontSize: 11, fontWeight: 900, color: ACTION_COLOR[log.action] || "var(--dm-muted)", background: `${ACTION_COLOR[log.action]}18`, borderRadius: 6, padding: "2px 7px", flexShrink: 0 }}>
                        {ACTION_LABEL[log.action] || log.action}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {log.assetLabel || log.asset}
                          {log.review?.result && <span style={{ marginLeft: 6, fontSize: 12 }}>{RESULT_LABEL[log.review.result]}</span>}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--dm-muted)" }}>{log.date}</div>
                      </div>
                      {amount && <div style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-sub)", flexShrink: 0 }}>{amount}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
