// 기본 자동 점검 — 빌드된 앱(dist)을 로컬에서 띄워 주요 화면이 오류 없이 열리는지 본다.
//   npm run test:smoke   (먼저 npm run build 필요 — release:prepare가 알아서 한다)
// 로그인 없이 볼 수 있는 범위만 점검한다(실제 서버 데이터·로그인 기능은 따로 확인).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 4799;
const BASE = `http://localhost:${PORT}`;
const SCREENS = ['today', 'my', 'memo', 'history', 'community', 'settings', 'manager', 'stats', 'knowledge', 'people', 'portfolio', 'battle-arena'];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

if (!existsSync('dist/index.html')) { console.error('dist가 없어요. 먼저 npm run build'); process.exit(1); }

const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', shell: process.platform === 'win32' });
const stop = () => { try { process.platform === 'win32' ? spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' }) : server.kill(); } catch { /* 이미 종료 */ } };

let failures = 0;
const fail = (msg) => { failures++; console.log(`❌ ${msg}`); };
const ok = (msg) => console.log(`✅ ${msg}`);

try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* 준비 중 */ } await sleep(250); }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 400, height: 860 } });
  // 첫 실행 안내 화면 건너뛰기
  await ctx.addInitScript(() => { try { localStorage.setItem('dm_first_run_done', 'true'); localStorage.setItem('dm_user', JSON.stringify({ name: '점검' })); } catch { /* 무시 */ } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  await page.goto(BASE);
  await page.waitForSelector('.dm-phone', { timeout: 15000 }).then(() => ok('앱이 뜸'), () => fail('앱 첫 화면(.dm-phone)이 뜨지 않음'));

  for (const s of SCREENS) {
    const before = pageErrors.length;
    await page.evaluate((id) => window.dispatchEvent(new CustomEvent('dm:navigate', { detail: id })), s);
    await sleep(900);
    const text = (await page.innerText('body').catch(() => '')).trim();
    // 화면 오류는 앱의 ScreenErrorBoundary가 잡아서 '⚠️ 화면 오류' 카드로 보여 준다
    const boundary = text.includes('⚠️ 화면 오류') ? text.split('⚠️ 화면 오류')[1].trim().split(/\r?\n/)[0] : '';
    if (boundary) fail(`${s} 화면 오류: ${boundary.slice(0, 200)}`);
    else if (pageErrors.length > before) fail(`${s} 화면 오류: ${pageErrors.slice(before).join(' / ').slice(0, 200)}`);
    else if (text.length < 5) fail(`${s} 화면이 비어 있음`);
    else ok(`${s} 화면`);
  }

  // 바탕화면 포스트잇 화면(가벼운 화면)
  const sticky = await ctx.newPage();
  const stickyErrors = [];
  sticky.on('pageerror', e => stickyErrors.push(e.message));
  await sticky.goto(`${BASE}/?view=sticky&new=1`);
  await sticky.waitForSelector('textarea', { timeout: 10000 }).then(
    () => (stickyErrors.length ? fail(`포스트잇 화면 오류: ${stickyErrors[0]}`) : ok('포스트잇 화면')),
    () => fail('포스트잇 화면 입력칸이 뜨지 않음'),
  );
  await browser.close();
} catch (e) {
  fail(`점검 실행 실패: ${e.message}`);
} finally {
  stop();
}
console.log(failures ? `\n기본 점검 실패 ${failures}건` : '\n기본 점검 모두 통과');
process.exit(failures ? 1 : 0);
