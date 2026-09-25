// 메모 잠금(암호화) — 브라우저 내장 WebCrypto만 사용.
//  · 비밀번호 → PBKDF2(SHA-256, 25만 번) → AES-GCM 256비트 키. 비밀번호와 키는 어디에도 저장하지 않는다.
//  · 계정 설정(settings.memoLock)에는 salt와 "확인용 암호문(check)"만 저장 — 다른 기기에서도 같은 비밀번호로 풀린다.
//  · 잠근 메모는 { ...나머지 칸, text: '', locked: { v, iv, ct } } — 본문·사진 목록·파일 목록이 암호문 안에 들어간다.
//  · 비밀번호를 잊으면 잠근 메모는 복구할 수 없다(서버·관리자도 못 읽는 것이 목적).
//  · 한 번 풀면 5분 동안(마지막 사용 기준) 다시 묻지 않는다.

const enc = new TextEncoder();
const dec = new TextDecoder();
const ITERATIONS = 250000;
const CHECK_TEXT = "daymate-memo-lock-v1";
const SESSION_MS = 5 * 60 * 1000;

let session = { key: null, at: 0 };

function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromB64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriveKey(password, saltB64, iterations = ITERATIONS) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromB64(saltB64), iterations, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}
async function encryptWith(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(value)));
  return { v: 1, iv: toB64(iv), ct: toB64(ct) };
}
async function decryptWith(key, box) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(box.iv) }, key, fromB64(box.ct));
  return JSON.parse(dec.decode(pt));
}

// 처음 잠금 비밀번호 만들기 → 계정 설정에 저장할 값
export async function createLockConfig(password) {
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await deriveKey(password, salt);
  const check = await encryptWith(key, CHECK_TEXT);
  session = { key, at: Date.now() };
  return { v: 1, salt, iterations: ITERATIONS, check };
}

// 비밀번호 확인 → 맞으면 5분간 열어 둠
export async function unlockSession(password, cfg) {
  try {
    const key = await deriveKey(password, cfg.salt, cfg.iterations || ITERATIONS);
    if ((await decryptWith(key, cfg.check)) !== CHECK_TEXT) return false;
    session = { key, at: Date.now() };
    return true;
  } catch {
    return false;
  }
}

export function sessionKey() {
  if (session.key && Date.now() - session.at < SESSION_MS) { session.at = Date.now(); return session.key; }
  session = { key: null, at: 0 };
  return null;
}
export const isUnlocked = () => !!sessionKey();
export function lockNow() { session = { key: null, at: 0 }; }

export async function encryptMemo(memo) {
  const key = sessionKey();
  if (!key) throw new Error("locked");
  const { text, photos, files, ...rest } = memo;
  const locked = await encryptWith(key, { text: text || "", photos: photos || [], files: files || [] });
  return { ...rest, text: "", locked };
}

// 잠긴 메모 → { text, photos, files } (메모 자체는 바꾸지 않음)
export async function decryptMemo(memo) {
  const key = sessionKey();
  if (!key) throw new Error("locked");
  return decryptWith(key, memo.locked);
}

// 잠금 해제된 일반 메모로 되돌리기
export function unlockedMemo(memo, data) {
  const { locked, ...rest } = memo; // eslint-disable-line no-unused-vars
  return { ...rest, text: data.text, ...(data.photos?.length ? { photos: data.photos } : {}), ...(data.files?.length ? { files: data.files } : {}) };
}

// 앱 어디서든 잠금 창 열기 — App.jsx가 받아 MemoLockSheet를 띄운다 (메모 번호만 알면 됨)
export function requestMemoLock(id, action) {
  window.dispatchEvent(new CustomEvent("dm:memo-lock", { detail: { id, action } }));
}
