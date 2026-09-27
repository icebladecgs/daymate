import { useEffect, useState } from "react";
import { SOUND_STYLES } from "../utils/notification.js";
import { loadChatPush, saveChatPush, getChatSound, setChatSound, playChatSound, CHAT_PUSH_DEFAULTS } from "../utils/chatNotify.js";
import { ensurePushSubscription, pushSupported } from "../utils/pushSubscription.js";

// 커뮤니티 채팅 알림 설정 — 채팅방 ⚙(communityId 있음)과 설정 → 알림(없음)에서 같이 쓴다.
export default function ChatNotifySettings({ authUser, communityId, communityName }) {
  const [prefs, setPrefs] = useState(null);
  const [sound, setSound] = useState(getChatSound);
  const [perm, setPerm] = useState(() => (typeof Notification !== "undefined" ? Notification.permission : "unsupported"));
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!authUser) return;
    loadChatPush(authUser.uid).then(setPrefs, () => setPrefs(CHAT_PUSH_DEFAULTS));
  }, [authUser]);

  if (!authUser) return <div style={{ fontSize: 13, color: "var(--dm-muted)" }}>로그인하면 채팅 알림을 설정할 수 있어요.</div>;
  if (!prefs) return <div style={{ fontSize: 13, color: "var(--dm-muted)" }}>불러오는 중…</div>;

  const save = (patch, next) => {
    setPrefs(next);
    saveChatPush(authUser.uid, patch).catch(() => setMsg("저장하지 못했어요"));
  };
  const muted = !!(communityId && prefs.muted?.[communityId]);

  const allow = async () => {
    setMsg("");
    try {
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p === "granted") { await ensurePushSubscription(authUser.uid); setMsg("✅ 이 기기로 알림을 받아요"); }
      else setMsg("알림이 허용되지 않았어요");
    } catch { setMsg("알림 권한을 요청하지 못했어요"); }
  };

  return (
    <div>
      {/* 이 기기 알림 권한 */}
      {!pushSupported() ? (
        <div style={{ fontSize: 12, color: "#F87171", marginBottom: 8, lineHeight: 1.6 }}>이 기기(브라우저)는 푸시 알림을 받을 수 없어요. 휴대폰에 설치한 앱에서 설정해 주세요.</div>
      ) : perm === "granted" ? (
        <div style={{ fontSize: 12, color: "#22A55A", marginBottom: 8, fontWeight: 700 }}>🔔 이 기기는 알림이 허용돼 있어요</div>
      ) : perm === "denied" ? (
        <div style={{ fontSize: 12, color: "#F87171", marginBottom: 8, lineHeight: 1.6 }}>알림이 차단돼 있어요. 휴대폰 설정 → 애플리케이션 → Chrome(또는 DayMate) → 알림에서 허용해 주세요.</div>
      ) : (
        <button onClick={allow} style={{ width: "100%", padding: "10px 0", marginBottom: 8, borderRadius: 10, border: "none", background: "#6C8EFF", color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer" }}>🔔 이 기기에서 알림 허용하기</button>
      )}

      <Row title="채팅 알림 받기" sub="모든 커뮤니티 채팅 알림을 한 번에 켜고 꺼요"
        on={prefs.enabled !== false} onToggle={() => save({ enabled: prefs.enabled === false }, { ...prefs, enabled: prefs.enabled === false })} />
      {communityId && (
        <Row title={`이 커뮤니티 알림`} sub={communityName ? `'${communityName}' 채팅 알림` : undefined} disabled={prefs.enabled === false}
          on={!muted} onToggle={() => save({ muted: { [communityId]: !muted } }, { ...prefs, muted: { ...prefs.muted, [communityId]: !muted } })} />
      )}
      <Row title="잠금 화면에 내용 보이기" sub="끄면 '새 메시지가 있어요'로만 보여요" disabled={prefs.enabled === false}
        on={prefs.preview !== false} onToggle={() => save({ preview: prefs.preview === false }, { ...prefs, preview: prefs.preview === false })} />

      <div style={{ padding: "10px 0", borderTop: "1px solid var(--dm-row)" }}>
        <div style={{ fontWeight: 900, fontSize: 14, color: "var(--dm-text)" }}>앱을 켜 둔 동안 알림 소리</div>
        <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 2, marginBottom: 8 }}>누르면 미리 들려요 · 이 기기에만 적용</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {[...SOUND_STYLES, { id: "none", label: "무음" }].map(s => (
            <button key={s.id} onClick={() => { setSound(s.id); setChatSound(s.id); playChatSound(s.id); }}
              style={{ padding: "7px 12px", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer",
                border: `1.5px solid ${sound === s.id ? "#6C8EFF" : "var(--dm-border)"}`,
                background: sound === s.id ? "rgba(108,142,255,.12)" : "transparent", color: sound === s.id ? "#6C8EFF" : "var(--dm-sub)" }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--dm-muted)", lineHeight: 1.7, paddingTop: 8, borderTop: "1px solid var(--dm-row)" }}>
        • 앱이 꺼져 있을 때 오는 알림 소리는 휴대폰 설정에서 바꿔요: 설정 → 애플리케이션 → Chrome(또는 DayMate) → 알림.<br />
        • 알림은 계정당 한 기기로 가요 — 마지막으로 알림을 허용한 기기예요.
      </div>
      {msg && <div style={{ fontSize: 12, fontWeight: 700, marginTop: 8, color: msg.startsWith("✅") ? "#22A55A" : "#F87171" }}>{msg}</div>}
    </div>
  );
}

// 켜기/끄기 한 줄
function Row({ title, sub, on, onToggle, disabled }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid var(--dm-row)", opacity: disabled ? 0.45 : 1 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 900, fontSize: 14, color: "var(--dm-text)" }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 2, lineHeight: 1.5 }}>{sub}</div>}
      </div>
      <div onClick={() => !disabled && onToggle()} role="switch" aria-checked={on} aria-label={title}
        style={{ width: 52, height: 28, borderRadius: 999, background: on ? "#6C8EFF" : "var(--dm-border)", cursor: disabled ? "default" : "pointer", position: "relative", flexShrink: 0 }}>
        <div style={{ position: "absolute", top: 4, left: on ? 28 : 4, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
      </div>
    </div>
  );
}
