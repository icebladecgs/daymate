import { useState, useEffect } from "react";
import { collection, doc, getDoc } from "firebase/firestore";
import { db, loadAllUsersMeta, getUserDaysCount, checkIsAdmin } from "../firebase.js";
import S from "../styles.js";

const ADMIN_CONFIG_PATH = "admin/config";

function ago(isoStr) {
  if (!isoStr) return "-";
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 2) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}일 전`;
  return new Date(isoStr).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function fmtDate(isoStr) {
  if (!isoStr) return "-";
  return new Date(isoStr).toLocaleDateString("ko-KR", { year: "2-digit", month: "short", day: "numeric" });
}

function isToday(isoStr) {
  if (!isoStr) return false;
  return new Date(isoStr).toDateString() === new Date().toDateString();
}

function isWithinDays(isoStr, days) {
  if (!isoStr) return false;
  return Date.now() - new Date(isoStr).getTime() < days * 86400000;
}

export default function Admin({ authUser, onBack }) {
  const [status, setStatus] = useState("checking"); // checking | denied | loading | ready | error
  const [users, setUsers] = useState([]);
  const [daysMap, setDaysMap] = useState({});
  const [expandedUid, setExpandedUid] = useState(null);
  const [adminUid, setAdminUid] = useState(null);

  useEffect(() => {
    if (!authUser) { setStatus("denied"); return; }
    init();
  }, [authUser]); // eslint-disable-line

  const [errMsg, setErrMsg] = useState("");

  const init = async () => {
    setStatus("checking");
    setErrMsg("");
    try {
      const isAdm = await checkIsAdmin(authUser.uid);
      if (!isAdm) { setStatus("denied"); return; }
      setStatus("loading");
      const list = await loadAllUsersMeta();
      list.sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0));
      setUsers(list);
      setStatus("ready");
      loadDaysCounts(list);
    } catch (e) {
      console.error(e);
      const msg = e?.code === "permission-denied"
        ? "Firestore 보안 규칙이 접근을 차단하고 있습니다."
        : e?.message || "알 수 없는 오류";
      setErrMsg(msg);
      setStatus("error");
    }
  };

  const loadDaysCounts = async (list) => {
    for (const u of list) {
      try {
        const cnt = await getUserDaysCount(u.uid);
        setDaysMap(prev => ({ ...prev, [u.uid]: cnt }));
      } catch {
        setDaysMap(prev => ({ ...prev, [u.uid]: "?" }));
      }
    }
  };

  // --- 접근 거부 ---
  if (status === "denied" || status === "checking") {
    return (
      <div style={S.content}>
        <div style={S.topbar}>
          <button onClick={onBack} style={{ ...S.btnGhost, width: 56, marginTop: 0, padding: 10 }}>←</button>
          <div style={{ flex: 1 }}><div style={S.title}>관리자</div></div>
          <div style={{ width: 56 }} />
        </div>
        <div style={{ padding: 24, textAlign: "center" }}>
          {status === "checking" ? (
            <div style={{ color: "var(--dm-muted)", fontSize: 14 }}>권한 확인 중...</div>
          ) : (
            <>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>접근 권한 없음</div>
              <div style={{ fontSize: 12, color: "var(--dm-sub)", lineHeight: 1.7, marginBottom: 20 }}>
                Firebase 콘솔에서 <code style={{ background: "var(--dm-input)", padding: "2px 6px", borderRadius: 4 }}>admin/config</code> 문서를 생성하고<br />
                <code style={{ background: "var(--dm-input)", padding: "2px 6px", borderRadius: 4 }}>uids</code> 배열에 아래 UID를 추가하세요.
              </div>
              {authUser && (
                <div
                  onClick={() => navigator.clipboard?.writeText(authUser.uid).then(() => setAdminUid("copied"))}
                  style={{ background: "var(--dm-input)", border: "1.5px solid var(--dm-border)", borderRadius: 10, padding: "10px 14px", fontSize: 11, wordBreak: "break-all", cursor: "pointer", color: adminUid === "copied" ? "#4ADE80" : "var(--dm-text)", fontFamily: "monospace" }}
                >
                  {adminUid === "copied" ? "✓ 복사됨" : authUser.uid}
                </div>
              )}
              <button onClick={init} style={{ ...S.btn, marginTop: 16, background: "var(--dm-input)", color: "var(--dm-text)", boxShadow: "none", border: "1.5px solid var(--dm-border)" }}>
                다시 확인
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div style={S.content}>
        <div style={S.topbar}>
          <button onClick={onBack} style={{ ...S.btnGhost, width: 56, marginTop: 0, padding: 10 }}>←</button>
          <div style={{ flex: 1 }}><div style={S.title}>관리자</div></div>
          <div style={{ width: 56 }} />
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ fontSize: 13, color: "#F87171", marginBottom: 12, lineHeight: 1.6 }}>
            오류: {errMsg}
          </div>
          {errMsg.includes("규칙") && (
            <div style={{ fontSize: 12, color: "var(--dm-sub)", background: "var(--dm-input)", borderRadius: 10, padding: 12, marginBottom: 16, lineHeight: 1.7 }}>
              Firebase 콘솔 → Firestore → <b>규칙</b> 탭에서 아래 규칙을 추가하세요:<br /><br />
              <code style={{ fontSize: 11, fontFamily: "monospace", display: "block", whiteSpace: "pre-wrap" }}>
{`match /admin/{doc} {
  allow read: if request.auth != null;
}
match /users/{uid} {
  allow read: if request.auth.uid in
    get(/databases/$(database)/documents/admin/config).data.uids;
  allow write: if request.auth.uid == uid;
}`}
              </code>
            </div>
          )}
          <button onClick={init} style={{ ...S.btn }}>재시도</button>
        </div>
      </div>
    );
  }

  // --- 통계 계산 ---
  const totalUsers = users.length;
  const activeToday = users.filter(u => isToday(u.lastSeen)).length;
  const activeWeek = users.filter(u => isWithinDays(u.lastSeen, 7)).length;
  const newThisWeek = users.filter(u => isWithinDays(u.createdAt, 7)).length;
  const totalDays = Object.values(daysMap).reduce((a, b) => (typeof b === "number" ? a + b : a), 0);

  const statCards = [
    { label: "전체 유저", value: status === "loading" ? "..." : totalUsers, color: "#6C8EFF" },
    { label: "오늘 접속", value: status === "loading" ? "..." : activeToday, color: "#4ADE80" },
    { label: "7일 활성", value: status === "loading" ? "..." : activeWeek, color: "#FBBF24" },
    { label: "신규 (7일)", value: status === "loading" ? "..." : newThisWeek, color: "#F472B6" },
    { label: "총 기록 일수", value: Object.keys(daysMap).length < users.length ? "..." : totalDays, color: "#A78BFA" },
  ];

  return (
    <div style={S.content}>
      {/* 상단 바 */}
      <div style={S.topbar}>
        <button onClick={onBack} style={{ ...S.btnGhost, width: 56, marginTop: 0, padding: 10 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={S.title}>관리자 대시보드</div>
          <div style={S.sub}>{authUser?.email}</div>
        </div>
        <button onClick={init} style={{ ...S.btnGhost, width: 56, marginTop: 0, padding: 10, fontSize: 18 }}>↻</button>
      </div>

      <div style={{ padding: "0 14px" }}>
        {/* 통계 카드 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
          {statCards.slice(0, 3).map(c => (
            <StatCard key={c.label} {...c} />
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 20 }}>
          {statCards.slice(3).map(c => (
            <StatCard key={c.label} {...c} />
          ))}
        </div>

        {/* 유저 목록 */}
        <div style={{ fontSize: 11, fontWeight: 900, color: "var(--dm-muted)", marginBottom: 8, letterSpacing: 0.5 }}>
          유저 목록 ({status === "loading" ? "로딩 중..." : `${totalUsers}명`})
        </div>

        {status === "loading" ? (
          <div style={{ textAlign: "center", color: "var(--dm-muted)", padding: 32, fontSize: 14 }}>유저 목록 로딩 중...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 80 }}>
            {users.map(u => (
              <UserRow
                key={u.uid}
                u={u}
                daysCount={daysMap[u.uid]}
                expanded={expandedUid === u.uid}
                onToggle={() => setExpandedUid(expandedUid === u.uid ? null : u.uid)}
              />
            ))}
            {users.length === 0 && (
              <div style={{ textAlign: "center", color: "var(--dm-muted)", padding: 32, fontSize: 14 }}>
                등록된 유저가 없습니다.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: "var(--dm-card)", border: "1.5px solid var(--dm-border)", borderRadius: 14, padding: "12px 14px" }}>
      <div style={{ fontSize: 22, fontWeight: 900, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function UserRow({ u, daysCount, expanded, onToggle }) {
  const displayName = u.name || u.email?.split("@")[0] || "이름 없음";
  const today = isToday(u.lastSeen);
  const recentWeek = isWithinDays(u.lastSeen, 7);

  return (
    <div style={{ background: "var(--dm-card)", border: "1.5px solid var(--dm-border)", borderRadius: 14, overflow: "hidden" }}>
      <div
        onClick={onToggle}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer" }}
      >
        {/* 아바타 */}
        <div style={{ width: 36, height: 36, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "var(--dm-deep)" }}>
          {u.photoURL
            ? <img src={u.photoURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>👤</div>
          }
        </div>
        {/* 이름/이메일 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {displayName}
          </div>
          <div style={{ fontSize: 11, color: "var(--dm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {u.email || "-"}
          </div>
        </div>
        {/* 상태 뱃지 + 기록 수 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20,
            background: today ? "rgba(74,222,128,.15)" : recentWeek ? "rgba(251,191,36,.12)" : "var(--dm-input)",
            color: today ? "#4ADE80" : recentWeek ? "#FBBF24" : "var(--dm-muted)"
          }}>
            {today ? "오늘" : ago(u.lastSeen)}
          </div>
          <div style={{ fontSize: 11, color: "var(--dm-sub)" }}>
            {daysCount === undefined ? "..." : `${daysCount}일`}
          </div>
        </div>
        <div style={{ color: "var(--dm-muted)", fontSize: 12, marginLeft: 4 }}>{expanded ? "▲" : "▼"}</div>
      </div>

      {/* 펼친 상세 */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--dm-border)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          <DetailRow label="UID" value={u.uid} mono />
          <DetailRow label="가입일" value={fmtDate(u.createdAt)} />
          <DetailRow label="마지막 접속" value={u.lastSeen ? new Date(u.lastSeen).toLocaleString("ko-KR") : "-"} />
          <DetailRow label="기록 일수" value={daysCount === undefined ? "로딩 중..." : `${daysCount}일`} />
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <div style={{ fontSize: 11, color: "var(--dm-muted)", width: 72, flexShrink: 0, paddingTop: 1 }}>{label}</div>
      <div style={{ fontSize: 11, color: "var(--dm-text)", wordBreak: "break-all", fontFamily: mono ? "monospace" : "inherit" }}>{value}</div>
    </div>
  );
}
