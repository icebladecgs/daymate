import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { memoAutoListOn, setMemoAutoList } from "../utils/editorAssist.js";

// 메모 설정 — 메모 창(포스트잇 ⋯ 메뉴, 메모 쓰기 화면, 메모 관리자)에서 바로 연다 (2026-10-07).
// 목록 자동완성 켜기/끄기 + 편집 단축키 안내 + (데스크탑 앱) 포스트잇 단축키와 단축키 설정 창 열기.
// inline: 포스트잇처럼 작은 창 안에 꽉 채워 그린다. 아니면 body에 띄우는 창(메모 관리자 900·메모 잠금 950 위)

const EDIT_KEYS = [
  ["Enter", "목록 줄(- 1. [ ])을 다음 줄에 이어 쓰기 · 빈 항목이면 한 단계 위로"],
  ["Tab / Shift+Tab", "한 단계 들여쓰기 / 내어쓰기 (여러 줄 한꺼번에)"],
  ["Backspace", "목록 기호 바로 뒤에서 누르면 한 단계 위로"],
  ["Ctrl+Shift+X", "체크박스 [ ] ↔ [x]"],
  ["Alt+↑ / Alt+↓", "줄(고른 여러 줄) 위아래로 옮기기"],
  ["F12 / Ctrl+/", "현재 줄 계산 · 빈 줄이면 위 숫자 합계"],
  ["Ctrl+;", "오늘 날짜 넣기 (Ctrl+Shift+; 지금 시각)"],
  ["Ctrl+D", "현재 줄 복제"],
];
// 데스크탑 단축키 — 이름은 desktop/main.js의 shortcuts.json 키와 같다
const GLOBAL_KEY_NAMES = [["memo", "새 메모"], ["quickMemo", "간편 메모(새 포스트잇)"], ["search", "메모 관리자"], ["calendar", "달력 보기"], ["memoSearch", "메모 검색"], ["toggleStickies", "포스트잇 모두 보이기/감추기"], ["recentMemo", "최근 편집한 메모 열기"]];
const STICKY_KEY_NAMES = [["stickyFold", "접기/펼치기"], ["stickyNew", "새 포스트잇"], ["stickyClose", "닫기"], ["stickyPin", "항상 위"], ["stickyCopy", "전체 복사"]];

export default function MemoSettings({ onClose, inline = false }) {
  const [autoList, setAutoList] = useState(memoAutoListOn);
  const [keys, setKeys] = useState(null);
  const desktop = typeof window !== "undefined" ? window.daymateDesktop : null;

  // 실제 설정 값을 읽는다. 단축키 설정 창에서 바꾸고 돌아오면(알림·창 포커스) 다시 읽는다.
  // 전체 단축키는 데스크탑 1.3.3부터(getShortcuts), 그 전에는 포스트잇 키 5개만 알 수 있다
  useEffect(() => {
    if (!desktop) return;
    const load = () => {
      const p = desktop.getShortcuts ? desktop.getShortcuts()
        : desktop.getStickyKeys?.().then(s => ({ stickyFold: s.fold, stickyNew: s.new, stickyClose: s.close, stickyPin: s.pin, stickyCopy: s.copy }));
      p?.then(setKeys).catch(() => {});
    };
    load();
    const off = desktop.onStickyKeysChanged?.(load);
    window.addEventListener("focus", load);
    return () => { off?.(); window.removeEventListener("focus", load); };
  }, [desktop]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const ink = inline ? { color: "#000" } : { color: "var(--dm-text)" };
  const sub = inline ? "#666" : "var(--dm-muted)";
  const line = inline ? "#eee" : "var(--dm-border)";
  const keyCap = { display: "inline-block", padding: "1px 6px", borderRadius: 5, border: `1px solid ${inline ? "#ccc" : "var(--dm-border)"}`, background: inline ? "#f5f5f5" : "var(--dm-input)", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", ...ink };
  const title = (t) => <div style={{ fontSize: 12, fontWeight: 900, color: sub, margin: "14px 0 6px" }}>{t}</div>;

  const body = (
    <div role="dialog" aria-label="메모 설정" onClick={e => e.stopPropagation()}
      style={{
        ...ink, fontFamily: "inherit", boxSizing: "border-box",
        ...(inline
          // 포스트잇 제목줄(28px)은 그대로 보이게
          ? { position: "absolute", top: 28, left: 0, right: 0, bottom: 0, zIndex: 20, background: "#fff", padding: "10px 12px", overflowY: "auto" }
          : { width: "min(440px, calc(100vw - 32px))", maxHeight: "calc(100vh - 64px)", overflowY: "auto", background: "var(--dm-bg)", border: "1px solid var(--dm-border)", borderRadius: 14, padding: "14px 16px", boxShadow: "0 10px 30px rgba(0,0,0,.35)" }),
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, fontSize: inline ? 14 : 16, fontWeight: 900 }}>⚙️ 메모 설정</div>
        <button onClick={onClose} aria-label="닫기"
          style={{ width: 28, height: 28, padding: 0, border: "none", background: "transparent", cursor: "pointer", fontSize: 15, ...ink }}>✕</button>
      </div>

      {title("자동 편집")}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>목록 자동완성</div>
          <div style={{ fontSize: 11, color: sub, marginTop: 2, lineHeight: 1.5 }}>Enter 이어쓰기 · Tab 들여쓰기 · Backspace · 번호 다시 매기기(단계마다 1. 가. 1) 가)) · 이 기기에만 적용</div>
        </div>
        <div onClick={() => { const v = !autoList; setAutoList(v); setMemoAutoList(v); }} role="switch" aria-checked={autoList} aria-label="목록 자동완성"
          style={{ width: 46, height: 26, borderRadius: 999, background: autoList ? "#6C8EFF" : (inline ? "#ccc" : "var(--dm-border)"), cursor: "pointer", position: "relative", flexShrink: 0 }}>
          <div style={{ position: "absolute", top: 3, left: autoList ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
        </div>
      </div>

      {title("편집 단축키")}
      {EDIT_KEYS.map(([k, d]) => (
        <div key={k} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "4px 0", borderTop: `1px solid ${line}`, fontSize: 12, lineHeight: 1.5 }}>
          <span style={{ flexShrink: 0, width: inline ? 100 : 120 }}><span style={keyCap}>{k}</span></span>
          <span style={{ color: inline ? "#333" : "var(--dm-sub)" }}>{d}</span>
        </div>
      ))}

      {desktop && (
        <>
          {keys && [
            ...(keys.memo !== undefined ? [["데스크탑 단축키 (어디서나)", GLOBAL_KEY_NAMES, ""]] : []),
            ["포스트잇 창 안 단축키", STICKY_KEY_NAMES, "포스트잇 "],
          ].map(([head, names, prefix]) => (
            <div key={head}>
              {title(head)}
              {names.map(([id, name]) => (
                <div key={id} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "4px 0", borderTop: `1px solid ${line}`, fontSize: 12 }}>
                  <span style={{ flexShrink: 0, width: inline ? 100 : 120 }}>{keys[id] ? <span style={keyCap}>{keys[id]}</span> : <span style={{ color: sub }}>없음</span>}</span>
                  <span style={{ color: inline ? "#333" : "var(--dm-sub)" }}>{prefix}{name}</span>
                </div>
              ))}
            </div>
          ))}
          {keys && keys.memo === undefined && (
            <div style={{ marginTop: 6, fontSize: 11, color: sub, lineHeight: 1.6 }}>새 메모·메모 관리자 등 전체 단축키는 데스크탑 앱 1.3.3부터 여기에 보여요</div>
          )}
          {desktop.openShortcutSettings ? (
            <button onClick={() => desktop.openShortcutSettings()}
              style={{ marginTop: 10, width: "100%", padding: "9px 0", borderRadius: 8, border: "none", background: "#6C8EFF", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              ⌨️ 단축키 바꾸기 (새 메모·메모 관리자 등 전체)
            </button>
          ) : (
            <div style={{ marginTop: 8, fontSize: 11, color: sub, lineHeight: 1.6 }}>
              단축키 바꾸기: 작업 표시줄 오른쪽 트레이의 DayMate 아이콘 → <b>단축키 설정</b>
            </div>
          )}
        </>
      )}
    </div>
  );

  if (inline) return body;
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 960, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {body}
    </div>,
    document.body,
  );
}
