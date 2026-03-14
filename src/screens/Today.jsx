import { useState } from "react";
import { formatKoreanDate } from "../utils/date.js";
import S from "../styles.js";
import Toast from "../components/Toast.jsx";
import MemoViewer from "./MemoViewer.jsx";
import JournalViewer from "./JournalViewer.jsx";

export default function Today({ dateStr, data, setData, toast, setToast, plans }) {
  const doneCount = data.tasks.filter((t) => t.done && t.title.trim()).length;
  const filledCount = data.tasks.filter((t) => t.title.trim()).length;
  const isPerfect = filledCount >= 3 && doneCount === filledCount && !!data.journal?.body?.trim();
  const [showMemoViewer, setShowMemoViewer] = useState(false);
  const [showJournalViewer, setShowJournalViewer] = useState(false);

  if (showMemoViewer) return <MemoViewer plans={plans} onClose={() => setShowMemoViewer(false)} />;
  if (showJournalViewer) return <JournalViewer plans={plans} onClose={() => setShowJournalViewer(false)} />;

  return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}

      <div style={S.topbar}>
        <div>
          <div style={S.title}>오늘 일기</div>
          <div style={S.sub}>{formatKoreanDate(dateStr)} · {doneCount}/{filledCount || 3} 완료</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setShowMemoViewer(true)} style={{
            ...S.btnGhost, marginTop: 0, padding: '6px 10px', fontSize: 11, width: 'auto',
          }}>전체메모</button>
          <button onClick={() => setShowJournalViewer(true)} style={{
            ...S.btnGhost, marginTop: 0, padding: '6px 10px', fontSize: 11, width: 'auto',
          }}>전체일기</button>
        </div>
      </div>

      {isPerfect && (
        <div style={{
          ...S.card,
          background: "linear-gradient(135deg,rgba(74,222,128,.15),rgba(108,142,255,.10))",
          border: "1.5px solid rgba(74,222,128,.35)",
        }}>
          <div style={{ fontSize: 32, textAlign: "center", marginBottom: 8 }}>🎉</div>
          <div style={{ fontSize: 14, fontWeight: 900, textAlign: "center", color: "#4ADE80" }}>
            완벽한 하루!
          </div>
          <div style={{ fontSize: 12, textAlign: "center", color: "var(--dm-sub)", marginTop: 6 }}>
            3가지 완료 + 일기 작성. 연속 기록이 쌓이고 있어요 🔥
          </div>
        </div>
      )}

      <div style={{ ...S.sectionTitle, display: "flex", justifyContent: "space-between", alignItems: "center", paddingRight: 16 }}>
        <span>📝 오늘 메모</span>
        <span style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 400 }}>수시로 기록해요</span>
      </div>
      <div style={S.card}>
        <textarea
          rows={10}
          style={{ ...S.input, resize: "none", lineHeight: 1.6 }}
          value={data.memo ?? ""}
          onChange={(e) =>
            setData((prev) => ({ ...prev, memo: e.target.value }))
          }
          placeholder="업무 메모, 떠오른 생각, 할 일... 뭐든 적어요."
          maxLength={1200}
        />
        <button
          style={S.btn}
          onClick={() => {
            setData((prev) => ({ ...prev, memo: prev.memo ?? "" }));
            setToast("메모 저장 ✅");
          }}
        >
          메모 저장
        </button>
        <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 6, textAlign: "right" }}>
          {(data.memo ?? "").length} / 1200
        </div>
      </div>

      <div style={S.sectionTitle}>일기 (22:00 이후 추천)</div>
      <div style={S.card}>
        <textarea
          rows={10}
          style={{ ...S.input, resize: "none", lineHeight: 1.6 }}
          value={data.journal.body}
          onChange={(e) =>
            setData((prev) => ({
              ...prev,
              journal: { ...prev.journal, body: e.target.value },
            }))
          }
          placeholder="오늘 하루를 한 줄이라도 기록해봐요."
          maxLength={1200}
        />
        <button
          style={S.btn}
          onClick={() => {
            setData((prev) => ({
              ...prev,
              journal: { ...prev.journal, savedAt: new Date().toISOString() },
            }));
            setToast("일기 저장 ✅");
          }}
        >
          일기 저장
        </button>
        <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 8, textAlign: "right" }}>
          {data.journal.body.length} / 1200
        </div>
      </div>

      <div style={{ height: 12 }} />
    </div>
  );
}
