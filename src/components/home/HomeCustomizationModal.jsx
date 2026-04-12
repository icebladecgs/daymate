import { useEffect, useRef, useState } from "react";

const HOME_MODAL_NAV_CLEARANCE = 100;

export default function HomeCustomizationModal({
  open,
  homeSectionOrder,
  renderSectionRow,
  onReset,
  onClose,
}) {
  const scrollRef = useRef(null);
  const [showScrollHint, setShowScrollHint] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    const element = scrollRef.current;
    if (!element) return undefined;

    const updateScrollHint = () => {
      const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
      setShowScrollHint(remaining > 24);
    };

    updateScrollHint();
    element.addEventListener('scroll', updateScrollHint);
    window.addEventListener('resize', updateScrollHint);

    return () => {
      element.removeEventListener('scroll', updateScrollHint);
      window.removeEventListener('resize', updateScrollHint);
    };
  }, [open, homeSectionOrder]);

  if (!open) return null;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.48)', zIndex: 1200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: `calc(16px + env(safe-area-inset-top, 0px)) 16px calc(${16 + HOME_MODAL_NAV_CLEARANCE}px + env(safe-area-inset-bottom, 0px))`, overflowY: 'auto'
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 420, borderRadius: 24, background: 'var(--dm-bg)', border: '1px solid var(--dm-border2)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.28)', overflow: 'hidden',
        maxHeight: `min(calc(100dvh - ${32 + HOME_MODAL_NAV_CLEARANCE}px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)), 760px)`,
        display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ padding: '18px 18px 12px', borderBottom: '1px solid var(--dm-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--dm-text)' }}>홈 구성</div>
            <div style={{ fontSize: 12, color: 'var(--dm-muted)', marginTop: 4 }}>자주 안 보는 카드만 숨기고, 필요한 섹션 순서도 바꿀 수 있어요.</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {onReset && (
              <button onClick={onReset} style={{ background: 'transparent', border: '1px solid var(--dm-border)', color: 'var(--dm-sub)', fontSize: 11, fontWeight: 800, cursor: 'pointer', padding: '7px 10px', borderRadius: 999 }}>
                기본 추천 복원
              </button>
            )}
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 20, cursor: 'pointer', padding: 4, lineHeight: 1 }}>✕</button>
          </div>
        </div>
        <div ref={scrollRef} style={{ padding: `16px 16px calc(${72 + HOME_MODAL_NAV_CLEARANCE}px + env(safe-area-inset-bottom, 0px))`, display: 'grid', gap: 10, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', position: 'relative' }}>
          <div style={{ fontSize: 12, color: 'var(--dm-muted)', lineHeight: 1.6 }}>
            각 줄에서 토글로 보이기 여부를 바꾸고, 위아래 버튼으로 순서를 바꿀 수 있어요.
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {homeSectionOrder.map((sectionId) => renderSectionRow(sectionId))}
          </div>
        </div>
        {showScrollHint && (
          <div style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: `${HOME_MODAL_NAV_CLEARANCE}px`,
            padding: '20px 16px calc(18px + env(safe-area-inset-bottom, 0px))',
            background: 'linear-gradient(180deg, rgba(12,16,28,0), rgba(12,16,28,0.88) 42%, rgba(12,16,28,0.98) 100%)',
            pointerEvents: 'none',
            display: 'flex',
            justifyContent: 'center',
          }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 999,
              background: 'rgba(19,24,39,0.92)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--dm-sub)',
              fontSize: 11,
              fontWeight: 800,
              boxShadow: '0 10px 24px rgba(0,0,0,0.24)',
            }}>
              <span style={{ fontSize: 12 }}>↓</span>
              아래로 더 내려서 보기
            </div>
          </div>
        )}
      </div>
    </div>
  );
}