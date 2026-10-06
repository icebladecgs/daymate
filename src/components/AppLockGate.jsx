import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isAppLockOn, getAppLock, checkPin, lockWaitMs, failsLeft, clearAppLock, hasBio, verifyBio, getLockId, getUnlockRequestAt, markUnlockRequested, clearUnlockRequest, RESET_VALID_MS } from "../utils/appLock.js";

// 앱 잠금 화면 — 앱을 켤 때, 그리고 앱을 벗어났다가 정한 시간(기본 5분) 넘게 지나 돌아올 때 비밀번호 4자리를 묻는다.
// 앱(App)은 뒤에서 그대로 떠서 동기화를 계속하고, 이 화면이 맨 위에서 가린다. 포스트잇 창(?view=sticky)은 이 잠금 밖이다.
export default function AppLockGate() {
  const [locked, setLocked] = useState(() => isAppLockOn());
  const hiddenAt = useRef(0);

  // 떠난 때: 휴대폰·브라우저는 visibilitychange, 데스크탑 앱은 창을 트레이로 숨기거나 최소화할 때
  // 앱이 보내는 dm:app-hidden / dm:app-shown (숨긴 창도 visibilityState가 visible로 남아서)
  useEffect(() => {
    const leave = () => { if (!hiddenAt.current) hiddenAt.current = Date.now(); };
    const back = () => {
      const cfg = getAppLock();
      if (cfg?.hash && hiddenAt.current && Date.now() - hiddenAt.current >= (cfg.idleMin ?? 5) * 60000) setLocked(true);
      hiddenAt.current = 0;
    };
    const onVis = () => (document.visibilityState === "hidden" ? leave() : back());
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("dm:app-hidden", leave);
    window.addEventListener("dm:app-shown", back);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("dm:app-hidden", leave);
      window.removeEventListener("dm:app-shown", back);
    };
  }, []);

  if (!locked) return null;
  return createPortal(<LockScreen onUnlock={() => setLocked(false)} />, document.body);
}

// 비밀번호를 잊으면: 지문·얼굴(등록했으면) 또는 관리자에게 해제 요청(제안 게시판으로 들어감).
// 관리자가 풀면 appLockResets/{이 기기 잠금 id}에 표시가 생기고, 이 화면이 확인해서 잠금을 끈다.
function LockScreen({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const [wait, setWait] = useState(() => lockWaitMs());
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [requestedAt, setRequestedAt] = useState(() => getUnlockRequestAt());
  const bio = hasBio();
  const pinRef = useRef(pin);
  pinRef.current = pin;
  // 비밀번호·지문으로 직접 풀었으면 보내 둔 해제 요청은 더 기다리지 않는다
  const unlockSelf = () => { clearUnlockRequest(); onUnlock(); };

  // 입력 막힘 남은 시간 표시
  useEffect(() => {
    if (wait <= 0) return;
    const t = setInterval(() => setWait(lockWaitMs()), 500);
    return () => clearInterval(t);
  }, [wait > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const tryBio = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await verifyBio();
    setBusy(false);
    if (ok) unlockSelf();
    else setMsg("지문·얼굴 확인이 안 됐어요. 다시 누르거나 비밀번호를 넣어 주세요");
  };

  // 지문을 등록했으면 잠금 화면이 뜰 때 바로 지문 창을 띄운다(브라우저가 막으면 버튼으로)
  useEffect(() => {
    if (!bio) return;
    verifyBio().then(ok => { if (ok) unlockSelf(); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 관리자에게 해제를 요청했으면, 풀어 줬는지 확인(잠금 화면을 연 동안 30초마다)
  const checkAdminUnlock = async (manual) => {
    const lockId = getLockId();
    if (!lockId) return;
    try {
      const { auth, consumeAppUnlock } = await import("../firebase.js");
      await auth.authStateReady();
      if (!auth.currentUser || auth.currentUser.uid !== getAppLock()?.uid) {
        if (manual) setMsg("이 기기에 잠금을 켠 계정의 로그인 정보가 없어요");
        return;
      }
      if (await consumeAppUnlock(lockId, RESET_VALID_MS)) {
        clearAppLock();
        window.alert("관리자가 앱 잠금을 풀었어요.\n설정 → 앱 관리 → 앱 잠금에서 새 비밀번호로 다시 켜 주세요.");
        onUnlock();
      } else if (manual) setMsg("아직 풀리지 않았어요. 관리자가 확인하면 풀려요");
    } catch {
      if (manual) setMsg("확인하지 못했어요. 인터넷 연결을 확인해 주세요");
    }
  };
  useEffect(() => {
    if (!requestedAt) return;
    checkAdminUnlock(false);
    const t = setInterval(() => checkAdminUnlock(false), 30000);
    return () => clearInterval(t);
  }, [requestedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendRequest = async () => {
    const lockId = getLockId();
    if (!lockId || sending) return;
    setSending(true);
    try {
      const [{ auth, requestAppUnlock }, { platformOf }] = await Promise.all([import("../firebase.js"), import("../utils/errorReport.js")]);
      await auth.authStateReady();
      const user = auth.currentUser;
      if (!user || user.uid !== getAppLock()?.uid) {
        setMsg("이 기기에 잠금을 켠 계정의 로그인 정보가 없어서 요청할 수 없어요");
        setSending(false);
        return;
      }
      const [local, domain] = (user.email || "@").split("@");
      const masked = `${local.slice(0, 2)}${"*".repeat(Math.max(2, local.length - 2))}@${domain}`;
      await requestAppUnlock(user.uid, masked, lockId, platformOf(), note.trim().slice(0, 300));
      markUnlockRequested();
      setRequestedAt(getUnlockRequestAt());
      setNote("");
    } catch {
      setMsg("요청을 보내지 못했어요. 인터넷 연결을 확인해 주세요");
    }
    setSending(false);
  };

  const submit = async (p) => {
    setBusy(true);
    const ok = await checkPin(p);
    setBusy(false);
    if (ok) { unlockSelf(); return; }
    setPin("");
    const w = lockWaitMs();
    setWait(w);
    setMsg(w > 0 ? "5번 틀려서 잠시 입력할 수 없어요" : `비밀번호가 달라요 (남은 횟수 ${failsLeft()}번)`);
  };

  const press = (d) => {
    if (busy || lockWaitMs() > 0) return;
    const next = (pinRef.current + d).slice(0, 4);
    setPin(next);
    setMsg("");
    if (next.length === 4) submit(next);
  };
  const back = () => { if (!busy) setPin(p => p.slice(0, -1)); };

  // PC 키보드 숫자 입력. 잠금 중에는 뒤쪽 앱으로 키가 가지 않게 막는다(요청 메모 입력칸은 그대로 입력)
  const pressRef = useRef(press);
  pressRef.current = press;
  useEffect(() => {
    const onKey = (e) => {
      e.stopPropagation();
      if (/^(TEXTAREA|INPUT)$/.test(e.target?.tagName || "")) return;
      if (/^\d$/.test(e.key)) { e.preventDefault(); pressRef.current(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); back(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const keyBtn = { width: 76, height: 76, padding: 0, borderRadius: "50%", border: "1px solid var(--dm-border)", background: "var(--dm-card)", color: "var(--dm-text)", fontSize: 28, fontWeight: 700, cursor: "pointer" };
  const linkBtn = { padding: "8px 12px", border: "none", background: "transparent", color: "var(--dm-muted)", fontSize: 15, textDecoration: "underline", cursor: "pointer" };
  const waiting = wait > 0;

  return (
    <div role="dialog" aria-label="앱 잠금" style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: "var(--dm-bg)", color: "var(--dm-text)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "safe center", gap: 20, userSelect: "none", fontFamily: "inherit", overflowY: "auto", padding: "24px 16px", boxSizing: "border-box" }}>
      <div style={{ fontSize: 40 }}>🔒</div>
      <div style={{ fontSize: 20, fontWeight: 900 }}>비밀번호 4자리</div>
      <div style={{ display: "flex", gap: 18 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid #6C8EFF", background: i < pin.length ? "#6C8EFF" : "transparent" }} />
        ))}
      </div>
      <div style={{ minHeight: 22, fontSize: 15, color: "#F87171", fontWeight: 700, textAlign: "center", maxWidth: 320 }}>
        {waiting ? `${Math.ceil(wait / 1000)}초 뒤에 다시 입력할 수 있어요` : msg}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 76px)", gap: 16, opacity: waiting ? 0.4 : 1 }}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(d => (
          <button key={d} onClick={() => press(d)} style={keyBtn}>{d}</button>
        ))}
        {bio
          ? <button onClick={tryBio} aria-label="지문·얼굴로 풀기" style={{ ...keyBtn, border: "none", background: "transparent", fontSize: 30 }}>👆</button>
          : <div />}
        <button onClick={() => press("0")} style={keyBtn}>0</button>
        <button onClick={back} aria-label="지우기" style={{ ...keyBtn, border: "none", background: "transparent", fontSize: 24 }}>⌫</button>
      </div>
      {bio && (
        <button onClick={tryBio} style={{ padding: "10px 22px", borderRadius: 999, border: "1px solid #6C8EFF", background: "rgba(108,142,255,.12)", color: "#6C8EFF", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
          👆 지문·얼굴로 풀기
        </button>
      )}

      {!forgotOpen ? (
        <button onClick={() => { setForgotOpen(true); setMsg(""); }} style={linkBtn}>비밀번호를 잊었어요</button>
      ) : (
        <div style={{ width: "100%", maxWidth: 340, boxSizing: "border-box", background: "var(--dm-card)", border: "1px solid var(--dm-border)", borderRadius: 14, padding: 14, fontSize: 14, lineHeight: 1.6, userSelect: "text" }}>
          {bio && <div style={{ marginBottom: 10 }}>👆 <b>지문·얼굴로 풀 수 있어요.</b> 푼 뒤 설정 → 앱 관리 → 앱 잠금에서 새 비밀번호를 정해 주세요.</div>}
          {requestedAt ? (
            <>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>📨 관리자에게 해제 요청을 보냈어요</div>
              <div style={{ color: "var(--dm-sub)", fontSize: 13, marginBottom: 10 }}>본인인지 확인하는 연락이 갈 수 있어요. 관리자가 풀면 이 화면이 저절로 풀려요.</div>
              <button onClick={() => checkAdminUnlock(true)} style={{ width: "100%", padding: "10px 0", borderRadius: 10, border: "1px solid var(--dm-border)", background: "transparent", color: "var(--dm-text)", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>풀렸는지 확인</button>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>관리자에게 잠금 해제 요청</div>
              <div style={{ color: "var(--dm-sub)", fontSize: 13, marginBottom: 8 }}>관리자가 본인인지 확인한 뒤 이 기기의 잠금을 풀어 드려요.</div>
              <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={300} rows={2}
                placeholder="연락받을 방법 (선택, 예: 카톡 아이디)"
                style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 10, border: "1px solid var(--dm-border)", background: "var(--dm-input)", color: "var(--dm-text)", fontSize: 14, resize: "none", fontFamily: "inherit", marginBottom: 8 }} />
              <button onClick={sendRequest} disabled={sending} style={{ width: "100%", padding: "10px 0", borderRadius: 10, border: "none", background: "#6C8EFF", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: sending ? 0.6 : 1 }}>
                {sending ? "보내는 중..." : "📨 해제 요청 보내기"}
              </button>
            </>
          )}
          <button onClick={() => setForgotOpen(false)} style={{ ...linkBtn, display: "block", margin: "6px auto 0", fontSize: 13 }}>닫기</button>
        </div>
      )}
    </div>
  );
}
