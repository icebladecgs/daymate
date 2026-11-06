// 화면을 열 때 입력칸에 자동으로 커서를 둘지 (2026-10-05 사용자 결정).
// 터치 화면(휴대폰·태블릿)에서는 키보드가 화면 절반을 가려 버튼이 안 보이므로 두지 않는다.
// PC(데스크탑 앱 포함)는 키보드가 화면을 가리지 않고, 단축키로 열어 바로 타자 치는 흐름이라 그대로 둔다.
// PC 대시보드 입구를 보여 줄지 — 데스크탑 앱(창을 넓혀 줌)이거나 브라우저 창이 충분히 넓을 때. 휴대폰에는 안 보임
export const canOpenDashboard = () => !!window.daymateDesktop?.setWideMode || window.innerWidth >= 1100;

export const canAutoFocus = () => !window.matchMedia?.("(pointer: coarse)").matches;
