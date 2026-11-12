// 달력 보기 분류 — 종합·업무·재무 + 직접 만든 보기(공부 등) (2026-11-13 사용자 확정)
// 계정 설정 taskCats = { custom: [{ id, name, color }], words: { 제목: 분류 id } } (App.jsx가 동기화)
// 할일에 직접 고른 분류만 task.cat에 저장한다(없음은 'none'). 고르지 않은 할일은 볼 때마다 자동으로 판단한다 —
// 그래야 예전 할일에도 바로 적용되고, 출퇴근 시간을 바꾸면 따라간다.
// 자동 판단 순서: 직접 고른 것 → 반복 할일의 분류(만들 때 task.cat으로 들어감) → 내가 고친 기록(같은 제목)
//   → 제목의 #업무 같은 표시 → 단어 → 평일 근무 시간 안이면 업무 → 분류 없음(종합에만 보임)
// 할일 제목은 이 기기·계정 안에서만 본다(밖으로 보내지 않음, AI 안 씀).
import { isWorkday, normalizeWorkHours, toMin } from "./workHours.js";

export const BUILTIN_CATS = [
  { id: "work", name: "업무", color: "#3B82F6" },
  { id: "fin", name: "재무", color: "#16A34A" },
];
export const CUSTOM_COLORS = ["#8B5CF6", "#EC4899", "#F59E0B", "#14B8A6", "#EF4444", "#64748B"];
export const MAX_CUSTOM_CATS = 3;
const MAX_WORDS = 400;

const WORDS = {
  fin: ["카드", "이체", "송금", "납부", "공과금", "관리비", "보험", "세금", "연말정산", "종합소득", "대출", "이자", "적금", "예금", "펀드", "매수", "매도", "주식", "배당", "월급", "급여", "용돈", "환전", "청약", "가계부", "결제일", "자동이체", "카드값", "연금", "재테크", "부동산", "등기", "잔금", "계약금"],
  work: ["회의", "미팅", "보고", "결재", "품의", "기안", "고객", "출장", "상담", "검토", "마감", "제출", "발표", "업무", "회사", "출근", "퇴근", "회식", "면담", "거래처", "프로젝트", "기획", "보고서", "실적", "영업", "심사", "점검", "교육", "워크숍", "세미나", "본부", "지점", "팀장", "부장", "결산"],
};

export const normalizeTaskCats = (x) => {
  const custom = (Array.isArray(x?.custom) ? x.custom : [])
    .filter((c) => c && typeof c.id === "string" && c.id.startsWith("c_") && String(c.name || "").trim())
    .map((c) => ({ id: c.id, name: String(c.name).trim().slice(0, 8), color: CUSTOM_COLORS.includes(c.color) ? c.color : CUSTOM_COLORS[0] }))
    .slice(0, MAX_CUSTOM_CATS);
  const words = x?.words && typeof x.words === "object" && !Array.isArray(x.words) ? x.words : {};
  return { custom, words };
};

export const allCats = (taskCats) => [...BUILTIN_CATS, ...normalizeTaskCats(taskCats).custom];
export const catById = (taskCats, id) => allCats(taskCats).find((c) => c.id === id) || null;

// 제목 비교용 — 띄어쓰기·대소문자·앞의 시간 표시 무시
export const titleKey = (title) => String(title || "").normalize("NFC").toLowerCase().replace(/^\s*\d{1,2}:\d{2}\s*/, "").replace(/\s+/g, "").slice(0, 60);

// 자동 판단 (task.cat이 없을 때) — 결과는 분류 id 또는 null
export function autoCat(task, ds, taskCats, workHours) {
  const { words, custom } = normalizeTaskCats(taskCats);
  const ids = new Set([...BUILTIN_CATS, ...custom].map((c) => c.id));
  const title = String(task?.title || "");
  const remembered = words[titleKey(title)];
  if (remembered === "none") return null;
  if (remembered && ids.has(remembered)) return remembered;
  const tag = /#(\S+)/.exec(title)?.[1];
  if (tag) {
    const hit = [...BUILTIN_CATS, ...custom].find((c) => c.name === tag);
    if (hit) return hit.id;
  }
  const plain = title.normalize("NFC");
  if (WORDS.fin.some((w) => plain.includes(w))) return "fin";
  if (WORDS.work.some((w) => plain.includes(w))) return "work";
  const t = toMin(task?.time);
  if (ds && t != null && isWorkday(ds)) {
    const wh = normalizeWorkHours(workHours);
    if (t >= toMin(wh.start) && t < toMin(wh.end)) return "work";
  }
  return null;
}

// 이 할일의 분류 — 직접 고른 것 우선(지운 분류는 없음으로)
export function catOf(task, ds, taskCats, workHours) {
  const set = task?.cat;
  if (set === "none") return null;
  if (set) return catById(taskCats, set) ? set : null;
  return autoCat(task, ds, taskCats, workHours);
}

// 상세 창에서 직접 고르면 그 제목을 기억한다(다음부터 같은 제목은 그 분류). 오래된 것부터 빼서 400개까지
export function rememberCat(taskCats, title, catId) {
  const cur = normalizeTaskCats(taskCats);
  const key = titleKey(title);
  if (!key) return cur;
  const words = { ...cur.words };
  delete words[key];
  words[key] = catId || "none";
  const keys = Object.keys(words);
  if (keys.length > MAX_WORDS) keys.slice(0, keys.length - MAX_WORDS).forEach((k) => delete words[k]);
  return { ...cur, words };
}

export const newCustomCat = (name, color) => ({ id: `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: String(name || "").trim().slice(0, 8), color: CUSTOM_COLORS.includes(color) ? color : CUSTOM_COLORS[0] });

// 할일 상세 창의 "분류" 칸에 넘길 값 (catCtx = App이 넘기는 { taskCats, workHours, remember })
export const categoryProps = (catCtx, task, ds) => (catCtx ? {
  options: allCats(catCtx.taskCats),
  auto: autoCat(task, ds, catCtx.taskCats, catCtx.workHours),
  remember: catCtx.remember,
} : undefined);
