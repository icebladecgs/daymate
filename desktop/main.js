// ELECTRON_RUN_AS_NODE=1 이 시스템에 설정된 경우 자동으로 재시작
if (process.type === undefined) {
  const { spawn } = require('child_process');
  const env = Object.assign({}, process.env);
  delete env.ELECTRON_RUN_AS_NODE;
  spawn(process.execPath, process.argv.slice(1), { env, detached: true, stdio: 'ignore', windowsHide: false }).unref();
  process.exit(0);
}

const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, ipcMain } = require('electron');

if (process.env.DAYMATE_USER_DATA) app.setPath('userData', process.env.DAYMATE_USER_DATA);

// 중복 실행 방지
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (memoWindow) { memoWindow.show(); memoWindow.focus(); }
});
const path = require('path');
const fs = require('fs');

// 테스트용: DAYMATE_URL로 로컬 서버를, DAYMATE_USER_DATA로 별도 설정 폴더를 쓸 수 있음(설치된 앱에 영향 없음)
const DAYMATE_URL = process.env.DAYMATE_URL || 'https://daymate-beta.vercel.app';

// 단축키 설정 파일
const CONFIG_PATH = path.join(app.getPath('userData'), 'shortcuts.json');
// 5가지 기능(새 메모·간편 메모·메모 관리자·달력 보기·메모 검색). 메모 검색은 VS Code의 Ctrl+Shift+F와 겹치지 않게 Ctrl+Alt+F
const DEFAULT_SHORTCUTS = { memo: 'Ctrl+Shift+M', calendar: 'Ctrl+Shift+C', search: 'Ctrl+Shift+S', quickMemo: 'Ctrl+Shift+N', memoSearch: 'Ctrl+Alt+F', toggleStickies: 'Ctrl+Alt+H', recentMemo: 'Ctrl+Alt+R' };

function loadShortcuts() {
  try { return Object.assign({}, DEFAULT_SHORTCUTS, JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))); } catch { return DEFAULT_SHORTCUTS; }
}

function saveShortcuts(sc) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(sc));
}

const PREFS_PATH = path.join(app.getPath('userData'), 'prefs.json');

function loadPrefs() {
  try { return JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8')); } catch { return {}; }
}

function savePrefs(prefs) {
  fs.writeFileSync(PREFS_PATH, JSON.stringify(prefs));
}

let prefs = loadPrefs();
let alwaysOnTop = prefs.alwaysOnTop || false;

let shortcuts = loadShortcuts();
let memoWindow = null;
let settingsWindow = null;
let tray = null;
let isQuitting = false;

// ---------- 바탕화면 포스트잇 (간편 메모) ----------
// 포스트잇 창은 웹의 ?view=sticky 화면(가벼운 메모 화면)을 띄운다. 열린 포스트잇 목록·위치·고정 여부는
// prefs.stickies에 저장해 두었다가 앱을 다시 켜면 그 자리에 다시 띄운다.
const stickyWindows = new Map(); // BrowserWindow → { ds, id, pinned }

function saveStickyList() {
  prefs.stickies = [...stickyWindows.entries()]
    .filter(([w, info]) => !w.isDestroyed() && info.id)
    .map(([w, info]) => ({ ds: info.ds, id: info.id, pinned: !!info.pinned, folded: !!info.folded, unfoldHeight: info.unfoldHeight, bounds: w.getBounds() }));
  savePrefs(prefs);
}

const FOLD_HEIGHT = 30; // 접힌 포스트잇 = 제목줄 높이

function createSticky({ ds, id, pinned = true, bounds, folded = false, unfoldHeight } = {}) {
  // 이미 떠 있는 메모면 그 창을 앞으로
  for (const [w, info] of stickyWindows) {
    if (!w.isDestroyed() && id && info.id === id && info.ds === ds) { w.show(); w.focus(); return w; }
  }
  const b = bounds || {};
  const win = new BrowserWindow({
    width: b.width || 280, height: folded ? FOLD_HEIGHT : (b.height || 240),
    ...(b.x !== undefined ? { x: b.x, y: b.y } : {}),
    minWidth: 180, minHeight: folded ? FOLD_HEIGHT : 120,
    frame: false, resizable: true, skipTaskbar: true,
    alwaysOnTop: pinned, backgroundColor: '#FFF7A8',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
  });
  stickyWindows.set(win, { ds, id, pinned, folded, unfoldHeight: unfoldHeight || (folded ? 240 : undefined) });
  const q = id ? `ds=${encodeURIComponent(ds)}&id=${encodeURIComponent(id)}` : 'new=1';
  win.loadURL(`${DAYMATE_URL}/?view=sticky&${q}&pin=${pinned ? 1 : 0}${folded ? '&fold=1' : ''}`);
  let t = null;
  const saveLater = () => { clearTimeout(t); t = setTimeout(saveStickyList, 500); };
  win.on('move', saveLater);
  win.on('resize', saveLater);
  win.on('closed', () => {
    stickyWindows.delete(win);
    if (!isQuitting) saveStickyList(); // 앱 종료 때는 목록을 남겨 다음 실행에 다시 띄움
  });
  return win;
}

const stickyOf = (event) => BrowserWindow.fromWebContents(event.sender);

ipcMain.on('sticky-new', () => createSticky());
ipcMain.on('sticky-open', (_, { ds, id }) => { createSticky({ ds, id }); saveStickyList(); });
ipcMain.on('sticky-created', (event, { ds, id }) => {
  const win = stickyOf(event);
  if (win && stickyWindows.has(win)) { Object.assign(stickyWindows.get(win), { ds, id }); saveStickyList(); }
});
ipcMain.on('sticky-close', (event) => { const win = stickyOf(event); if (win) win.close(); });
ipcMain.on('sticky-minimize', (event) => { const win = stickyOf(event); if (win) win.minimize(); });
ipcMain.handle('sticky-fold', (event, fold) => {
  const win = stickyOf(event);
  const info = win && stickyWindows.get(win);
  if (!info) return false;
  const [w, h] = win.getSize();
  if (fold && !info.folded) {
    info.unfoldHeight = h;
    win.setMinimumSize(180, FOLD_HEIGHT);
    win.setSize(w, FOLD_HEIGHT);
  } else if (!fold && info.folded) {
    win.setMinimumSize(180, 120);
    win.setSize(w, info.unfoldHeight || 240);
  }
  info.folded = !!fold;
  saveStickyList();
  return info.folded;
});

// 포스트잇 모두 보이기/감추기 — 하나라도 보이면 모두 감추고, 모두 숨어 있으면 모두 보이기
function toggleAllStickies() {
  const wins = [...stickyWindows.keys()].filter(w => !w.isDestroyed());
  if (wins.some(w => w.isVisible() && !w.isMinimized())) wins.forEach(w => w.hide());
  else showAllStickies();
}

// 최근 편집한 메모를 포스트잇으로 — 메인 창의 저장소에서 수정 시각이 가장 늦은 메모를 찾는다
function openRecentMemo() {
  if (!memoWindow) return;
  memoWindow.webContents.executeJavaScript(`(() => {
    let best = null;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('dm_day_')) continue;
      try {
        for (const m of (JSON.parse(localStorage.getItem(k)).memos || [])) {
          const t = m.updatedAt || '';
          if (t && (!best || t > best.t)) best = { t, ds: k.slice(7), id: m.id };
        }
      } catch (e) {}
    }
    return best;
  })()`)
    .then(best => { if (best) { createSticky({ ds: best.ds, id: best.id }); saveStickyList(); } })
    .catch(() => {});
}

ipcMain.handle('sticky-toggle-pin', (event) => {
  const win = stickyOf(event);
  const info = win && stickyWindows.get(win);
  if (!info) return false;
  info.pinned = !info.pinned;
  win.setAlwaysOnTop(info.pinned);
  saveStickyList();
  return info.pinned;
});

function showAllStickies() {
  if (stickyWindows.size === 0) { createSticky(); return; }
  for (const w of stickyWindows.keys()) if (!w.isDestroyed()) { w.restore(); w.show(); }
}

// ---------- 메모 관리자일 때 메인 창 넓게 ----------
let normalBounds = null;
ipcMain.on('set-wide-mode', (event, on) => {
  if (!memoWindow || BrowserWindow.fromWebContents(event.sender) !== memoWindow) return;
  if (on && !normalBounds) {
    normalBounds = memoWindow.getBounds();
    memoWindow.setSize(1240, 800);
    memoWindow.center();
  } else if (!on && normalBounds) {
    memoWindow.setBounds(normalBounds);
    normalBounds = null;
  }
});

function registerShortcuts() {
  globalShortcut.unregisterAll();
  // 비워 둔(지운) 단축키는 등록하지 않음
  if (shortcuts.memo) globalShortcut.register(shortcuts.memo, () => toggleMemo());
  if (shortcuts.calendar) globalShortcut.register(shortcuts.calendar, () => showCalendar());
  if (shortcuts.search) globalShortcut.register(shortcuts.search, () => showSearch());
  if (shortcuts.quickMemo) globalShortcut.register(shortcuts.quickMemo, () => createSticky());
  if (shortcuts.memoSearch) globalShortcut.register(shortcuts.memoSearch, () => showMemoSearch());
  if (shortcuts.toggleStickies) globalShortcut.register(shortcuts.toggleStickies, () => toggleAllStickies());
  if (shortcuts.recentMemo) globalShortcut.register(shortcuts.recentMemo, () => openRecentMemo());
}

function toggleAlwaysOnTop() {
  alwaysOnTop = !alwaysOnTop;
  if (memoWindow) memoWindow.setAlwaysOnTop(alwaysOnTop);
  prefs.alwaysOnTop = alwaysOnTop;
  savePrefs(prefs);
  updateTray();
}

const menuLabel = (name, key) => (key ? `${name}  (${key})` : name);

function updateTray() {
  const menu = Menu.buildFromTemplate([
    { label: menuLabel('새 메모', shortcuts.memo), click: () => showMemo() },
    { label: menuLabel('간편 메모', shortcuts.quickMemo), click: () => createSticky() },
    { label: menuLabel('메모 관리자', shortcuts.search), click: () => showSearch() },
    { label: menuLabel('달력 보기', shortcuts.calendar), click: () => showCalendar() },
    { label: menuLabel('메모 검색', shortcuts.memoSearch), click: () => showMemoSearch() },
    { type: 'separator' },
    { label: menuLabel('포스트잇 모두 보이기/감추기', shortcuts.toggleStickies), click: () => toggleAllStickies() },
    { label: menuLabel('최근 편집한 메모 열기', shortcuts.recentMemo), click: () => openRecentMemo() },
    { type: 'separator' },
    { label: '항상 위에 고정', type: 'checkbox', checked: alwaysOnTop, click: () => toggleAlwaysOnTop() },
    { type: 'separator' },
    { label: '단축키 설정', click: () => openSettings() },
    { type: 'separator' },
    { label: '종료', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function createMemoWindow() {
  memoWindow = new BrowserWindow({
    width: 560,
    height: 860,
    show: false,
    frame: true,
    resizable: true,
    alwaysOnTop: alwaysOnTop,
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'Daymate',
  });
  memoWindow.loadURL(DAYMATE_URL);
  memoWindow.setMenuBarVisibility(false);

  memoWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F5' || (input.control && input.key === 'r')) {
      memoWindow.webContents.reload();
      event.preventDefault();
    }
  });

  memoWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    memoWindow.hide();
  });
}

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus(); return;
  }
  globalShortcut.unregisterAll(); // 설정 중 단축키 발동 방지
  settingsWindow = new BrowserWindow({
    width: 400, height: 800,
    resizable: false, frame: true,
    alwaysOnTop: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
    title: '단축키 설정',
  });
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.on('closed', () => registerShortcuts()); // 닫히면 복원
}

function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
  tray = new Tray(img.resize({ width: 16, height: 16 }));
  tray.setToolTip('Daymate');
  tray.on('click', () => toggleMemo());
  updateTray();
}

// IPC: 설정 창 ↔ main
ipcMain.handle('get-shortcuts', () => shortcuts);
ipcMain.handle('set-shortcuts', (_, { memo, calendar, search, quickMemo, memoSearch, toggleStickies, recentMemo }) => {
  globalShortcut.unregisterAll();
  // 비운 칸('')은 단축키 없음 — 등록하지 않고 성공으로 친다
  const reg = (key, fn) => !key || globalShortcut.register(key, fn);
  const ok = [
    reg(memo, () => toggleMemo()),
    reg(calendar, () => showCalendar()),
    reg(search, () => showSearch()),
    reg(quickMemo, () => createSticky()),
    reg(memoSearch, () => showMemoSearch()),
    reg(toggleStickies, () => toggleAllStickies()),
    reg(recentMemo, () => openRecentMemo()),
  ].every(Boolean);
  if (ok) {
    shortcuts = { memo, calendar, search, quickMemo, memoSearch, toggleStickies, recentMemo };
    saveShortcuts(shortcuts);
    updateTray();
    return true;
  }
  // 실패 시 원래 단축키 복원
  registerShortcuts();
  return false;
});

function closeOverlay() {
  // SearchViewer 또는 LongMemoEditor의 ← 버튼 클릭
  return memoWindow.webContents.executeJavaScript(`
    (function() {
      const btns = document.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent.trim() === '←') { b.click(); return true; }
      }
      return false;
    })()
  `).catch(() => false);
}

// 화면 이동은 버튼 글자를 찾아 누르지 않고, 웹 앱에 이동 신호(dm:navigate)를 보낸다.
// 예전 방식은 아래쪽 탭이 없는 화면(메모 관리자 등)에서는 누를 버튼이 없어 이동이 안 됐다.
function navigateTo(screen, extraJs = '') {
  if (!memoWindow) return;
  memoWindow.show();
  memoWindow.focus();
  closeOverlay(); // SearchViewer/LongMemoEditor가 열려있으면 닫기
  setTimeout(() => {
    memoWindow.webContents.executeJavaScript(
      `window.dispatchEvent(new CustomEvent('dm:navigate', { detail: '${screen}' }));${extraJs}`
    ).catch(() => {});
    setTimeout(() => memoWindow.webContents.focus(), 300); // 입력칸 포커스 보장
  }, 150);
}

// 메모 탭 — 새 메모 작성 화면이 바로 뜸
function showMemo() { navigateTo('memo'); }
function showCalendar() { navigateTo('history'); }
// 메모 관리자(메모잇 메모관리자 방식의 넓은 화면). 창 크기는 웹이 set-wide-mode로 요청
function showSearch() { navigateTo('manager'); }
// 메모 검색(휴대폰식 통합 검색) — 오늘 화면으로 간 뒤 검색창 열기.
// 오늘 화면이 뜨기 전에 신호가 도착해도 놓치지 않도록 대기 표시를 남긴다(Today.jsx)
function showMemoSearch() {
  navigateTo('today', "window.__dmOpenSearchPending = true; window.dispatchEvent(new Event('dm:open-search'));");
}

// 자동 테스트(Playwright _electron)에서만 이동 함수를 부를 수 있게 — 설치된 앱에는 노출 안 됨
if (process.env.DAYMATE_USER_DATA) globalThis.__daymateTest = { showMemo, showCalendar, showSearch, showMemoSearch, toggleAllStickies, openRecentMemo, createSticky };

function toggleMemo() {
  if (!memoWindow) return;
  if (memoWindow.isVisible()) { memoWindow.hide(); } else { showMemo(); }
}

app.whenReady().then(() => {
  createMemoWindow();
  createTray();
  registerShortcuts();
  (prefs.stickies || []).forEach(st => createSticky(st)); // 지난번에 붙여 둔 포스트잇 다시 띄우기
});

app.on('before-quit', () => { isQuitting = true; saveStickyList(); });

app.on('window-all-closed', () => {});
app.on('will-quit', () => { globalShortcut.unregisterAll(); });
