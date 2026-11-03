import { useEffect, useRef, useState } from "react";

// ↩ 되돌리기 (2026-11-03) — 지우거나 옮긴 뒤 5초 동안 아래쪽에 띠를 띄운다.
// offer(msg, undo, finalize): undo = 되돌리기를 눌렀을 때, finalize = 시간이 지나 확정될 때(사진 파일 지우기 등).
// 새 일을 하면 앞의 것은 바로 확정된다. 화면을 벗어나도 확정된다.
const WAIT_MS = 5000;

export function useUndo() {
  const [bar, setBar] = useState(null); // { id, msg }
  const ref = useRef(null); // { id, undo, finalize, timer }
  const finish = () => {
    const u = ref.current;
    if (!u) return;
    clearTimeout(u.timer);
    ref.current = null;
    setBar(null);
    u.finalize?.();
  };
  const offer = (msg, undo, finalize) => {
    finish();
    const id = Date.now();
    ref.current = { id, undo, finalize, timer: setTimeout(finish, WAIT_MS) };
    setBar({ id, msg });
  };
  const run = () => {
    const u = ref.current;
    if (!u) return;
    clearTimeout(u.timer);
    ref.current = null;
    setBar(null);
    u.undo();
  };
  // 화면을 벗어나면 확정 — finish는 렌더마다 새로 만들어지므로 ref로 마지막 것을 부른다
  const finishRef = useRef(finish);
  useEffect(() => { finishRef.current = finish; });
  useEffect(() => () => finishRef.current(), []);
  return { bar, offer, run };
}
