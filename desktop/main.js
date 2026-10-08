// ELECTRON_RUN_AS_NODE=1 이 시스템에 설정된 경우 자동으로 재시작
if (process.type === undefined) {
  const { spawn } = require('child_process');
  const env = Object.assign({}, process.env);
  delete env.ELECTRON_RUN_AS_NODE;
  spawn(process.execPath, process.argv.slice(1), { env, detached: true, stdio: 'ignore', windowsHide: false }).unref();
  process.exit(0);
}

const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, ipcMain, screen, powerMonitor, shell } = require('electron');

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
// 포스트잇 창 안에서만 쓰는 키(전역 등록 안 함) — 같은 설정 파일·설정 창에서 바꾸거나 지움
const STICKY_KEY_DEFAULTS = { stickyFold: 'Esc', stickyNew: 'Ctrl+N', stickyClose: 'Ctrl+W', stickyPin: 'Ctrl+T', stickyCopy: 'Ctrl+Alt+C' };
const STICKY_KEY_ACTIONS = { stickyFold: 'fold', stickyNew: 'new', stickyClose: 'close', stickyPin: 'pin', stickyCopy: 'copy' };

function loadShortcuts() {
  try { return Object.assign({}, DEFAULT_SHORTCUTS, STICKY_KEY_DEFAULTS, JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))); } catch { return { ...DEFAULT_SHORTCUTS, ...STICKY_KEY_DEFAULTS }; }
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
// 윈도우 켤 때 자동 실행 — 기본 켜기(2026-10-08 사용자 결정, 메모잇처럼 재부팅 뒤에도 포스트잇·단축키가 바로 되게).
// 트레이 메뉴에서 끌 수 있다. 설치된 앱에서만 등록한다(테스트로 띄운 electron.exe가 등록되지 않게).
let autoStart = prefs.autoStart !== false;
function applyAutoStart() {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: autoStart, path: process.execPath });
}
function toggleAutoStart() {
  autoStart = !autoStart;
  prefs.autoStart = autoStart;
  savePrefs(prefs);
  applyAutoStart();
  updateTray();
}

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
    .map(([w, info]) => ({ ds: info.ds, id: info.id, pinned: !!info.pinned, folded: !!info.folded, unfoldHeight: info.unfoldHeight, opacity: info.opacity, bounds: w.getBounds() }));
  savePrefs(prefs);
}

const FOLD_HEIGHT = 30; // 접힌 포스트잇 = 제목줄 높이
const STICKY_W = 340, STICKY_H = 300;
let lastFocusedSticky = null;

// 새 포스트잇 자리 — 지금 쓰던(마지막으로 누른) 포스트잇에서 대각선 아래로 살짝 겹치게.
// 아래로 내리는 폭은 제목줄 높이만큼이라 뒤 메모의 제목줄이 보인다. 화면 밖으로 나가면 화면 왼쪽 위부터 다시.
function cascadeBounds() {
  const alive = [...stickyWindows.keys()].filter(w => !w.isDestroyed() && w.isVisible() && !w.isMinimized());
  const ref = (lastFocusedSticky && alive.includes(lastFocusedSticky)) ? lastFocusedSticky : alive[alive.length - 1];
  if (!ref) return {};
  const r = ref.getBounds();
  const wa = screen.getDisplayMatching(r).workArea;
  const taken = new Set(alive.map(w => { const b = w.getBounds(); return `${b.x},${b.y}`; }));
  let x = r.x + 20, y = r.y + FOLD_HEIGHT;
  for (let i = 0; i < 30; i++) {
    if (x + STICKY_W > wa.x + wa.width || y + STICKY_H > wa.y + wa.height) { x = wa.x + 40 + i * 20; y = wa.y + 40; }
    if (!taken.has(`${x},${y}`)) break;
    x += 20; y += FOLD_HEIGHT;
  }
  return { x, y };
}

// 포스트잇 창 안의 키 → 설정한 동작. 설정 창과 같은 표기('Ctrl+Shift+N', 'Esc')로 만들어 비교한다.
// 한글 입력 상태에서도 되게 글자·숫자는 key 대신 자판 위치(code)로 읽는다.
function comboOf(input) {
  const ignore = ['Control', 'Shift', 'Alt', 'Meta'];
  if (ignore.includes(input.key)) return null;
  let key = input.key;
  if (/^Key[A-Z]$/.test(input.code)) key = input.code.slice(3);
  else if (/^Digit\d$/.test(input.code)) key = input.code.slice(5);
  else if (key === 'Escape') key = 'Esc';
  else if (key.length === 1) key = key.toUpperCase();
  const parts = [];
  if (input.control) parts.push('Ctrl');
  if (input.shift) parts.push('Shift');
  if (input.alt) parts.push('Alt');
  if (input.meta) parts.push('Meta');
  parts.push(key);
  return parts.join('+');
}

function onStickyKey(win, event, input) {
  if (input.type !== 'keyDown' || input.isAutoRepeat) return;
  const combo = comboOf(input);
  if (!combo) return;
  const name = Object.keys(STICKY_KEY_ACTIONS).find(k => shortcuts[k] && shortcuts[k] === combo);
  if (!name) return;
  event.preventDefault();
  const action = STICKY_KEY_ACTIONS[name];
  if (action === 'new') { createSticky(); return; }
  win.webContents.send('sticky-key', action); // 접기·닫기·고정·복사는 화면 쪽 버튼과 같은 동작으로
}

function createSticky({ ds, id, pinned = true, bounds, folded = false, unfoldHeight, opacity } = {}) {
  // 이미 떠 있는 메모면 그 창을 앞으로
  for (const [w, info] of stickyWindows) {
    if (!w.isDestroyed() && id && info.id === id && info.ds === ds) { w.show(); w.focus(); return w; }
  }
  const b = bounds || cascadeBounds();
  const win = new BrowserWindow({
    width: b.width || STICKY_W, height: folded ? FOLD_HEIGHT : (b.height || STICKY_H),
    ...(b.x !== undefined ? { x: b.x, y: b.y } : {}),
    minWidth: 180, minHeight: folded ? FOLD_HEIGHT : 120,
    frame: false, resizable: true, skipTaskbar: true,
    alwaysOnTop: pinned, backgroundColor: '#FFF7A8',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
  });
  const op = clampOpacity(opacity);
  if (op < 1) win.setOpacity(op);
  stickyWindows.set(win, { ds, id, pinned, folded, unfoldHeight: unfoldHeight || (folded ? STICKY_H : undefined), opacity: op < 1 ? op : undefined });
  const q = id ? `ds=${encodeURIComponent(ds)}&id=${encodeURIComponent(id)}` : 'new=1';
  win.loadURL(`${DAYMATE_URL}/?view=sticky&${q}&pin=${pinned ? 1 : 0}${folded ? '&fold=1' : ''}${op < 1 ? `&op=${op}` : ''}`);
  let t = null;
  const saveLater = () => { clearTimeout(t); t = setTimeout(saveStickyList, 500); };
  win.on('focus', () => { lastFocusedSticky = win; checkRemote(); });
  win.webContents.on('before-input-event', (event, input) => onStickyKey(win, event, input));
  win.on('move', saveLater);
  win.on('resize', saveLater);
  win.on('closed', () => {
    stickyWindows.delete(win);
    if (lastFocusedSticky === win) lastFocusedSticky = null;
    if (!isQuitting) saveStickyList(); // 앱 종료 때는 목록을 남겨 다음 실행에 다시 띄움
  });
  return win;
}

const stickyOf = (event) => BrowserWindow.fromWebContents(event.sender);

// 포스트잇 투명도 (메모잇 "메모 투명효과") — 50~100%, 포스트잇마다 따로 기억
function clampOpacity(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(1, Math.max(0.5, n)) : 1;
}
ipcMain.handle('sticky-opacity', (event, v) => {
  const win = stickyOf(event);
  const info = win && stickyWindows.get(win);
  if (!info) return 1;
  const op = clampOpacity(v);
  win.setOpacity(op);
  info.opacity = op < 1 ? op : undefined;
  saveStickyList();
  return op;
});

// 메모 관리자 "📌 포스트잇" 분류 — 지금 띄워 둔(숨긴 것 포함) 포스트잇 메모 목록
ipcMain.handle('sticky-list', () => [...stickyWindows.entries()]
  .filter(([w, info]) => !w.isDestroyed() && info.id)
  .map(([, info]) => ({ ds: info.ds, id: info.id })));

// 메모 속 링크 열기 — 기본 브라우저로. http(s)·mailto만 연다(파일·프로그램 실행 주소는 막음)
ipcMain.on('open-external', (_, url) => {
  if (/^(https?:\/\/|mailto:)/i.test(String(url || ''))) shell.openExternal(String(url)).catch(() => {});
});

// 웹이 데스크탑 앱 버전을 보고 "새 버전 있어요"를 띄운다 (1.3.1~, 이전 버전은 이 함수가 없음)
ipcMain.handle('app-version', () => app.getVersion());

// 보이는 포스트잇 가지런히 정렬 (메모잇 "보이는 메모 정렬") — 포스트잇이 있는 화면마다 왼쪽 위부터 줄 맞춰 놓는다.
// 순서는 띄운 순서. 한 화면에 다 안 들어가면 다시 위에서부터 조금씩 비켜서 겹친다.
function arrangeStickies() {
  const GAP = 10;
  const groups = new Map(); // display id → { wa, wins }
  for (const w of stickyWindows.keys()) {
    if (w.isDestroyed() || !w.isVisible() || w.isMinimized()) continue;
    const d = screen.getDisplayMatching(w.getBounds());
    if (!groups.has(d.id)) groups.set(d.id, { wa: d.workArea, wins: [] });
    groups.get(d.id).wins.push(w);
  }
  for (const { wa, wins } of groups.values()) {
    let x = wa.x + GAP, y = wa.y + GAP, rowH = 0, pass = 0;
    for (const w of wins) {
      const b = w.getBounds();
      if (x + b.width > wa.x + wa.width && x > wa.x + GAP) { x = wa.x + GAP + pass * 20; y += rowH + GAP; rowH = 0; }
      if (y + Math.min(b.height, FOLD_HEIGHT * 2) > wa.y + wa.height) { pass++; x = wa.x + GAP + pass * 20; y = wa.y + GAP + pass * FOLD_HEIGHT; rowH = 0; }
      w.setBounds({ x, y, width: b.width, height: b.height });
      x += b.width + GAP;
      rowH = Math.max(rowH, b.height);
    }
  }
  saveStickyList();
}

// ---------- 화면 밖으로 나간 포스트잇 되찾기 (메모잇 v2.00 참고, 2026-10-08) ----------
// 모니터를 빼거나 해상도가 바뀌면 저장해 둔 자리가 화면 밖일 수 있다. 제목줄이 어느 화면에든
// 가로 40px 이상 보이면 그대로 두고(끌어 옮길 수 있으니), 아니면 주 화면 왼쪽 위로 계단식으로 옮긴다.
const VISIBLE_MIN = 40;
function isOnScreen(b) {
  const titleY = b.y + FOLD_HEIGHT / 2;
  return screen.getAllDisplays().some(({ workArea: wa }) => {
    const visibleW = Math.min(b.x + b.width, wa.x + wa.width) - Math.max(b.x, wa.x);
    return visibleW >= VISIBLE_MIN && titleY >= wa.y && titleY < wa.y + wa.height;
  });
}

function rescueOffscreenStickies() {
  const wa = screen.getPrimaryDisplay().workArea;
  let i = 0, moved = 0;
  for (const [w, info] of stickyWindows) {
    if (w.isDestroyed()) continue;
    const b = w.getBounds();
    if (isOnScreen(b)) continue;
    const width = Math.min(b.width, wa.width - 80);
    const height = info.folded ? FOLD_HEIGHT : Math.min(b.height, wa.height - 80);
    w.setBounds({ x: wa.x + 40 + i * 20, y: wa.y + 40 + i * FOLD_HEIGHT, width, height });
    i = (i + 1) % 10;
    moved++;
  }
  if (moved) saveStickyList();
  return moved;
}

// ---------- 다른 기기 변경 받기 ----------
// 포스트잇은 메인 창이 서버에서 받아 저장한 내용을 storage 이벤트로 넘겨받는다. 메인 창은 자기 창이 다시 보일 때만
// 받아 오므로, 절전·화면 잠금에서 돌아올 때와 포스트잇을 누를 때도 받게 알린다(웹 쪽 15초 간격 제한이 그대로 걸린다).
function tellWeb(name) {
  if (!memoWindow || memoWindow.isDestroyed()) return;
  memoWindow.webContents.executeJavaScript(`window.dispatchEvent(new Event('${name}'))`).catch(() => {});
}
const checkRemote = () => tellWeb('dm:check-remote');

// 웹의 confirm/alert → DayMate 창 한가운데에 직접 그린 작은 확인창 (preload.js가 가로채 보냄)
// 윈도우 기본 확인창(dialog.showMessageBox)은 창을 부모로 줘도 모니터 가운데에 떠서, 위치를 직접 계산한 창을 쓴다(2026-09-27)
const DIALOG_W = 380, DIALOG_H = 190;
function dialogHtml(kind, message) {
  // 메시지는 textContent로만 넣는다(메모 내용 등이 HTML로 해석되지 않게). '<'는 스크립트 밖으로 새지 않게 이스케이프
  const msg = JSON.stringify(String(message)).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    :root { color-scheme: light dark; --bg:#ffffff; --fg:#111827; --sub:#6b7280; --line:#e5e7eb; --btn:#f3f4f6; }
    @media (prefers-color-scheme: dark) { :root { --bg:#1c2130; --fg:#e5e7eb; --sub:#9ca3af; --line:#2f3649; --btn:#2a3142; } }
    html,body { margin:0; height:100%; background:var(--bg); color:var(--fg); font-family:'Segoe UI','Malgun Gothic',sans-serif; user-select:none; }
    body { display:flex; flex-direction:column; border:1px solid var(--line); box-sizing:border-box; }
    .t { font-size:12px; color:var(--sub); padding:12px 16px 0; font-weight:600; -webkit-app-region:drag; }
    .m { flex:1; padding:8px 16px; font-size:15px; line-height:1.5; white-space:pre-wrap; word-break:keep-all; overflow:auto; }
    .b { display:flex; gap:8px; justify-content:flex-end; padding:0 16px 14px; }
    button { min-width:80px; height:36px; border-radius:8px; border:1px solid var(--line); background:var(--btn); color:var(--fg); font-size:14px; font-weight:700; cursor:pointer; font-family:inherit; }
    button.ok { background:#6C8EFF; border-color:#6C8EFF; color:#fff; }
    button:focus-visible { outline:2px solid #6C8EFF; outline-offset:2px; }
  </style></head><body>
    <div class="t">DayMate</div><div class="m" id="m"></div>
    <div class="b">${kind === 'confirm' ? '<button id="no">취소</button>' : ''}<button class="ok" id="ok">확인</button></div>
    <script>
      document.getElementById('m').textContent = ${msg};
      const go = (r) => { location.href = 'https://dm-dialog.invalid/' + r; };
      document.getElementById('ok').onclick = () => go('ok');
      const no = document.getElementById('no'); if (no) no.onclick = () => go('no');
      document.getElementById('ok').focus();
      addEventListener('keydown', (e) => { if (e.key === 'Enter') go('ok'); if (e.key === 'Escape') go('no'); });
    </script></body></html>`;
}

function showWindowDialog(parent, kind, message) {
  return new Promise((resolve) => {
    const pb = parent.getBounds();
    const wa = screen.getDisplayMatching(pb).workArea;
    // DayMate 창 한가운데, 화면 밖으로 나가지 않게
    const x = Math.round(Math.min(Math.max(pb.x + (pb.width - DIALOG_W) / 2, wa.x), wa.x + wa.width - DIALOG_W));
    const y = Math.round(Math.min(Math.max(pb.y + (pb.height - DIALOG_H) / 2, wa.y), wa.y + wa.height - DIALOG_H));
    const dlg = new BrowserWindow({
      parent, modal: true, x, y, width: DIALOG_W, height: DIALOG_H, frame: false, resizable: false,
      minimizable: false, maximizable: false, skipTaskbar: true, show: false, alwaysOnTop: parent.isAlwaysOnTop(),
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    let done = false;
    const finish = (ok) => { if (done) return; done = true; resolve(ok); if (!dlg.isDestroyed()) dlg.close(); };
    dlg.webContents.on('will-navigate', (e, url) => { e.preventDefault(); finish(url.endsWith('/ok')); });
    dlg.on('closed', () => finish(false));
    dlg.once('ready-to-show', () => { dlg.show(); dlg.focus(); });
    dlg.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(dialogHtml(kind, message)));
  });
}

ipcMain.on('dm-dialog', (event, { kind, message }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) { event.returnValue = kind !== 'confirm'; return; }
  // 웹 화면은 답(event.returnValue)이 올 때까지 기다린다 — confirm은 true/false
  showWindowDialog(win, kind, message).then((ok) => { event.returnValue = kind === 'confirm' ? ok : true; });
});

ipcMain.on('open-shortcut-settings', () => openSettings());
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
    win.setSize(w, info.unfoldHeight || STICKY_H);
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
    { label: '포스트잇 가지런히 정렬', click: () => arrangeStickies() },
    { label: '화면 밖 포스트잇 불러오기', click: () => { rescueOffscreenStickies(); showAllStickies(); } },
    { type: 'separator' },
    { label: '항상 위에 고정', type: 'checkbox', checked: alwaysOnTop, click: () => toggleAlwaysOnTop() },
    { label: '윈도우 시작 시 자동 실행', type: 'checkbox', checked: autoStart, click: () => toggleAutoStart() },
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

  // 앱 잠금용 — 숨긴 창도 웹에서는 visible로 보여서, 트레이로 숨김·최소화·다시 보임을 직접 알려 준다
  memoWindow.on('hide', () => tellWeb('dm:app-hidden'));
  memoWindow.on('minimize', () => tellWeb('dm:app-hidden'));
  memoWindow.on('show', () => tellWeb('dm:app-shown'));
  memoWindow.on('restore', () => tellWeb('dm:app-shown'));

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
    width: 400, height: 900,
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
ipcMain.handle('set-shortcuts', (_, all) => {
  const { memo, calendar, search, quickMemo, memoSearch, toggleStickies, recentMemo } = all;
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
    const stickyKeys = Object.fromEntries(Object.keys(STICKY_KEY_DEFAULTS).map(k => [k, all[k] ?? shortcuts[k] ?? '']));
    shortcuts = { memo, calendar, search, quickMemo, memoSearch, toggleStickies, recentMemo, ...stickyKeys };
    for (const w of stickyWindows.keys()) if (!w.isDestroyed()) w.webContents.send('sticky-keys-changed');
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
if (process.env.DAYMATE_USER_DATA) globalThis.__daymateTest = { showMemo, showCalendar, showSearch, showMemoSearch, toggleAllStickies, openRecentMemo, createSticky, rescueOffscreenStickies, checkRemote, stickyWindows, arrangeStickies, toggleAutoStart, getAutoStart: () => autoStart };

function toggleMemo() {
  if (!memoWindow) return;
  if (memoWindow.isVisible()) { memoWindow.hide(); } else { showMemo(); }
}

app.whenReady().then(() => {
  applyAutoStart();
  createMemoWindow();
  createTray();
  registerShortcuts();
  (prefs.stickies || []).forEach(st => createSticky(st)); // 지난번에 붙여 둔 포스트잇 다시 띄우기
  rescueOffscreenStickies();
  // 모니터를 빼거나 해상도를 바꾼 순간에도 — 윈도우가 창을 먼저 옮기는 경우가 있어 잠깐 뒤에 본다
  let t = null;
  const rescueLater = () => { clearTimeout(t); t = setTimeout(rescueOffscreenStickies, 1500); };
  screen.on('display-removed', rescueLater);
  screen.on('display-metrics-changed', rescueLater);
  // 절전·화면 잠금에서 돌아오면 다른 기기 변경 받기 — 깬 직후엔 인터넷이 아직 안 붙어 있을 수 있어 몇 초 뒤에
  const checkLater = () => setTimeout(checkRemote, 5000);
  powerMonitor.on('resume', checkLater);
  powerMonitor.on('unlock-screen', checkLater);
});

app.on('before-quit', () => { isQuitting = true; saveStickyList(); });

app.on('window-all-closed', () => {});
app.on('will-quit', () => { globalShortcut.unregisterAll(); });
