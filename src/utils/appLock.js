// 앱 잠금(비밀번호 4자리) — 기기마다 따로(localStorage). 화면을 가리는 잠금이고 데이터 암호화는 아니다.
// 번호는 그대로 두지 않고 PBKDF2 해시만 저장한다.
// 잊으면: 지문·얼굴(등록했으면)로 풀거나, 관리자에게 해제를 요청한다(2026-10-06 — 예전 "구글 계정 재로그인"은
// 휴대폰에 구글 계정이 이미 로그인돼 있어 주운 사람도 풀 수 있어서 없앴다).
const KEY = "dm_app_lock";          // { salt, hash, uid, idleMin, lockId, bio?: { credId } }
const FAIL_KEY = "dm_app_lock_fail"; // { count, until }
const REQ_KEY = "dm_app_lock_req";   // 관리자에게 해제 요청을 보낸 시각(ms)
export const IDLE_CHOICES = [0, 1, 5, 30]; // 분 — 0은 "즉시"
export const MAX_FAILS = 5;
export const COOLDOWN_MS = 30 * 1000;
export const RESET_VALID_MS = 60 * 60 * 1000; // 관리자 해제 표시는 1시간 안에만 유효

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 */ } };

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");

async function hashPin(pin, salt) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, base, 256);
  return b64(bits);
}

export const getAppLock = () => read(KEY);
export const isAppLockOn = () => !!read(KEY)?.hash;
export const isValidPin = (pin) => /^\d{4}$/.test(pin);

// 비밀번호를 새로 정하거나 바꿀 때. 지문 등록·기기 잠금 id는 그대로 둔다
export async function setAppLock(pin, uid, idleMin = 5) {
  const prev = read(KEY) || {};
  const salt = crypto.getRandomValues(new Uint8Array(16));
  write(KEY, { ...prev, salt: b64(salt), hash: await hashPin(pin, salt), uid, idleMin, lockId: prev.lockId || randomId() });
  write(FAIL_KEY, null);
}

export function setAppLockIdle(idleMin) {
  const cfg = read(KEY);
  if (cfg) write(KEY, { ...cfg, idleMin });
}

export function clearAppLock() { write(KEY, null); write(FAIL_KEY, null); write(REQ_KEY, null); }

// 관리자 해제 요청에 쓰는 이 기기의 잠금 id (예전에 켠 잠금은 처음 부를 때 만든다)
export function getLockId() {
  const cfg = read(KEY);
  if (!cfg?.hash) return null;
  if (cfg.lockId) return cfg.lockId;
  const lockId = randomId();
  write(KEY, { ...cfg, lockId });
  return lockId;
}

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

// ---------- 지문·얼굴로 풀기 (WebAuthn, 이 기기 안에서만 확인) ----------
// 지문 정보는 기기 밖으로 나오지 않고, 앱은 "본인 확인 성공" 결과만 받는다. 서버 검증 없이 이 기기에서만 쓰는
// 화면 잠금이라 등록한 키의 id만 저장한다. 안드로이드는 지문 대신 휴대폰 화면 잠금 비밀번호로도 통과시킨다.
export const hasBio = () => !!read(KEY)?.bio?.credId;

export async function bioAvailable() {
  try {
    return !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}

export async function enrollBio(displayName = "DayMate") {
  const cfg = read(KEY);
  if (!cfg?.hash) throw new Error("no-lock");
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "DayMate 앱 잠금" },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: displayName, displayName: `${displayName} (앱 잠금)` },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
      timeout: 60000,
      attestation: "none",
    },
  });
  write(KEY, { ...read(KEY), bio: { credId: b64(cred.rawId) } });
}

export function removeBio() {
  const cfg = read(KEY);
  if (cfg?.bio) { const { bio: _b, ...rest } = cfg; write(KEY, rest); }
}

// 지문·얼굴 확인 — 성공하면 true. 취소·실패는 false (오류를 밖으로 던지지 않음)
export async function verifyBio() {
  const credId = read(KEY)?.bio?.credId;
  if (!credId) return false;
  try {
    const res = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: "public-key", id: unb64(credId) }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    // authenticatorData 33번째 바이트의 UV(본인 확인) 플래그 확인
    const flags = new Uint8Array(res.response.authenticatorData)[32];
    if (!(flags & 0x04)) return false;
    write(FAIL_KEY, null);
    return true;
  } catch { return false; }
}

// ---------- 관리자에게 해제 요청 ----------
export const getUnlockRequestAt = () => Number(read(REQ_KEY)) || 0;
export const markUnlockRequested = () => write(REQ_KEY, Date.now());
export const clearUnlockRequest = () => write(REQ_KEY, null);
