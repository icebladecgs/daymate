// 데스크탑 앱 창 크기 맞추기 (2026-11-11 사용자 확정, 데스크탑 1.3.5~)
// · 보통 화면: 창 폭 = 앱 기둥(430px × 화면 크기 단계) — 윈도우 배율·앱 단계가 바뀔 때만 맞춘다(직접 늘린 창은 그대로)
// · 메모 관리자·대시보드: 1240×800에 (윈도우 배율 × 앱 단계/110%)를 곱해서, 모니터를 넘지 않게
// 실제 창 크기 계산(윈도우 배율 = 창 안쪽 폭 ÷ innerWidth)은 desktop/main.js의 fit-window가 한다.
// 옛 데스크탑 앱(fitWindow 없음)은 예전처럼 setWideMode만.
const PHONE_WIDTH = 430; // styles.js S.phone maxWidth
const BASE_ZOOM = 1.1;   // 대시보드 1240×800은 기본 110%로 맞춘 크기

let last = null; // 마지막으로 보낸 { wide, zoom, dpr }

export function syncDesktopWindow(wide, zoom) {
  const d = window.daymateDesktop;
  if (!d) return;
  if (!d.fitWindow) { d.setWideMode?.(wide); return; }
  const dpr = window.devicePixelRatio || 1;
  const changedScale = !last || last.zoom !== zoom || last.dpr !== dpr;
  if (last && last.wide === wide && !changedScale) return; // 화면만 바뀐 것 — 직접 맞춘 창 크기를 건드리지 않는다
  last = { wide, zoom, dpr };
  const sb = Math.max(0, window.innerWidth - document.documentElement.clientWidth); // 세로 스크롤 막대
  d.fitWindow({
    wide,
    fitNormal: changedScale, // 보통 화면 폭은 배율·단계가 바뀌었을 때만
    rel: zoom / BASE_ZOOM,
    cssWidth: Math.ceil(PHONE_WIDTH * zoom + sb),
    innerWidth: window.innerWidth,
  });
}

// 윈도우 배율(텍스트 크기 포함)이 바뀌면 devicePixelRatio가 바뀐다
export function watchPixelRatio(onChange) {
  let mq = null;
  const listen = () => {
    mq = window.matchMedia?.(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq?.addEventListener?.('change', handler, { once: true });
  };
  const handler = () => { onChange(); listen(); };
  listen();
  return () => mq?.removeEventListener?.('change', handler);
}
