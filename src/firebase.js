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
export async function googleSignInWithCalendarScope() {
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/calendar');
  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential) throw new Error('no credential');
  return { accessToken: credential.accessToken, expiresAt: Date.now() + 3600 * 1000 };
}

// Google Drive OAuth (drive.file scope — only files created by this app)
export async function googleSignInWithDriveScope() {
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/drive.file');
  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential) throw new Error('no credential');
  return { accessToken: credential.accessToken, expiresAt: Date.now() + 3600 * 1000 };
}

// ---------- Rankings ----------

export async function updateRanking(uid, data) {
  await setDoc(doc(db, 'rankings', uid), data, { merge: true });
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
