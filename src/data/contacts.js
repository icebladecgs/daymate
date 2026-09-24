// 인맥 관리("내 사람들") 데이터 모델 + 날짜 계산 — 순수 함수만, React/Firebase에 의존하지 않는다.
import KoreanLunarCalendar from "korean-lunar-calendar";
import { toDateStr } from "../utils/date.js";

export const DEFAULT_RELATION_TAGS = ["가족", "친구", "직장", "거래처", "모임"];

const genPart = () => Math.random().toString(36).slice(2, 8);
export const genContactId = () => `c_${Date.now()}_${genPart()}`;
export const genSubId = (prefix) => `${prefix}_${Date.now()}_${genPart().slice(0, 6)}`;

export function newContact(name) {
  const now = new Date().toISOString();
  return {
    id: genContactId(),
    name: (name || "").trim(),
    company: "",
    title: "",
    phone: "",
    email: "",
    tags: [],
    cards: [], // { id, frontUrl, frontPath, backUrl, backPath, addedAt }
    birthday: null, // { calendar: 'solar'|'lunar', month, day, year: number|null }
    anniversaries: [], // { id, name, month, day, year: number|null } — v1은 양력만 지원
    firstMet: { date: null, place: "" },
    introducedBy: { personId: null, text: "" },
    memo: "",
    meetings: [], // { id, date, note, createdAt } — 후속 할 일 연결은 contact.linkedTasks 쪽에서 관리
    createdAt: now,
    updatedAt: now,
  };
}

// 전화번호 비교용 정규화: 숫자만 남기고 +82(국가번호)는 0으로 — "+82 10-1234-5678" == "010-1234-5678"
export function normalizePhone(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("82") && d.length >= 11) d = "0" + d.slice(2);
  return d;
}

// 휴대폰 연락처 선택 결과([{ name:[], tel:[], email:[] }])를 가져오기 후보로 변환.
// 이미 등록된 사람(같은 전화번호, 전화번호가 없으면 같은 이름)은 dup=true로 표시하고 기본 체크 해제.
// 선택 목록 안에서 같은 사람이 두 번 나오면 한 번만 남긴다.
export function buildImportCandidates(picked, existingContacts) {
  const existingPhones = new Set((existingContacts || []).map(c => normalizePhone(c.phone)).filter(Boolean));
  const existingNames = new Set((existingContacts || []).map(c => (c.name || "").trim()).filter(Boolean));
  const seen = new Set();
  const out = [];
  (picked || []).forEach((p, i) => {
    const phone = String(p?.tel?.[0] || "").trim();
    const email = String(p?.email?.[0] || "").trim();
    const name = String(p?.name?.[0] || "").trim() || phone;
    if (!name) return;
    const norm = normalizePhone(phone);
    const key = norm || `name:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    const dup = norm ? existingPhones.has(norm) : existingNames.has(name);
    out.push({ key: `${key}_${i}`, name: name.slice(0, 40), phone: phone.slice(0, 20), email: email.slice(0, 60), dup, checked: !dup });
  });
  return out;
}

function parseYmd(dateStr) {
  return new Date(`${dateStr}T00:00:00`);
}

function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

// 다음 발생일(양력 Date)을 계산한다. 음력은 KASI 변환표 기반(korean-lunar-calendar, 1000~2050년 지원)이며,
// 저장 시 월/일만 받으므로(윤달 여부 모름) 평달로 가정해 변환한다 — 실제 생일이 윤달인 극소수 경우 하루 이상 어긋날 수 있다.
// 양력 2/29는 평년에는 2/28로 챙긴다(3/1로 미루지 않음).
export function getNextSolarOccurrence(month, day, calendarType, todayStr = toDateStr()) {
  if (!month || !day) return null;
  const today = parseYmd(todayStr);
  const thisYear = today.getFullYear();

  if (calendarType === "lunar") {
    const cal = new KoreanLunarCalendar();
    for (const y of [thisYear, thisYear + 1]) {
      if (cal.setLunarDate(y, month, day, false)) {
        const s = cal.getSolarCalendar();
        const d = parseYmd(`${s.year}-${String(s.month).padStart(2, "0")}-${String(s.day).padStart(2, "0")}`);
        if (d >= today) return d;
      }
    }
    return null; // 변환 실패 — 지원 범위(1000~2050) 밖인 극히 드문 경우
  }

  for (const y of [thisYear, thisYear + 1]) {
    const useDay = month === 2 && day === 29 && !isLeapYear(y) ? 28 : day;
    const d = parseYmd(`${y}-${String(month).padStart(2, "0")}-${String(useDay).padStart(2, "0")}`);
    if (d >= today) return d;
  }
  return null;
}

export function daysUntil(date, todayStr = toDateStr()) {
  const today = parseYmd(todayStr);
  return Math.round((date - today) / 86400000);
}

// 홈 위젯용 — 오늘 포함 windowDays일 이내 생일·기념일만 모아 D-day 순으로 반환
export function getUpcomingContactEvents(contacts, windowDays, todayStr = toDateStr()) {
  const events = [];
  (contacts || []).forEach((c) => {
    if (c.birthday?.month && c.birthday?.day) {
      const occ = getNextSolarOccurrence(c.birthday.month, c.birthday.day, c.birthday.calendar || "solar", todayStr);
      if (occ) {
        const dday = daysUntil(occ, todayStr);
        if (dday >= 0 && dday <= windowDays) {
          events.push({ contactId: c.id, name: c.name, type: "birthday", label: "생일", dday });
        }
      }
    }
    (c.anniversaries || []).forEach((a) => {
      if (!a.month || !a.day) return;
      const occ = getNextSolarOccurrence(a.month, a.day, "solar", todayStr);
      if (occ) {
        const dday = daysUntil(occ, todayStr);
        if (dday >= 0 && dday <= windowDays) {
          events.push({ contactId: c.id, name: c.name, type: "anniversary", label: a.name || "기념일", dday });
        }
      }
    });
  });
  return events.sort((a, b) => a.dday - b.dday);
}

// 홈 위젯 "오늘 챙길 사람" 조합 — 생일·기념일(window일 이내) + 기한이 지났거나 오늘인 미완료 후속 할 일.
// 완료 여부는 사람 쪽에 복제하지 않고 그 날짜의 실제 task(plans)를 그때그때 조회해서 판단한다.
export function getContactReminders(contacts, plans, windowDays = 7, todayStr = toDateStr()) {
  const items = [];
  getUpcomingContactEvents(contacts, windowDays, todayStr).forEach((ev) => {
    const when = ev.dday === 0 ? "오늘" : `${ev.dday}일 뒤`;
    items.push({ key: `${ev.type}_${ev.contactId}`, text: `${when} ${ev.name}님 ${ev.label}` });
  });
  (contacts || []).forEach((c) => {
    (c.linkedTasks || []).forEach((lt) => {
      if (lt.date > todayStr) return;
      const task = (plans?.[lt.date]?.tasks || []).find((t) => t.id === lt.taskId);
      if (!task || task.done) return;
      const when = lt.date === todayStr ? "오늘" : "지난";
      items.push({ key: `task_${lt.taskId}`, text: `${when} ${c.name}님께 ${task.title || lt.title}` });
    });
  });
  return items;
}

export function searchContacts(contacts, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return contacts || [];
  return (contacts || []).filter((c) =>
    (c.name || "").toLowerCase().includes(q) ||
    (c.company || "").toLowerCase().includes(q) ||
    (c.title || "").toLowerCase().includes(q) ||
    (c.tags || []).some((t) => t.toLowerCase().includes(q))
  );
}
