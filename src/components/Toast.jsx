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

function getToastStyle(msg) {
  const errorKeywords = /실패|오류|에러|error|없어|불가|차단|거부|denied|failed/i;
  const warnKeywords = /주의|확인|경고|이미|불일치/i;
  if (errorKeywords.test(msg)) {
    return { color: "#F87171", border: "1px solid rgba(248,113,113,.4)", background: "rgba(30,10,10,.85)" };
  }
  if (warnKeywords.test(msg)) {
    return { color: "#FBBF24", border: "1px solid rgba(251,191,36,.4)", background: "rgba(30,25,5,.85)" };
  }
  return {}; // 기본: 초록 (styles.js 기준)
}

export default function Toast({ msg, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, [onDone]);
  const extra = getToastStyle(msg);
  return (
    <div style={{ ...S.toast, ...extra }}>
      <ToastContent msg={msg} />
    </div>
  );
}
