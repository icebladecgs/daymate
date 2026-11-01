// 우리나라 공휴일 (2026-11-01) — 달력 탭에서 날짜를 빨갛게, 칸에 이름을 보여준다. 외부 API 없이 앱 안 표로 계산.
// · 음력 날짜(설날·부처님오신날·추석)는 LUNAR 표 — Intl 단기력(dangi)으로 뽑아 2024~2027 공식 달력과 맞춰 봤다.
//   2032년 뒤는 비어 있다(2033년 음력 계산 문제가 있어 공식 월력요항이 나오면 추가).
// · 대체공휴일은 지금 규칙으로 계산: 설·추석은 일요일이나 다른 공휴일과 겹칠 때, 어린이날·국경일(삼일절·제헌절·광복절·
//   개천절·한글날)·부처님오신날·성탄절·노동절은 토·일요일이나 다른 공휴일과 겹칠 때 → 그 뒤 첫 평일. 신정·현충일은 없음.
// · 제헌절·노동절은 2026년부터 공휴일(공휴일법 개정).
// · 선거일·임시공휴일은 미리 알 수 없어서 EXTRA 표에 직접 넣는다.
const LUNAR = {
  2024: ["02-10", "05-15", "09-17"],
  2025: ["01-29", "05-05", "10-06"],
  2026: ["02-17", "05-24", "09-25"],
  2027: ["02-07", "05-13", "09-15"],
  2028: ["01-27", "05-02", "10-03"],
  2029: ["02-13", "05-20", "09-22"],
  2030: ["02-03", "05-09", "09-12"],
  2031: ["01-23", "05-28", "10-01"],
  2032: ["02-11", "05-16", "09-19"],
};
const EXTRA = {
  "2024-04-10": "국회의원 선거",
  "2024-10-01": "국군의 날(임시)",
  "2025-01-27": "임시공휴일",
  "2025-06-03": "대통령 선거",
  "2026-06-03": "지방선거",
  "2028-04-12": "국회의원 선거",
};

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };
const dow = (s) => new Date(`${s}T12:00:00`).getDay();

// sub: 'none' 대체 없음 / 'sun' 일요일·겹침만(설·추석) / 'all' 토·일요일·겹침
function baseList(y) {
  const L = [];
  const add = (md, name, sub) => L.push({ ds: `${y}-${md}`, name, sub });
  add("01-01", "신정", "none");
  add("03-01", "삼일절", "all");
  if (y >= 2026) add("05-01", "노동절", "all");
  add("05-05", "어린이날", "all");
  add("06-06", "현충일", "none");
  if (y >= 2026) add("07-17", "제헌절", "all");
  add("08-15", "광복절", "all");
  add("10-03", "개천절", "all");
  add("10-09", "한글날", "all");
  add("12-25", "성탄절", "all");
  const lunar = LUNAR[y];
  if (lunar) {
    const [seol, buddha, chuseok] = lunar.map(md => `${y}-${md}`);
    [[seol, "설날"], [chuseok, "추석"]].forEach(([d, name]) => {
      L.push({ ds: addDays(d, -1), name: `${name} 연휴`, sub: "sun" }, { ds: d, name, sub: "sun" }, { ds: addDays(d, 1), name: `${name} 연휴`, sub: "sun" });
    });
    L.push({ ds: buddha, name: "부처님오신날", sub: "all" });
  }
  Object.entries(EXTRA).forEach(([ds, name]) => { if (ds.startsWith(`${y}-`)) L.push({ ds, name, sub: "none" }); });
  return L;
}

const cache = new Map();
// 그해 공휴일 { 'YYYY-MM-DD': '이름' } — 같은 날 두 개면 "어린이날·부처님오신날"
export function holidaysOf(y) {
  if (cache.has(y)) return cache.get(y);
  const list = baseList(y);
  const map = {};
  list.forEach(h => { map[h.ds] = map[h.ds] ? `${map[h.ds]}·${h.name}` : h.name; });
  // 날짜마다 "잃은 휴일" 수 → 그 뒤 첫 평일(토·일·공휴일·이미 정한 대체일이 아닌 날)을 대체공휴일로
  const byDay = new Map();
  list.forEach(h => byDay.set(h.ds, [...(byDay.get(h.ds) || []), h]));
  const days = [...byDay.keys()].sort();
  for (const ds of days) {
    const hs = byDay.get(ds);
    const w = dow(ds);
    const eligible = hs.filter(h => h.sub !== "none");
    let lost = 0;
    if (w === 0) lost = eligible.length;
    else if (w === 6) lost = hs.filter(h => h.sub === "all").length;
    else if (eligible.length) lost = hs.length - 1;
    let d = ds;
    while (lost > 0) {
      d = addDays(d, 1);
      const dw = dow(d);
      if (dw === 0 || dw === 6 || map[d]) continue;
      map[d] = "대체공휴일";
      lost--;
    }
  }
  cache.set(y, map);
  return map;
}

// 그날 공휴일 이름 (아니면 "")
export function holidayName(ds) {
  if (!ds) return "";
  return holidaysOf(Number(ds.slice(0, 4)))[ds] || "";
}
