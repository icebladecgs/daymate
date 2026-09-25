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
  // 메모 관리자일 때 메인 창을 넓게
  setWideMode: (on) => ipcRenderer.send('set-wide-mode', !!on),
});
