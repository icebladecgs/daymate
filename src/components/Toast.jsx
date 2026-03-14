import { useEffect } from "react";
import S from "../styles.js";

export default function Toast({ msg, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1900);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div style={S.toast}>{msg}</div>;
}
