// 웹 화면(daymate-beta.vercel.app)에서 데스크탑 기능을 부를 수 있게 하는 다리 — window.daymateDesktop
const { contextBridge, ipcRenderer } = require('electron');

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
  // 메모 관리자일 때 메인 창을 넓게
  setWideMode: (on) => ipcRenderer.send('set-wide-mode', !!on),
});
