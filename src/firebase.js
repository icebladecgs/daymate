import { initializeApp } from "firebase/app";
import { toDateStr } from './utils/date.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import {
  initializeFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  arrayUnion,
  arrayRemove,
  collection,
  getDocs,
  getCountFromServer,
  query,
  where,
  deleteDoc,
  orderBy,
  addDoc,
  onSnapshot,
  limit,
  serverTimestamp,
  Timestamp,
  deleteField,
  runTransaction,
} from "firebase/firestore";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});
// 저장할 데이터에 undefined 값이 섞여 있어도 그 칸만 빼고 저장한다. 설정하지 않으면 setDoc이 저장 전체를 거부하는데
// (예: 할일 '시간 지우기' → time: undefined) 앱은 오류를 무시하고 있어서, 그날 기록이 조용히 서버에 올라가지 않았다 (2026-09-26)
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
export const storage = getStorage(app);

// ---------- Auth ----------
// 로그인할 때마다 구글 계정 고르는 창을 띄운다 (2026-11-01 사용자 결정) — 앱 로그아웃은 크롬의 구글 로그인을 남겨 두어서,
// 다시 로그인하면 구글이 방금 쓴 계정으로 바로 들어가 다른 계정을 고를 수 없었다. 캘린더·드라이브 권한 창에는 넣지 않는다(다른 계정을 고르면 꼬임)
export function googleSignIn() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(auth, provider);
}


export function googleSignOut() {
  return signOut(auth);
}

export function onAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export function isPrimaryAdmin(uid) {
  const adminUid = (import.meta.env.VITE_ADMIN_UID || '').trim();
  return !!uid && !!adminUid && uid === adminUid;
}

// ---------- Firestore helpers ----------

// settings: { name, notifEnabled, alarmTimes, telegram }
export async function saveSettings(uid, data) {
  await setDoc(doc(db, "users", uid, "data", "settings"), data, { merge: true });
}

export async function saveGoals(uid, data) {
  await setDoc(doc(db, "users", uid, "data", "goals"), data);
}

// 날짜 문서의 서버 저장 시각 — 앱으로 돌아올 때 "마지막으로 받은 뒤 바뀐 날짜"만 골라 받는 데 쓴다.
// 기기마다 시계가 달라도 어긋나지 않게 서버 시각(serverTimestamp)으로 기록하고, 앱 데이터에는 넣지 않는다.
const DAY_SYNCED_AT = "_syncedAt";
const readDayDoc = (snap) => {
  const { [DAY_SYNCED_AT]: syncedAt, ...day } = snap.data();
  return { day, ms: syncedAt?.toMillis?.() || 0 };
};

export async function saveDay(uid, dateStr, data) {
  const { [DAY_SYNCED_AT]: _ignored, ...day } = data || {};
  await setDoc(doc(db, "users", uid, "days", dateStr), { ...day, [DAY_SYNCED_AT]: serverTimestamp() });
}

// sinceMs(서버 시각) 이후 저장된 날짜 문서만 — latestMs는 받은 문서 중 가장 늦은 저장 시각
export async function loadDaysChangedSince(uid, sinceMs = 0) {
  const snap = await getDocs(query(
    collection(db, "users", uid, "days"),
    where(DAY_SYNCED_AT, ">", Timestamp.fromMillis(sinceMs)),
  ));
  const days = {};
  let latestMs = sinceMs;
  snap.forEach((d) => {
    const { day, ms } = readDayDoc(d);
    days[d.id] = day;
    latestMs = Math.max(latestMs, ms);
  });
  return { days, latestMs };
}

// 앱 복귀 시 다른 기기에서 바뀐 언젠가할일·목표를 받기 위한 설정·목표 문서 (문서 2개만 읽음)
export async function loadSettingsAndGoals(uid) {
  const [settingsSnap, goalsSnap] = await Promise.all([
    getDoc(doc(db, "users", uid, "data", "settings")),
    getDoc(doc(db, "users", uid, "data", "goals")),
  ]);
  return {
    settings: settingsSnap.exists() ? settingsSnap.data() : null,
    goals: goalsSnap.exists() ? goalsSnap.data() : null,
  };
}

// 로그인 시 Firestore → 앱으로 전체 로드
export async function loadAllFromFirestore(uid) {
  const result = { settings: null, goals: null, days: {}, daysSyncedAt: 0 };

  const settingsSnap = await getDoc(doc(db, "users", uid, "data", "settings"));
  if (settingsSnap.exists()) result.settings = settingsSnap.data();

  const goalsSnap = await getDoc(doc(db, "users", uid, "data", "goals"));
  if (goalsSnap.exists()) result.goals = goalsSnap.data();

  const daysSnap = await getDocs(collection(db, "users", uid, "days"));
  daysSnap.forEach((d) => {
    const { day, ms } = readDayDoc(d);
    result.days[d.id] = day;
    result.daysSyncedAt = Math.max(result.daysSyncedAt, ms);
  });

  return result;
}

// ---------- 보유자산 추이 (2026-11-07) ----------
// users/{uid}/data/pfHistory = { points: { 'YYYY-MM-DD': { u, k, t } } } — 하루 한 점이라 몇 년 쌓여도 작다.
// 날짜 키를 지우는 일이 없어서 맵 + merge 저장으로 둔다(지운 키가 남는 문제 없음). 규칙: users/{uid}/** 본인만
export async function savePfHistoryPoints(uid, points) {
  await setDoc(doc(db, "users", uid, "data", "pfHistory"), { points }, { merge: true });
}
export async function loadPfHistory(uid) {
  const snap = await getDoc(doc(db, "users", uid, "data", "pfHistory"));
  return snap.exists() ? (snap.data().points || {}) : {};
}

// ---------- 내 사람들(인맥) ----------
// settings 문서 하나에 몰아넣지 않고 day처럼 사람별 개별 문서로 저장 — 기록이 쌓여도
// 로그인 시 읽는 단일 settings 문서가 커지지 않고, 문서당 1MiB 한도 위험도 없다.
export async function saveContact(uid, contact) {
  await setDoc(doc(db, "users", uid, "contacts", contact.id), contact);
}

export async function deleteContactDoc(uid, contactId) {
  await deleteDoc(doc(db, "users", uid, "contacts", contactId));
}

export async function loadContacts(uid) {
  const snap = await getDocs(collection(db, "users", uid, "contacts"));
  return snap.docs.map((d) => d.data());
}

// Google Calendar OAuth (Calendar scope)
export function googleSignInWithCalendarScope() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 30000);
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: '9221676076-5ceja00ivoodlv4sqf045sv5poqousi8.apps.googleusercontent.com',
      scope: 'https://www.googleapis.com/auth/calendar',
      prompt: '',
      callback: (response) => {
        clearTimeout(timer);
        if (response.error) { reject(new Error(response.error)); return; }
        resolve({ accessToken: response.access_token, expiresAt: Date.now() + response.expires_in * 1000 });
      },
    });
    client.requestAccessToken();
  });
}

// Google Drive OAuth (drive.file scope — only files created by this app)
export function googleSignInWithDriveScope() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 30000);
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: '9221676076-5ceja00ivoodlv4sqf045sv5poqousi8.apps.googleusercontent.com',
      scope: 'https://www.googleapis.com/auth/drive.file',
      prompt: '',
      callback: (response) => {
        clearTimeout(timer);
        if (response.error) { reject(new Error(response.error)); return; }
        resolve({ accessToken: response.access_token, expiresAt: Date.now() + response.expires_in * 1000 });
      },
    });
    client.requestAccessToken();
  });
}

// ---------- Rankings ----------

// 순위표(rankings)는 로그인한 누구나 읽으므로 이메일을 두지 않는다 (2026-11-09 사용자 결정 — 닉네임만).
// 예전에 저장된 이메일은 다음 저장 때 지운다. 이메일은 관리자만 읽는 users/{uid}에만 있다.
export async function updateRanking(uid, data) {
  const { email: _drop, ...rest } = data || {};
  await setDoc(doc(db, 'rankings', uid), { ...rest, email: deleteField() }, { merge: true });
}
// 관리자 화면: 아직 앱을 안 연 사람의 순위표에 남은 이메일 지우기 (규칙상 관리자는 email 칸 지우기만 할 수 있다)
export async function clearRankingEmails(list) {
  const left = (list || []).filter(r => r?.uid && r.email);
  await Promise.all(left.map(r => updateDoc(doc(db, 'rankings', r.uid), { email: deleteField() }).catch(() => {})));
  return left.length;
}

// 내 초대 코드 등록 (로그인 시 호출, 2026-11-09) — 개인 코드는 userInviteCodes/{코드} = { uid }.
// 예전엔 커뮤니티 코드 저장소(inviteCodes)에 넣었는데 11-01 규칙 변경 뒤로 거절돼 등록이 안 되고 있었다.
// 결과: 'ok' | 'taken'(다른 사람이 이미 쓰는 코드 — 새 코드를 만들어 다시 등록)
export async function registerInviteCode(uid, code) {
  const ref = doc(db, 'userInviteCodes', code);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data()?.uid === uid ? 'ok' : 'taken';
  await setDoc(ref, { uid });
  return 'ok';
}

export async function loadRankings() {
  const snap = await getDocs(collection(db, 'rankings'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

export async function loadRankingProfiles(uids = []) {
  const uniqueUids = [...new Set((uids || []).filter(Boolean))];
  if (uniqueUids.length === 0) return {};

  const snaps = await Promise.all(uniqueUids.map(uid => getDoc(doc(db, 'rankings', uid))));
  return uniqueUids.reduce((acc, uid, index) => {
    acc[uid] = snaps[index].exists()
      ? { uid, ...snaps[index].data() }
      : { uid, totalScore: 0 };
    return acc;
  }, {});
}

// ---------- Admin ----------

// 로그인 시 유저 루트 문서에 메타 저장 (관리자 조회용)
export async function updateUserMeta(uid, data) {
  await setDoc(doc(db, 'users', uid), data, { merge: true });
}

// 전체 유저 메타 목록 (관리자 전용)
export async function loadAllUsersMeta() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

// 특정 유저의 day 기록 수
export async function getUserDaysCount(uid) {
  const snap = await getCountFromServer(collection(db, 'users', uid, 'days'));
  return snap.data().count;
}

// ---------- Community ----------

// 초대 코드·비밀번호는 멤버만 읽는 communities/{id}/private/secret에 둔다 (2026-11-01).
// 커뮤니티 문서는 로그인한 누구나 읽으므로, 거기엔 비밀번호가 있는지(hasPassword)만 남긴다.
// 코드로 찾기는 inviteCodes/{코드} = { communityId }.
export const communitySecretRef = (communityId) => doc(db, 'communities', communityId, 'private', 'secret');

export async function createCommunity(uid, name, nickname, isPublic = false, password = null) {
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const ref = doc(collection(db, 'communities'));
  await setDoc(ref, {
    name, createdBy: uid,
    createdAt: new Date().toISOString(), memberCount: 1,
    isPublic, hasPassword: !!password,
  });
  await setDoc(communitySecretRef(ref.id), { inviteCode: code, password: password || null });
  await setDoc(doc(db, 'inviteCodes', code), { communityId: ref.id });
  await setDoc(doc(db, 'communities', ref.id, 'members', uid), { nickname, joinedAt: new Date().toISOString(), isAdmin: true });
  return { communityId: ref.id, inviteCode: code };
}

// 옛 커뮤니티(문서에 inviteCode·password가 그대로 있는 것)를 새 구조로 옮긴다.
// 커뮤니티 관리자·앱 관리자만 할 수 있다. 옮길 게 없으면 false.
export function isLegacyCommunity(data) {
  return !!data && ('inviteCode' in data || 'password' in data);
}

export async function migrateCommunitySecret(communityId) {
  const snap = await getDoc(doc(db, 'communities', communityId));
  if (!snap.exists() || !isLegacyCommunity(snap.data())) return false;
  const { inviteCode = null, password = null } = snap.data();
  await setDoc(communitySecretRef(communityId), { inviteCode, password: password || null }, { merge: true });
  if (inviteCode) {
    const codeRef = doc(db, 'inviteCodes', inviteCode);
    if (!(await getDoc(codeRef)).exists()) await setDoc(codeRef, { communityId });
  }
  await updateDoc(doc(db, 'communities', communityId), {
    inviteCode: deleteField(), password: deleteField(), hasPassword: !!password,
  });
  return true;
}

export async function loadAllCommunities() {
  const snap = await getDocs(collection(db, 'communities'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// 내가 가입한 커뮤니티 ID 목록을 Firestore에서 복구
export async function loadMyCommunityIds(uid) {
  const allSnap = await getDocs(collection(db, 'communities'));
  const ids = [];
  for (const d of allSnap.docs) {
    const memberSnap = await getDoc(doc(db, 'communities', d.id, 'members', uid));
    if (memberSnap.exists()) ids.push(d.id);
  }
  return ids;
}

// 공개 목록에 보여줄 정보 — 옛 문서에 남아 있는 비밀번호·초대 코드는 빼고 넘긴다
const publicCommunityInfo = (data) => {
  const { password, inviteCode, ...rest } = data; // eslint-disable-line no-unused-vars -- 비밀 칸을 빼고 넘긴다
  return { ...rest, hasPassword: rest.hasPassword ?? !!password };
};

export async function loadPublicCommunities() {
  const q = query(collection(db, 'communities'), where('isPublic', '==', true));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...publicCommunityInfo(d.data()) }));
}

// 공개 목록·초대 코드로 가입. 비밀번호가 있으면 서버가 확인하고 틀린 횟수를 센다(2026-11-08 — 규칙으로는 직접 못 함).
// 비밀번호가 없으면(공개·코드만) 예전처럼 보안 규칙이 코드를 확인한다.
// 실패: Error.message = 'wrong password'(e.left 남은 기회) | 'locked'(e.retryAt) | 'join denied'
export async function joinPublicCommunity(uid, communityId, nickname, password, joinCode = null) {
  if (password) {
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    const r = await fetch('/api/chat?action=community-join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ communityId, nickname, password, joinCode }),
    });
    const body = await r.json().catch(() => ({}));
    if (r.ok) return;
    const err = new Error(body.error === 'wrong-password' ? 'wrong password' : body.error === 'locked' ? 'locked' : 'join denied');
    err.left = body.left; err.retryAt = body.retryAt;
    throw err;
  }
  try {
    await joinCommunity(uid, communityId, nickname, { joinCode, joinKey: password || null });
  } catch (e) {
    if (e?.code === 'permission-denied') throw new Error(password ? 'wrong password' : 'join denied');
    throw e;
  }
}

export async function findCommunityByCode(code) {
  const c = code.trim().toUpperCase();
  const codeSnap = await getDoc(doc(db, 'inviteCodes', c));
  let communityId = codeSnap.exists() ? codeSnap.data().communityId : null;
  if (!communityId) {
    // 아직 옮기지 않은 옛 커뮤니티
    const snap = await getDocs(query(collection(db, 'communities'), where('inviteCode', '==', c)));
    if (snap.empty) return null;
    communityId = snap.docs[0].id;
  }
  const d = await getDoc(doc(db, 'communities', communityId));
  if (!d.exists()) return null;
  return { communityId, ...publicCommunityInfo(d.data()), joinCode: c };
}

export async function joinCommunity(uid, communityId, nickname, { joinCode = null, joinKey = null } = {}) {
  const memberRef = doc(db, 'communities', communityId, 'members', uid);
  const existing = await getDoc(memberRef);
  if (existing.exists()) return; // 이미 가입됨
  const proof = {};
  if (joinCode) proof.joinCode = joinCode;
  if (joinKey) proof.joinKey = joinKey;
  await setDoc(memberRef, { nickname, joinedAt: new Date().toISOString(), isAdmin: false, ...proof });
  // 확인용 값은 가입 뒤 바로 지운다 (멤버 목록에 남지 않게)
  if (Object.keys(proof).length) {
    updateDoc(memberRef, { joinCode: deleteField(), joinKey: deleteField() }).catch(() => {});
  }
  await updateDoc(doc(db, 'communities', communityId), { memberCount: increment(1) });
}

export async function setCommunityPassword(communityId, password) {
  await migrateCommunitySecret(communityId);
  await setDoc(communitySecretRef(communityId), { password: password || null }, { merge: true });
  await updateDoc(doc(db, 'communities', communityId), { hasPassword: !!password });
}

// 커뮤니티 정보 + (멤버면) 초대 코드·비밀번호
export async function loadCommunityData(communityId) {
  const snap = await getDoc(doc(db, 'communities', communityId));
  if (!snap.exists()) return null;
  const data = { id: snap.id, ...snap.data() };
  try {
    const s = await getDoc(communitySecretRef(communityId));
    if (s.exists()) Object.assign(data, { inviteCode: s.data().inviteCode ?? null, password: s.data().password ?? null });
  } catch { /* 멤버가 아니면 읽을 수 없다 */ }
  return data;
}

export async function loadCommunityMembers(communityId) {
  const snap = await getDocs(collection(db, 'communities', communityId, 'members'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

// memberCount는 increment()로 증분 관리라 중간에 쓰기 하나가 실패하면 어긋날 수 있음 —
// 멤버 목록을 실제로 읽을 때마다 실제 개수로 보정 (commentCount의 self-heal과 동일 패턴)
export async function syncCommunityMemberCount(communityId, actualCount) {
  await updateDoc(doc(db, 'communities', communityId), { memberCount: actualCount });
}

export async function loadTodayCommunityEvents(communityIds, date) {
  const results = [];
  for (const communityId of communityIds) {
    // 나간(또는 내보내진) 커뮤니티는 일정을 읽을 수 없다 — 그 하나만 건너뛴다
    const [commSnap, evSnap] = await Promise.all([
      getDoc(doc(db, 'communities', communityId)),
      getDocs(query(collection(db, 'communities', communityId, 'events'), where('date', '==', date))),
    ]).catch(() => [null, null]);
    if (!commSnap?.exists()) continue;
    const communityName = commSnap.data().name || '커뮤니티';
    evSnap.docs.forEach(d => results.push({ id: d.id, ...d.data(), communityId, communityName }));
  }
  return results;
}

// 커뮤니티 "최근 활동" — 출석·채팅·게시판 글·댓글·공지·일정 때 서버 시각으로 (2026-11-03).
// 예전엔 출석·채팅·게시판 새 글 때만, 쓴 사람 기기 시계로 기록했다. 실패해도 글쓰기는 그대로 (보안 규칙: 멤버는 이 칸만 바꿀 수 있음)
// ── 협동 보스전 (2026-11-08, 계산은 utils/bossRaid.js) ──
// communities/{id}/raids/{주 월요일} = { week, level, bossId, hpMax, createdAt, defeatedAt?, defeatedBy? }
// communities/{id}/raids/{주}/hits/{uid} = { uid, nickname, dmg, byStat, at } — 본인 것만 쓴다
const raidRef = (cid, week) => doc(db, 'communities', cid, 'raids', week);
export async function loadRaid(cid, week) {
  const [r, h] = await Promise.all([getDoc(raidRef(cid, week)), getDocs(collection(db, 'communities', cid, 'raids', week, 'hits'))]);
  return { raid: r.exists() ? { id: r.id, ...r.data() } : null, hits: h.docs.map(d => ({ id: d.id, ...d.data() })) };
}
// 이번 주 보스가 없으면 만든다 (여러 멤버가 동시에 열어도 하나만 — 트랜잭션)
export async function ensureRaid(cid, week, { level, bossId, hpMax }) {
  return runTransaction(db, async (tx) => {
    const ref = raidRef(cid, week);
    const snap = await tx.get(ref);
    if (snap.exists()) return { id: snap.id, ...snap.data() };
    const data = { week, level, bossId, hpMax, createdAt: new Date().toISOString() };
    tx.set(ref, data);
    return { id: week, ...data };
  });
}
export function saveRaidHit(cid, week, uid, { nickname, dmg, byStat }) {
  return setDoc(doc(db, 'communities', cid, 'raids', week, 'hits', uid),
    { uid, nickname: nickname || '', dmg, byStat: byStat || {}, at: new Date().toISOString() });
}
// 처치 표시 — 먼저 표시한 한 사람만 true (채팅 한 줄을 그 사람이 남긴다)
export async function markRaidDefeated(cid, week, uid) {
  return runTransaction(db, async (tx) => {
    const ref = raidRef(cid, week);
    const snap = await tx.get(ref);
    if (!snap.exists() || snap.data().defeatedAt) return false;
    tx.update(ref, { defeatedAt: new Date().toISOString(), defeatedBy: uid });
    return true;
  });
}

export function touchCommunity(communityId) {
  return updateDoc(doc(db, 'communities', communityId), { lastActivityAt: serverTimestamp() }).catch(() => {});
}

export async function addCommunityEvent(communityId, event) {
  const ref = doc(collection(db, 'communities', communityId, 'events'));
  await setDoc(ref, { ...event, createdAt: new Date().toISOString() });
  touchCommunity(communityId);
  return ref.id;
}

export async function deleteCommunityEvent(communityId, eventId) {
  await deleteDoc(doc(db, 'communities', communityId, 'events', eventId));
}

export async function checkinCommunity(communityId, uid, nickname, completionRate) {
  const now = new Date();
  const today = toDateStr(now);
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  const yesterday = toDateStr(yest);

  const ref = doc(db, 'communities', communityId, 'checkins', uid);
  const existing = await getDoc(ref);
  const prev = existing.exists() ? existing.data() : {};
  const streak = prev.lastCheckin === yesterday
    ? (prev.streak || 1) + 1
    : prev.lastCheckin === today
      ? (prev.streak || 1)
      : 1;
  await setDoc(ref, { uid, nickname, date: today, completionRate: completionRate ?? null, streak, lastCheckin: today, checkedAt: new Date().toISOString() });
  touchCommunity(communityId);
}

export async function updateMemberNickname(communityId, uid, nickname) {
  await setDoc(doc(db, 'communities', communityId, 'members', uid), { nickname }, { merge: true });
  // 오늘 출석 기록에도 닉네임 반영 (문서가 없으면 무시)
  const checkinRef = doc(db, 'communities', communityId, 'checkins', uid);
  const snap = await getDoc(checkinRef);
  if (snap.exists()) await setDoc(checkinRef, { nickname }, { merge: true });
}

export async function leaveCommunity(communityId, uid) {
  await deleteDoc(doc(db, 'communities', communityId, 'members', uid));
  await updateDoc(doc(db, 'communities', communityId), { memberCount: increment(-1) });
}

export async function deleteCommunityFull(communityId) {
  let inviteCode = null;
  try {
    const s = await getDoc(communitySecretRef(communityId));
    inviteCode = s.data()?.inviteCode || null;
  } catch { /* 옮기기 전 커뮤니티 */ }
  if (inviteCode) await deleteDoc(doc(db, 'inviteCodes', inviteCode)).catch(() => {});
  await deleteDoc(communitySecretRef(communityId)).catch(() => {});
  const subcollections = ['members', 'events', 'checkins', 'notices', 'board', 'chat'];
  for (const sub of subcollections) {
    const snap = await getDocs(collection(db, 'communities', communityId, sub));
    for (const d of snap.docs) {
      if (sub === 'notices' || sub === 'board') {
        const commSnap = await getDocs(collection(db, 'communities', communityId, sub, d.id, 'comments'));
        for (const c of commSnap.docs) await deleteDoc(c.ref);
      }
      await deleteDoc(d.ref);
    }
  }
  await deleteDoc(doc(db, 'communities', communityId));
}

// ---------- 오류 기록 (관리자 화면 → 오류 탭) ----------
// errorLogs/{id} = { uid, kind, msg, stack, where, version, platform, at(ISO) } — 쓰기는 utils/errorReport.js
export async function loadErrorLogs(max = 300) {
  const snap = await getDocs(query(collection(db, 'errorLogs'), orderBy('at', 'desc'), limit(max)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function deleteErrorLogs(ids) {
  await Promise.all(ids.map(id => deleteDoc(doc(db, 'errorLogs', id))));
}

// 30일 지난 기록 정리 (관리자 화면을 열 때)
export async function purgeOldErrorLogs(days = 30) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const snap = await getDocs(query(collection(db, 'errorLogs'), where('at', '<', cutoff), limit(300)));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  return snap.size;
}

// ---------- 📋 업그레이드 할 일 (관리자 화면, 앱 관리자만 — firestore.rules adminRoadmap) ----------
export async function loadRoadmap() {
  const snap = await getDocs(collection(db, 'adminRoadmap'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// id가 없으면 새로 만든다. 문의·제안에서 옮길 때는 id를 `s_제안id`로 줘서 두 번 들어가지 않게 한다.
export async function saveRoadmapItem(item) {
  const id = item.id || doc(collection(db, 'adminRoadmap')).id;
  const data = {
    text: String(item.text || '').trim().slice(0, 500),
    note: String(item.note || '').slice(0, 3000),
    status: ['todo', 'doing', 'done'].includes(item.status) ? item.status : 'todo',
    pri: ['high', 'normal', 'low'].includes(item.pri) ? item.pri : 'normal',
    createdAt: item.createdAt || new Date().toISOString(),
    doneAt: item.status === 'done' ? (item.doneAt || new Date().toISOString()) : null,
    from: item.from || '',
  };
  await setDoc(doc(db, 'adminRoadmap', id), data);
  return { id, ...data };
}

export async function roadmapItemExists(id) {
  return (await getDoc(doc(db, 'adminRoadmap', id))).exists();
}

export async function deleteRoadmapItem(id) {
  await deleteDoc(doc(db, 'adminRoadmap', id));
}

// ---------- 커뮤니티 단체 채팅 ----------
// communities/{id}/chat/{msgId} = { uid, nickname, text, photos: [{url, path}], createdAt(ISO) }
// 읽기·쓰기는 멤버만, 삭제는 보낸 사람·커뮤니티 관리자·앱 관리자 (보안 규칙). 수정은 없다.
export const chatQuery = (communityId, n = 50) =>
  query(collection(db, 'communities', communityId, 'chat'), orderBy('createdAt', 'desc'), limit(n));

export async function addChatMessage(communityId, msg) {
  const createdAt = new Date().toISOString();
  const ref = await addDoc(collection(db, 'communities', communityId, 'chat'), { ...msg, createdAt });
  touchCommunity(communityId);
  return { id: ref.id, createdAt };
}

export async function deleteChatMessage(communityId, msgId) {
  await deleteDoc(doc(db, 'communities', communityId, 'chat', msgId));
}

// 화면 위쪽 "이전 대화 더 보기" — before(ISO)보다 앞선 메시지 n개 (최신순)
export async function loadOlderChat(communityId, before, n = 50) {
  const q = query(collection(db, 'communities', communityId, 'chat'), where('createdAt', '<', before), orderBy('createdAt', 'desc'), limit(n));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// 안 읽은 메시지 수 — since(ISO) 뒤에 온 메시지 (개수만 세서 읽기 비용이 적다)
export async function countChatSince(communityId, since) {
  return countCommunitySince(communityId, 'chat', since);
}

// 커뮤니티 채팅·게시판·공지에서 since(ISO) 뒤에 생긴 글 수 — 개수만 센다(내용은 안 받음). 새 소식 숫자용 (2026-11-03)
export async function countCommunitySince(communityId, sub, since) {
  const base = collection(db, 'communities', communityId, sub);
  const q = since ? query(base, where('createdAt', '>', since)) : base;
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

// ---------- 커뮤니티 자유게시판 ----------

export async function addBoardPost(communityId, post) {
  const ref = doc(collection(db, 'communities', communityId, 'board'));
  await setDoc(ref, { ...post, createdAt: new Date().toISOString() });
  touchCommunity(communityId);
  return ref.id;
}

export async function deleteBoardPost(communityId, postId) {
  await deleteDoc(doc(db, 'communities', communityId, 'board', postId));
}

export async function updateBoardPost(communityId, postId, updates) {
  await updateDoc(doc(db, 'communities', communityId, 'board', postId), { ...updates, editedAt: new Date().toISOString() });
}

export async function addBoardComment(communityId, postId, comment) {
  const ref = doc(collection(db, 'communities', communityId, 'board', postId, 'comments'));
  await setDoc(ref, { ...comment, createdAt: new Date().toISOString(), likedBy: [] });
  await updateDoc(doc(db, 'communities', communityId, 'board', postId), { commentCount: increment(1) });
  touchCommunity(communityId);
  return ref.id;
}

export async function deleteBoardComment(communityId, postId, commentId) {
  await deleteDoc(doc(db, 'communities', communityId, 'board', postId, 'comments', commentId));
  await updateDoc(doc(db, 'communities', communityId, 'board', postId), { commentCount: increment(-1) });
}

export async function syncBoardCommentCount(communityId, postId, actualCount) {
  await updateDoc(doc(db, 'communities', communityId, 'board', postId), { commentCount: actualCount });
}

export async function toggleBoardCommentLike(communityId, postId, commentId, uid) {
  const ref = doc(db, 'communities', communityId, 'board', postId, 'comments', commentId);
  const snap = await getDoc(ref);
  const likedBy = snap.data()?.likedBy || [];
  const isLiked = likedBy.includes(uid);
  await updateDoc(ref, { likedBy: isLiked ? arrayRemove(uid) : arrayUnion(uid) });
  return !isLiked;
}

export async function addCommunityNotice(communityId, notice) {
  const ref = doc(collection(db, 'communities', communityId, 'notices'));
  await setDoc(ref, { ...notice, createdAt: new Date().toISOString() });
  touchCommunity(communityId);
  return ref.id;
}

export async function deleteCommunityNotice(communityId, noticeId) {
  await deleteDoc(doc(db, 'communities', communityId, 'notices', noticeId));
}

export async function addNoticeComment(communityId, noticeId, comment) {
  const ref = doc(collection(db, 'communities', communityId, 'notices', noticeId, 'comments'));
  await setDoc(ref, { ...comment, createdAt: new Date().toISOString(), likedBy: [] });
  await updateDoc(doc(db, 'communities', communityId, 'notices', noticeId), { commentCount: increment(1) });
  touchCommunity(communityId);
  return ref.id;
}

export async function deleteNoticeComment(communityId, noticeId, commentId) {
  await deleteDoc(doc(db, 'communities', communityId, 'notices', noticeId, 'comments', commentId));
  await updateDoc(doc(db, 'communities', communityId, 'notices', noticeId), { commentCount: increment(-1) });
}

export async function syncNoticeCommentCount(communityId, noticeId, actualCount) {
  await updateDoc(doc(db, 'communities', communityId, 'notices', noticeId), { commentCount: actualCount });
}

export async function toggleCommentLike(communityId, noticeId, commentId, uid) {
  const ref = doc(db, 'communities', communityId, 'notices', noticeId, 'comments', commentId);
  const snap = await getDoc(ref);
  const likedBy = snap.data()?.likedBy || [];
  const isLiked = likedBy.includes(uid);
  await updateDoc(ref, { likedBy: isLiked ? arrayRemove(uid) : arrayUnion(uid) });
  return !isLiked;
}

// ---------- 자유게시판 (전체 공개, 커뮤니티 소속 무관) ----------

export async function updateFreeboardNickname(uid, nickname) {
  await setDoc(doc(db, 'users', uid), { freeboardNickname: nickname }, { merge: true });
}

export async function addFreeBoardPost(post) {
  const ref = doc(collection(db, 'publicBoard'));
  await setDoc(ref, { ...post, createdAt: new Date().toISOString() });
  return ref.id;
}

export async function deleteFreeBoardPost(postId) {
  await deleteDoc(doc(db, 'publicBoard', postId));
}

export async function updateFreeBoardPost(postId, updates) {
  await updateDoc(doc(db, 'publicBoard', postId), { ...updates, editedAt: new Date().toISOString() });
}

export async function addFreeBoardComment(postId, comment) {
  const ref = doc(collection(db, 'publicBoard', postId, 'comments'));
  await setDoc(ref, { ...comment, createdAt: new Date().toISOString(), likedBy: [] });
  await updateDoc(doc(db, 'publicBoard', postId), { commentCount: increment(1) });
  return ref.id;
}

export async function deleteFreeBoardComment(postId, commentId) {
  await deleteDoc(doc(db, 'publicBoard', postId, 'comments', commentId));
  await updateDoc(doc(db, 'publicBoard', postId), { commentCount: increment(-1) });
}

export async function syncFreeBoardCommentCount(postId, actualCount) {
  await updateDoc(doc(db, 'publicBoard', postId), { commentCount: actualCount });
}

export async function toggleFreeBoardCommentLike(postId, commentId, uid) {
  const ref = doc(db, 'publicBoard', postId, 'comments', commentId);
  const snap = await getDoc(ref);
  const likedBy = snap.data()?.likedBy || [];
  const isLiked = likedBy.includes(uid);
  await updateDoc(ref, { likedBy: isLiked ? arrayRemove(uid) : arrayUnion(uid) });
  return !isLiked;
}

// ---------- 투자일기 ----------

export async function saveInvestLog(uid, log) {
  const ref = doc(collection(db, 'users', uid, 'invest_logs'));
  const id = ref.id;
  await setDoc(ref, { ...log, id, createdAt: new Date().toISOString() });
  return id;
}

export async function loadInvestLogs(uid) {
  const snap = await getDocs(collection(db, 'users', uid, 'invest_logs'));
  return snap.docs
    .map(d => ({ ...d.data(), id: d.id }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateInvestLog(uid, logId, patch) {
  await setDoc(doc(db, 'users', uid, 'invest_logs', logId), patch, { merge: true });
}

export async function deleteInvestLog(uid, logId) {
  await deleteDoc(doc(db, 'users', uid, 'invest_logs', logId));
}

// ---------- Firestore (local → cloud) ----------

// localStorage 데이터를 Firestore로 최초 업로드 (Firestore가 비어있을 때)
export async function uploadLocalToFirestore(uid, localData) {
  const { settings, goals, days } = localData;
  if (settings) await saveSettings(uid, settings);
  if (goals) await saveGoals(uid, goals);
  for (const [dateStr, dayData] of Object.entries(days)) {
    await saveDay(uid, dateStr, dayData);
  }
}

// ---------- 제안하기 ----------

export async function submitSuggestion(uid, maskedEmail, text) {
  await addDoc(collection(db, 'suggestions'), {
    uid,
    maskedEmail,
    text,
    status: 'pending',
    adminReply: null,
    createdAt: new Date().toISOString(),
    repliedAt: null,
  });
}

export async function loadSuggestions() {
  const snap = await getDocs(query(collection(db, 'suggestions'), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ ...d.data(), id: d.id }));
}

export async function replySuggestion(id, reply) {
  await setDoc(doc(db, 'suggestions', id), {
    adminReply: reply,
    status: 'answered',
    repliedAt: new Date().toISOString(),
  }, { merge: true });
}

export async function getPendingSuggestionsCount() {
  const snap = await getCountFromServer(query(collection(db, 'suggestions'), where('status', '==', 'pending')));
  return snap.data().count;
}

// ---------- 앱 잠금 해제 요청 (비밀번호를 잊었을 때 관리자에게) ----------
// 요청은 제안 게시판(suggestions)에 kind: 'appLock'으로 들어가고, 관리자가 풀어 주면
// appLockResets/{기기 잠금 id}에 표시가 생긴다. 잠긴 기기는 이 표시를 확인하고 잠금을 푼 뒤 표시를 지운다.

export async function requestAppUnlock(uid, maskedEmail, lockId, platform, note) {
  await addDoc(collection(db, 'suggestions'), {
    uid,
    maskedEmail,
    kind: 'appLock',
    lockId,
    platform,
    text: `🔒 앱 잠금 해제 요청 (${platform})${note ? `\n${note}` : ''}`,
    status: 'pending',
    adminReply: null,
    createdAt: new Date().toISOString(),
    repliedAt: null,
  });
}

export async function approveAppUnlock(suggestionId, uid, lockId) {
  await setDoc(doc(db, 'appLockResets', lockId), { uid, at: new Date().toISOString() });
  await setDoc(doc(db, 'suggestions', suggestionId), {
    adminReply: '잠금을 풀었어요. 1시간 안에 앱을 열면 풀려요. 설정 → 앱 관리에서 새 비밀번호를 정해 주세요.',
    status: 'answered',
    repliedAt: new Date().toISOString(),
    unlockedAt: new Date().toISOString(),
  }, { merge: true });
}

// 이 기기의 해제 표시가 있고 1시간 안이면 true (확인 후 표시는 지운다)
export async function consumeAppUnlock(lockId, validMs) {
  const ref = doc(db, 'appLockResets', lockId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  const fresh = Date.now() - new Date(snap.data().at).getTime() < validMs;
  await deleteDoc(ref).catch(() => {});
  return fresh;
}

// ---------- 챌린지 ----------

export async function createChallenge(uid, nickname, data) {
  const today = toDateStr();
  const hostChallengesSnap = await getDocs(query(collection(db, 'challenges'), where('hostUid', '==', uid)));
  const activeHostedChallenges = hostChallengesSnap.docs.filter((challengeDoc) => {
    const challenge = challengeDoc.data() || {};
    if (challenge.status && challenge.status !== 'open') return false;
    if (challenge.endDate && challenge.endDate < today) return false;
    return true;
  });

  if (activeHostedChallenges.length >= 3) {
    throw new Error('challenge_limit_reached');
  }

  if (data?.endDate) {
    const maxAllowedEndDate = toDateStr(new Date(Date.now() + 1000 * 60 * 60 * 24 * 90));
    if (data.endDate < today) throw new Error('invalid_end_date');
    if (data.endDate > maxAllowedEndDate) throw new Error('end_date_too_far');
  }

  const ref = doc(collection(db, 'challenges'));
  await setDoc(ref, {
    ...data,
    hostUid: uid,
    hostNickname: nickname,
    memberCount: 1,
    createdAt: new Date().toISOString(),
    status: 'open',
  });
  await setDoc(doc(db, 'challenges', ref.id, 'members', uid), {
    nickname,
    joinedAt: new Date().toISOString(),
    streak: 0,
    totalCerts: 0,
    lastCertDate: null,
  });
  return ref.id;
}

export async function loadPublicChallenges() {
  const q = query(collection(db, 'challenges'), where('isPublic', '==', true));
  const snap = await getDocs(q);
  const today = toDateStr();
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter((challenge) => (challenge.status || 'open') === 'open' && (!challenge.endDate || challenge.endDate >= today))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function loadMyChallenges(uid) {
  const allSnap = await getDocs(collection(db, 'challenges'));
  const all = allSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  // 순차 await 대신 Promise.all로 병렬 조회
  const memberSnaps = await Promise.all(
    all.map(ch => getDoc(doc(db, 'challenges', ch.id, 'members', uid)))
  );
  return all
    .map((ch, i) => memberSnaps[i].exists() ? { ...ch, myMember: memberSnaps[i].data() } : null)
    .filter(Boolean);
}

export async function joinChallenge(uid, nickname, challengeId) {
  const challengeSnap = await getDoc(doc(db, 'challenges', challengeId));
  if (!challengeSnap.exists()) throw new Error('challenge_not_found');

  const today = toDateStr();
  const challenge = challengeSnap.data() || {};
  if ((challenge.status && challenge.status !== 'open') || (challenge.endDate && challenge.endDate < today)) {
    throw new Error('challenge_closed');
  }

  const memberRef = doc(db, 'challenges', challengeId, 'members', uid);
  const existing = await getDoc(memberRef);
  if (existing.exists()) return;
  await setDoc(memberRef, { nickname, joinedAt: new Date().toISOString(), streak: 0, totalCerts: 0, lastCertDate: null });
  await updateDoc(doc(db, 'challenges', challengeId), { memberCount: increment(1) });
}

export async function updateMemberLinkedHabit(challengeId, uid, habitId) {
  await setDoc(doc(db, 'challenges', challengeId, 'members', uid), { linkedHabitId: habitId || null }, { merge: true });
}

export async function certifyChallenge(uid, nickname, challengeId, text) {
  const today = toDateStr();
  const challengeSnap = await getDoc(doc(db, 'challenges', challengeId));
  if (!challengeSnap.exists()) throw new Error('challenge_not_found');

  const challenge = challengeSnap.data() || {};
  if (challenge.status && challenge.status !== 'open') throw new Error('challenge_closed');
  if (challenge.endDate && challenge.endDate < today) throw new Error('challenge_closed');

  // 중복 인증 방지
  const q = query(collection(db, 'challenges', challengeId, 'certs'), where('uid', '==', uid), where('dateKey', '==', today));
  const existing = await getDocs(q);
  if (!existing.empty) throw new Error('already_certified');

  const ref = doc(collection(db, 'challenges', challengeId, 'certs'));
  await setDoc(ref, { uid, nickname, dateKey: today, text, createdAt: new Date().toISOString(), cheerCount: 0 });

  // streak 업데이트
  const memberRef = doc(db, 'challenges', challengeId, 'members', uid);
  const memberSnap = await getDoc(memberRef);
  const member = memberSnap.data() || {};
  const yesterday = toDateStr(new Date(Date.now() - 86400000));
  const newStreak = member.lastCertDate === yesterday ? (member.streak || 0) + 1 : 1;
  await setDoc(memberRef, { streak: newStreak, totalCerts: (member.totalCerts || 0) + 1, lastCertDate: today }, { merge: true });
  return ref.id;
}

export async function loadChallengeCerts(challengeId) {
  const q = query(collection(db, 'challenges', challengeId, 'certs'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function deleteCert(challengeId, certId) {
  await deleteDoc(doc(db, 'challenges', challengeId, 'certs', certId));
}

export async function cheerCert(challengeId, certId) {
  await updateDoc(doc(db, 'challenges', challengeId, 'certs', certId), { cheerCount: increment(1) });
}

export async function loadChallengeMembers(challengeId) {
  const snap = await getDocs(collection(db, 'challenges', challengeId, 'members'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() })).sort((a, b) => (b.streak || 0) - (a.streak || 0));
}

export async function syncChallengeMemberCount(challengeId, actualCount) {
  await updateDoc(doc(db, 'challenges', challengeId), { memberCount: actualCount });
}

// 챌린지를 만든 사람이 나가면 관리자 권한이 영영 사라지므로, 남은 멤버 중
// 가장 먼저 가입한 사람에게 승계 (Community.jsx의 createdBy와 동일 개념)
export async function transferCommunityAdmin(communityId, newAdminUid) {
  await updateDoc(doc(db, 'communities', communityId), { createdBy: newAdminUid });
}

export async function deleteChallengeFull(challengeId, actorUid) {
  if (!actorUid) throw new Error('missing_actor');

  if (!isPrimaryAdmin(actorUid)) throw new Error('admin_only');

  for (const sub of ['members', 'certs']) {
    const snap = await getDocs(collection(db, 'challenges', challengeId, sub));
    for (const d of snap.docs) await deleteDoc(d.ref);
  }
  await deleteDoc(doc(db, 'challenges', challengeId));
}

export async function endChallenge(challengeId, actorUid) {
  if (!actorUid) throw new Error('missing_actor');

  if (!isPrimaryAdmin(actorUid)) throw new Error('admin_only');

  await updateDoc(doc(db, 'challenges', challengeId), {
    status: 'ended',
    endedAt: new Date().toISOString(),
  });
}

export async function loadAllChallenges() {
  const snap = await getDocs(collection(db, 'challenges'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

// ---------- 텔레그램 연결 ----------

// 연결 코드 생성 (클라이언트에서 Firestore에 직접 저장)
// 텔레그램 봇이 만든 지 10분 안에만 받아 준다(api/telegram-webhook.js). 맞히기 어렵게 안전한 난수 12자리.
export async function saveTgConnectCode(uid) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => chars[b % chars.length]).join('');
  await setDoc(doc(db, 'tg_connect', code), {
    uid,
    createdAt: new Date().toISOString(),
  });
  return code;
}

// tg_users/{uid} 실시간 감지 — 연결 완료 시 콜백 호출
export function onTgConnected(uid, callback) {
  return onSnapshot(doc(db, 'tg_users', uid), (snap) => {
    if (snap.exists()) callback(snap.data());
  });
}

// 텔레그램 연결 해제
export async function disconnectTelegram(uid) {
  await deleteDoc(doc(db, 'tg_users', uid));
}

// 연결된 chatId 조회
export async function getTgChatId(uid) {
  const snap = await getDoc(doc(db, 'tg_users', uid));
  return snap.exists() ? snap.data().chatId : null;
}

// ---------- 오답 노트 (수험생 모드, 2026-11-01) ----------
// users/{uid}/wrongNotes/{id} = { sub, unit, reason, memo, photos:[{url,path}], answerPhotos, ds, createdAt,
//   step, due, done, reviews:[{ds, ok}], updatedAt } — 본인만 읽고 씀(users/{uid}/** 규칙). 사진은 users/{uid}/wrong/
export async function loadWrongNotes(uid) {
  const snap = await getDocs(collection(db, 'users', uid, 'wrongNotes'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveWrongNote(uid, note) {
  const { id, ...rest } = note;
  await setDoc(doc(db, 'users', uid, 'wrongNotes', id), { ...rest, updatedAt: new Date().toISOString() });
}

export async function deleteWrongNote(uid, id) {
  await deleteDoc(doc(db, 'users', uid, 'wrongNotes', id));
}

// ---------- 사진 업로드 (메모/일기/게시판 공용) ----------

export async function uploadPhoto(path, blob, uid) {
  const r = storageRef(storage, path);
  await uploadBytes(r, blob, { contentType: 'image/jpeg', customMetadata: { uid } });
  const url = await getDownloadURL(r);
  return { url, path };
}

export async function deletePhoto(path) {
  if (!path) return;
  try { await deleteObject(storageRef(storage, path)); } catch { /* best-effort */ }
}
