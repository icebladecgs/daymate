import S from "../styles.js";

export default function BottomNav({ screen, setScreen, badge = {} }) {
  const items = [
    { id: "home", icon: "🏠", label: "홈" },
    { id: "today", icon: "📖", label: "일기/메모" },
    { id: "history", icon: "📅", label: "기록" },
    { id: "community", icon: "👥", label: "커뮤니티" },
    { id: "settings", icon: "⚙️", label: "설정" },
  ];
  return (
    <div style={S.bottomNav}>
      {items.map((it) => (
        <button
          key={it.id}
          style={{ ...S.navItem(screen === it.id), position: "relative" }}
          onClick={() => setScreen(it.id)}
        >
          <span style={{ fontSize: 20, position: "relative", display: "inline-block" }}>
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
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}
