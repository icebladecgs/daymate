import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();

const UID = process.env.FIREBASE_USER_UID;
const WIDGET_ACCESS_TOKEN = process.env.WIDGET_ACCESS_TOKEN || '';
const WIDGET_ALLOWED_ORIGINS = (process.env.WIDGET_ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

function pad2(n) { return String(n).padStart(2, '0'); }
function toDateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return;

  if (WIDGET_ALLOWED_ORIGINS.length === 0 || WIDGET_ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Widget-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  }
}

function isAuthorized(req) {
  if (!WIDGET_ACCESS_TOKEN) return true;

  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const headerToken = req.headers['x-widget-token'];
  const queryToken = req.query?.token;

  return bearerToken === WIDGET_ACCESS_TOKEN || headerToken === WIDGET_ACCESS_TOKEN || queryToken === WIDGET_ACCESS_TOKEN;
}

export default async function handler(req, res) {
  applyCors(req, res);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

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
