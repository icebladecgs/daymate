import S from "../styles.js";

export default function BottomNav({ screen, setScreen, badge = {} }) {
  const items = [
    { id: "today", icon: "📋", label: "오늘" },
    { id: "my", icon: "👤", label: "My" },
    { id: "history", icon: "📅", label: "달력" },
    { id: "community", icon: "👥", label: "커뮤니티" },
    { id: "settings", icon: "⚙️", label: "설정" },
  ];
  return (
    <div style={S.bottomNav}>
      {items.map((it) => (
        <button
          key={it.id}
          style={{ ...S.navItem(screen === it.id || (it.id === "today" && screen === "home")), position: "relative", padding: "6px 8px" }}
          onClick={() => setScreen(it.id)}
        >
          <span style={{ fontSize: screen === it.id ? 20 : 18, position: "relative", display: "inline-block", transition: "font-size 0.2s ease" }}>
            {it.icon}
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
      ))}
    </div>
  );
}
