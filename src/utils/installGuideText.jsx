// 안드로이드 브라우저별로 실제 메뉴 위치/명칭이 달라 하나로 뭉뚱그리면 안내가 틀어진다.
export function androidInstallText(isSamsung) {
  return isSamsung
    ? <>삼성인터넷 하단 <b style={{ color: 'var(--dm-text)' }}>≡ 메뉴</b> → <b style={{ color: 'var(--dm-text)' }}>현재 페이지 추가</b> → <b style={{ color: 'var(--dm-text)' }}>홈 화면</b></>
    : <>Chrome <b style={{ color: 'var(--dm-text)' }}>⋮ 메뉴</b> → <b style={{ color: 'var(--dm-text)' }}>앱 설치</b> 또는 <b style={{ color: 'var(--dm-text)' }}>홈 화면에 추가</b></>;
}
