// 보유자산 추이 기록 — 이 기기(localStorage)와 계정(users/{uid}/data/pfHistory)에 함께 둔다.
// 계산은 portfolioExtras.js(nextHistoryPoint·mergeHistory), 여기는 저장만.
// 실계좌 총액만 기록한다(My 탭 자산 브리핑·보유자산 실계좌 탭이 시세를 받은 뒤 부른다).
import { store } from "./storage.js";
import { savePfHistoryPoints, loadPfHistory } from "../firebase.js";
import { nextHistoryPoint, mergeHistory } from "./portfolioExtras.js";
import { reportError } from "./errorReport.js";

const KEY = "dm_pf_history";
export const localPfHistory = () => store.get(KEY, {}) || {};

export function notePfValue(authUser, ds, valueUSD, valueKRW) {
  const pts = localPfHistory();
  const p = nextHistoryPoint(pts, ds, valueUSD, valueKRW);
  if (!p) return pts;
  const next = { ...pts, [ds]: p };
  store.set(KEY, next);
  if (authUser) savePfHistoryPoints(authUser.uid, { [ds]: p }).catch((e) => reportError("pf-history", e, "추이 저장"));
  return next;
}

// 계정 기록과 합치고, 이 기기에만 있던 점은 계정에 올린다 (다른 기기에서 쌓인 점도 보이게)
let syncing = null;
export function syncPfHistory(authUser) {
  if (!authUser) return Promise.resolve(localPfHistory());
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const remote = await loadPfHistory(authUser.uid);
      const merged = mergeHistory(localPfHistory(), remote);
      store.set(KEY, merged);
      const up = Object.fromEntries(Object.entries(merged).filter(([ds, p]) => !remote[ds] || (remote[ds].t || 0) < (p.t || 0)));
      if (Object.keys(up).length) await savePfHistoryPoints(authUser.uid, up);
      return merged;
    } catch (e) {
      reportError("pf-history", e, "추이 불러오기");
      return localPfHistory();
    } finally {
      setTimeout(() => { syncing = null; }, 60000); // 1분 안에 다시 부르면 같은 결과를 쓴다
    }
  })();
  return syncing;
}
