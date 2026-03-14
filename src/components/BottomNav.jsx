import S from "../styles.js";

export default function BottomNav({ screen, setScreen }) {
  const items = [
    { id: "home", icon: "🏠", label: "홈" },
    { id: "today", icon: "📖", label: "일기/메모" },
    { id: "history", icon: "📅", label: "기록" },
    { id: "stats", icon: "📊", label: "통계" },
    { id: "settings", icon: "⚙️", label: "설정" },
  ];
  return (
    <div style={S.bottomNav}>
      {items.map((it) => (
        <button
          key={it.id}
          style={S.navItem(screen === it.id)}
          onClick={() => setScreen(it.id)}
        >
          <span style={{ fontSize: 20 }}>{it.icon}</span>
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}
