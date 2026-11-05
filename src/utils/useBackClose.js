import { useEffect, useRef } from "react";

// 휴대폰 뒤로가기로 열린 창부터 닫기 (2026-11-05)
// 창이 하나라도 열려 있으면 브라우저 기록에 "창 표시" 한 칸(guard)을 얹어 둔다. 뒤로가기는 그 칸만 지우고 맨 위 창을 닫는다.
// 창을 ✕로 닫으면 칸을 스스로 지운다. 창을 닫고 곧바로 다른 창을 열면 칸을 그대로 쓴다 — history.back()은 늦게 실행되므로
// 닫을 때마다 지우면 새 창의 칸이 대신 지워져 새 창이 바로 닫힌다.
const GUARD = "dmSheetGuard";
const stack = [];
let guardOn = false; // 지금 맨 위 기록이 우리 칸인가
let ignorePop = false; // 우리가 부른 history.back()의 결과를 기다리는 중
let scheduled = false;

function sync() {
  scheduled = false;
  if (ignorePop) return; // 뒤로 가기가 끝나면 다시 맞춘다
  if (stack.length && !guardOn) {
    history.pushState({ ...(history.state || {}), [GUARD]: true }, "");
    guardOn = true;
  } else if (!stack.length && guardOn) {
    guardOn = false;
    // 창을 닫으면서 다른 화면으로 넘어갔으면(칸 위에 새 기록) 칸은 남겨 두고, 나중에 거기 닿을 때 건너뛴다
    if (history.state?.[GUARD]) { ignorePop = true; history.back(); }
  }
}
function schedule() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(sync);
}

// 앱의 화면 전환 처리(App.jsx)보다 먼저 받아서, 창 때문에 생긴 이동은 앱에 넘기지 않는다
if (typeof window !== "undefined") {
  window.addEventListener("popstate", (e) => {
    const onGuard = !!e.state?.[GUARD];
    if (ignorePop) {
      ignorePop = false;
      e.stopImmediatePropagation();
      schedule();
      return;
    }
    if (guardOn && !onGuard) { // 뒤로가기 → 맨 위 창 닫기
      guardOn = false;
      e.stopImmediatePropagation();
      const top = stack.pop();
      top?.close.current?.();
      // 닫기를 거절한 창(저장 확인 등)은 다시 올린다
      if (top) setTimeout(() => { if (top.mounted && !stack.includes(top)) { stack.push(top); schedule(); } }, 50);
      schedule();
      return;
    }
    if (!guardOn && onGuard) { // 남겨 둔 칸에 닿음 → 한 칸 더 뒤로
      e.stopImmediatePropagation();
      history.back();
    }
  }, { capture: true });
}

// onClose: 뒤로가기를 눌렀을 때 부를 함수, active: 창이 열려 있는가
export function useBackClose(onClose, active = true) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    if (!active) return undefined;
    const entry = { close, mounted: true };
    stack.push(entry);
    schedule();
    return () => {
      entry.mounted = false;
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      schedule();
    };
  }, [active]);
}
