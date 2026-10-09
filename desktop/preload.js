// 웹 화면(daymate-beta.vercel.app)에서 데스크탑 기능을 부를 수 있게 하는 다리 — window.daymateDesktop
const { contextBridge, ipcRenderer, webFrame } = require('electron');

// 확인창·알림창(window.confirm/alert)을 윈도우 기본 방식 대신 DayMate 창에 붙여서 띄운다 —
// 기본 방식은 앱 창 위치와 상관없이 모니터 가운데에 떴다(2026-09-27). 웹 코드는 그대로 confirm/alert를 쓰면 된다.
contextBridge.exposeInMainWorld('__dmDialog', {
  confirm: (msg) => ipcRenderer.sendSync('dm-dialog', { kind: 'confirm', message: String(msg ?? '') }),
  alert: (msg) => ipcRenderer.sendSync('dm-dialog', { kind: 'alert', message: String(msg ?? '') }),
});
webFrame.executeJavaScript(`
  window.confirm = (m) => window.__dmDialog.confirm(m);
  window.alert = (m) => { window.__dmDialog.alert(m); };
`);

contextBridge.exposeInMainWorld('daymateDesktop', {
  // 포스트잇(바탕화면 메모)
  newSticky: () => ipcRenderer.send('sticky-new'),
  openSticky: (ds, id) => ipcRenderer.send('sticky-open', { ds, id }),
  stickyCreated: (info) => ipcRenderer.send('sticky-created', info),
  stickyClose: (info) => ipcRenderer.send('sticky-close', info || {}),
  togglePin: () => ipcRenderer.invoke('sticky-toggle-pin'),
  minimize: () => ipcRenderer.send('sticky-minimize'),
  // 접기/펼치기 — 창을 제목줄 높이로 줄이거나 원래 높이로. 바뀐 상태(true=접힘)를 돌려줌
  fold: (on) => ipcRenderer.invoke('sticky-fold', !!on),
  // 포스트잇 창 안 단축키 — 앱이 키를 받아 동작 이름('fold'·'close'·'pin'·'copy')을 보내 준다. 해제 함수를 돌려줌
  onStickyKey: (cb) => {
    const h = (_, action) => cb(action);
    ipcRenderer.on('sticky-key', h);
    return () => ipcRenderer.removeListener('sticky-key', h);
  },
  // 버튼 설명에 보여 줄 현재 키 설정 — 바뀌면 onStickyKeysChanged로 알림
  getStickyKeys: () => ipcRenderer.invoke('get-shortcuts').then(s => ({ fold: s.stickyFold, new: s.stickyNew, close: s.stickyClose, pin: s.stickyPin, copy: s.stickyCopy })),
  onStickyKeysChanged: (cb) => {
    const h = () => cb();
    ipcRenderer.on('sticky-keys-changed', h);
    return () => ipcRenderer.removeListener('sticky-keys-changed', h);
  },
  // 1.3.3~: 전체 단축키(전역 7개 + 포스트잇 5개) — 메모 설정의 안내에 실제 값을 보여 준다. 바뀌면 onStickyKeysChanged로 알림
  getShortcuts: () => ipcRenderer.invoke('get-shortcuts'),
  // 메모 관리자일 때 메인 창을 넓게
  setWideMode: (on) => ipcRenderer.send('set-wide-mode', !!on),
  // 메모 설정 창(웹)의 "단축키 바꾸기" → 트레이 메뉴의 단축키 설정 창과 같은 창 (1.3.0~)
  openShortcutSettings: () => ipcRenderer.send('open-shortcut-settings'),
  // 1.3.1~: 앱 버전(새 버전 알림), 링크를 기본 브라우저로, 포스트잇 투명도(0.5~1, 바뀐 값을 돌려줌), 띄운 포스트잇 목록
  getVersion: () => ipcRenderer.invoke('app-version'),
  openExternal: (url) => ipcRenderer.send('open-external', String(url || '')),
  setStickyOpacity: (v) => ipcRenderer.invoke('sticky-opacity', v),
  getOpenStickies: () => ipcRenderer.invoke('sticky-list'),
});
