import { useRef, useState } from "react";
import S from "../styles.js";
import Toast from "../components/Toast.jsx";
import { DEFAULT_DIARY_QUESTIONS } from "../utils/diary.js";

export default function VoiceDiary({ user, questions, toast, setToast, onBack, onComplete }) {
  const qList = questions?.length ? questions : DEFAULT_DIARY_QUESTIONS;
  const totalQ = qList.length;

  const [step, setStep] = useState(0); // 0=인트로, 1..N=질문, N+1=로딩, N+2=결과
  const [answers, setAnswers] = useState(Array(totalQ).fill(""));
  const [current, setCurrent] = useState("");
  const [listening, setListening] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const recognitionRef = useRef(null);

  const qIdx = step - 1;

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const toggleListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setToast?.('이 브라우저는 음성 인식을 지원하지 않아요'); return; }
    if (listening) { stopListening(); return; }
    const r = new SR();
    r.lang = 'ko-KR';
    r.interimResults = false;
    r.continuous = true;
    recognitionRef.current = r;
    r.onresult = (e) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) text += e.results[i][0].transcript;
      }
      if (text) setCurrent(prev => (prev ? `${prev} ${text.trim()}` : text.trim()));
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    r.start();
    setListening(true);
  };

  const goNext = () => {
    if (step >= 1 && step <= totalQ) {
      stopListening();
      const updated = [...answers];
      updated[qIdx] = current.trim();
      setAnswers(updated);
      setCurrent("");
      if (step < totalQ) {
        setStep(step + 1);
      } else {
        compose(updated);
      }
    }
  };

  const compose = async (ans) => {
    setStep(totalQ + 1);
    setError("");
    try {
      const payload = qList.map((q, i) => ({ question: q, answer: ans[i] }));
      const res = await fetch("/api/chat?action=voice-diary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: payload, userName: user?.name || "사용자" }),
      });
      if (!res.ok) throw new Error("서버 오류");
      const data = await res.json();
      setResult(data.content || "");
      setStep(totalQ + 2);
    } catch (e) {
      setError(e.message || "오류가 발생했어요.");
      setCurrent(ans[totalQ - 1] || "");
      setStep(totalQ);
    }
  };

  const wrap = (children) => (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast?.('')} />}
      <div style={{ padding: "44px 22px 32px", position: "relative", zIndex: 1 }}>
        {children}
      </div>
    </div>
  );

  // 인트로
  if (step === 0) {
    return wrap(
      <>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🎙️</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>음성으로 일기 쓰기</div>
          <div style={{ fontSize: 13, color: "var(--dm-sub)", lineHeight: 1.8 }}>
            질문에 음성으로 답하면<br />
            Claude가 오늘의 일기로 정리해드려요.
          </div>
        </div>
        <div style={{ marginBottom: 24 }}>
          {qList.map((q, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--dm-row)" }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: "var(--dm-muted)", width: 22, textAlign: "center" }}>{i + 1}</span>
              <div style={{ flex: 1, fontSize: 13, color: "var(--dm-sub)" }}>{q}</div>
            </div>
          ))}
        </div>
        <button style={S.btn} onClick={() => setStep(1)}>시작하기 →</button>
        <button style={S.btnGhost} onClick={onBack}>나중에 하기</button>
      </>
    );
  }

  // 질문 단계
  if (step >= 1 && step <= totalQ) {
    const q = qList[qIdx];
    const canSubmit = current.trim().length > 0;
    return wrap(
      <>
        <div style={{ display: "flex", gap: 5, marginBottom: 28 }}>
          {qList.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i < step ? "#6C8EFF" : "var(--dm-border)",
              transition: "background .3s",
            }} />
          ))}
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#6C8EFF", marginBottom: 6 }}>
            질문 {step} / {totalQ}
          </div>
          <div style={{ fontSize: 17, fontWeight: 900, lineHeight: 1.5, color: "var(--dm-text)" }}>
            {q}
          </div>
        </div>

        <div style={{ position: "relative" }}>
          <textarea
            style={{ ...S.input, minHeight: 120, resize: "none", lineHeight: 1.7 }}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="마이크를 누르고 말하거나 직접 입력해주세요"
          />
          <button
            onClick={toggleListening}
            style={{
              position: "absolute", right: 10, bottom: 10,
              width: 42, height: 42, borderRadius: 10,
              border: `1.5px solid ${listening ? '#F87171' : 'var(--dm-border)'}`,
              background: listening ? 'rgba(248,113,113,.15)' : 'var(--dm-input)',
              fontSize: 18, cursor: 'pointer',
            }}
          >{listening ? '⏹' : '🎤'}</button>
        </div>
        {listening && <div style={{ fontSize: 11, color: "#F87171", fontWeight: 900, marginTop: 6 }}>● 듣는 중...</div>}
        {error && <div style={{ fontSize: 12, color: "#f87171", marginTop: 8 }}>{error}</div>}

        <button style={{ ...S.btn, marginTop: 16, opacity: canSubmit ? 1 : 0.5 }} onClick={goNext} disabled={!canSubmit}>
          {step < totalQ ? "다음 →" : "일기 만들기 ✨"}
        </button>
        {step > 1 && (
          <button style={S.btnGhost} onClick={() => {
            stopListening();
            setStep(step - 1);
            setCurrent(answers[qIdx - 1] || "");
          }}>← 이전</button>
        )}
      </>
    );
  }

  // 정리 중
  if (step === totalQ + 1) {
    return wrap(
      <div style={{ textAlign: "center", paddingTop: 60 }}>
        <div style={{ fontSize: 48, marginBottom: 20, animation: "spin 2s linear infinite" }}>🧠</div>
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>일기 정리 중...</div>
        <div style={{ fontSize: 13, color: "var(--dm-sub)", lineHeight: 1.8 }}>
          Claude가 답변을 모아 오늘의 일기로<br />
          엮고 있어요.
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // 결과
  if (step === totalQ + 2) {
    return wrap(
      <>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📖</div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>오늘의 일기</div>
          <div style={{ fontSize: 12, color: "var(--dm-sub)", marginTop: 6 }}>저장 전에 자유롭게 수정할 수 있어요</div>
        </div>
        <textarea
          rows={8}
          style={{ ...S.input, resize: "none", lineHeight: 1.8, marginBottom: 16 }}
          value={result}
          onChange={(e) => setResult(e.target.value)}
        />
        <button style={{ ...S.btn, background: "linear-gradient(135deg,#4B6FFF,#6C8EFF)" }} onClick={() => onComplete?.(result.trim())} disabled={!result.trim()}>
          일기에 저장 →
        </button>
        <button style={S.btnGhost} onClick={() => {
          setAnswers(Array(totalQ).fill(""));
          setCurrent("");
          setResult("");
          setStep(0);
        }}>다시 답하기</button>
        <button style={S.btnGhost} onClick={onBack}>나중에 하기</button>
      </>
    );
  }

  return null;
}
