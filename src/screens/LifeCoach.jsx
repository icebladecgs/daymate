import { useEffect, useState } from "react";
import { store } from "../utils/storage.js";
import S from "../styles.js";
import { chatFetch } from "../api/chatFetch.js";

const QUESTIONS = [
  {
    icon: "😤",
    label: "현재 불만",
    text: "지금 삶에서 가장 불만이거나 바꾸고 싶은 게 뭐예요?",
    placeholder: "예: 운동을 못하고 있어요, 돈을 못 모으고 있어요...",
  },
  {
    icon: "🌟",
    label: "미래 비전",
    text: "1년 후 어떤 모습이고 싶어요?",
    placeholder: "예: 건강한 몸, 사업 시작, 해외여행...",
  },
  {
    icon: "🚀",
    label: "지연된 꿈",
    text: "꼭 해보고 싶은데 계속 미루고 있는 게 있어요?",
    placeholder: "예: 책 쓰기, 악기 배우기, 창업...",
  },
  {
    icon: "💎",
    label: "가치관",
    text: "인생에서 가장 중요하게 생각하는 게 뭐예요?",
    placeholder: "예: 가족, 건강, 성장, 자유, 돈, 인간관계...",
  },
  {
    icon: "⏰",
    label: "현실",
    text: "요즘 하루를 어떻게 보내고 있어요? 만족스럽지 않은 부분이 있다면?",
    placeholder: "예: 유튜브를 너무 많이 봐요, 일이 너무 많아요...",
  },
];

// 쓰던 답은 이 기기에 임시 저장 — 나갔다 들어와도 이어서 쓰고, 플랜이 만들어지면 지운다
const DRAFT_KEY = "dm_life_coach_draft";

export default function LifeCoach({ user, onBack, onApplyPlan }) {
  const draft = store.get(DRAFT_KEY, null);
  const [step, setStep] = useState(() => (draft && draft.step >= 0 && draft.step <= QUESTIONS.length ? draft.step : 0)); // 0=intro, 1-5=질문, 6=loading, 7=result
  const [answers, setAnswers] = useState(() => QUESTIONS.map((_, i) => (Array.isArray(draft?.answers) ? draft.answers[i] || "" : "")));
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const qIdx = step - 1; // 현재 질문 인덱스 (0~4)
  const totalQ = QUESTIONS.length;
  const answeredCount = answers.filter(a => a.trim()).length;

  useEffect(() => {
    if (step <= totalQ) store.set(DRAFT_KEY, { step, answers });
  }, [step, answers, totalQ]);

  const setAnswer = (text) => setAnswers(prev => prev.map((a, i) => (i === qIdx ? text : a)));

  // 비어 있어도 넘어갈 수 있다(건너뛰기). 마지막 질문에서는 답이 하나라도 있어야 플랜을 만든다
  const goNext = () => {
    if (step < 1 || step > totalQ) return;
    if (step < totalQ) setStep(step + 1);
    else if (answeredCount > 0) analyze(answers);
  };
  const goPrev = () => setStep(Math.max(0, step - 1)); // 1번 질문에서 이전 → 소개 화면

  const analyze = async (ans) => {
    setStep(6);
    setError("");
    try {
      const payload = QUESTIONS.map((q, i) => ({ question: q.text, answer: ans[i].trim() || "(답하지 않음)" }));
      const res = await chatFetch("/api/chat?action=life-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: payload, userName: user?.name || "사용자" }),
      });
      if (!res.ok) throw new Error("서버 오류");
      const data = await res.json();
      setResult(data);
      setStep(7);
      store.remove(DRAFT_KEY);
    } catch (e) {
      setError(e.message || "오류가 발생했어요.");
      setStep(totalQ); // 마지막 질문으로 돌아가기 (답은 그대로)
    }
  };

  const handleApply = () => {
    if (!result) return;
    onApplyPlan?.(result);
  };

  // 공통 래퍼 — 질문 도중에도 언제든 나갈 수 있게 위에 "나가기" (쓰던 답은 임시 저장돼 있음)
  const wrap = (children) => (
    <div style={S.content}>
      <div style={{ padding: "12px 22px 32px", position: "relative", zIndex: 1 }}>
        <button onClick={onBack}
          style={{ background: "none", border: "none", padding: "6px 0", marginBottom: 14, fontSize: 14, fontWeight: 700, color: "var(--dm-muted)", cursor: "pointer", fontFamily: "inherit" }}>
          ← 나가기
        </button>
        {children}
      </div>
    </div>
  );

  // 인트로
  if (step === 0) {
    return wrap(
      <>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🧭</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>인생 플랜 만들기</div>
          <div style={{ fontSize: 13, color: "var(--dm-sub)", lineHeight: 1.8 }}>
            {user?.name || ""}님의 꿈과 가치관을 바탕으로<br />
            Claude가 맞춤 액션플랜을 만들어드려요.
          </div>
        </div>
        <div style={{ marginBottom: 24 }}>
          {QUESTIONS.map((q, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--dm-row)" }}>
              <span style={{ fontSize: 20, width: 28, textAlign: "center" }}>{q.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--dm-muted)" }}>질문 {i + 1}</div>
                <div style={{ fontSize: 13, color: "var(--dm-sub)", marginTop: 2 }}>{q.label}</div>
              </div>
              {answers[i].trim() && <span style={{ fontSize: 12, color: "#4ADE80", fontWeight: 800 }}>✓</span>}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "var(--dm-muted)", textAlign: "center", marginBottom: 16 }}>
          솔직하게 답할수록 정확한 플랜이 나와요 · 모르는 질문은 건너뛰어도 돼요
        </div>
        <button style={S.btn} onClick={() => setStep(1)}>{answeredCount > 0 ? "이어서 하기 →" : "시작하기 →"}</button>
      </>
    );
  }

  // 질문 단계
  if (step >= 1 && step <= totalQ) {
    const q = QUESTIONS[qIdx];
    const current = answers[qIdx];
    const isLast = step === totalQ;
    const empty = !current.trim();
    const blocked = isLast && answeredCount === 0; // 답이 하나도 없으면 플랜을 만들 수 없음
    return wrap(
      <>
        {/* 진행 바 — 누르면 그 질문으로 이동 */}
        <div style={{ display: "flex", gap: 5, marginBottom: 24 }}>
          {QUESTIONS.map((_, i) => (
            <button key={i} onClick={() => setStep(i + 1)} aria-label={`질문 ${i + 1}로 이동`}
              style={{ flex: 1, height: 20, padding: 0, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center" }}>
              <span style={{
                display: "block", width: "100%", height: i === qIdx ? 6 : 4, borderRadius: 3,
                background: i === qIdx ? "#6C8EFF" : answers[i].trim() ? "rgba(108,142,255,.55)" : "var(--dm-border)",
                transition: "background .3s",
              }} />
            </button>
          ))}
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{q.icon}</div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#6C8EFF", marginBottom: 6 }}>
            질문 {step} / {totalQ} — {q.label}
          </div>
          <div style={{ fontSize: 17, fontWeight: 900, lineHeight: 1.5, color: "var(--dm-text)" }}>
            {q.text}
          </div>
        </div>

        <textarea
          key={step}
          style={{
            ...S.input,
            minHeight: 120,
            resize: "none",
            lineHeight: 1.7,
          }}
          value={current}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder={q.placeholder}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) goNext();
          }}
        />
        {error && <div style={{ fontSize: 12, color: "#f87171", marginTop: 8 }}>{error}</div>}
        {blocked && <div style={{ fontSize: 12, color: "var(--dm-muted)", marginTop: 8 }}>한 가지 이상 답해야 플랜을 만들 수 있어요</div>}

        <button style={{ ...S.btn, marginTop: 16, opacity: blocked ? 0.5 : 1 }} onClick={goNext} disabled={blocked}>
          {isLast ? "플랜 만들기 ✨" : empty ? "건너뛰기 →" : "다음 →"}
        </button>
        <button style={S.btnGhost} onClick={goPrev}>← 이전</button>
      </>
    );
  }

  // 분석 중
  if (step === 6) {
    return wrap(
      <div style={{ textAlign: "center", paddingTop: 60 }}>
        <div style={{ fontSize: 48, marginBottom: 20, animation: "spin 2s linear infinite" }}>🧠</div>
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>분석 중...</div>
        <div style={{ fontSize: 13, color: "var(--dm-sub)", lineHeight: 1.8 }}>
          Claude가 {user?.name || ""}님의 답변을 분석하고<br />
          맞춤 액션플랜을 만들고 있어요.
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // 결과
  if (step === 7 && result) {
    return (
      <div style={S.content}>
        <div style={{ padding: "32px 22px 32px", position: "relative", zIndex: 1 }}>
          {/* 헤더 */}
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎯</div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{user?.name || ""}님의 액션플랜</div>
            {result.keywords?.length > 0 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                {result.keywords.map((kw, i) => (
                  <span key={i} style={{
                    padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 800,
                    background: "rgba(108,142,255,.15)", color: "#818cf8",
                    border: "1px solid rgba(108,142,255,.3)",
                  }}>#{kw}</span>
                ))}
              </div>
            )}
          </div>

          {/* 코치 메시지 */}
          {result.message && (
            <div style={{
              background: "linear-gradient(135deg, rgba(108,142,255,0.12), rgba(139,92,246,0.12))",
              border: "1px solid rgba(108,142,255,0.25)",
              borderRadius: 16, padding: "18px 18px", marginBottom: 14,
            }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: "#818cf8", marginBottom: 8, letterSpacing: 1 }}>💬 코치의 말</div>
              <div style={{ fontSize: 14, color: "var(--dm-text)", lineHeight: 1.8, fontWeight: 500 }}>
                {result.message}
              </div>
            </div>
          )}

          {/* 핵심 문제 */}
          {result.analysis && (
            <div style={{
              background: "rgba(251,113,133,0.08)", border: "1px solid rgba(251,113,133,0.2)",
              borderRadius: 14, padding: "12px 16px", marginBottom: 14,
              display: "flex", gap: 10, alignItems: "flex-start",
            }}>
              <span style={{ fontSize: 16, marginTop: 1 }}>⚡</span>
              <div style={{ fontSize: 13, color: "var(--dm-sub)", lineHeight: 1.7, flex: 1 }}>
                {result.analysis}
              </div>
            </div>
          )}

          {/* 이번 달 목표 */}
          {result.goals?.length > 0 && (
            <>
              <div style={{ ...S.sectionTitle, padding: "16px 0 8px" }}>
                <span style={S.sectionEmoji}>📌</span> 이번 달 집중할 목표
              </div>
              <div style={{ background: "var(--dm-card)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden", marginBottom: 12 }}>
                {result.goals.map((g, i) => (
                  <div key={i} style={{ padding: "12px 16px", borderBottom: i < result.goals.length - 1 ? "1px solid var(--dm-row)" : "none", display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 16, marginTop: 1 }}>🎯</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{g}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 매일 할 습관 */}
          {result.habits?.length > 0 && (
            <>
              <div style={{ ...S.sectionTitle, padding: "16px 0 8px" }}>
                <span style={S.sectionEmoji}>🔄</span> 매일 할 습관
              </div>
              <div style={{ background: "var(--dm-card)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden", marginBottom: 12 }}>
                {result.habits.map((h, i) => (
                  <div key={i} style={{ padding: "12px 16px", borderBottom: i < result.habits.length - 1 ? "1px solid var(--dm-row)" : "none", display: "flex", gap: 10 }}>
                    <span style={{ fontSize: 16 }}>✨</span>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{h}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 오늘 시작할 할일 */}
          {result.tasks?.length > 0 && (
            <>
              <div style={{ ...S.sectionTitle, padding: "16px 0 8px" }}>
                <span style={S.sectionEmoji}>✅</span> 오늘 바로 시작할 것
              </div>
              <div style={{ background: "var(--dm-card)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden", marginBottom: 20 }}>
                {result.tasks.map((t, i) => (
                  <div key={i} style={{ padding: "12px 16px", borderBottom: i < result.tasks.length - 1 ? "1px solid var(--dm-row)" : "none", display: "flex", gap: 10 }}>
                    <span style={{ fontSize: 16 }}>▶</span>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{t}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <button style={{ ...S.btn, background: "linear-gradient(135deg,#4B6FFF,#6C8EFF)" }} onClick={handleApply}>
            할일 & 습관 등록하기 →
          </button>
          <button style={S.btnGhost} onClick={onBack}>나중에 등록하기</button>
        </div>
      </div>
    );
  }

  return null;
}
