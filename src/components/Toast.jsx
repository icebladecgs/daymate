import { useEffect } from "react";
import S from "../styles.js";

// msg에 "+ N XP" 패턴이 있으면 XP 부분을 강조 렌더링
function ToastContent({ msg }) {
  const match = msg.match(/^(.*?)(\+\d+\s*XP)(.*)$/i);
  if (!match) return <span>{msg}</span>;
  return (
    <span>
      {match[1]}
      <span style={{
        background: "rgba(108,142,255,.25)",
        border: "1px solid rgba(108,142,255,.5)",
        borderRadius: 999,
        padding: "1px 8px",
        color: "#b8c3ff",
        fontWeight: 900,
        fontSize: 12,
        marginLeft: 4,
        marginRight: match[3] ? 4 : 0,
      }}>{match[2]}</span>
      {match[3]}
    </span>
  );
}

export default function Toast({ msg, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div style={S.toast}><ToastContent msg={msg} /></div>;
}
