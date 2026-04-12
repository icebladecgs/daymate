export default function UpdateBanner({ mode, version, onApply, onDismiss }) {
  if (!mode) return null;

  const isReady = mode === 'ready';

  return (
    <div style={{
      position: 'fixed',
      top: 10,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'calc(100% - 20px)',
      maxWidth: 372,
      zIndex: 400,
      background: isReady
        ? 'linear-gradient(135deg, rgba(18,30,49,.97), rgba(23,39,61,.95))'
        : 'linear-gradient(135deg, rgba(17,28,46,.95), rgba(24,40,64,.93))',
      border: `1px solid ${isReady ? 'rgba(108,142,255,.38)' : 'rgba(74,222,128,.32)'}`,
      borderRadius: 14,
      padding: '10px 12px',
      boxShadow: '0 14px 28px rgba(0,0,0,.28)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{isReady ? '⬇️' : '✨'}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: '#F8FBFF', marginBottom: 2, lineHeight: 1.3 }}>
            {isReady ? '새 버전 준비가 끝났어요' : '새 버전이 적용됐어요'}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(236,244,255,.78)', lineHeight: 1.45 }}>
            {isReady ? '지금 업데이트를 누르면 바로 새 버전으로 전환됩니다.' : `현재 버전 ${version}. 바뀐 기능을 바로 확인해보세요.`}
          </div>
        </div>
        {isReady && (
          <button onClick={onApply} style={{
            background: 'rgba(108,142,255,.18)',
            border: '1px solid rgba(108,142,255,.32)',
            borderRadius: 999,
            color: '#D7E2FF',
            fontSize: 10,
            fontWeight: 900,
            cursor: 'pointer',
            padding: '7px 11px',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}>
            업데이트
          </button>
        )}
        <button onClick={onDismiss} style={{ background: 'transparent', border: 'none', color: 'rgba(236,244,255,.68)', fontSize: 15, cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0 }}>✕</button>
      </div>
    </div>
  );
}