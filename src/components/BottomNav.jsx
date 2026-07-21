import S from "../styles.js";

const NavIcon = ({ id, active }) => {
  const size = active ? 24 : 22;
  const color = active ? "#b8c3ff" : "var(--dm-muted)";
  const stroke = { fill: "none", stroke: color, strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" };
  if (id === "today") return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <path d="M9 11l3 3 8-8" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  );
  if (id === "my") return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
  if (id === "history") return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
  if (id === "community") return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <circle cx="9" cy="8" r="3" /><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
      <circle cx="17" cy="8" r="3" /><path d="M22 20c0-3.3-2.5-5.5-5-6" />
    </svg>
  );
  if (id === "settings") return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
  return null;
};

const leftItems = [
  { id: "today", label: "오늘" },
  { id: "my", label: "My" },
];
const rightItems = [
  { id: "history", label: "달력" },
  { id: "community", label: "소셜" },
  { id: "settings", label: "설정" },
];

export default function BottomNav({ screen, setScreen, badge = {}, onMemo }) {
  const renderItem = (it) => {
    const active = screen === it.id || (it.id === "today" && screen === "home");
    return (
      <button key={it.id} style={S.navItem(active)} onClick={() => setScreen(it.id)}>
        {active && (
          <span style={{
            position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
            width: 24, height: 3, borderRadius: 999,
            background: "linear-gradient(90deg, #6C8EFF, #A78BFA)",
          }} />
        )}
        <span style={{ position: "relative", display: "inline-flex" }}>
          <NavIcon id={it.id} active={active} />
          {badge[it.id] > 0 && (
            <span style={{
              position: "absolute", top: -4, right: -6,
              minWidth: 16, height: 16, borderRadius: 999,
              background: "#F87171", color: "#fff",
              fontSize: 10, fontWeight: 900, lineHeight: "16px",
              textAlign: "center", padding: "0 3px",
            }}>{badge[it.id]}</span>
          )}
        </span>
        <span style={{ letterSpacing: "0.01em" }}>{it.label}</span>
      </button>
    );
  };

  return (
    <div style={S.bottomNav}>
      <div style={{ flex: 1, display: "flex", justifyContent: "space-around" }}>
        {leftItems.map(renderItem)}
      </div>
      {onMemo && (
        <button
          onClick={onMemo}
          aria-label="빠른 메모"
          style={{
            position: "absolute", top: -22, left: "50%", transform: "translateX(-50%)",
            width: 54, height: 54, borderRadius: "50%",
            background: "linear-gradient(135deg, #A78BFA, #7C6FCD)",
            border: "none",
            boxShadow: "0 4px 18px rgba(167,139,250,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, cursor: "pointer",
          }}
        >✏️</button>
      )}
      <div style={{ flex: 1, display: "flex", justifyContent: "space-around" }}>
        {rightItems.map(renderItem)}
      </div>
    </div>
  );
}
