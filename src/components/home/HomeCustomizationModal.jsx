export default function HomeCustomizationModal({
  open,
  homeSectionOrder,
  renderSectionRow,
  onClose,
}) {
  if (!open) return null;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.48)', zIndex: 1200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 'calc(16px + env(safe-area-inset-top, 0px)) 16px calc(16px + env(safe-area-inset-bottom, 0px))', overflowY: 'auto'
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 420, borderRadius: 24, background: 'var(--dm-bg)', border: '1px solid var(--dm-border2)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.28)', overflow: 'hidden',
        maxHeight: 'min(calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)), 760px)',
        display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ padding: '18px 18px 12px', borderBottom: '1px solid var(--dm-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--dm-text)' }}>홈 구성</div>
            <div style={{ fontSize: 12, color: 'var(--dm-muted)', marginTop: 4 }}>자주 안 보는 카드만 숨기고, 필요한 섹션 순서도 바꿀 수 있어요.</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 20, cursor: 'pointer', padding: 4, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: '16px 16px calc(20px + env(safe-area-inset-bottom, 0px))', display: 'grid', gap: 10, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
          <div style={{ fontSize: 12, color: 'var(--dm-muted)', lineHeight: 1.6 }}>
            각 줄에서 토글로 보이기 여부를 바꾸고, 위아래 버튼으로 순서를 바꿀 수 있어요.
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {homeSectionOrder.map((sectionId) => renderSectionRow(sectionId))}
          </div>
        </div>
      </div>
    </div>
  );
}