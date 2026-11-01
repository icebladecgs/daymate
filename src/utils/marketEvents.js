import { holidayName } from "./holidays.js";

// 달력 아래 "📈 이번 달 증시 일정" (2026-11-01) — 외부 API 없이 앱 안 표·규칙으로 만든다(공휴일과 같은 방식).
// · 규칙으로 계산(해마다 손볼 필요 없음): 코스피 옵션만기(매월 둘째 목요일, 3·6·9·12월은 동시만기), 코스피 휴장(평일 공휴일·연말),
//   미국 옵션만기(매월 셋째 금요일, 3·6·9·12월은 네 마녀의 날).
// · 발표된 날짜를 표에 넣음(해마다 추가): 금통위·FOMC·CPI·고용보고서·미국 휴장. 지금 표는 2026년 11월 ~ 2027년 12월.
//   2026-11-26 금통위는 공식 자료로 확인 못 한 날짜. 2027 CPI는 BLS 공식 발표 전 달력 사이트 날짜.
// · 미국 발표는 한국 시간으로 바꿔 보여준다: FOMC는 미국 오후 2시 → 다음 날 새벽, CPI·고용은 오전 8시 30분 → 그날 밤.
// 국기 이모지는 윈도우에서 "KR"·"US" 글자로 보여 글자 표시로 한다
export const MARKETS = [
  { id: "kr", label: "코스피", tag: "한국", color: "#EF4444" },
  { id: "us", label: "나스닥", tag: "미국", color: "#5B7CFA" },
];

const BOK = ["2026-11-26", "2027-01-14", "2027-02-25", "2027-04-09", "2027-05-27", "2027-07-15", "2027-08-26", "2027-10-15", "2027-11-25"];
// FOMC 결정일(미국 날짜, 회의 둘째 날). * 표시 회의는 점도표(경제 전망) 함께 발표
const FOMC = ["2026-12-09*", "2027-01-27", "2027-03-17*", "2027-04-28", "2027-06-09*", "2027-07-28", "2027-09-15*", "2027-10-27", "2027-12-08*"];
const CPI = ["2026-11-10", "2026-12-10", "2027-01-13", "2027-02-11", "2027-03-10", "2027-04-13", "2027-05-12", "2027-06-10", "2027-07-14", "2027-08-11", "2027-09-14", "2027-10-14", "2027-11-10", "2027-12-10"];
const JOBS = ["2026-11-06", "2026-12-04", "2027-01-08", "2027-02-05", "2027-03-05", "2027-04-02", "2027-05-07", "2027-06-04", "2027-07-02", "2027-08-06", "2027-09-03", "2027-10-08", "2027-11-05", "2027-12-03"];
const US_CLOSED = {
  "2026-01-01": "새해", "2026-01-19": "마틴 루터 킹 데이", "2026-02-16": "대통령의 날", "2026-04-03": "성금요일", "2026-05-25": "메모리얼 데이",
  "2026-06-19": "준틴스", "2026-07-03": "독립기념일 대체", "2026-09-07": "노동절", "2026-11-26": "추수감사절", "2026-12-25": "크리스마스",
  "2027-01-01": "새해", "2027-01-18": "마틴 루터 킹 데이", "2027-02-15": "대통령의 날", "2027-03-26": "성금요일", "2027-05-31": "메모리얼 데이",
  "2027-06-18": "준틴스 대체", "2027-07-05": "독립기념일 대체", "2027-09-06": "노동절", "2027-11-25": "추수감사절", "2027-12-24": "크리스마스 대체",
};

const pad = (n) => String(n).padStart(2, "0");
const dsOf = (y, m0, d) => `${y}-${pad(m0 + 1)}-${pad(d)}`;
const dateOf = (ds) => new Date(`${ds}T12:00:00`);
const addDays = (ds, n) => { const d = dateOf(ds); d.setDate(d.getDate() + n); return dsOf(d.getFullYear(), d.getMonth(), d.getDate()); };
const weekend = (ds) => { const w = dateOf(ds).getDay(); return w === 0 || w === 6; };
// 그달 n번째 w요일
const nthWeekday = (y, m0, n, w) => { const first = new Date(y, m0, 1).getDay(); return dsOf(y, m0, 1 + ((w - first + 7) % 7) + (n - 1) * 7); };

// 미국 서머타임: 3월 둘째 일요일 ~ 11월 첫째 일요일
function usDst(ds) {
  const y = Number(ds.slice(0, 4));
  return ds >= nthWeekday(y, 2, 2, 0) && ds < nthWeekday(y, 10, 1, 0);
}

// 한국 증시 휴장 — 평일 공휴일 + 연말(12/31, 주말·공휴일이면 그 앞 평일)
function krYearEnd(y) {
  let d = `${y}-12-31`;
  while (weekend(d) || holidayName(d)) d = addDays(d, -1);
  return d;
}
const krClosed = (ds) => !weekend(ds) && (!!holidayName(ds) || ds === krYearEnd(Number(ds.slice(0, 4))));
const prevKrOpen = (ds) => { let d = ds; while (weekend(d) || krClosed(d)) d = addDays(d, -1); return d; };
const prevUsOpen = (ds) => { let d = ds; while (weekend(d) || US_CLOSED[d]) d = addDays(d, -1); return d; };

// 그달 증시 일정 [{ ds, market, title, time }] — ds는 한국 날짜, 날짜순
export function marketEventsOf(y, m0, markets) {
  const on = new Set(markets || []);
  const ym = `${y}-${pad(m0 + 1)}`;
  const out = [];
  const push = (ds, market, title, time = "") => { if (ds.startsWith(ym)) out.push({ ds, market, title, time }); };
  const quarter = (m0 + 1) % 3 === 0;
  if (on.has("kr")) {
    BOK.forEach(ds => push(ds, "kr", "금통위 기준금리 결정", "오전"));
    push(prevKrOpen(nthWeekday(y, m0, 2, 4)), "kr", quarter ? "선물·옵션 동시만기" : "옵션만기");
    const days = new Date(y, m0 + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const ds = dsOf(y, m0, d);
      if (krClosed(ds)) push(ds, "kr", `휴장 (${holidayName(ds) || "연말"})`);
    }
  }
  if (on.has("us")) {
    FOMC.forEach(raw => {
      const ds = raw.replace("*", "");
      push(addDays(ds, 1), "us", `FOMC 금리 결정${raw.endsWith("*") ? " · 점도표" : ""}`, usDst(ds) ? "새벽 3시" : "새벽 4시");
    });
    const night = (ds) => (usDst(ds) ? "밤 9시 30분" : "밤 10시 30분");
    CPI.forEach(ds => push(ds, "us", "소비자물가(CPI)", night(ds)));
    JOBS.forEach(ds => push(ds, "us", "고용보고서", night(ds)));
    push(prevUsOpen(nthWeekday(y, m0, 3, 5)), "us", quarter ? "네 마녀의 날 (선물·옵션 동시만기)" : "옵션만기");
    Object.entries(US_CLOSED).forEach(([ds, name]) => push(ds, "us", `휴장 (${name})`));
  }
  return out.sort((a, b) => a.ds.localeCompare(b.ds) || a.market.localeCompare(b.market));
}

// 표(금통위·FOMC·CPI·고용·미국 휴장)가 들어 있는 달인지 — 아니면 만기일·한국 휴장만 보인다는 안내
export const SCHEDULE_RANGE = "2026년 11월 ~ 2027년 12월";
export const hasScheduleFor = (y, m0) => { const ym = `${y}-${pad(m0 + 1)}`; return ym >= "2026-11" && ym <= "2027-12"; };
