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
    anniversaries: [], // { id, name, month, day, year: number|null, calendar?: 'solar'|'lunar' } — 음력은 2026-11-03부터 (제사 등)
    firstMet: { date: null, place: "" },
    introducedBy: { personId: null, text: "" },
    memo: "",
    meetings: [], // { id, date, note, createdAt } — 후속 할 일 연결은 contact.linkedTasks 쪽에서 관리
    // 연락 주기(2026-11-09): contactEvery = 며칠마다(0·없음 = 안 정함), contactEverySince = 정한 날(기록이 없으면 여기부터 셈),
    // lastContactAt = "오늘 연락했어요"로 남긴 날짜. 마지막 연락일은 이것과 만남 기록 중 늦은 날
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

// 화면에 보일 전화번호 모양 (2026-11-10 — 저장된 글자 그대로 보여 "010-000-00000"처럼 나오던 것).
// 저장 값은 바꾸지 않고 숫자만 다시 끊는다: 휴대폰 010-0000-0000(10자리는 3-3-4), 서울 02-000(0)-0000, 지역 031-000(0)-0000,
// 대표번호 1588-0000, 070·050 인터넷 전화. 모르는 모양이면 저장된 글자 그대로
export function formatPhone(phone) {
  const raw = String(phone || "").trim();
  const d = normalizePhone(raw);
  if (!d || /[^\d\s()+\-.]/.test(raw)) return raw; // 내선·메모가 섞이면 그대로
  if (/^01\d/.test(d)) return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : raw;
  if (/^02/.test(d)) return d.length === 10 ? `02-${d.slice(2, 6)}-${d.slice(6)}` : d.length === 9 ? `02-${d.slice(2, 5)}-${d.slice(5)}` : raw;
  if (/^0\d{2}/.test(d)) return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : raw;
  if (/^1[5-9]\d{2}/.test(d) && d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return raw;
}

// 휴대폰 연락처 선택 결과([{ name:[], tel:[], email:[] }])를 가져오기 후보로 변환.
// 이미 등록된 사람(같은 전화번호, 전화번호가 없으면 같은 이름)은 dup=true로 표시.
// 안드로이드 선택 창에서 "모두 선택"으로 전체를 넘겨받은 뒤 앱에서 골라 등록하는 흐름이라 기본은 모두 체크 해제.
// 선택 목록 안에서 같은 사람이 두 번 나오면 한 번만 남긴다.
export function buildImportCandidates(picked, existingContacts) {
  const existingPhones = new Set((existingContacts || []).map(c => normalizePhone(c.phone)).filter(Boolean));
  const existingNames = new Set((existingContacts || []).map(c => String(c.name || "").normalize("NFC").trim()).filter(Boolean));
  const seen = new Set();
  const out = [];
  (picked || []).forEach((p, i) => {
    // 기기에 따라 한글이 자모 분리(NFD)로 올 수 있어 표준(NFC)으로 맞춰 저장
    const phone = String(p?.tel?.[0] || "").normalize("NFC").trim();
    const email = String(p?.email?.[0] || "").normalize("NFC").trim();
    const name = String(p?.name?.[0] || "").normalize("NFC").trim() || phone;
    if (!name) return;
    const norm = normalizePhone(phone);
    const key = norm || `name:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    const dup = norm ? existingPhones.has(norm) : existingNames.has(name);
    const item = { key: `${key}_${i}`, name: name.slice(0, 40), phone: phone.slice(0, 20), email: email.slice(0, 60), dup, checked: false };
    // vCard 파일에서 온 것만 있는 칸 (휴대폰 연락처 선택 창은 이름·전화만 준다)
    if (p?.org?.[0]) item.company = String(p.org[0]).normalize("NFC").trim().slice(0, 40);
    if (p?.title?.[0]) item.title = String(p.title[0]).normalize("NFC").trim().slice(0, 20);
    if (p?.bday?.month && p?.bday?.day) item.birthday = { calendar: "solar", month: p.bday.month, day: p.bday.day, year: p.bday.year || "" };
    item.search = buildSearchIndex(item); // 가져오기 창 검색용으로 한 번만 계산
    out.push(item);
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
      const occ = getNextSolarOccurrence(a.month, a.day, a.calendar || "solar", todayStr);
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

// 오늘 탭 "다가오는 날" — excludeWithin일까지는 "오늘 챙길 사람" 칸에 이미 보이므로 뺀다 (그 칸을 숨겼으면 -1)
export function getUpcomingDays(contacts, todayStr = toDateStr(), { excludeWithin = 7, maxDays = 100 } = {}) {
  return getUpcomingContactEvents(contacts, maxDays, todayStr).filter((ev) => ev.dday > excludeWithin);
}

// ── 연락 주기 (2026-11-09) ── 생일이 아니어도 챙길 계기 — 정한 사람만(기본 "안 정함")
export const CONTACT_EVERY_OPTIONS = [
  { v: 0, l: "안 정함" }, { v: 14, l: "2주" }, { v: 30, l: "1달" }, { v: 90, l: "3달" }, { v: 180, l: "6달" }, { v: 365, l: "1년" },
];
export const contactEveryLabel = (v) => CONTACT_EVERY_OPTIONS.find((o) => o.v === Number(v))?.l || `${v}일`;

export function daysBetween(fromStr, toStr) {
  return Math.round((parseYmd(toStr) - parseYmd(fromStr)) / 86400000);
}

// 마지막 연락일 — 만남 기록(오늘까지)과 "오늘 연락했어요" 중 늦은 날. 없으면 null
export function lastContactDate(c, todayStr = toDateStr()) {
  let last = null;
  const take = (d) => { if (d && d <= todayStr && (!last || d > last)) last = d; };
  (c?.meetings || []).forEach((m) => take(m.date));
  take(c?.lastContactAt);
  return last;
}

// "오늘" · "어제" · "5일 전" · "3주 전" · "2달 전" · "1년 전"
export function agoLabel(days) {
  if (days == null) return "";
  if (days <= 0) return "오늘";
  if (days === 1) return "어제";
  if (days < 14) return `${days}일 전`;
  if (days < 60) return `${Math.floor(days / 7)}주 전`;
  if (days < 365) return `${Math.floor(days / 30)}달 전`;
  return `${Math.floor(days / 365)}년 전`;
}

// 연락할 때인지 — 주기를 안 정했으면 null. 기록이 없으면 주기를 정한 날(없으면 등록한 날)부터 센다
// (주기를 정하자마자 기록 없는 사람이 한꺼번에 뜨지 않게)
export function contactDue(c, todayStr = toDateStr()) {
  const every = Number(c?.contactEvery) || 0;
  if (!every) return null;
  const last = lastContactDate(c, todayStr);
  const base = last || c?.contactEverySince || String(c?.createdAt || "").slice(0, 10) || todayStr;
  const since = Math.max(0, daysBetween(base, todayStr));
  return { every, last, since, due: since >= every, dueIn: every - since };
}

// 목록 순서 — added(추가한 순, 예전 그대로) · recent(최근 연락 순) · old(연락 오래된 순) · name(이름순)
// recent·old는 연락 기록이 없는 사람을 맨 뒤로 (연락처를 가져온 사람이 많아 앞을 덮지 않게)
export const CONTACT_SORTS = [
  { v: "added", l: "추가한 순" }, { v: "recent", l: "최근 연락 순" }, { v: "old", l: "오래된 순" }, { v: "name", l: "이름순" },
];
export function sortContacts(list, mode, todayStr = toDateStr()) {
  const arr = [...(list || [])];
  if (mode === "name") return arr.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko"));
  if (mode !== "recent" && mode !== "old") return arr;
  const withLast = arr.map((c, i) => ({ c, i, last: lastContactDate(c, todayStr) }));
  withLast.sort((a, b) => {
    if (!a.last || !b.last) return a.last ? -1 : b.last ? 1 : a.i - b.i;
    if (a.last === b.last) return a.i - b.i;
    return mode === "recent" ? (a.last < b.last ? 1 : -1) : (a.last < b.last ? -1 : 1);
  });
  return withLast.map((x) => x.c);
}

// 태그 이름 바꾸기·지우기 — 바뀐 사람만 돌려준다(그 사람만 저장). to가 이미 있는 태그면 합친다
export function renameContactTag(contacts, tags, from, to) {
  const name = String(to || "").trim();
  if (!name || name === from) return { tags, changed: [] };
  const nextTags = tags.includes(name) ? tags.filter((t) => t !== from) : tags.map((t) => (t === from ? name : t));
  const changed = (contacts || []).filter((c) => (c.tags || []).includes(from)).map((c) => ({
    ...c, tags: [...new Set((c.tags || []).map((t) => (t === from ? name : t)))],
  }));
  return { tags: nextTags, changed };
}
export function removeContactTag(contacts, tags, tag) {
  const changed = (contacts || []).filter((c) => (c.tags || []).includes(tag)).map((c) => ({ ...c, tags: c.tags.filter((t) => t !== tag) }));
  return { tags: tags.filter((t) => t !== tag), changed };
}

const MAX_DUE_SHOWN = 3; // 오늘 탭에 연락할 사람은 3명까지 — 많이 정하면 칸을 다 덮는다

// 홈 위젯 "오늘 챙길 사람" 조합 — 생일·기념일(window일 이내) + 기한이 지났거나 오늘인 미완료 후속 할 일 + 연락할 때가 된 사람.
// 완료 여부는 사람 쪽에 복제하지 않고 그 날짜의 실제 task(plans)를 그때그때 조회해서 판단한다.
export function getContactReminders(contacts, plans, windowDays = 7, todayStr = toDateStr()) {
  const items = [];
  getUpcomingContactEvents(contacts, windowDays, todayStr).forEach((ev) => {
    const when = ev.dday === 0 ? "오늘" : `${ev.dday}일 뒤`;
    items.push({ key: `${ev.type}_${ev.contactId}`, icon: "🎂", contactId: ev.contactId, text: `${when} ${ev.name}님 ${ev.label}` });
  });
  (contacts || []).forEach((c) => {
    (c.linkedTasks || []).forEach((lt) => {
      if (lt.date > todayStr) return;
      const task = (plans?.[lt.date]?.tasks || []).find((t) => t.id === lt.taskId);
      if (!task || task.done) return;
      const when = lt.date === todayStr ? "오늘" : "지난";
      items.push({ key: `task_${lt.taskId}`, icon: "📌", contactId: c.id, text: `${when} ${c.name}님께 ${task.title || lt.title}` });
    });
  });
  const due = (contacts || [])
    .map((c) => ({ c, d: contactDue(c, todayStr) }))
    .filter((x) => x.d?.due)
    .sort((a, b) => (b.d.since - b.d.every) - (a.d.since - a.d.every)); // 많이 지난 사람부터
  due.slice(0, MAX_DUE_SHOWN).forEach(({ c, d }) => {
    const ago = d.last ? `마지막 연락 ${agoLabel(d.since)}` : "아직 연락 기록 없음";
    items.push({ key: `due_${c.id}`, icon: "📞", contactId: c.id, text: `${c.name}님께 연락할 때예요 · ${ago}` });
  });
  if (due.length > MAX_DUE_SHOWN) {
    items.push({ key: "due_more", icon: "📞", text: `연락할 사람 ${due.length - MAX_DUE_SHOWN}명 더 — 내 사람들에서 보기` });
  }
  return items;
}

// 검색 비교용: 한글 자모 분리 저장(NFD)을 합치고(NFC), 대소문자·띄어쓰기 무시
// (휴대폰에서 가져온 연락처는 기기에 따라 NFD로 들어올 수 있어 겉보기엔 같아도 검색이 안 되던 문제 방지)
const normText = (s) => String(s || "").normalize("NFC").toLowerCase().replace(/\s+/g, "");

// 초성 추출: "김철수" → "ㄱㅊㅅ" (한글 음절이 아닌 글자는 그대로)
const CHOSEONG = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
export function getChoseong(text) {
  return Array.from(normText(text)).map((ch) => {
    const code = ch.charCodeAt(0) - 0xac00;
    return code >= 0 && code <= 11171 ? CHOSEONG[Math.floor(code / 588)] : ch;
  }).join("");
}

// 검색용 정보를 미리 계산 — 연락처가 수천 명이어도 글자 칠 때마다 초성·번호를 다시 계산하지 않도록
export function buildSearchIndex(c) {
  return {
    text: [c.name, c.company, c.title, c.email, c.memo, ...(c.tags || [])].map(normText).join("\u0001"),
    digits: normalizePhone(c.phone),
    cho: [c.name, c.company].map(getChoseong).join("\u0001"),
  };
}
export function prepareSearchQuery(query) {
  const q = normText(query);
  return { q, digits: normalizePhone(query), isCho: /^[ㄱ-ㅎ]+$/.test(q) };
}
export function matchSearchIndex(idx, pq) {
  if (!pq.q) return true;
  if (idx.text.includes(pq.q)) return true;
  if (pq.digits.length >= 3 && idx.digits.includes(pq.digits)) return true;
  if (pq.isCho && idx.cho.includes(pq.q)) return true;
  return false;
}

// 이름·회사·직함·이메일·메모·태그 + 전화번호(숫자 3자리 이상) + 초성(ㄱㅊㅅ) 검색
export function searchContacts(contacts, query) {
  const pq = prepareSearchQuery(query);
  if (!pq.q) return contacts || [];
  return (contacts || []).filter((c) => matchSearchIndex(buildSearchIndex(c), pq));
}

// 양력 날짜 → 음력 { year, month, day, leap } (달력에 음력 표시, 2026-11-03) — 생일과 같은 KASI 표 기반 라이브러리. 안 되면 null
const lunarCache = new Map();
export function solarToLunar(ds) {
  if (lunarCache.has(ds)) return lunarCache.get(ds);
  let out = null;
  try {
    const [y, m, d] = ds.split("-").map(Number);
    const cal = new KoreanLunarCalendar();
    if (cal.setSolarDate(y, m, d)) {
      const l = cal.getLunarCalendar();
      out = { year: l.year, month: l.month, day: l.day, leap: !!l.intercalation };
    }
  } catch { out = null; }
  lunarCache.set(ds, out);
  return out;
}
// "음 9.1" · "음 윤6.1"
export const lunarShort = (ds) => { const l = solarToLunar(ds); return l ? `음 ${l.leap ? "윤" : ""}${l.month}.${l.day}` : ""; };
