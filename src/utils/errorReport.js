// 앱 오류 자동 수집 — 오류가 나면 Firestore errorLogs에 짧게 남기고, 관리자 화면(오류 탭)에서 본다.
// 메모·일기 같은 사용자 내용은 넣지 않는다: 오류 문구·위치·버전·기기 종류·시각만(문구도 길이 제한).
// 로그인한 사용자만 보낸다(보안 규칙). 같은 오류는 한 번만, 한 번 켤 때 최대 20건.
import { APP_VERSION } from "../version.js";

const MAX_PER_SESSION = 20;
const seen = new Set();
let sentCount = 0; // 같은 오류 한 번·최대 20건이라, 보고 중에 난 오류가 다시 보고돼도 끝없이 돌지 않는다

// 브라우저 확장·크기 계산 경고처럼 앱 문제가 아닌 것
const IGNORE = [/ResizeObserver loop/i, /^Script error\.?$/i, /chrome-extension:\/\//i, /moz-extension:\/\//i];

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

function toText(err) {
  if (!err) return { msg: "(내용 없음)", stack: "" };
  if (err instanceof Error) return { msg: `${err.name}: ${err.message}${err.code ? ` [${err.code}]` : ""}`, stack: err.stack || "" };
  if (typeof err === "string") return { msg: err, stack: "" };
  try { return { msg: JSON.stringify(err), stack: "" }; } catch { return { msg: String(err), stack: "" }; }
}

export function platformOf() {
  const tags = [];
  if (window.daymateDesktop) tags.push("데스크탑");
  else if (window.matchMedia?.("(display-mode: standalone)").matches) tags.push("설치앱");
  else tags.push("브라우저");
  tags.push(window.matchMedia?.("(pointer: coarse)").matches ? "휴대폰" : "PC");
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "기타";
  const br = /SamsungBrowser/.test(ua) ? "삼성인터넷" : /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "기타";
  return `${tags.join("·")} ${os} ${br}`;
}

function whereNow() {
  if (new URLSearchParams(window.location.search).get("view") === "sticky") return "포스트잇";
  return window.__dmScreen || "알 수 없음";
}

export function reportError(kind, err, note = "") {
  try {
    if (sentCount >= MAX_PER_SESSION) return;
    const { msg, stack } = toText(err);
    if (IGNORE.some(re => re.test(msg))) return;
    const key = `${kind}|${msg.slice(0, 200)}`;
    if (seen.has(key)) return;
    seen.add(key);
    sentCount++;
    const entry = {
      kind,
      msg: clip(note ? `${note} — ${msg}` : msg, 500),
      stack: clip(stack.split("\n").slice(0, 8).join("\n"), 1500),
      where: whereNow(),
      version: APP_VERSION,
      platform: platformOf(),
      at: new Date().toISOString(),
    };
    // 포스트잇처럼 가벼운 화면에서도 쓰므로 firebase는 필요할 때 불러온다
    import("../firebase.js").then(async ({ auth, db }) => {
      await auth.authStateReady();
      if (!auth.currentUser) return;
      const { addDoc, collection } = await import("firebase/firestore");
      try { await addDoc(collection(db, "errorLogs"), { ...entry, uid: auth.currentUser.uid }); } catch { /* 저장 실패는 조용히 */ }
    }).catch(() => {});
  } catch { /* 보고 자체가 앱을 망가뜨리지 않게 */ }
}

// main.jsx에서 한 번 — 잡히지 않은 오류, 처리 안 된 Promise 오류, console.error로 남긴 오류
export function installErrorReporting() {
  if (window.__dmErrorReporting) return;
  window.__dmErrorReporting = true;
  window.addEventListener("error", (e) => reportError("오류", e.error || e.message));
  window.addEventListener("unhandledrejection", (e) => reportError("비동기", e.reason));
  const orig = console.error.bind(console);
  console.error = (...args) => {
    orig(...args);
    const errArg = args.find(a => a instanceof Error);
    const text = args.filter(a => !(a instanceof Error)).map(a => (typeof a === "string" ? a : "")).join(" ").trim();
    reportError("콘솔", errArg || text, errArg && text ? clip(text, 100) : "");
  };
}
