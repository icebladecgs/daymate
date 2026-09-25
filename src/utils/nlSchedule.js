// 문장으로 일정 입력 (Fantastical·Todoist 참고) — 외부 AI 없이 규칙으로 해석한다.
// "내일 오후 3시 지점장 회의" → { title: "지점장 회의", date: "2026-09-26", time: "15:00" }
// "매월 둘째 화요일 월례회의" → { title: "월례회의", recurring: "nth:2:2" }
// 알아듣는 표현이 하나도 없으면 null (그냥 제목으로 추가)

const WD = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
const NTH = { 첫째: 1, 첫번째: 1, 둘째: 2, 두번째: 2, 셋째: 3, 세번째: 3, 넷째: 4, 네번째: 4, 마지막: -1 };
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDaysD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// 뒤에 붙은 조사(에, 에는, 까지, 부터)까지 함께 떼어낸다
const TAIL = "(?:에는|에|까지|부터)?";

export function parseSchedule(input, now = new Date()) {
  let text = ` ${String(input || "").trim()} `;
  if (!text.trim()) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let date = null, time = null, recurring = null;
  const take = (re, fn) => {
    const m = re.exec(text);
    if (!m) return false;
    if (fn(m) === false) return false;
    text = text.slice(0, m.index) + " " + text.slice(m.index + m[0].length);
    return true;
  };

  // ── 반복: 매월 n번째 ○요일 / 매주 ○요일 / 매일
  take(new RegExp(`\\s매\\s?(?:월|달)\\s*(첫째|첫번째|둘째|두번째|셋째|세번째|넷째|네번째|마지막)\\s*(?:주\\s*)?([일월화수목금토])요일${TAIL}(?=\\s)`), m => { recurring = `nth:${NTH[m[1]]}:${WD[m[2]]}`; })
    || take(new RegExp(`\\s매\\s?주\\s*([일월화수목금토])요일${TAIL}(?=\\s)`), m => { recurring = String(WD[m[1]]); })
    || take(new RegExp(`\\s(?:매일|날마다)${TAIL}(?=\\s)`), () => { recurring = "daily"; });

  // ── 날짜
  if (!recurring) {
    take(new RegExp(`\\s(오늘|내일|모레|글피)${TAIL}(?=\\s)`), m => { date = addDaysD(today, { 오늘: 0, 내일: 1, 모레: 2, 글피: 3 }[m[1]]); })
      || take(new RegExp(`\\s(\\d{1,2})\\s*일\\s*(?:후|뒤)${TAIL}(?=\\s)`), m => { date = addDaysD(today, Number(m[1])); })
      || take(new RegExp(`\\s(이번\\s?주|다음\\s?주|담주|다다음\\s?주)?\\s*([일월화수목금토])요일${TAIL}(?=\\s)`), m => {
        const w = WD[m[2]];
        const which = (m[1] || "").replace(/\s/g, "");
        if (!which) { // 그냥 "금요일" → 오늘 포함 가장 가까운 그 요일
          date = addDaysD(today, (w - today.getDay() + 7) % 7);
          return;
        }
        // 이번 주/다음 주는 월요일 시작 주 기준
        const mondayOffset = (today.getDay() + 6) % 7;
        const thisMonday = addDaysD(today, -mondayOffset);
        const weeks = which === "이번주" ? 0 : which === "다다음주" ? 2 : 1;
        date = addDaysD(thisMonday, weeks * 7 + ((w + 6) % 7));
      })
      || take(new RegExp(`\\s(?:(\\d{4})[년.\\-/]\\s*)?(\\d{1,2})\\s*(?:월|[./])\\s*(\\d{1,2})\\s*일?${TAIL}(?=\\s)`), m => {
        const mo = Number(m[2]), da = Number(m[3]);
        if (mo < 1 || mo > 12 || da < 1 || da > 31) return false;
        let y = m[1] ? Number(m[1]) : today.getFullYear();
        let d = new Date(y, mo - 1, da);
        if (!m[1] && d < addDaysD(today, -30)) d = new Date(y + 1, mo - 1, da); // 한참 지난 날짜면 내년
        date = d;
      })
      || take(new RegExp(`\\s(다음\\s?달|이번\\s?달)?\\s*(\\d{1,2})\\s*일${TAIL}(?=\\s)`), m => {
        const da = Number(m[2]);
        if (da < 1 || da > 31) return false;
        const next = (m[1] || "").replace(/\s/g, "") === "다음달";
        let d = new Date(today.getFullYear(), today.getMonth() + (next ? 1 : 0), da);
        if (!m[1] && d < today) d = new Date(today.getFullYear(), today.getMonth() + 1, da); // 지난 날이면 다음 달
        date = d;
      });
  }

  // ── 시간
  take(new RegExp(`\\s(오전|오후|아침|점심|저녁|밤|새벽)?\\s*(\\d{1,2})\\s*시\\s*(?:(\\d{1,2})\\s*분|(반))?${TAIL}(?=\\s)`), m => {
    let h = Number(m[2]);
    const min = m[4] ? 30 : Number(m[3] || 0);
    if (h > 24 || min > 59) return false;
    const ampm = m[1];
    if (ampm === "오후" || ampm === "저녁" || ampm === "밤") { if (h < 12) h += 12; }
    else if (ampm === "점심") { if (h < 6) h += 12; }
    else if (ampm === "오전" || ampm === "아침" || ampm === "새벽") { if (h === 12) h = 0; }
    else if (h >= 1 && h <= 7) h += 12; // "3시 회의"는 보통 오후 3시
    time = `${pad(h % 24)}:${pad(min)}`;
  })
    || take(new RegExp(`\\s(\\d{1,2}):(\\d{2})${TAIL}(?=\\s)`), m => {
      const h = Number(m[1]), min = Number(m[2]);
      if (h > 23 || min > 59) return false;
      time = `${pad(h)}:${pad(min)}`;
    });

  if (!date && !time && !recurring) return null;
  const title = text.replace(/\s+/g, " ").trim();
  if (!title) return null; // 제목 없이 날짜만 쓴 경우는 해석하지 않음
  return { title, date: date ? ymd(date) : null, time, recurring };
}

// 미리보기 문구: "9/26(토) 15:00" · "매월 둘째 화요일"
export function describeSchedule(p, labelRecurring) {
  if (!p) return "";
  const parts = [];
  if (p.recurring) parts.push(labelRecurring ? labelRecurring(p.recurring) : "반복");
  if (p.date) {
    const d = new Date(`${p.date}T00:00:00`);
    parts.push(`${d.getMonth() + 1}/${d.getDate()}(${"일월화수목금토"[d.getDay()]})`);
  }
  if (p.time) parts.push(p.time);
  return parts.join(" ");
}
