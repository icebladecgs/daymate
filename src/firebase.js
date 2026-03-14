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

// localStorage 데이터를 Firestore로 최초 업로드 (Firestore가 비어있을 때)
export async function uploadLocalToFirestore(uid, localData) {
  const { settings, goals, days } = localData;
  if (settings) await saveSettings(uid, settings);
  if (goals) await saveGoals(uid, goals);
  for (const [dateStr, dayData] of Object.entries(days)) {
    await saveDay(uid, dateStr, dayData);
  }
}
