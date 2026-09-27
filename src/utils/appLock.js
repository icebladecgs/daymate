// 앱 잠금(비밀번호 4자리) — 기기마다 따로(localStorage). 화면을 가리는 잠금이고 데이터 암호화는 아니다.
// 번호는 그대로 두지 않고 PBKDF2 해시만 저장한다. 잊으면 잠금을 설정한 구글 계정으로 다시 로그인해서 푼다.
const KEY = "dm_app_lock";          // { salt, hash, uid, idleMin }
const FAIL_KEY = "dm_app_lock_fail"; // { count, until }
export const IDLE_CHOICES = [0, 1, 5, 30]; // 분 — 0은 "즉시"
export const MAX_FAILS = 5;
export const COOLDOWN_MS = 30 * 1000;

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 */ } };

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function hashPin(pin, salt) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, base, 256);
  return b64(bits);
}

export const getAppLock = () => read(KEY);
export const isAppLockOn = () => !!read(KEY)?.hash;
export const isValidPin = (pin) => /^\d{4}$/.test(pin);

export async function setAppLock(pin, uid, idleMin = 5) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  write(KEY, { salt: b64(salt), hash: await hashPin(pin, salt), uid, idleMin });
  write(FAIL_KEY, null);
}

export function setAppLockIdle(idleMin) {
  const cfg = read(KEY);
  if (cfg) write(KEY, { ...cfg, idleMin });
}

export function clearAppLock() { write(KEY, null); write(FAIL_KEY, null); }

// 남은 대기 시간(ms) — 5번 틀리면 30초 동안 입력을 막는다
export function lockWaitMs() {
  const f = read(FAIL_KEY);
  return f?.until ? Math.max(0, f.until - Date.now()) : 0;
}

// 맞으면 true. 틀리면 실패 횟수를 올리고 5번째에 대기 시작
export async function checkPin(pin) {
  const cfg = read(KEY);
  if (!cfg?.hash) return true;
  if (lockWaitMs() > 0) return false;
  const ok = (await hashPin(pin, unb64(cfg.salt))) === cfg.hash;
  if (ok) { write(FAIL_KEY, null); return true; }
  const count = (read(FAIL_KEY)?.count || 0) + 1;
  write(FAIL_KEY, count >= MAX_FAILS ? { count: 0, until: Date.now() + COOLDOWN_MS } : { count });
  return false;
}

export const failsLeft = () => MAX_FAILS - (read(FAIL_KEY)?.count || 0);
