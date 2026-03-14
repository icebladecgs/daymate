import { useRef, useState } from "react";
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
  const [recording, setRecording] = useState(null); // 'memo' | 'journal' | null
  const recognitionRef = useRef(null);

  const startRecording = (field) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setToast('이 브라우저는 음성 인식을 지원하지 않아요'); return; }
    if (recording) { recognitionRef.current?.stop(); setRecording(null); return; }
    const r = new SR();
    r.lang = 'ko-KR';
    r.interimResults = false;
    r.continuous = true;
    recognitionRef.current = r;
    r.onresult = (e) => {
      const text = Array.from(e.results).filter(x => x.isFinal).map(x => x[0].transcript).join('');
      if (!text) return;
      if (field === 'memo') {
        setData(prev => ({ ...prev, memo: (prev.memo ?? '') + (prev.memo?.trim() ? '\n' : '') + text }));
      } else {
        setData(prev => ({ ...prev, journal: { ...prev.journal, body: (prev.journal?.body || '') + (prev.journal?.body?.trim() ? '\n' : '') + text } }));
      }
    };
    r.onerror = () => setRecording(null);
    r.onend = () => setRecording(null);
    r.start();
    setRecording(field);
  };

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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {recording === 'memo' && <span style={{ fontSize: 11, color: "#F87171", fontWeight: 900, animation: "pulse 1s infinite" }}>● 녹음 중</span>}
          <span style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 400 }}>수시로 기록해요</span>
        </div>
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
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button
            style={{ ...S.btn, marginTop: 0, flex: 1 }}
            onClick={() => {
              setData((prev) => ({ ...prev, memo: prev.memo ?? "" }));
              setToast("메모 저장 ✅");
            }}
          >
            메모 저장
          </button>
          <button
            onClick={() => startRecording('memo')}
            style={{ width: 48, borderRadius: 12, border: `1.5px solid ${recording === 'memo' ? '#F87171' : 'var(--dm-border)'}`, background: recording === 'memo' ? 'rgba(248,113,113,.15)' : 'var(--dm-input)', fontSize: 20, cursor: 'pointer', flexShrink: 0 }}
          >{recording === 'memo' ? '⏹' : '🎤'}</button>
        </div>
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
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button
            style={{ ...S.btn, marginTop: 0, flex: 1 }}
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
          <button
            onClick={() => startRecording('journal')}
            style={{ width: 48, borderRadius: 12, border: `1.5px solid ${recording === 'journal' ? '#F87171' : 'var(--dm-border)'}`, background: recording === 'journal' ? 'rgba(248,113,113,.15)' : 'var(--dm-input)', fontSize: 20, cursor: 'pointer', flexShrink: 0 }}
          >{recording === 'journal' ? '⏹' : '🎤'}</button>
        </div>
        <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 8, textAlign: "right" }}>
          {data.journal.body.length} / 1200
        </div>
      </div>

      <div style={{ height: 12 }} />
    </div>
  );
}
