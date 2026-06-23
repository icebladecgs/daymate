// ELECTRON_RUN_AS_NODE=1 이 시스템에 설정된 경우 자동으로 재시작
if (process.type === undefined) {
  const { spawn } = require('child_process');
  const env = Object.assign({}, process.env);
  delete env.ELECTRON_RUN_AS_NODE;
  spawn(process.execPath, process.argv.slice(1), { env, detached: true, stdio: 'ignore', windowsHide: false }).unref();
  process.exit(0);
}

const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, ipcMain } = require('electron');

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

const DAYMATE_URL = 'https://daymate-beta.vercel.app';

// 단축키 설정 파일
const CONFIG_PATH = path.join(app.getPath('userData'), 'shortcuts.json');
const DEFAULT_SHORTCUTS = { memo: 'Ctrl+Shift+M', calendar: 'Ctrl+Shift+C', search: 'Ctrl+Shift+S' };

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

function registerShortcuts() {
  globalShortcut.unregisterAll();
  globalShortcut.register(shortcuts.memo, () => toggleMemo());
  globalShortcut.register(shortcuts.calendar, () => showCalendar());
  if (shortcuts.search) globalShortcut.register(shortcuts.search, () => showSearch());
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
    { label: `Daymate 검색  (${shortcuts.search || 'Ctrl+Shift+S'})`, click: () => showSearch() },
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
    webPreferences: { nodeIntegration: false, contextIsolation: true },
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
    width: 400, height: 430,
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
ipcMain.handle('set-shortcuts', (_, { memo, calendar, search }) => {
  globalShortcut.unregisterAll();
  const okMemo = globalShortcut.register(memo, () => toggleMemo());
  const okCal = globalShortcut.register(calendar, () => showCalendar());
  const okSearch = globalShortcut.register(search, () => showSearch());
  if (okMemo && okCal && okSearch) {
    shortcuts = { memo, calendar, search };
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

function waitAndClick(label, maxTries = 10, interval = 200) {
  const gen = ++navGen; // 새 탐색 시작 시 이전 건 취소
  let tries = 0;
  const attempt = () => {
    if (navGen !== gen) return; // 새 탐색이 시작됐으면 중단
    memoWindow.webContents.executeJavaScript(`
      (function() {
        const btns = document.querySelectorAll('button');
        for (const b of btns) {
          if (b.textContent.includes('${label}')) { b.click(); return true; }
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
  setTimeout(() => goToToday(), 100);
  setTimeout(() => {
    waitAndClick('긴 메모');
    setTimeout(() => memoWindow.webContents.focus(), 300); // textarea 포커스 보장
  }, 700);
}

function showCalendar() {
  if (!memoWindow) return;
  memoWindow.show();
  memoWindow.focus();
  closeOverlay();
  setTimeout(() => clickTab('달력'), 300);
}

function showSearch() {
  if (!memoWindow) return;
  memoWindow.show();
  memoWindow.focus();
  closeOverlay(); // LongMemoEditor가 열려있으면 닫기
  setTimeout(() => goToToday(), 100);
  setTimeout(() => waitAndClick('🔍'), 600);
}

function toggleMemo() {
  if (!memoWindow) return;
  if (memoWindow.isVisible()) { memoWindow.hide(); } else { showMemo(); }
}

app.whenReady().then(() => {
  createMemoWindow();
  createTray();
  registerShortcuts();
});

app.on('window-all-closed', () => {});
app.on('will-quit', () => { globalShortcut.unregisterAll(); });
