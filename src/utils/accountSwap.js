// 같은 기기에서 계정을 바꿀 때 이 기기 기록을 계정별로 바꿔 끼운다 (2026-11-01, ChatGPT 검토로 발견).
// 예전엔 로그아웃해도 이 기기 기록이 남고, 다른 계정으로 로그인하면 그 기록이 새 계정으로 올라갔다(테스트 계정 로그인 등).
//
// · 앱이 쓰는 저장 이름(dm_…)은 그대로 두고, 이 기기 기록의 주인(OWNER_KEY)만 기억한다.
// · 다른 계정으로 로그인하면: 이전 계정 기록을 IndexedDB 보관함(계정별)에 넣고 → 지우고 → 새 계정 보관함이 있으면 꺼낸 뒤
//   앱을 새로 연다(화면 상태가 모두 저장소에서 다시 시작되도록). 못 올린 기록(dm_unsynced_days)도 그 계정 보관함에 같이 들어가
//   그 계정으로 다시 로그인할 때 올라간다 — 다른 계정으로는 절대 올라가지 않는다.
// · 주인이 없으면(로그인 없이 쓰던 기록, 또는 이 기능 전부터 쓰던 기기) 지금처럼 로그인한 계정의 것으로 삼는다
//   — "로그인 전 메모는 로그인 때 계정으로 올라간다"(CLAUDE.md 14.6 LoginNotice)를 그대로 지킨다.
// · 기기마다 따로인 설정(앱 잠금·새 디자인·글씨 크기·알림 소리 등)은 계정과 상관없이 그대로 둔다.
//   새 저장 이름은 따로 적지 않으면 계정 기록으로 본다(다른 계정에 보이지 않는 쪽이 안전).
import { freezeStore } from "./storage.js";

export const OWNER_KEY = "dm_local_owner";
const DEVICE_KEYS = new Set([
  "dm_app_lock", "dm_app_lock_fail", "dm_app_lock_req", "dm_first_run_done", "dm_font_scale", "dm_theme",
  "dm_today_new_look", "dm_today_done_group", "dm_memo_autolist", "dm_battle_skip_scene", "dm_battle_stats_open",
  "dm_chat_sound", "dm_community_sound", "dm_chunk_reload_at", "dm_desktop_update_snooze", "dm_install_dismissed",
  "dm_seen_app_commit", "dm_shortcut_tip_dismissed", "dm_home_mode", "dm_home_prefs", "dm_home_section_order",
  "dm_open_settings_subpage", "dm_pf_display_currency",
  "dm_notif_sound", "dm_notif_sound_style", "dm_notif_tts", "dm_notif_vibration",
]);
const DEVICE_PREFIXES = ["dm_section_open_", "dm_fx_usd_krw_"];
export const isAccountKey = (k) => k.startsWith("dm_") && k !== OWNER_KEY && !DEVICE_KEYS.has(k) && !DEVICE_PREFIXES.some(p => k.startsWith(p));

// 계정별 보관함 (IndexedDB — localStorage는 5MB 남짓이라 두 계정 기록을 같이 두기엔 좁다)
const DB = "dm-accounts", STORE = "archives";
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idb(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
const archiveGet = (uid) => idb("readonly", s => s.get(uid));
const archivePut = (uid, data) => idb("readwrite", s => s.put(data, uid));
const archiveDelete = (uid) => idb("readwrite", s => s.delete(uid));

export const localOwner = () => { try { return localStorage.getItem(OWNER_KEY) || ""; } catch { return ""; } };

// 로그인 직후 가장 먼저 부른다. "ok" = 이 기기 기록이 이 계정 것(그대로 진행), "swapped" = 바꿔 끼움(앱을 새로 열 것),
// "failed" = 보관하지 못함(기록이 섞이지 않게 로그인을 멈출 것 — 이전 계정 기록은 손대지 않은 상태)
export async function prepareAccount(uid) {
  const owner = localOwner();
  if (owner === uid) return "ok";
  if (!owner) { localStorage.setItem(OWNER_KEY, uid); return "ok"; }
  const keys = Object.keys(localStorage).filter(isAccountKey);
  const data = Object.fromEntries(keys.map(k => [k, localStorage.getItem(k)]));
  freezeStore(true); // 바꾸는 동안 앱이 저장소에 쓰지 않게 (새로 열 때까지)
  try {
    if (keys.length) {
      await archivePut(owner, data);
      const back = await archiveGet(owner);
      if (!back || Object.keys(back).length !== keys.length) throw new Error("보관 확인 실패");
    }
  } catch (e) {
    freezeStore(false);
    console.error("[accountSwap] 이전 계정 기록을 보관하지 못함", e);
    return "failed";
  }
  keys.forEach(k => localStorage.removeItem(k));
  const restore = await archiveGet(uid).catch(() => null);
  if (restore) {
    Object.entries(restore).forEach(([k, v]) => { if (isAccountKey(k) && typeof v === "string") localStorage.setItem(k, v); });
    await archiveDelete(uid).catch(() => {});
  }
  localStorage.setItem(OWNER_KEY, uid);
  try { sessionStorage.setItem("dm_account_swapped", restore ? "back" : "new"); } catch { /* 안내만 못 띄움 */ }
  return "swapped";
}
