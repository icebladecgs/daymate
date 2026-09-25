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
const DEFAULT_SHORTCUTS = { memo: 'Ctrl+Shift+M', calendar: 'Ctrl+Shift+C', search: 'Ctrl+Shift+S', quickMemo: 'Ctrl+Shift+N' };

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
let navGen = 0; // 이전 waitAndClick 취소용

// ---------- 바탕화면 포스트잇 (간편 메모) ----------
// 포스트잇 창은 웹의 ?view=sticky 화면(가벼운 메모 화면)을 띄운다. 열린 포스트잇 목록·위치·고정 여부는
// prefs.stickies에 저장해 두었다가 앱을 다시 켜면 그 자리에 다시 띄운다.
const stickyWindows = new Map(); // BrowserWindow → { ds, id, pinned }

function saveStickyList() {
  prefs.stickies = [...stickyWindows.entries()]
    .filter(([w, info]) => !w.isDestroyed() && info.id)
    .map(([w, info]) => ({ ds: info.ds, id: info.id, pinned: !!info.pinned, bounds: w.getBounds() }));
  savePrefs(prefs);
}

function createSticky({ ds, id, pinned = true, bounds } = {}) {
  // 이미 떠 있는 메모면 그 창을 앞으로
  for (const [w, info] of stickyWindows) {
    if (!w.isDestroyed() && id && info.id === id && info.ds === ds) { w.show(); w.focus(); return w; }
  }
  const b = bounds || {};
  const win = new BrowserWindow({
    width: b.width || 280, height: b.height || 240,
    ...(b.x !== undefined ? { x: b.x, y: b.y } : {}),
    minWidth: 180, minHeight: 120,
    frame: false, resizable: true, skipTaskbar: true,
    alwaysOnTop: pinned, backgroundColor: '#FFF7A8',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
  });
  stickyWindows.set(win, { ds, id, pinned });
  const q = id ? `ds=${encodeURIComponent(ds)}&id=${encodeURIComponent(id)}` : 'new=1';
  win.loadURL(`${DAYMATE_URL}/?view=sticky&${q}&pin=${pinned ? 1 : 0}`);
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
  globalShortcut.register(shortcuts.memo, () => toggleMemo());
  globalShortcut.register(shortcuts.calendar, () => showCalendar());
  if (shortcuts.search) globalShortcut.register(shortcuts.search, () => showSearch());
  if (shortcuts.quickMemo) globalShortcut.register(shortcuts.quickMemo, () => createSticky());
}

function toggleAlwaysOnTop() {
  alwaysOnTop = !alwaysOnTop;
  if (memoWindow) memoWindow.setAlwaysOnTop(alwaysOnTop);
  prefs.alwaysOnTop = alwaysOnTop;
  savePrefs(prefs);
  updateTray();
}

function updateTray() {
  const menu = Menu.buildFromTemplate([
    { label: `Daymate 메모  (${shortcuts.memo})`, click: () => showMemo() },
    { label: `Daymate 달력  (${shortcuts.calendar})`, click: () => showCalendar() },
    { label: `메모 관리자  (${shortcuts.search || 'Ctrl+Shift+S'})`, click: () => showSearch() },
    { type: 'separator' },
    { label: `새 간편 메모  (${shortcuts.quickMemo || 'Ctrl+Shift+N'})`, click: () => createSticky() },
    { label: '포스트잇 모두 보이기', click: () => showAllStickies() },
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
    width: 400, height: 510,
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
ipcMain.handle('set-shortcuts', (_, { memo, calendar, search, quickMemo }) => {
  globalShortcut.unregisterAll();
  const okMemo = globalShortcut.register(memo, () => toggleMemo());
  const okCal = globalShortcut.register(calendar, () => showCalendar());
  const okSearch = globalShortcut.register(search, () => showSearch());
  const okQuick = globalShortcut.register(quickMemo, () => createSticky());
  if (okMemo && okCal && okSearch && okQuick) {
    shortcuts = { memo, calendar, search, quickMemo };
    saveShortcuts(shortcuts);
    updateTray();
    return true;
  }
  // 실패 시 원래 단축키 복원
  registerShortcuts();
  return false;
});

function clickTab(label) {
  return memoWindow.webContents.executeJavaScript(`
    (function() {
      const btns = document.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent.includes('${label}')) { b.click(); return true; }
      }
      return false;
    })()
  `).catch(() => false);
}

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

function waitAndClick(label, maxTries = 10, interval = 200, exact = false) {
  const gen = ++navGen; // 새 탐색 시작 시 이전 건 취소
  let tries = 0;
  const attempt = () => {
    if (navGen !== gen) return; // 새 탐색이 시작됐으면 중단
    memoWindow.webContents.executeJavaScript(`
      (function() {
        const btns = document.querySelectorAll('button');
        for (const b of btns) {
          const t = b.textContent.trim();
          if (${exact ? "t === '" + label + "'" : "t.includes('" + label + "')"}) { b.click(); return true; }
        }
        return false;
      })()
    `).then(found => {
      if (navGen !== gen) return;
      if (!found && tries++ < maxTries) setTimeout(attempt, interval);
    }).catch(() => {});
  };
  attempt();
}

function goToToday() {
  return memoWindow.webContents.executeJavaScript(`
    (function() {
      const all = document.querySelectorAll('*');
      for (const el of all) {
        const st = window.getComputedStyle(el);
        if (st.position === 'fixed' && st.bottom === '0px') {
          const btns = el.querySelectorAll('button');
          for (const b of btns) {
            if (b.textContent.includes('오늘')) { b.click(); return true; }
          }
        }
      }
      return false;
    })()
  `).catch(() => {});
}

function showMemo() {
  if (!memoWindow) return;
  memoWindow.show();
  memoWindow.focus();
  closeOverlay(); // SearchViewer/LongMemoEditor가 열려있으면 닫기
  // "메모"가 하단 탭의 정식 화면으로 바뀌면서(기존엔 오늘 화면 안의 "긴 메모" 버튼이었음)
  // 하단 네비게이션의 "메모" 탭을 직접 클릭하는 방식으로 변경 — 누르면 새 메모 작성 화면이 바로 뜸
  setTimeout(() => {
    waitAndClick('메모', 10, 200, true); // 하단 탭 라벨과 정확히 일치하는 버튼만 클릭("긴메모편집" 등 다른 버튼과 혼동 방지)
    setTimeout(() => memoWindow.webContents.focus(), 300); // textarea 포커스 보장
  }, 200);
}

function showCalendar() {
  if (!memoWindow) return;
  memoWindow.show();
  memoWindow.focus();
  closeOverlay();
  setTimeout(() => clickTab('달력'), 300);
}

// 검색 단축키 → 메모 관리자(메모잇 메모관리자 방식의 넓은 화면). 창 크기는 웹이 set-wide-mode로 요청
function showSearch() {
  if (!memoWindow) return;
  memoWindow.show();
  memoWindow.focus();
  closeOverlay(); // LongMemoEditor가 열려있으면 닫기
  setTimeout(() => {
    memoWindow.webContents.executeJavaScript(
      "window.dispatchEvent(new CustomEvent('dm:navigate', { detail: 'manager' }))"
    ).catch(() => {});
  }, 150);
}

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
