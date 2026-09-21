// PWA 홈 화면 설치 수동 안내 — beforeinstallprompt(원터치 설치)를 못 쓰는 상황(iOS, 또는 이벤트 미발생)에서 사용
// iOS는 Safari 공유 버튼 위치를 실제로 못 찾아 헤매는 경우가 많아 텍스트 대신 아이콘 시각 안내를 보여준다.
export function IOSInstallGuide() {
  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        background: '#1c1c1e', borderRadius: 12, padding: '10px 6px', marginBottom: 10,
      }}>
        <span style={{ opacity: 0.35, fontSize: 16 }}>◀</span>
        <span style={{ opacity: 0.35, fontSize: 16 }}>▶</span>
        <div style={{ position: 'relative', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{
            position: 'absolute', inset: -5, borderRadius: 999,
            border: '2px solid #6C8EFF', animation: 'dm-install-pulse 1.4s ease-out infinite',
          }} />
          <span style={{ fontSize: 18 }}>⬆️</span>
        </div>
        <span style={{ opacity: 0.35, fontSize: 16 }}>🔖</span>
        <span style={{ opacity: 0.35, fontSize: 16 }}>▤</span>
      </div>
      <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 900, color: '#6C8EFF', marginBottom: 12 }}>
        ↑ Safari 하단(아이패드는 상단)의 이 공유 아이콘을 눌러요
      </div>
      {[
        ['1', '위 공유 아이콘(□↑)을 탭해요'],
        ['2', '아래로 스크롤해서 \'홈 화면에 추가\'를 찾아요'],
        ['3', '오른쪽 위 \'추가\'를 눌러요'],
      ].map(([n, txt]) => (
        <div key={n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 6 }}>
          <div style={{ width: 20, height: 20, borderRadius: 999, background: '#6C8EFF', color: '#fff', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</div>
          <div style={{ fontSize: 12, color: 'var(--dm-sub)', lineHeight: 1.5, paddingTop: 1 }}>{txt}</div>
        </div>
      ))}
    </div>
  );
}
