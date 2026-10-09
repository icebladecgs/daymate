// 데스크탑 앱(Windows) 최신 버전 — 새 설치 파일을 GitHub 릴리스(Desktop-v버전)에 올리면 여기 두 줄을 바꾼다.
// 설정의 "Windows 앱 다운로드"와 데스크탑 앱 위쪽의 "새 버전이 있어요" 알림이 이 값을 쓴다.
// 릴리스를 올리기 전에 이 값을 바꿔 배포하면 알림의 받기 주소가 없는 파일을 가리키니 순서를 지킨다.
// 태그는 대소문자를 구분한다 — 'Desktop-v버전'(대문자 D)으로 만든다(소문자로 바꾸면 404).
export const DESKTOP_LATEST = '1.3.3';
export const DESKTOP_DOWNLOAD_URL = `https://github.com/icebladecgs/daymate/releases/download/Desktop-v${DESKTOP_LATEST}/Daymate.Setup.${DESKTOP_LATEST}.exe`;

// '1.2.10' > '1.2.9' 처럼 숫자로 비교. a가 b보다 낮으면 음수
export function compareVersion(a, b) {
  const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

// 데스크탑 앱 안이면 그 버전, 아니면 null. 1.3.0 이하는 버전을 알려 주는 기능이 없어 '1.3.0'으로 본다
export async function installedDesktopVersion() {
  const d = window.daymateDesktop;
  if (!d) return null;
  if (!d.getVersion) return '1.3.0';
  try { return await d.getVersion(); } catch { return '1.3.0'; }
}
