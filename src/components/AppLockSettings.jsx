import { useEffect, useState } from "react";
import S from "../styles.js";
import { getAppLock, setAppLock, setAppLockIdle, clearAppLock, checkPin, isValidPin, lockWaitMs, IDLE_CHOICES, bioAvailable, enrollBio, removeBio, verifyBio } from "../utils/appLock.js";

// 설정 → 앱 관리 → 앱 잠금. 이 기기에만 적용된다(기기마다 따로).
export default function AppLockSettings({ authUser, setToast }) {
  const [cfg, setCfg] = useState(() => getAppLock());
  const [mode, setMode] = useState(null); // 'on' | 'change' | 'off' | 'set'(지문으로 확인 후 새 비밀번호)
  const [cur, setCur] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [err, setErr] = useState("");
  const [bioOk, setBioOk] = useState(false); // 이 기기에서 지문·얼굴 확인을 쓸 수 있는지
  const [bioBusy, setBioBusy] = useState(false);
  const on = !!cfg?.hash;
  const idleMin = cfg?.idleMin ?? 5;
  const bioOn = !!cfg?.bio?.credId;

  useEffect(() => { bioAvailable().then(setBioOk); }, []);

  const reset = () => { setMode(null); setCur(""); setPin(""); setPin2(""); setErr(""); };
  const start = (m) => {
    if (m === "on" && !authUser) { setToast?.("로그인한 뒤에 켤 수 있어요 (비밀번호를 잊었을 때 관리자에게 해제를 요청하기 위해)"); return; }
    reset(); setMode(m);
  };

  const verifyCurrent = async () => {
    if (lockWaitMs() > 0) { setErr("여러 번 틀려서 30초 뒤에 다시 해 주세요"); return false; }
    if (await checkPin(cur)) return true;
    setErr("지금 비밀번호가 달라요"); setCur("");
    return false;
  };

  // 지금 비밀번호 대신 지문·얼굴로 확인 (비밀번호를 잊었을 때 새로 정하기·끄기)
  const confirmByBio = async () => {
    setErr("");
    if (!(await verifyBio())) { setErr("지문·얼굴 확인이 안 됐어요"); return; }
    if (mode === "off") { clearAppLock(); setCfg(null); reset(); setToast?.("앱 잠금을 껐어요"); return; }
    setMode("set"); // 지금 비밀번호 확인을 마친 상태로 새 비밀번호만 받는다
  };

  const toggleBio = async () => {
    if (bioBusy) return;
    if (bioOn) { removeBio(); setCfg(getAppLock()); setToast?.("지문·얼굴로 풀기를 껐어요"); return; }
    setBioBusy(true);
    try {
      await enrollBio(authUser?.email?.split("@")[0] || "DayMate");
      setCfg(getAppLock());
      setToast?.("👆 지문·얼굴로 풀 수 있어요");
    } catch (e) {
      if (e?.name !== "NotAllowedError") setToast?.("지문·얼굴을 등록하지 못했어요");
    }
    setBioBusy(false);
  };

  const save = async () => {
    setErr("");
    if (mode === "off") {
      if (!(await verifyCurrent())) return;
      clearAppLock(); setCfg(null); reset(); setToast?.("앱 잠금을 껐어요");
      return;
    }
    if (mode === "change" && !(await verifyCurrent())) return;
    // mode "set": 지문으로 지금 비밀번호 확인을 대신한 경우
    if (!isValidPin(pin)) { setErr("숫자 4자리로 정해 주세요"); return; }
    if (pin !== pin2) { setErr("두 번 입력한 번호가 달라요"); setPin2(""); return; }
    await setAppLock(pin, authUser?.uid || cfg?.uid, idleMin);
    setCfg(getAppLock()); reset();
    setToast?.(mode !== "on" ? "비밀번호를 바꿨어요" : bioOk ? "🔒 앱 잠금을 켰어요 — 아래에서 지문·얼굴로 풀기도 켤 수 있어요" : "🔒 앱 잠금을 켰어요");
  };

  const pickIdle = (m) => { setAppLockIdle(m); setCfg(getAppLock()); };

  const pinInput = (value, set, placeholder) => (
    <input type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={value} placeholder={placeholder}
      onChange={e => { set(e.target.value.replace(/\D/g, "").slice(0, 4)); setErr(""); }}
      onKeyDown={e => { if (e.key === "Enter") save(); }}
      style={{ ...S.input, fontSize: 20, letterSpacing: "0.5em", textAlign: "center" }} />
  );

  return (
    <>
      <div style={S.sectionTitle}>🔒 앱 잠금</div>
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 13 }}>비밀번호 4자리로 잠그기</div>
            <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 2, lineHeight: 1.5 }}>앱을 켤 때와 앱을 벗어났다 돌아올 때 물어봐요. 이 기기에만 적용돼요</div>
          </div>
          <div onClick={() => (mode ? reset() : start(on ? "off" : "on"))} role="switch" aria-checked={on} style={{
            width: 52, height: 28, borderRadius: 999, background: on ? "#6C8EFF" : "var(--dm-border)",
            cursor: "pointer", position: "relative", flexShrink: 0,
          }}>
            <div style={{ position: "absolute", top: 4, left: on ? 28 : 4, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
          </div>
        </div>

        {on && !mode && (
          <>
            <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900, margin: "16px 0 8px" }}>앱을 벗어났다 돌아올 때 다시 묻기</div>
            <div style={{ display: "flex", gap: 6 }}>
              {IDLE_CHOICES.map(m => (
                <button key={m} onClick={() => pickIdle(m)}
                  style={{ flex: 1, padding: "8px 0", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer",
                    border: idleMin === m ? "1px solid #6C8EFF" : "1px solid var(--dm-border)",
                    background: idleMin === m ? "rgba(108,142,255,.15)" : "transparent",
                    color: idleMin === m ? "#6C8EFF" : "var(--dm-sub)" }}>
                  {m === 0 ? "즉시" : `${m}분 뒤`}
                </button>
              ))}
            </div>
            {bioOk && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 16 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 13 }}>👆 지문·얼굴로 풀기</div>
                  <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 2, lineHeight: 1.5 }}>비밀번호를 잊어도 지문으로 풀고 새로 정할 수 있어요</div>
                </div>
                <div onClick={toggleBio} role="switch" aria-checked={bioOn} style={{
                  width: 52, height: 28, borderRadius: 999, background: bioOn ? "#6C8EFF" : "var(--dm-border)",
                  cursor: "pointer", position: "relative", flexShrink: 0, opacity: bioBusy ? 0.5 : 1,
                }}>
                  <div style={{ position: "absolute", top: 4, left: bioOn ? 28 : 4, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
                </div>
              </div>
            )}
            <button style={{ ...S.btnGhost, marginTop: 12 }} onClick={() => start("change")}>비밀번호 바꾸기</button>
          </>
        )}

        {mode && (
          <div style={{ marginTop: 14 }}>
            {(mode === "change" || mode === "off") && pinInput(cur, setCur, "지금 비밀번호")}
            {mode !== "off" && pinInput(pin, setPin, "새 비밀번호 4자리")}
            {mode !== "off" && pinInput(pin2, setPin2, "한 번 더 입력")}
            {bioOn && (mode === "change" || mode === "off") && (
              <button style={{ ...S.btnGhost, marginTop: 0, marginBottom: 8 }} onClick={confirmByBio}>👆 지금 비밀번호 대신 지문으로 확인</button>
            )}
            {err && <div style={{ fontSize: 12, color: "#F87171", fontWeight: 700, marginBottom: 8 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...S.btnGhost, marginTop: 0, flex: 1 }} onClick={reset}>취소</button>
              <button style={{ ...S.btn, marginTop: 0, flex: 1 }} onClick={save}>{mode === "off" ? "잠금 끄기" : mode === "on" ? "잠금 켜기" : "바꾸기"}</button>
            </div>
          </div>
        )}

        <div style={{ fontSize: 11, color: "var(--dm-muted)", lineHeight: 1.7, marginTop: 12 }}>
          • 휴대폰·PC는 각각 그 기기 설정에서 따로 켜요.<br />
          • 비밀번호를 잊으면 지문·얼굴로 풀거나, 잠금 화면의 "비밀번호를 잊었어요"에서 관리자에게 해제를 요청해요. 관리자가 본인인지 확인한 뒤 풀어 드려요.<br />
          • 지문·얼굴을 켤 때 "패스키 저장" 창이 뜰 수 있어요. 비밀번호가 아니라 이 기기 확인용 키예요.<br />
          • 화면을 가리는 잠금이에요. 꼭 숨길 메모는 메모 잠금(암호화)을 함께 써 주세요.<br />
          • 바탕화면 포스트잇은 잠기지 않아요.
        </div>
      </div>
    </>
  );
}
