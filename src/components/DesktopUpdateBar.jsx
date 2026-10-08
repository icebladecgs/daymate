import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DESKTOP_LATEST, DESKTOP_DOWNLOAD_URL, compareVersion, installedDesktopVersion } from "../utils/desktopRelease.js";

// 데스크탑 앱이 최신이 아니면 위쪽에 "새 버전이 있어요" (메모잇의 업데이트 확인·공지 참고, 2026-10-08).
// 웹은 배포하면 바로 바뀌지만 데스크탑 앱은 다시 설치해야 해서, 모르고 옛 버전을 계속 쓰지 않게 알린다.
// "나중에"를 누르면 3일 동안 안 보인다.
const SNOOZE_KEY = "dm_desktop_update_snooze";
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

export default function DesktopUpdateBar() {
  const [current, setCurrent] = useState(null);
  useEffect(() => {
    let alive = true;
    installedDesktopVersion().then(v => {
      if (!alive || !v || compareVersion(v, DESKTOP_LATEST) >= 0) return;
      try {
        const s = JSON.parse(localStorage.getItem(SNOOZE_KEY) || "null");
        if (s?.v === DESKTOP_LATEST && Date.now() < s.until) return;
      } catch { /* 저장소를 못 읽으면 그냥 보여 준다 */ }
      setCurrent(v);
    });
    return () => { alive = false; };
  }, []);
  if (!current) return null;

  const snooze = () => {
    try { localStorage.setItem(SNOOZE_KEY, JSON.stringify({ v: DESKTOP_LATEST, until: Date.now() + SNOOZE_MS })); } catch { /* 이번만 닫기 */ }
    setCurrent(null);
  };
  const download = () => {
    const d = window.daymateDesktop;
    if (d?.openExternal) d.openExternal(DESKTOP_DOWNLOAD_URL); else window.open(DESKTOP_DOWNLOAD_URL, "_blank");
    snooze();
  };
  const target = document.querySelector(".dm-phone") || document.body;
  return createPortal(
    <div role="status" style={{
      position: "fixed", top: 10, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 24px)", maxWidth: 406,
      zIndex: 240, background: "var(--dm-card)", border: "1.5px solid rgba(108,142,255,.55)", borderRadius: 12,
      boxShadow: "0 6px 20px rgba(0,0,0,.18)", padding: "8px 10px", display: "flex", alignItems: "center", gap: 8,
    }}>
      <span style={{ fontSize: 16 }}>🆕</span>
      <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--dm-text)", lineHeight: 1.45 }}>
        데스크탑 앱 <b>새 버전 {DESKTOP_LATEST}</b>이 있어요 (지금 {current}). 받아서 설치하면 돼요.
      </div>
      <button onClick={download}
        style={{ flexShrink: 0, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(108,142,255,.6)", background: "rgba(108,142,255,.15)", color: "var(--dm-text)", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
        받기
      </button>
      <button onClick={snooze} aria-label="나중에" title="나중에 (3일 뒤 다시 알림)"
        style={{ flexShrink: 0, width: 26, height: 26, padding: 0, background: "none", border: "none", color: "var(--dm-muted)", fontSize: 16, cursor: "pointer" }}>✕</button>
    </div>,
    target
  );
}
