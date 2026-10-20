// 지금 오늘 탭을 예시 할 일 6개로 캡처한다 (다크·라이트, 390px, 2배).
// 사용: npx vite build 후  node design/today-redesign/capture-current.mjs <저장할 폴더>
// npm run build는 버전 파일을 바꾸므로 캡처용 빌드는 npx vite build. 윈도우용(npx.cmd·taskkill) — 맥은 npx·server.kill()로 바꿔 쓴다.

import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
const SP = process.argv[2];
const PORT = 4798, BASE = `http://localhost:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = spawn('npx.cmd', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', shell: true });
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(250); }
  const browser = await chromium.launch();
  for (const theme of ['dark', 'light']) {
    const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await ctx.addInitScript((theme) => {
      const d = new Date(); const p = n => String(n).padStart(2, '0');
      const ds = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
      const h = d.getHours();
      localStorage.setItem('dm_first_run_done', 'true');
      localStorage.setItem('dm_user', JSON.stringify({ name: '점검' }));
      localStorage.setItem('dm_theme', JSON.stringify(theme));
      localStorage.setItem('dm_install_dismissed', 'true');
      localStorage.setItem(`dm_day_${ds}`, JSON.stringify({ tasks: [
        { id: 't1', title: '아침 운동 30분', done: true, time: '07:00' },
        { id: 't2', title: '주간 보고서 초안 작성', done: false, time: `${p(h)}:00`, endTime: `${p(h+1)}:30` },
        { id: 't3', title: '은행 대출 서류 확인', done: false },
        { id: 't4', title: '엄마한테 전화하기', done: false, time: '19:30' },
        { id: 't5', title: '책 20쪽 읽기', done: false },
        { id: 't6', title: '영양제 주문', done: true },
      ], memos: [], journal: { body: '' } }));
      localStorage.setItem('dm_habits', JSON.stringify([{ id: 'h1', icon: '💧', name: '물 2L 마시기' }, { id: 'h2', icon: '🚶', name: '만보 걷기' }, { id: 'h3', icon: '📖', name: '독서' }]));
      localStorage.setItem('dm_someday', JSON.stringify([{ id: 's1', title: '제주도 한 달 살기 알아보기', done: false }, { id: 's2', title: '자격증 공부 계획 세우기', done: false }, { id: 's3', title: '책장 정리', done: false }, { id: 's4', title: '사진 앨범 만들기', done: false }]));
    }, theme);
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForSelector('.dm-phone', { timeout: 15000 });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('dm:navigate', { detail: 'today' })));
    await sleep(1500);
    await page.screenshot({ path: `${SP}/today-${theme}-top.png` });
    await page.screenshot({ path: `${SP}/today-${theme}-full.png`, fullPage: true });
    await ctx.close();
  }
  await browser.close();
} finally { spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); }
