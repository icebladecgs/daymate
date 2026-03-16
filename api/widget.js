import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();

const UID = process.env.FIREBASE_USER_UID;

function pad2(n) { return String(n).padStart(2, '0'); }
function toDateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export default async function handler(req, res) {
  // CORS 허용 (iOS 단축어 등에서 사용)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const today = toDateStr();

  try {
    const [daySnap, settingsSnap] = await Promise.all([
      db.doc(`users/${UID}/days/${today}`).get(),
      db.doc(`users/${UID}/data/settings`).get(),
    ]);

    const d = daySnap.data() || {};
    const settings = settingsSnap.data() || {};
    const tasks = (d.tasks || []).filter(t => t.title?.trim());
    const doneTasks = tasks.filter(t => t.done).length;
    const habits = (settings.habits || []);
    const habitChecks = d.habitChecks || {};
    const doneHabits = habits.filter(h => habitChecks[h.id]).length;

    res.status(200).json({
      date: today,
      tasks: tasks.map(t => ({ id: t.id, title: t.title, done: t.done, priority: t.priority || false })),
      doneTasks,
      totalTasks: tasks.length,
      habits: habits.map(h => ({ id: h.id, name: h.name, icon: h.icon, done: !!habitChecks[h.id] })),
      doneHabits,
      totalHabits: habits.length,
      memo: d.memo || '',
      hasDiary: !!(d.journal?.body?.trim()),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
