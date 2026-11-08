// 달러 → 원 환율 (오늘 하루 저장) — 보유자산·자산 브리핑과 같은 저장 이름(dm_fx_usd_krw_날짜)을 같이 쓴다
import { useEffect, useState } from "react";
import { toDateStr } from "./date.js";

export function useUsdKrw(needed) {
  const key = `dm_fx_usd_krw_${toDateStr()}`;
  const [rate, setRate] = useState(() => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } });
  useEffect(() => {
    if (!needed || rate) return;
    let alive = true;
    fetch("/api/market?type=fx&from=USD&to=KRW").then((r) => r.json())
      .then((d) => { if (alive && d?.ok && d.rate) { try { localStorage.setItem(key, JSON.stringify(d.rate)); } catch { /* 저장 못 해도 화면엔 씀 */ } setRate(d.rate); } })
      .catch(() => {});
    return () => { alive = false; };
  }, [needed, rate, key]);
  return rate;
}
