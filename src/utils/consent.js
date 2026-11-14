// 첫 로그인 동의 (2026-11-14 사용자 결정) — 이용약관·개인정보처리방침 동의 + 만 14세 이상 확인.
// · 로그인한 계정만 묻는다(로그인 없이 쓰는 기록은 이 기기에만 저장). 기존 계정도 한 번 묻는다.
// · 동의하지 않으면 로그아웃(로그인 없이 이 기기에서 쓰기는 그대로).
// · 동의 기록은 계정 설정 consent = { terms, privacy, age14, at } (users/{uid}/data/settings — 기존 규칙 안).
//   문서 버전(LEGAL_VERSION)이 바뀌면 다시 묻는다.
// · 약관·방침 원본은 docs/legal/*.md (초안). 앱은 그 글을 읽어 초안 메모(인용 줄·🔶)를 빼고 빈칸을 LEGAL_INFO로 채워 보여 준다.

// 공개 전까지 꺼 둔다(사용자 결정 "만들어만 두기") — 운영자명·문의 이메일을 채우고 전문가 확인 뒤 true로.
// 꺼져 있어도 관리자 화면 → 📋 업그레이드 탭에서 미리 볼 수 있다.
export const CONSENT_ENABLED = false;

// 약관·방침이 바뀌면 이 값을 올린다 → 모든 계정이 다음 로그인 때 다시 동의
export const LEGAL_VERSION = "2026-11-12";

// 문서의 빈칸 — 정해지면 여기만 채운다
export const LEGAL_INFO = {
  operator: "", // 운영자명
  email: "", // 문의 이메일
  officer: "", // 개인정보 보호책임자 이름
  effective: "", // 시행일 (예: 2027년 1월 1일)
};

export const needsConsent = (c) => !(c && c.terms === LEGAL_VERSION && c.privacy === LEGAL_VERSION && c.age14 === true);
export const makeConsent = (now = new Date()) => ({ terms: LEGAL_VERSION, privacy: LEGAL_VERSION, age14: true, at: now.toISOString() });

// 초안 글 → 앱에 보여 줄 글
export function cleanLegal(md, info = LEGAL_INFO) {
  const fill = {
    "운영자명": info.operator || "운영자(공개 전 정함)",
    "문의 이메일": info.email || "(공개 전 안내)",
    "YYYY년 MM월 DD일": info.effective || "공개일",
    "이름": info.officer || "(공개 전 정함)",
  };
  return String(md || "")
    .split(/\r?\n/)
    .filter(l => !/^\s*>/.test(l)) // 초안 메모(인용 줄)
    .join("\n")
    .replace(/\s*🔶\s*\*[^*\n]*\*/g, "") // 🔶 *운영자가 정할 것*
    .replace(/🔶\s*/g, "")
    .replace(/\s*\(초안\)/g, "")
    // 빈칸 [운영자명] 등 — 문서에 링크는 없다("[운영자명](이하 …)"처럼 괄호가 바로 붙어도 빈칸)
    .replace(/\[([^\]\n]+)\]/g, (m, k) => fill[k] ?? "(공개 전 정함)")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
