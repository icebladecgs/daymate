import { useState } from "react";
import { updateInvestLog, deleteInvestLog } from "../firebase.js";
import S from "../styles.js";
import Toast from "../components/Toast.jsx";

const ACTION_COLOR = { BUY: "#4ADE80", HOLD: "#FCD34D", SELL: "#F87171" };
const RESULTS = [
  { key: "WIN",     label: "✅ 맞음",  color: "#4ADE80",  bg: "rgba(74,222,128,0.12)" },
  { key: "LOSE",    label: "❌ 틀림",  color: "#F87171",  bg: "rgba(248,113,113,0.12)" },
  { key: "UNKNOWN", label: "❓ 모름",  color: "#9CA3AF",  bg: "rgba(156,163,175,0.12)" },
];

export default function InvestDetail({ log, uid, onBack, onDelete, onReviewSaved }) {
  const [toast, setToast] = useState("");
  const [reviewNote, setReviewNote] = useState(log.review?.note || "");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [content, setContent] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleReview = async (result) => {
    setSaving(true);
    try {
      const review = { result, note: reviewNote.trim(), reviewedAt: new Date().toISOString() };
      await updateInvestLog(uid, log.id, { review });
      onReviewSaved(log.id, review);
      setToast("복기 저장 ✅");
    } catch { setToast("저장 실패"); }
    setSaving(false);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setContent("");
    try {
      const res = await fetch("/api/invest-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log }),
      });
      const data = await res.json();
      setContent(data.content || "생성 실패");
    } catch { setContent("오류가 발생했어요."); }
    setGenerating(false);
  };

  const handleDelete = async () => {
    await deleteInvestLog(uid, log.id);
    onDelete(log.id);
  };

  return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}

      {/* 상단바 */}
      <div style={S.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
          <button onClick={onBack} style={{ background: "transparent", border: "none", color: "var(--dm-text)", fontSize: 22, cursor: "pointer", padding: 0 }}>←</button>
          <div>
            <div style={S.title}>{log.asset} {log.action}</div>
            <div style={S.sub}>{log.date}</div>
          </div>
        </div>
        <button onClick={() => setShowDeleteConfirm(true)} style={{ background: "transparent", border: "none", color: "#F87171", fontSize: 20, cursor: "pointer" }}>🗑</button>
      </div>

      {showDeleteConfirm && (
        <div style={{ ...S.card, border: "1.5px solid #F87171", marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: "var(--dm-text)", marginBottom: 12 }}>이 기록을 삭제할까요?</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleDelete} style={{ ...S.btn, flex: 1, background: "linear-gradient(135deg,#F87171,#ef4444)" }}>삭제</button>
            <button onClick={() => setShowDeleteConfirm(false)} style={{ ...S.btnGhost, flex: 1 }}>취소</button>
          </div>
        </div>
      )}

      {/* 기록 상세 */}
      <div style={S.sectionTitle}><span style={S.sectionEmoji}>📊</span>투자 내용</div>
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 22, fontWeight: 900, color: "var(--dm-text)" }}>{log.asset}</span>
          <span style={{ fontSize: 14, fontWeight: 900, color: "var(--dm-sub)" }}>{log.assetLabel}</span>
          <span style={{ fontSize: 14, fontWeight: 900, color: ACTION_COLOR[log.action], background: `${ACTION_COLOR[log.action]}22`, borderRadius: 8, padding: "4px 12px" }}>{log.action}</span>
        </div>

        {(log.amountKRW || log.amountUSD) && (
          <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
            {log.amountKRW && (
              <div style={{ background: "var(--dm-input)", borderRadius: 10, padding: "10px 14px", flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: "var(--dm-text)" }}>₩{Number(log.amountKRW).toLocaleString()}</div>
                <div style={{ fontSize: 10, color: "var(--dm-muted)", marginTop: 2 }}>원화</div>
              </div>
            )}
            {log.amountUSD && (
              <div style={{ background: "var(--dm-input)", borderRadius: 10, padding: "10px 14px", flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: "var(--dm-text)" }}>${Number(log.amountUSD).toLocaleString()}</div>
                <div style={{ fontSize: 10, color: "var(--dm-muted)", marginTop: 2 }}>달러</div>
              </div>
            )}
          </div>
        )}

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700, marginBottom: 4 }}>판단 이유</div>
          <div style={{ fontSize: 14, color: "var(--dm-text)", lineHeight: 1.6 }}>{log.reason}</div>
        </div>

        {log.marketNote && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700, marginBottom: 4 }}>시장 메모</div>
            <div style={{ fontSize: 13, color: "var(--dm-sub)", lineHeight: 1.6 }}>{log.marketNote}</div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700 }}>확신도</span>
          <span>{"⭐".repeat(log.confidence)}{"☆".repeat(5 - log.confidence)}</span>
        </div>
      </div>

      {/* 복기 */}
      <div style={S.sectionTitle}><span style={S.sectionEmoji}>🔍</span>복기</div>
      <div style={S.card}>
        {log.review?.result ? (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "var(--dm-muted)", marginBottom: 8 }}>복기 완료 · {log.review.reviewedAt?.slice(0, 10)}</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: RESULTS.find(r => r.key === log.review.result)?.color }}>
              {RESULTS.find(r => r.key === log.review.result)?.label}
            </div>
            {log.review.note && <div style={{ fontSize: 13, color: "var(--dm-sub)", marginTop: 8 }}>{log.review.note}</div>}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "var(--dm-muted)", marginBottom: 14 }}>이 판단이 맞았나요?</div>
        )}

        <textarea
          rows={3}
          value={reviewNote}
          onChange={e => setReviewNote(e.target.value)}
          placeholder="복기 메모 (선택) — 왜 맞았는지/틀렸는지..."
          style={{ ...S.input, resize: "none", marginBottom: 12 }}
        />

        <div style={{ display: "flex", gap: 8 }}>
          {RESULTS.map(r => (
            <button key={r.key} onClick={() => handleReview(r.key)} disabled={saving}
              style={{
                flex: 1, padding: "10px 4px", borderRadius: 10, border: `1.5px solid ${log.review?.result === r.key ? r.color : "var(--dm-border)"}`,
                background: log.review?.result === r.key ? r.bg : "var(--dm-input)",
                color: r.color, fontWeight: 900, fontSize: 12, cursor: "pointer",
              }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* AI 콘텐츠 생성 */}
      <div style={S.sectionTitle}><span style={S.sectionEmoji}>✨</span>AI 콘텐츠 생성</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "var(--dm-muted)", marginBottom: 12 }}>
          이 투자 기록을 바탕으로 인사이트 글을 생성해요.
        </div>
        <button onClick={handleGenerate} disabled={generating}
          style={{ ...S.btn, background: generating ? "var(--dm-input)" : "linear-gradient(135deg,#A78BFA,#7c3aed)", color: generating ? "var(--dm-muted)" : "#fff" }}>
          {generating ? "⏳ 생성 중..." : "✨ 콘텐츠 만들기"}
        </button>
        {content && (
          <div style={{ marginTop: 14, padding: 14, background: "var(--dm-input)", borderRadius: 12, fontSize: 13, color: "var(--dm-text)", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
            {content}
          </div>
        )}
      </div>

      <div style={{ height: 20 }} />
    </div>
  );
}
