// 배당 기록 받기 (api/market.js ?type=dividends, Yahoo) — 종목마다 하루 한 번만 묻는다
import { store } from "../utils/storage.js";
import { toDateStr } from "../utils/date.js";

const KEY = "dm_div_cache"; // { [yahooSym]: { at: 'YYYY-MM-DD', currency, list } }

export async function fetchDividends(syms) {
  const today = toDateStr();
  const cache = store.get(KEY, {}) || {};
  const need = [...new Set(syms.filter(Boolean))].filter((s) => cache[s]?.at !== today);
  if (need.length) {
    try {
      const res = await fetch(`/api/market?type=dividends&syms=${encodeURIComponent(need.join(","))}`);
      const data = res.ok ? await res.json() : {};
      for (const s of need) cache[s] = { at: today, currency: data?.[s]?.currency || null, list: data?.[s]?.list || [] };
      store.set(KEY, cache);
    } catch { /* 못 받으면 예전 값으로 */ }
  }
  return Object.fromEntries(syms.filter((s) => cache[s]).map((s) => [s, cache[s]]));
}
