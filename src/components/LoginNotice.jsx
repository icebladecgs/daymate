// 로그인 안 된 상태로 메모를 쓸 때만 보이는 안내 줄 (2026-10-05) — 메모 쓰기 화면·메모 관리자 위쪽.
// 로그인 전에 쓴 메모는 "미동기화"로 표시돼 있어 로그인할 때 계정으로 올라간다(App 로그인 병합).
export default function LoginNotice({ onLogin }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', margin: '0 12px 8px', borderRadius: 10, background: 'rgba(251,191,36,.12)', border: '1px solid rgba(251,191,36,.45)', flexShrink: 0 }}>
      <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--dm-text)', lineHeight: 1.45 }}>
        ⚠ 로그인 안 됨 — 이 메모는 <b>이 기기에만</b> 저장돼요
      </div>
      <button onClick={onLogin}
        style={{ flexShrink: 0, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--dm-border)', background: 'var(--dm-card)', color: 'var(--dm-text)', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
        <span style={{ color: '#4285F4', fontWeight: 900 }}>G</span> 구글 로그인
      </button>
    </div>
  );
}
