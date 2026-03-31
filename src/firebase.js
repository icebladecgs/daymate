import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  getCountFromServer,
  query,
  where,
  deleteDoc,
  orderBy,
  addDoc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBjMy6mpY0A_1h8X5D-7BkMFzpehIq_d4o",
  authDomain: "daymate-a9ff6.firebaseapp.com",
  projectId: "daymate-a9ff6",
  storageBucket: "daymate-a9ff6.firebasestorage.app",
  messagingSenderId: "9221676076",
  appId: "1:9221676076:web:c2dbada9d6b87c91818589",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// ---------- Auth ----------
export function googleSignIn() {
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export function googleSignOut() {
  return signOut(auth);
}

export function onAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

// ---------- Firestore helpers ----------

// settings: { name, notifEnabled, alarmTimes, telegram }
export async function saveSettings(uid, data) {
  await setDoc(doc(db, "users", uid, "data", "settings"), data, { merge: true });
}

export async function saveGoals(uid, data) {
  await setDoc(doc(db, "users", uid, "data", "goals"), data);
}

export async function saveDay(uid, dateStr, data) {
  await setDoc(doc(db, "users", uid, "days", dateStr), data);
}

// 로그인 시 Firestore → 앱으로 전체 로드
export async function loadAllFromFirestore(uid) {
  const result = { settings: null, goals: null, days: {} };

  const settingsSnap = await getDoc(doc(db, "users", uid, "data", "settings"));
  if (settingsSnap.exists()) result.settings = settingsSnap.data();

  const goalsSnap = await getDoc(doc(db, "users", uid, "data", "goals"));
  if (goalsSnap.exists()) result.goals = goalsSnap.data();

  const daysSnap = await getDocs(collection(db, "users", uid, "days"));
  daysSnap.forEach((d) => { result.days[d.id] = d.data(); });

  return result;
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

export async function updateRanking(uid, data) {
  await setDoc(doc(db, 'rankings', uid), data, { merge: true });
}

// 내 초대 코드를 inviteCodes 컬렉션에 등록 (로그인 시 호출)
export async function registerInviteCode(uid, code) {
  await setDoc(doc(db, 'inviteCodes', code), { uid }, { merge: true });
}

// 초대 코드 사용 → 코드 주인의 inviteCount 증가
export async function recordInviteUse(code) {
  const snap = await getDoc(doc(db, 'inviteCodes', code));
  if (!snap.exists()) return;
  const { uid } = snap.data();
  await setDoc(doc(db, 'rankings', uid), {
    inviteCount: (((await getDoc(doc(db, 'rankings', uid))).data()?.inviteCount) || 0) + 1,
  }, { merge: true });
}

export async function loadRankings() {
  const snap = await getDocs(collection(db, 'rankings'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
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

// admin/config 문서의 uids 배열에 포함 여부 확인
export async function checkIsAdmin(uid) {
  const snap = await getDoc(doc(db, 'admin', 'config')); // 에러는 caller에서 처리
  if (!snap.exists()) return false;
  return (snap.data().uids || []).includes(uid);
}

// ---------- Community ----------

export async function createCommunity(uid, name, nickname, isPublic = false, password = null) {
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const ref = doc(collection(db, 'communities'));
  await setDoc(ref, {
    name, createdBy: uid, inviteCode: code,
    createdAt: new Date().toISOString(), memberCount: 1,
    isPublic, password: isPublic ? (password || null) : null,
  });
  await setDoc(doc(db, 'communities', ref.id, 'members', uid), { nickname, joinedAt: new Date().toISOString(), isAdmin: true });
  return { communityId: ref.id, inviteCode: code };
}

export async function loadPublicCommunities() {
  const q = query(collection(db, 'communities'), where('isPublic', '==', true));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function joinPublicCommunity(uid, communityId, nickname, password) {
  const snap = await getDoc(doc(db, 'communities', communityId));
  if (!snap.exists()) throw new Error('not found');
  const data = snap.data();
  if (data.password && data.password !== password) throw new Error('wrong password');
  await joinCommunity(uid, communityId, nickname);
}

export async function findCommunityByCode(code) {
  const q = query(collection(db, 'communities'), where('inviteCode', '==', code.toUpperCase()));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { communityId: d.id, ...d.data() };
}

export async function joinCommunity(uid, communityId, nickname) {
  const memberRef = doc(db, 'communities', communityId, 'members', uid);
  const existing = await getDoc(memberRef);
  if (existing.exists()) return; // 이미 가입됨
  await setDoc(memberRef, { nickname, joinedAt: new Date().toISOString(), isAdmin: false });
  const ref = doc(db, 'communities', communityId);
  const snap = await getDoc(ref);
  await setDoc(ref, { memberCount: (snap.data()?.memberCount || 0) + 1 }, { merge: true });
}

export async function loadCommunityData(communityId) {
  const snap = await getDoc(doc(db, 'communities', communityId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function loadCommunityMembers(communityId) {
  const snap = await getDocs(collection(db, 'communities', communityId, 'members'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

export async function addCommunityEvent(communityId, event) {
  const ref = doc(collection(db, 'communities', communityId, 'events'));
  await setDoc(ref, { ...event, createdAt: new Date().toISOString() });
  return ref.id;
}

export async function deleteCommunityEvent(communityId, eventId) {
  await deleteDoc(doc(db, 'communities', communityId, 'events', eventId));
}

export async function checkinCommunity(communityId, uid, nickname, completionRate) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const ref = doc(db, 'communities', communityId, 'checkins', uid);
  const existing = await getDoc(ref);
  const prev = existing.exists() ? existing.data() : {};
  const streak = prev.lastCheckin === yesterday
    ? (prev.streak || 1) + 1
    : prev.lastCheckin === today
      ? (prev.streak || 1)
      : 1;
  await setDoc(ref, { uid, nickname, date: today, completionRate: completionRate ?? null, streak, lastCheckin: today, checkedAt: new Date().toISOString() });
}

export async function leaveCommunity(communityId, uid) {
  await deleteDoc(doc(db, 'communities', communityId, 'members', uid));
  const ref = doc(db, 'communities', communityId);
  const snap = await getDoc(ref);
  await setDoc(ref, { memberCount: Math.max((snap.data()?.memberCount || 1) - 1, 0) }, { merge: true });
}

export async function addCommunityNotice(communityId, notice) {
  const ref = doc(collection(db, 'communities', communityId, 'notices'));
  await setDoc(ref, { ...notice, createdAt: new Date().toISOString() });
  return ref.id;
}

export async function deleteCommunityNotice(communityId, noticeId) {
  await deleteDoc(doc(db, 'communities', communityId, 'notices', noticeId));
}

export async function addNoticeComment(communityId, noticeId, comment) {
  const ref = doc(collection(db, 'communities', communityId, 'notices', noticeId, 'comments'));
  await setDoc(ref, { ...comment, createdAt: new Date().toISOString() });
  // 공지 문서에 댓글 수 업데이트
  const noticeRef = doc(db, 'communities', communityId, 'notices', noticeId);
  const snap = await getDoc(noticeRef);
  await setDoc(noticeRef, { commentCount: (snap.data()?.commentCount || 0) + 1 }, { merge: true });
  return ref.id;
}

export async function deleteNoticeComment(communityId, noticeId, commentId) {
  await deleteDoc(doc(db, 'communities', communityId, 'notices', noticeId, 'comments', commentId));
  const noticeRef = doc(db, 'communities', communityId, 'notices', noticeId);
  const snap = await getDoc(noticeRef);
  await setDoc(noticeRef, { commentCount: Math.max((snap.data()?.commentCount || 1) - 1, 0) }, { merge: true });
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
