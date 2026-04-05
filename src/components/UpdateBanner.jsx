export default function UpdateBanner({ mode, version, onApply, onDismiss }) {
  if (!mode) return null;

  const isReady = mode === 'ready';

  return (
    <div style={{
      position: 'fixed',
      top: 12,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'calc(100% - 32px)',
      maxWidth: 398,
      zIndex: 400,
      background: isReady
        ? 'linear-gradient(135deg, rgba(14,24,40,.96), rgba(18,37,62,.94))'
        : 'linear-gradient(135deg, rgba(17,28,46,.94), rgba(24,40,64,.92))',
      border: `1px solid ${isReady ? 'rgba(108,142,255,.38)' : 'rgba(74,222,128,.32)'}`,
      borderRadius: 16,
      padding: '12px 14px',
      boxShadow: '0 18px 40px rgba(0,0,0,.36)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ fontSize: 20, lineHeight: 1 }}>{isReady ? '⬇️' : '✨'}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#F8FBFF', marginBottom: 3 }}>
            {isReady ? '새 버전 준비가 끝났어요' : '새 버전이 적용됐어요'}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(236,244,255,.82)', lineHeight: 1.6 }}>
            {isReady ? '지금 업데이트를 누르면 바로 새 버전으로 전환됩니다.' : `현재 버전 ${version}. 바뀐 기능을 바로 확인해보세요.`}
          </div>
          {isReady && (
            <button onClick={onApply} style={{
              marginTop: 8,
              background: 'rgba(108,142,255,.2)',
              border: '1px solid rgba(108,142,255,.34)',
              borderRadius: 999,
              color: '#C9D7FF',
              fontSize: 11,
              fontWeight: 900,
              cursor: 'pointer',
              padding: '6px 10px'
            }}>
              지금 업데이트
            </button>
          )}
        </div>
        <button onClick={onDismiss} style={{ background: 'transparent', border: 'none', color: 'rgba(236,244,255,.68)', fontSize: 16, cursor: 'pointer', padding: 0, lineHeight: 1 }}>✕</button>
      </div>
    </div>
  );
}