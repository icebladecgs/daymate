// 같은 기기 계정 전환 — 기록이 섞이지 않는지 (2026-11-01, utils/accountSwap.js)
//   npm run test:account   에뮬레이터(firestore·auth, demo-daymate) + 가짜 구글 로그인 + 실제 앱(Vite 개발 서버)
// 고치기 전 코드에서는 B로 로그인해도 이 기기에 A 메모가 남아 B 화면에 섞였다
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const toolDir = fileURLToPath(new URL('.', import.meta.url));
const root = path.resolve(toolDir, '../..');
const require = createRequire(path.join(root, 'package.json'));
const { chromium } = require('playwright');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
initializeApp({ projectId: 'demo-daymate' });
const adb = getFirestore();

const env = { ...process.env, VITE_FB_PROJECT_ID: 'demo-daymate', VITE_FB_API_KEY: 'fake-key', VITE_FB_AUTH_DOMAIN: 'localhost', VITE_FB_STORAGE_BUCKET: 'demo-daymate.appspot.com', VITE_FB_APP_ID: '1:1:web:1', VITE_FB_MESSAGING_SENDER_ID: '1' };
const server = spawn('npx', ['vite', '--config', path.join(toolDir, 'vite.emu.config.mjs')], { cwd: root, env, shell: true });
await new Promise((resolve) => { server.stdout.on('data', d => { if (String(d).includes('5199')) resolve(); }); setTimeout(resolve, 20000); });

const results = [];
const t = (name, ok, detail = '') => { results.push(`${ok ? '✅' : '❌'} ${name}${!ok && detail ? ` — ${detail}` : ''}`); };
const DS = '2026-11-01';
const browser = await chromium.launch();
const ctx = await browser.newContext({ serviceWorkers: 'block' });
await ctx.addInitScript(() => { try { localStorage.setItem('dm_first_run_done', 'true'); if (!localStorage.getItem('dm_user')) localStorage.setItem('dm_user', JSON.stringify({ name: 'x' })); } catch { /* 무시 */ } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('dialog', d => { errors.push('dialog: ' + d.message()); d.dismiss(); });
const ls = (k) => page.evaluate((key) => localStorage.getItem(key), k);
const waitReady = async () => { await page.waitForLoadState('load'); await page.waitForTimeout(3500); };
let seenToasts = [];
const login = async (sub) => {
  await page.evaluate(s => window.__dmTestLogin(s, s), sub);
  for (let i = 0; i < 25; i++) { // 새로 여는 동안 0.2초마다 알림 글자 확인
    await page.waitForTimeout(200);
    try { const txt = await page.evaluate(() => document.body?.innerText || ''); if (txt.includes('따로 보관')) seenToasts.push(txt.includes('이 계정의 기록으로 바꿨어요') ? 'back' : 'new'); } catch { /* 새로 여는 중 */ }
  }
  await waitReady();
};
const serverMemos = async (uid) => ((await adb.doc(`users/${uid}/days/${DS}`).get()).data()?.memos || []).map(m => m.text);

await page.goto('http://localhost:5199/');
await waitReady();
// ① 로그인 없이 쓴 메모 → 처음 로그인한 계정(A)으로 (예전과 같게)
await page.evaluate((ds) => { localStorage.setItem(`dm_day_${ds}`, JSON.stringify({ memos: [{ id: 'g1', text: '로그인 전 메모' }] })); localStorage.setItem('dm_unsynced_days', JSON.stringify([ds])); }, DS);
await page.reload(); await waitReady();
await login('userA');
const uidA = await ls('dm_local_owner');
t('A 로그인: 이 기기 주인이 A', !!uidA);
t('로그인 전 메모는 A 계정으로 올라감 (예전과 같음)', (await serverMemos(uidA)).includes('로그인 전 메모'), JSON.stringify(await serverMemos(uidA)));

// ② A 로그아웃 → 로그인 없이 A 기기에 메모(못 올림) → B 로그인
await page.evaluate(() => window.__dmTestLogout()); await page.waitForTimeout(800);
await page.evaluate((ds) => {
  const d = JSON.parse(localStorage.getItem(`dm_day_${ds}`) || '{}');
  d.memos = [...(d.memos || []), { id: 'a2', text: 'A가 로그아웃 뒤 쓴 메모' }];
  localStorage.setItem(`dm_day_${ds}`, JSON.stringify(d));
  localStorage.setItem('dm_unsynced_days', JSON.stringify([ds]));
  localStorage.setItem('dm_someday', JSON.stringify([{ id: 's1', title: 'A의 언젠가할일', done: false }]));
}, DS);
await login('userB');
const uidB = await ls('dm_local_owner');
t('B 로그인: 주인이 B로 바뀜', uidB && uidB !== uidA);
const localB = await ls(`dm_day_${DS}`) || '';
t('B 화면(이 기기 저장소)에 A 메모 없음', !localB.includes('A가') && !localB.includes('로그인 전'), localB);
t('B 화면에 A 언젠가할일 없음', !(await ls('dm_someday') || '').includes('A의'));
t('B 계정 서버에 A 메모가 올라가지 않음', !(await serverMemos(uidB)).length, JSON.stringify(await serverMemos(uidB)));
t('B 계정 서버 설정에 A 언젠가할일 없음', !JSON.stringify((await adb.doc(`users/${uidB}/data/settings`).get()).data()?.someday || '').includes('A의'));
t('기기용 설정은 그대로 (처음 실행 완료)', (await ls('dm_first_run_done')) === 'true');
t('바꿔 끼운 뒤 안내', seenToasts.includes('new'), JSON.stringify(seenToasts)); seenToasts = [];
// B가 쓴 메모 (B 계정에 올라가야 함)
await page.evaluate((ds) => { localStorage.setItem(`dm_day_${ds}`, JSON.stringify({ memos: [{ id: 'b1', text: 'B 메모' }] })); localStorage.setItem('dm_unsynced_days', JSON.stringify([ds])); }, DS);
await page.reload(); await waitReady();
t('B 메모는 B 계정으로', (await serverMemos(uidB)).includes('B 메모'), JSON.stringify(await serverMemos(uidB)));

// ③ 다시 A 로그인 → A 기록 복원, 로그아웃 뒤 쓴 메모가 A 계정으로 올라감
await page.evaluate(() => window.__dmTestLogout()); await page.waitForTimeout(800);
await login('userA');
t('A로 돌아옴', (await ls('dm_local_owner')) === uidA);
const localA = await ls(`dm_day_${DS}`) || '';
t('A 화면에 B 메모 없음', !localA.includes('B 메모'), localA);
t('A 로그아웃 뒤 메모가 A 계정 서버로 올라감', (await serverMemos(uidA)).includes('A가 로그아웃 뒤 쓴 메모'), JSON.stringify(await serverMemos(uidA)));
t('A 언젠가할일 복원', (await ls('dm_someday') || '').includes('A의'));
t('B 계정 서버는 여전히 B 메모만', JSON.stringify(await serverMemos(uidB)) === JSON.stringify(['B 메모']), JSON.stringify(await serverMemos(uidB)));
t('돌아온 안내', seenToasts.includes('back'), JSON.stringify(seenToasts));

console.log(results.join('\n'));
console.log('화면 오류', errors);
const failed = results.filter(r => r.startsWith('❌')).length + errors.length;
console.log(`
계정 전환 점검: ${results.length - failed}/${results.length} 통과`);
await browser.close();
server.kill();
process.exit(failed ? 1 : 0);
