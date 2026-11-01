// 계정을 바꿔 끼우는 동안(utils/accountSwap.js) 앱이 저장소에 쓰지 않게 막는다 — 앱을 새로 열 때까지
let frozen = false;
export const freezeStore = (on) => { frozen = !!on; };

export const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    if (frozen) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  },
  remove(key) {
    if (frozen) return;
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};
