// PWA 홈 화면 설치 수동 안내 — beforeinstallprompt(원터치 설치)를 못 쓰는 상황(iOS, 또는 이벤트 미발생)에서 사용
// iOS는 브라우저·버전마다 '홈 화면에 추가' 위치가 달라서 하나로 뭉뚱그리면 안내가 틀어진다.
//  - Safari 26 이상(iOS 26): 공유 버튼이 아래 막대에서 빠지고 ⋯ 메뉴 안으로 들어갔다.
//  - Safari 18 이하: 아래 막대 가운데 공유 버튼. 스크롤하면 막대가 숨는다.
//  - 크롬·엣지·파이어폭스(iOS 16.4+): 주소창 오른쪽 공유 버튼에서 추가 가능.
//  - 앱 안 브라우저(카카오톡·네이버·인스타 등): 홈 화면 추가 불가 → Safari로 먼저 연다.

const ACCENT = '#6C8EFF';

export function detectIOSBrowser(ua = navigator.userAgent) {
  const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (/KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp/i.test(ua)) return { kind: 'inapp', isIPad };
  if (/CriOS|EdgiOS|FxiOS/.test(ua)) return { kind: 'chrome', isIPad, name: /EdgiOS/.test(ua) ? 'Edge' : /FxiOS/.test(ua) ? 'Firefox' : 'Chrome' };
  const safariVer = parseInt((ua.match(/Version\/(\d+)/) || [])[1] || '0', 10);
  if (safariVer >= 26) return { kind: 'safari26', isIPad };
  return { kind: 'safari', isIPad };
}

const ShareIcon = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-3px' }}>
    <path d="M8 9H6a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1h-2" />
    <path d="M12 15V3" /><path d="M8 7l4-4 4 4" />
  </svg>
);

const MoreIcon = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ verticalAlign: '-3px' }}>
    <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
  </svg>
);

const AddIcon = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" style={{ verticalAlign: '-3px' }}>
    <rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8M8 12h8" />
  </svg>
);

// 누를 버튼 위치를 알려주는 파란 테두리 깜빡임
function Pulse({ children }) {
  return (
    <div style={{ position: 'relative', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
      <span style={{ position: 'absolute', inset: -4, borderRadius: 999, border: `2px solid ${ACCENT}`, animation: 'dm-install-pulse 1.4s ease-out infinite' }} />
      {children}
    </div>
  );
}

const Dim = ({ children }) => <span style={{ opacity: 0.35, color: '#fff', fontSize: 15, display: 'flex' }}>{children}</span>;

// 실제 브라우저 막대 모양을 흉내낸 그림
function BarMock({ kind, isIPad }) {
  const bar = { display: 'flex', alignItems: 'center', gap: 8, background: '#1c1c1e', borderRadius: 12, padding: '8px 10px' };
  const addr = <div style={{ flex: 1, height: 26, borderRadius: 8, background: '#3a3a3c', color: '#aaa', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>daymate</div>;
  if (kind === 'chrome' || isIPad) {
    // 크롬(아이폰)·아이패드: 위쪽 주소창 오른쪽에 공유 버튼
    return <div style={bar}>{addr}<Pulse><ShareIcon /></Pulse></div>;
  }
  if (kind === 'safari26') {
    // iOS 26 Safari: 아래 막대 = 뒤로 · 주소창 · ⋯
    return <div style={bar}><Dim>◀</Dim>{addr}<Pulse><MoreIcon /></Pulse></div>;
  }
  // iOS 18 이하 Safari: 아래 막대 가운데 공유 버튼
  return (
    <div style={{ ...bar, justifyContent: 'space-around' }}>
      <Dim>◀</Dim><Dim>▶</Dim><Pulse><ShareIcon /></Pulse><Dim>📖</Dim><Dim>⧉</Dim>
    </div>
  );
}

const b = (t) => <b style={{ color: 'var(--dm-text)' }}>{t}</b>;

function stepsFor({ kind, isIPad, name }) {
  if (kind === 'inapp') {
    return {
      where: '지금 브라우저에서는 홈 화면에 추가할 수 없어요',
      steps: [
        <>화면 아래나 위의 {b(<><MoreIcon size={15} /> 또는 <ShareIcon size={15} /></>)} 버튼을 눌러요</>,
        <>{b('Safari로 열기')}(또는 '기본 브라우저로 열기')를 눌러요</>,
        <>Safari에서 DayMate가 열리면 {b('앱 설치')} 안내를 다시 따라 해요</>,
      ],
    };
  }
  if (kind === 'chrome') {
    return {
      where: `${name} 주소창 오른쪽의 이 공유 버튼을 눌러요`,
      steps: [
        <>주소창 오른쪽 {b(<><ShareIcon size={15} /> 공유</>)} 버튼을 눌러요</>,
        <>목록을 아래로 내려 {b(<><AddIcon size={15} /> 홈 화면에 추가</>)}를 눌러요 <span style={{ color: 'var(--dm-muted)' }}>(안 보이면 {b('더 보기')})</span></>,
        <>오른쪽 위 {b('추가')}를 누르면 끝!</>,
      ],
    };
  }
  if (kind === 'safari26') {
    return {
      where: isIPad ? 'Safari 위쪽 주소창 오른쪽의 공유 버튼을 눌러요' : 'Safari 아래쪽 주소창 오른쪽의 ⋯ 버튼을 눌러요',
      steps: [
        isIPad
          ? <>주소창 오른쪽 {b(<><ShareIcon size={15} /> 공유</>)} 버튼을 눌러요</>
          : <>주소창 오른쪽 {b(<><MoreIcon size={15} /> (점 3개)</>)} 버튼 → {b(<><ShareIcon size={15} /> 공유</>)}를 눌러요</>,
        <>목록을 아래로 내려 {b(<><AddIcon size={15} /> 홈 화면에 추가</>)}를 눌러요 <span style={{ color: 'var(--dm-muted)' }}>(안 보이면 {b('더 보기')})</span></>,
        <>{b("'웹 앱으로 열기'")}가 켜진 상태로 오른쪽 위 {b('추가')}를 누르면 끝!</>,
      ],
    };
  }
  return {
    where: isIPad ? 'Safari 위쪽 주소창 오른쪽의 공유 버튼을 눌러요' : 'Safari 아래쪽 가운데의 공유 버튼을 눌러요',
    steps: [
      <>{isIPad ? '위쪽 주소창 오른쪽' : '아래쪽 가운데'} {b(<><ShareIcon size={15} /> 공유</>)} 버튼을 눌러요</>,
      <>목록을 아래로 내려 {b(<><AddIcon size={15} /> 홈 화면에 추가</>)}를 눌러요</>,
      <>오른쪽 위 {b('추가')}를 누르면 끝!</>,
    ],
  };
}

export function IOSInstallGuide() {
  const info = detectIOSBrowser();
  const { where, steps } = stepsFor(info);
  const showBarHint = info.kind === 'safari' && !info.isIPad;
  return (
    <div>
      {info.kind !== 'inapp' && <BarMock kind={info.kind} isIPad={info.isIPad} />}
      <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 900, color: ACCENT, margin: '8px 0 12px' }}>
        {info.kind !== 'inapp' && '↑ '}{where}
      </div>
      {steps.map((txt, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: 999, background: ACCENT, color: '#fff', fontSize: 12, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
          <div style={{ fontSize: 13, color: 'var(--dm-sub)', lineHeight: 1.6, paddingTop: 1 }}>{txt}</div>
        </div>
      ))}
      {showBarHint && (
        <div style={{ fontSize: 12, color: 'var(--dm-muted)', lineHeight: 1.6, marginTop: 4 }}>
          💡 아래 막대가 안 보이면 화면을 아래로 살짝 끌어내리거나 맨 아래를 톡 누르면 다시 나타나요.
        </div>
      )}
    </div>
  );
}
