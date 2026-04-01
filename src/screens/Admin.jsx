import { useState, useEffect } from "react";
import { collection, doc, getDoc } from "firebase/firestore";
import { db, loadAllUsersMeta, getUserDaysCount, checkIsAdmin, loadSuggestions, replySuggestion, loadAllCommunities, deleteCommunityFull } from "../firebase.js";
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
  const [activeTab, setActiveTab] = useState("users"); // users | suggestions
  const [suggestions, setSuggestions] = useState([]);
  const [replyTexts, setReplyTexts] = useState({});
  const [replyingId, setReplyingId] = useState(null);
  const [communities, setCommunities] = useState([]);
  const [commLoading, setCommLoading] = useState(false);

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
      const [list, suggs, comms] = await Promise.all([loadAllUsersMeta(), loadSuggestions(), loadAllCommunities()]);
      list.sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0));
      setUsers(list);
      setSuggestions(suggs);
      setCommunities(comms.sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0)));
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 16 }}>
          {statCards.slice(3).map(c => (
            <StatCard key={c.label} {...c} />
          ))}
        </div>

        {/* 탭 */}
        {(() => {
          const pendingCount = suggestions.filter(s => s.status === 'pending').length;
          return (
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              {[
                { key: 'users', label: `유저 (${totalUsers})` },
                { key: 'suggestions', label: '제안', badge: pendingCount },
                { key: 'communities', label: `커뮤니티 (${communities.length})` },
              ].map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                  flex: 1, padding: '8px 0', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer',
                  border: 'none',
                  background: activeTab === t.key ? '#6C8EFF' : 'var(--dm-input)',
                  color: activeTab === t.key ? '#fff' : 'var(--dm-sub)',
                  position: 'relative',
                }}>
                  {t.label}
                  {t.badge > 0 && (
                    <span style={{ position: 'absolute', top: -4, right: 8, fontSize: 10, fontWeight: 900, background: '#F87171', color: '#fff', borderRadius: 999, padding: '1px 6px' }}>{t.badge}</span>
                  )}
                </button>
              ))}
            </div>
          );
        })()}

        {/* 유저 목록 탭 */}
        {activeTab === 'users' && (
          status === "loading" ? (
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
          )
        )}

        {/* 커뮤니티 탭 */}
        {activeTab === 'communities' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 80 }}>
            {commLoading && <div style={{ textAlign: 'center', color: 'var(--dm-muted)', padding: 24, fontSize: 14 }}>삭제 중...</div>}
            {communities.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--dm-muted)', padding: 32, fontSize: 14 }}>커뮤니티 없음</div>
            ) : communities.map(c => (
              <div key={c.id} style={{ background: 'var(--dm-card)', border: '1.5px solid var(--dm-border)', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--dm-text)' }}>{c.name}</span>
                    {c.isPublic && <span style={{ fontSize: 9, fontWeight: 900, color: '#6C8EFF', background: 'rgba(75,111,255,.12)', border: '1px solid rgba(75,111,255,.3)', borderRadius: 4, padding: '1px 5px' }}>공개</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--dm-muted)' }}>멤버 {c.memberCount || 0}명 · ID: {c.id.slice(0, 8)}...</div>
                </div>
                <button
                  disabled={commLoading}
                  onClick={async () => {
                    if (!window.confirm(`"${c.name}" 커뮤니티를 강제 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`)) return;
                    setCommLoading(true);
                    try {
                      await deleteCommunityFull(c.id);
                      setCommunities(prev => prev.filter(x => x.id !== c.id));
                    } catch { alert('삭제 실패 — Firestore 권한을 확인하세요'); }
                    setCommLoading(false);
                  }}
                  style={{ background: 'rgba(248,113,113,.15)', border: '1px solid rgba(248,113,113,.4)', borderRadius: 8, color: '#F87171', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '6px 12px', flexShrink: 0 }}>
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 제안 탭 */}
        {activeTab === 'suggestions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 80 }}>
            {suggestions.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--dm-muted)', padding: 32, fontSize: 14 }}>아직 제안이 없습니다.</div>
            ) : suggestions.map(s => (
              <div key={s.id} style={{ background: 'var(--dm-card)', border: `1.5px solid ${s.status === 'pending' ? 'rgba(251,191,36,.4)' : 'var(--dm-border)'}`, borderRadius: 14, padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--dm-muted)' }}>{s.maskedEmail}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 900, padding: '2px 8px', borderRadius: 999, background: s.status === 'pending' ? 'rgba(251,191,36,.15)' : 'rgba(74,222,128,.15)', color: s.status === 'pending' ? '#FBBF24' : '#4ADE80' }}>
                      {s.status === 'pending' ? '미답변' : '답변완료'}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--dm-muted)' }}>{new Date(s.createdAt).toLocaleDateString('ko-KR')}</span>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--dm-text)', lineHeight: 1.7, marginBottom: 10 }}>{s.text}</div>
                {s.adminReply && (
                  <div style={{ background: 'rgba(108,142,255,.1)', border: '1px solid rgba(108,142,255,.3)', borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: '#6C8EFF', marginBottom: 3 }}>관리자 답변</div>
                    <div style={{ fontSize: 12, color: 'var(--dm-text)', lineHeight: 1.6 }}>{s.adminReply}</div>
                  </div>
                )}
                {replyingId === s.id ? (
                  <div>
                    <textarea
                      value={replyTexts[s.id] || ''}
                      onChange={e => setReplyTexts(prev => ({ ...prev, [s.id]: e.target.value }))}
                      placeholder="답변을 입력하세요"
                      rows={3}
                      style={{ ...S.input, resize: 'none', marginBottom: 8, fontSize: 13 }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={async () => {
                        const reply = replyTexts[s.id]?.trim();
                        if (!reply) return;
                        await replySuggestion(s.id, reply);
                        setSuggestions(prev => prev.map(x => x.id === s.id ? { ...x, adminReply: reply, status: 'answered' } : x));
                        setReplyingId(null);
                      }} style={{ ...S.btn, flex: 1, marginTop: 0, background: 'linear-gradient(135deg,#4B6FFF,#6C8EFF)', fontSize: 13 }}>
                        답변 저장
                      </button>
                      <button onClick={() => setReplyingId(null)} style={{ ...S.btnGhost, flex: 1, marginTop: 0, fontSize: 13 }}>취소</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setReplyingId(s.id); setReplyTexts(prev => ({ ...prev, [s.id]: s.adminReply || '' })); }}
                    style={{ ...S.btnGhost, marginTop: 0, fontSize: 12, padding: '8px 0' }}>
                    {s.adminReply ? '✏️ 답변 수정' : '💬 답변하기'}
                  </button>
                )}
              </div>
            ))}
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
