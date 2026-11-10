// 화면 크기 단계 (2026-11-11 사용자 확정) — 글씨·버튼·간격을 같이 키우는 .dm-phone zoom (index.css [data-font]).
// 기기마다 따로(dm_font_scale). 예전 값 'normal'(100)·'large'(110, 기본)은 그대로 쓴다.
// 휴대폰은 화면이 좁아 130%부터 줄이 깨져서 120%까지만.
export const FONT_STEPS = [
  { id: 'normal', pct: 100 },
  { id: 'large', pct: 110 },
  { id: 's120', pct: 120 },
  { id: 's130', pct: 130 },
];

export const isTouchScreen = () => !!window.matchMedia?.('(pointer: coarse)').matches;

export const fontSteps = (touch = isTouchScreen()) => (touch ? FONT_STEPS.filter((s) => s.pct <= 120) : FONT_STEPS);

// 저장된 값 → 이 기기에서 실제로 쓸 단계 (모르는 값은 기본 110, 휴대폰 130은 120으로)
export function effectiveFontScale(id, touch = isTouchScreen()) {
  const steps = fontSteps(touch);
  if (steps.some((s) => s.id === id)) return id;
  if (FONT_STEPS.some((s) => s.id === id)) return steps[steps.length - 1].id;
  return 'large';
}

export const fontZoom = (id) => (FONT_STEPS.find((s) => s.id === id)?.pct || 110) / 100;

// 설정 첫 화면 A+ 버튼: 누를 때마다 다음 단계, 끝이면 처음으로
export function nextFontScale(id, touch = isTouchScreen()) {
  const steps = fontSteps(touch);
  const i = steps.findIndex((s) => s.id === effectiveFontScale(id, touch));
  return steps[(i + 1) % steps.length].id;
}
