import { useState, useEffect, useRef } from "react";
import { calcLevel } from "../data/stats.js";
import { createChallenge, loadPublicChallenges, loadMyChallenges, joinChallenge, certifyChallenge, loadChallengeCerts, cheerCert, deleteCert, loadChallengeMembers, deleteChallengeFull, endChallenge, updateMemberLinkedHabit, loadRankingProfiles } from "../firebase.js";
import { toDateStr, formatRelativeTime } from "../utils/date.js";
import { store } from "../utils/storage.js";
import S from "../styles.js";

const NICKNAME_KEY = 'dm_challenge_nickname';

function isChallengeClosed(challenge, today = toDateStr()) {
  return !!((challenge?.status && challenge.status !== 'open') || (challenge?.endDate && challenge.endDate < today));
}

function getChallengeClosedMeta(challenge, today = toDateStr()) {
  const endedByAdmin = challenge?.status && challenge.status !== 'open';
  if (endedByAdmin) {
    return {
      badge: '관리자 종료',
      line: challenge?.endedAt ? `관리자 종료 · ${challenge.endedAt.slice(0, 10)}` : '관리자 종료',
    };
  }

  if (challenge?.endDate && challenge.endDate < today) {
    return {
      badge: '마감 종료',
      line: `마감 종료 · ${challenge.endDate}`,
    };
  }

  return {
    badge: '종료됨',
    line: '종료됨',
  };
}

function LevelChip({ levelInfo, score = 0, compact = false }) {
  if (!levelInfo) return null;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: compact ? 4 : 6,
      padding: compact ? '3px 8px' : '5px 10px',
      borderRadius: 999,
      background: 'linear-gradient(135deg, rgba(108,142,255,.16), rgba(75,111,255,.08))',
      border: '1px solid rgba(108,142,255,.22)',
      color: compact ? 'var(--dm-sub)' : 'var(--dm-text)',
      fontSize: compact ? 10 : 11,
      fontWeight: compact ? 800 : 900,
      whiteSpace: 'nowrap',
    }}>
      <span>{levelInfo.icon}</span>
      <span>Lv.{levelInfo.level}</span>
      {!compact && <span>{levelInfo.title}</span>}
      {!compact && <span style={{ color: 'var(--dm-muted)', fontWeight: 800 }}>{(score || 0).toLocaleString()} XP</span>}
    </span>
  );
}

export default function Challenge({ authUser, myTotalScore = 0, habits = [], onToggleHabit, initialSelectedId = null }) {
  const [tab, setTab] = useState("my"); // my | explore | archive
  const [myChallenges, setMyChallenges] = useState([]);
  const [publicChallenges, setPublicChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // 선택된 챌린지 상세
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState(null);
  const initialSelectionHandledRef = useRef(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const [nickname, setNickname] = useState(() => store.get(NICKNAME_KEY, authUser?.displayName?.split(" ")[0] || authUser?.email?.split("@")[0] || ""));
  const [editingNickname, setEditingNickname] = useState(!store.get(NICKNAME_KEY, null));
  const [nicknameInput, setNicknameInput] = useState(nickname);
  const today = toDateStr();
  const activeMyChallenges = myChallenges.filter((challenge) => !isChallengeClosed(challenge, today));
  const archivedChallenges = myChallenges
    .filter((challenge) => isChallengeClosed(challenge, today))
    .sort((a, b) => ((b.endedAt || b.endDate || b.createdAt || '').localeCompare(a.endedAt || a.endDate || a.createdAt || '')));

  useEffect(() => {
    if (!authUser) return;
    load();
  }, [authUser]); // eslint-disable-line

  useEffect(() => {
    if (!initialSelectedId || initialSelectionHandledRef.current) return;
    const allChallenges = [...(myChallenges || []), ...(publicChallenges || [])];
    const matched = allChallenges.find((challenge) => challenge.id === initialSelectedId);
    if (!matched) return;
    setSelected(matched);
    initialSelectionHandledRef.current = true;
  }, [initialSelectedId, myChallenges, publicChallenges]);

  const load = async () => {
    setLoading(true);
    try {
      const [my, pub] = await Promise.all([loadMyChallenges(authUser.uid), loadPublicChallenges()]);
      setMyChallenges(my);
      // 이미 참여 중인 챌린지는 explore에서 제외
      const myIds = new Set(my.map(c => c.id));
      setPublicChallenges(pub.filter(c => !myIds.has(c.id)));
    } finally {
      setLoading(false);
    }
  };

  const saveNickname = () => {
    if (!nicknameInput.trim()) return;
    const n = nicknameInput.trim();
    setNickname(n);
    store.set(NICKNAME_KEY, n);
    setEditingNickname(false);
  };

  if (showCreate) return <CreateChallenge authUser={authUser} nickname={nickname} habits={habits} onDone={(id) => { setShowCreate(false); load(); }} onBack={() => setShowCreate(false)} showToast={showToast} />;
  if (selected) return <ChallengeDetail challenge={selected} authUser={authUser} nickname={nickname} myLevel={calcLevel(myTotalScore)} onBack={() => { setSelected(null); load(); }} onDeleted={() => { setSelected(null); load(); }} showToast={showToast} onToggleHabit={onToggleHabit} habits={habits} />;

  return (
    <div style={{ paddingBottom: 80 }}>
      {toast && (
        <div style={{ position: 'fixed', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 999, background: 'var(--dm-card)', border: '1px solid var(--dm-border)', borderRadius: 12, padding: '10px 18px', fontSize: 13, fontWeight: 700, color: 'var(--dm-text)', boxShadow: '0 4px 20px rgba(0,0,0,.3)', whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}

      {/* 닉네임 */}
      <div style={{ padding: '8px 16px 0', display: 'grid', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--dm-muted)' }}>챌린지 닉네임</span>
          {editingNickname ? (
            <div style={{ display: 'flex', gap: 6, flex: 1 }}>
              <input value={nicknameInput} onChange={e => setNicknameInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveNickname()} placeholder="닉네임 입력" maxLength={20} autoFocus style={{ ...S.input, marginBottom: 0, fontSize: 12, padding: '4px 10px', flex: 1 }} />
              <button onClick={saveNickname} style={{ ...S.btn, marginTop: 0, padding: '4px 12px', fontSize: 12, width: 'auto' }}>확인</button>
            </div>
          ) : (
            <button onClick={() => { setNicknameInput(nickname); setEditingNickname(true); }} style={{ background: 'transparent', border: 'none', color: 'var(--dm-text)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
              {nickname} <span style={{ fontSize: 11 }}>✏️</span>
            </button>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--dm-muted)', paddingLeft: 1 }}>
          커뮤니티 닉네임과 별개로, 모든 챌린지에서 공통으로 사용됩니다.
        </div>
      </div>

      {/* 탭 + 만들기 버튼 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px 8px' }}>
        <div style={{ display: 'flex', flex: 1, gap: 6 }}>
          {[{ key: 'my', label: `내 챌린지 ${activeMyChallenges.length}` }, { key: 'explore', label: '탐색' }, { key: 'archive', label: `보관함 ${archivedChallenges.length}` }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: '8px 0', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer', border: 'none',
              background: tab === t.key ? '#6C8EFF' : 'var(--dm-input)',
              color: tab === t.key ? '#fff' : 'var(--dm-sub)',
            }}>{t.label}</button>
          ))}
        </div>
        <button onClick={() => setShowCreate(true)} style={{ ...S.btn, marginTop: 0, padding: '8px 14px', fontSize: 13, width: 'auto', flexShrink: 0 }}>
          + 만들기
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--dm-muted)', padding: 40, fontSize: 14 }}>불러오는 중...</div>
      ) : tab === 'my' ? (
        activeMyChallenges.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🏁</div>
            <div style={{ fontSize: 14, color: 'var(--dm-muted)', marginBottom: 16 }}>참여 중인 챌린지가 없어요</div>
            <button onClick={() => setTab('explore')} style={{ ...S.btn, width: 'auto', padding: '10px 24px', marginTop: 0, fontSize: 13 }}>챌린지 탐색하기</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px' }}>
            {activeMyChallenges.map(c => (
              <ChallengeCard key={c.id} challenge={c} myMember={c.myMember} today={today} onClick={() => setSelected(c)} />
            ))}
          </div>
        )
      ) : tab === 'explore' ? (
        publicChallenges.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 14, color: 'var(--dm-muted)' }}>공개 챌린지가 없어요</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px' }}>
            {publicChallenges.map(c => (
              <ChallengeCard key={c.id} challenge={c} today={today} onClick={() => setSelected(c)} />
            ))}
          </div>
        )
      ) : archivedChallenges.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🗂️</div>
          <div style={{ fontSize: 14, color: 'var(--dm-muted)', marginBottom: 8 }}>보관된 챌린지가 없어요</div>
          <div style={{ fontSize: 12, color: 'var(--dm-muted)' }}>마감일이 지나거나 관리자가 종료한 챌린지가 이쪽으로 모입니다.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px' }}>
          {archivedChallenges.map(c => (
            <ChallengeCard key={c.id} challenge={c} myMember={c.myMember} today={today} onClick={() => setSelected(c)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChallengeCard({ challenge: c, myMember, today, onClick }) {
  const daysLeft = c.endDate ? Math.max(0, Math.ceil((new Date(c.endDate) - new Date(today)) / 86400000)) : null;
  const certedToday = myMember?.lastCertDate === today;
  const isClosed = isChallengeClosed(c, today);
  const closedMeta = isClosed ? getChallengeClosedMeta(c, today) : null;

  return (
    <div onClick={onClick} style={{ background: 'var(--dm-card)', border: `1.5px solid ${certedToday ? 'rgba(74,222,128,.4)' : 'var(--dm-border)'}`, borderRadius: 14, padding: '14px', cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 3 }}>{c.title}</div>
          {c.description && <div style={{ fontSize: 12, color: 'var(--dm-muted)', lineHeight: 1.5 }}>{c.description}</div>}
          {isClosed && <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginTop: 5 }}>{closedMeta.line}</div>}
        </div>
        {isClosed ? (
          <span style={{ fontSize: 11, fontWeight: 900, color: '#F87171', background: 'rgba(248,113,113,.12)', border: '1px solid rgba(248,113,113,.3)', borderRadius: 8, padding: '2px 8px', flexShrink: 0, marginLeft: 8 }}>{closedMeta.badge}</span>
        ) : certedToday ? (
          <span style={{ fontSize: 11, fontWeight: 900, color: '#4ADE80', background: 'rgba(74,222,128,.12)', border: '1px solid rgba(74,222,128,.3)', borderRadius: 8, padding: '2px 8px', flexShrink: 0, marginLeft: 8 }}>✓ 인증완료</span>
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--dm-muted)' }}>👥 {c.memberCount || 1}명</span>
        {myMember && <span style={{ fontSize: 11, color: '#FBBF24', fontWeight: 700 }}>🔥 {myMember.streak || 0}일 연속</span>}
        {!isClosed && daysLeft !== null && <span style={{ fontSize: 11, color: 'var(--dm-muted)' }}>{`⏰ ${daysLeft}일 남음`}</span>}
        <span style={{ fontSize: 11, color: 'var(--dm-muted)', background: 'var(--dm-input)', borderRadius: 6, padding: '1px 7px' }}>
          {c.certType === 'check' ? '✓ 체크' : '✏️ 텍스트'}
        </span>
      </div>
    </div>
  );
}

function ChallengeDetail({ challenge: c, authUser, nickname, myLevel, onBack, showToast, onDeleted, onToggleHabit, habits = [] }) {
  const [certs, setCerts] = useState([]);
  const [members, setMembers] = useState([]);
  const [memberRankings, setMemberRankings] = useState({});
  const [loading, setLoading] = useState(true);
  const [certText, setCertText] = useState("");
  const [certifying, setCertifying] = useState(false);
  const [joining, setJoining] = useState(false);
  const [isMember, setIsMember] = useState(!!c.myMember);
  const [myMember, setMyMember] = useState(c.myMember || null);
  const [linkedHabitId, setLinkedHabitId] = useState(c.myMember?.linkedHabitId || c.linkedHabitId || '');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
  const [detailTab, setDetailTab] = useState("feed"); // feed | members
  const [cheeredCerts, setCheeredCerts] = useState(() => { try { return new Set(JSON.parse(store.get(`dm_cheer_${c.id}`, '[]'))); } catch { return new Set(); } });
  const today = toDateStr();
  const certedToday = myMember?.lastCertDate === today;
  const isClosed = !!((c.status && c.status !== 'open') || (c.endDate && c.endDate < today));
  const closedMeta = isClosed ? getChallengeClosedMeta(c, today) : null;

  useEffect(() => {
    loadData();
  }, []); // eslint-disable-line

  const loadData = async () => {
    setLoading(true);
    try {
      const [certsData, membersData] = await Promise.all([loadChallengeCerts(c.id), loadChallengeMembers(c.id)]);
      const rankingMap = await loadRankingProfiles(membersData.map(member => member.uid));
      setCerts(certsData);
      setMembers(membersData);
      setMemberRankings(rankingMap);
      const me = membersData.find(m => m.uid === authUser.uid);
      if (me) { setIsMember(true); setMyMember(me); setLinkedHabitId(me.linkedHabitId || c.linkedHabitId || ''); }
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    setJoining(true);
    try {
      await joinChallenge(authUser.uid, nickname, c.id);
      setIsMember(true);
      setMyMember({ streak: 0, totalCerts: 0, lastCertDate: null });
      showToast('✅ 챌린지 참여 완료!');
      loadData();
    } catch (e) {
      if (e.message === 'challenge_closed') showToast('종료된 챌린지는 참여할 수 없어요');
      else showToast('❌ 참여 실패');
    }
    finally { setJoining(false); }
  };

  const handleCert = async () => {
    if (certedToday) return;
    if (c.certType === 'text' && !certText.trim()) return;
    setCertifying(true);
    try {
      await certifyChallenge(authUser.uid, nickname, c.id, certText.trim() || '✓');
      setCertText("");
      // 연결된 습관 자동 체크 (멤버 개인 설정 우선)
      if (linkedHabitId && onToggleHabit) {
        onToggleHabit(linkedHabitId);
        showToast('🎉 인증 완료! 연결된 습관도 체크됐어요');
      } else {
        showToast('🎉 인증 완료! 오늘도 수고했어요');
      }
      loadData();
    } catch (e) {
      if (e.message === 'already_certified') showToast('오늘은 이미 인증했어요');
      else if (e.message === 'challenge_closed') showToast('종료된 챌린지는 더 이상 인증할 수 없어요');
      else showToast('❌ 인증 실패');
    } finally { setCertifying(false); }
  };

  const handleCheer = async (certId) => {
    if (cheeredCerts.has(certId)) return;
    await cheerCert(c.id, certId);
    const next = new Set(cheeredCerts);
    next.add(certId);
    setCheeredCerts(next);
    store.set(`dm_cheer_${c.id}`, JSON.stringify([...next]));
    setCerts(prev => prev.map(cert => cert.id === certId ? { ...cert, cheerCount: (cert.cheerCount || 0) + 1 } : cert));
  };

  const isAdmin = authUser?.uid === import.meta.env.VITE_ADMIN_UID;

  const handleDeleteChallenge = async () => {
    try {
      await deleteChallengeFull(c.id, authUser?.uid);
      showToast('챌린지가 삭제됐어요');
      onDeleted?.();
      onBack();
    } catch (e) {
      showToast('삭제 실패: ' + (e?.message || '권한을 확인하세요'));
      setDeleteConfirm(false);
    }
  };

  const handleEndChallenge = async () => {
    try {
      await endChallenge(c.id, authUser?.uid);
      showToast('챌린지를 종료했어요');
      onBack();
    } catch (e) {
      showToast('종료 실패: ' + (e?.message || '권한을 확인하세요'));
      setEndConfirm(false);
    }
  };

  const handleDeleteCert = async (certId) => {
    if (!window.confirm('인증을 삭제할까요?')) return;
    await deleteCert(c.id, certId);
    setCerts(prev => prev.filter(cert => cert.id !== certId));
  };

  const daysLeft = c.endDate ? Math.max(0, Math.ceil((new Date(c.endDate) - new Date(today)) / 86400000)) : null;
  const todayCerts = certs.filter(cert => cert.dateKey === today).length;
  const rankedMembers = [...members]
    .map(member => ({
      ...member,
      totalCerts: certs.filter(cert => cert.uid === member.uid).length,
      totalScore: memberRankings[member.uid]?.totalScore || 0,
      levelInfo: calcLevel(memberRankings[member.uid]?.totalScore || 0),
    }))
    .sort((a, b) => (b.totalCerts - a.totalCerts) || (b.totalScore - a.totalScore) || ((b.streak || 0) - (a.streak || 0)));
  const myMemberScore = memberRankings[authUser.uid]?.totalScore || 0;
  const myMemberRank = rankedMembers.findIndex(member => member.uid === authUser.uid) + 1;
  const podiumMembers = rankedMembers.slice(0, 3);
  const rankAccent = ['#FBBF24', '#94A3B8', '#CD7C3E'];
  const rankBadge = ['🥇', '🥈', '🥉'];

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* 헤더 */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--dm-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: c.description ? 8 : 0 }}>
          <button onClick={onBack} style={{ ...S.btnGhost, width: 36, height: 36, marginTop: 0, padding: 0, fontSize: 18, flexShrink: 0 }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--dm-text)' }}>{c.title}</div>
            <div style={{ fontSize: 11, color: 'var(--dm-muted)' }}>👥 {c.memberCount || 1}명 · {isClosed ? closedMeta.line : (daysLeft !== null ? `⏰ ${daysLeft}일 남음` : '기간 없음')}</div>
          </div>
          {isAdmin && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {!isClosed && (endConfirm ? (
                <>
                  <button onClick={() => setEndConfirm(false)} style={{ background: 'var(--dm-card)', border: '1px solid var(--dm-border)', borderRadius: 8, color: 'var(--dm-muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '5px 10px' }}>취소</button>
                  <button onClick={handleEndChallenge} style={{ background: 'rgba(251,191,36,.18)', border: '1px solid rgba(251,191,36,.4)', borderRadius: 8, color: '#FBBF24', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '5px 10px' }}>종료확인</button>
                </>
              ) : deleteConfirm ? (
                <>
                  <button onClick={() => setDeleteConfirm(false)} style={{ background: 'var(--dm-card)', border: '1px solid var(--dm-border)', borderRadius: 8, color: 'var(--dm-muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '5px 10px' }}>취소</button>
                  <button onClick={handleDeleteChallenge} style={{ background: 'rgba(248,113,113,.2)', border: '1px solid rgba(248,113,113,.5)', borderRadius: 8, color: '#F87171', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '5px 10px' }}>삭제확인</button>
                </>
              ) : (
                <>
                  <button onClick={() => setEndConfirm(true)} style={{ background: 'transparent', border: '1px solid rgba(251,191,36,.35)', borderRadius: 8, color: '#FBBF24', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '5px 10px' }}>종료</button>
                  <button onClick={() => setDeleteConfirm(true)} style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 18, cursor: 'pointer', padding: '4px', flexShrink: 0 }}>🗑</button>
                </>
              ))}
              {isClosed && !deleteConfirm && (
                <button onClick={() => setDeleteConfirm(true)} style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 18, cursor: 'pointer', padding: '4px', flexShrink: 0 }}>🗑</button>
              )}
            </div>
          )}
        </div>
        {c.description && (
          <div style={{ fontSize: 12, color: 'var(--dm-sub)', lineHeight: 1.7, background: 'var(--dm-input)', borderRadius: 10, padding: '10px 12px' }}>
            {c.description}
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--dm-muted)', lineHeight: 1.6 }}>
          생성 보너스 XP는 없고, 인증은 하루 1회만 반영됩니다.
        </div>
      </div>

      {/* 내 상태 카드 */}
      {isMember && (
        <div style={{ margin: '12px 16px', background: 'var(--dm-card)', border: '1.5px solid var(--dm-border)', borderRadius: 14, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <LevelChip levelInfo={myLevel} score={myMemberScore} />
            <span style={{ fontSize: 11, color: 'var(--dm-muted)' }}>
              다음 레벨까지 {Math.max(0, (myLevel?.nextFloor || 0) - myMemberScore).toLocaleString()} XP
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: certedToday ? 0 : 12 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--dm-muted)', marginBottom: 2 }}>내 현황</div>
              <div style={{ display: 'flex', gap: 16 }}>
                <span style={{ fontSize: 20, fontWeight: 900, color: '#FBBF24' }}>🔥 {myMember?.streak || 0}일</span>
                <span style={{ fontSize: 13, color: 'var(--dm-muted)', alignSelf: 'flex-end', marginBottom: 2 }}>총 {myMember?.totalCerts || 0}회 · {myMemberScore.toLocaleString()} XP · 현재 {myMemberRank || '-'}위</span>
              </div>
            </div>
            {certedToday && (
              <div style={{ fontSize: 13, fontWeight: 900, color: '#4ADE80' }}>✓ 오늘 인증완료</div>
            )}
          </div>

          {!certedToday && (
            <div>
              {isClosed && (
                <div style={{ fontSize: 12, color: '#F87171', marginBottom: 8, fontWeight: 700 }}>
                  종료된 챌린지라 추가 인증은 닫혀 있어요.
                </div>
              )}
              {c.certType === 'text' && (
                <input
                  value={certText}
                  onChange={e => setCertText(e.target.value)}
                  placeholder="오늘 한 것을 한 줄로 적어주세요"
                  maxLength={100}
                  style={{ ...S.input, marginBottom: 8, fontSize: 13 }}
                />
              )}
              <button onClick={handleCert} disabled={isClosed || certifying || (c.certType === 'text' && !certText.trim())} style={{
                ...S.btn, marginTop: 0, fontSize: 13,
                background: certifying ? 'var(--dm-input)' : 'linear-gradient(135deg,#4ADE80,#22C55E)',
                opacity: (isClosed || certifying) ? 0.6 : 1,
              }}>
                {isClosed ? '종료된 챌린지' : certifying ? '인증 중...' : '✓ 오늘 인증하기'}
              </button>
            </div>
          )}

          {/* 습관 연결 */}
          {habits.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--dm-border)' }}>
              <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginBottom: 8 }}>🔗 습관 연결 — 인증하면 자동 체크</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[{ id: '', title: '연결 안 함', icon: '✕' }, ...habits].map(h => {
                  const selected = linkedHabitId === h.id;
                  return (
                    <button key={h.id} onClick={async () => {
                      setLinkedHabitId(h.id);
                      updateMemberLinkedHabit(c.id, authUser.uid, h.id).catch(() => {});
                    }} style={{
                      padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      border: selected ? '1.5px solid #6C8EFF' : '1.5px solid var(--dm-border)',
                      background: selected ? 'rgba(108,142,255,.15)' : 'var(--dm-input)',
                      color: selected ? '#6C8EFF' : 'var(--dm-muted)',
                    }}>{h.icon || '📌'} {h.name || h.title}</button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 참여 버튼 (비참여자) */}
      {!isMember && (
        <div style={{ margin: '12px 16px' }}>
          {c.description && <div style={{ fontSize: 13, color: 'var(--dm-sub)', marginBottom: 12, lineHeight: 1.6 }}>{c.description}</div>}
          <button onClick={handleJoin} disabled={joining} style={{ ...S.btn, marginTop: 0, fontSize: 14 }}>
            {isClosed ? '종료된 챌린지' : joining ? '참여 중...' : '🏁 챌린지 참여하기'}
          </button>
        </div>
      )}

      {/* 피드/멤버 탭 */}
      <div style={{ display: 'flex', gap: 6, padding: '4px 16px 12px' }}>
        {[{ key: 'feed', label: `인증 피드 (오늘 ${todayCerts}명)` }, { key: 'members', label: `전체 참여자 ${members.length}명` }].map(t => (
          <button key={t.key} onClick={() => setDetailTab(t.key)} style={{
            flex: 1, padding: '7px 0', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer', border: 'none',
            background: detailTab === t.key ? '#6C8EFF' : 'var(--dm-input)',
            color: detailTab === t.key ? '#fff' : 'var(--dm-sub)',
          }}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--dm-muted)', padding: 32, fontSize: 14 }}>불러오는 중...</div>
      ) : detailTab === 'feed' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px' }}>
          {certs.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--dm-muted)', padding: 32, fontSize: 14 }}>아직 인증이 없어요. 첫 번째로 인증해보세요!</div>
          ) : certs.map(cert => {
            const certLevel = cert.uid === authUser.uid ? myLevel : calcLevel(memberRankings[cert.uid]?.totalScore || 0);
            const certScore = cert.uid === authUser.uid ? (myMember?.totalScore || 0) : (memberRankings[cert.uid]?.totalScore || 0);
            return (
            <div key={cert.id} style={{ background: 'var(--dm-card)', border: '1.5px solid var(--dm-border)', borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: cert.text && cert.text !== '✓' ? 6 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#4B6FFF22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: '#6C8EFF' }}>
                    {cert.nickname?.[0] || '?'}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--dm-text)' }}>{cert.nickname}</span>
                      <LevelChip levelInfo={certLevel} score={certScore} compact />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, color: 'var(--dm-muted)' }}>{cert.dateKey === today ? '오늘' : cert.dateKey} · {formatRelativeTime(cert.createdAt)}</span>
                      <span style={{ fontSize: 10, color: 'var(--dm-muted)' }}>{certLevel.title}</span>
                      <span style={{ fontSize: 10, color: '#6C8EFF' }}>{certScore.toLocaleString()} XP</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button onClick={() => handleCheer(cert.id)} disabled={cheeredCerts.has(cert.id)} style={{ background: cheeredCerts.has(cert.id) ? 'rgba(251,191,36,.25)' : 'rgba(251,191,36,.12)', border: '1px solid rgba(251,191,36,.3)', borderRadius: 8, padding: '4px 10px', color: '#FBBF24', fontSize: 12, fontWeight: 700, cursor: cheeredCerts.has(cert.id) ? 'default' : 'pointer' }}>
                    👏 {cert.cheerCount || 0}
                  </button>
                  {(cert.uid === authUser.uid || isAdmin) && (
                    <button onClick={() => handleDeleteCert(cert.id)} style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 13, cursor: 'pointer', padding: '4px 6px' }}>✕</button>
                  )}
                </div>
              </div>
              {cert.text && cert.text !== '✓' && (
                <div style={{ fontSize: 13, color: 'var(--dm-text)', lineHeight: 1.6, paddingLeft: 36 }}>{cert.text}</div>
              )}
            </div>
          )})}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 16px' }}>
          <div style={{ background: 'var(--dm-card)', border: '1.5px solid var(--dm-border)', borderRadius: 14, padding: '12px 14px', marginBottom: 2 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 4 }}>현재 참여 중인 멤버</div>
            <div style={{ fontSize: 11, color: 'var(--dm-muted)', lineHeight: 1.6 }}>
              닉네임과 레벨, 누적 XP, 인증 횟수, 연속 인증 일수를 한 번에 볼 수 있어요.
            </div>
          </div>
          {podiumMembers.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 4 }}>
              {podiumMembers.map((member, index) => (
                <div key={member.uid} style={{ background: 'var(--dm-card)', border: `1.5px solid ${rankAccent[index]}55`, borderRadius: 14, padding: '12px 10px', textAlign: 'center', boxShadow: index === 0 ? '0 8px 22px rgba(251,191,36,.12)' : 'none' }}>
                  <div style={{ fontSize: 18, marginBottom: 6 }}>{rankBadge[index]}</div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.nickname}</div>
                  <div style={{ fontSize: 10, color: rankAccent[index], fontWeight: 900, marginBottom: 4 }}>{member.totalCerts}회 인증</div>
                  <div style={{ fontSize: 10, color: 'var(--dm-muted)' }}>{member.totalScore.toLocaleString()} XP</div>
                </div>
              ))}
            </div>
          )}
          {myMemberRank > 0 && (
            <div style={{ background: 'linear-gradient(135deg,rgba(108,142,255,.14),rgba(108,142,255,.06))', border: '1px solid rgba(108,142,255,.25)', borderRadius: 12, padding: '10px 12px', marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 3 }}>내 현재 위치</div>
                <div style={{ fontSize: 11, color: 'var(--dm-sub)' }}>지금 {myMemberRank}위예요. 순위는 인증 횟수가 먼저 반영되고, 이후 XP와 연속 인증이 비교됩니다.</div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#6C8EFF', flexShrink: 0 }}>#{myMemberRank}</div>
            </div>
          )}
          {rankedMembers.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--dm-muted)', padding: 32, fontSize: 14 }}>아직 참여자가 없어요.</div>
          ) : rankedMembers.map((m, i) => (
            <div key={m.uid} style={{ background: 'var(--dm-card)', border: m.uid === authUser.uid ? '1.5px solid rgba(108,142,255,.35)' : '1.5px solid var(--dm-border)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 10, boxShadow: i < 3 ? '0 8px 22px rgba(15,23,42,.04)' : 'none' }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: i < 3 ? rankAccent[i] : 'var(--dm-muted)', width: 20, textAlign: 'center', paddingTop: 6 }}>{i + 1}</div>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#4B6FFF22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: '#6C8EFF', flexShrink: 0 }}>
                {m.nickname?.[0] || '?'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--dm-text)' }}>{m.nickname}</span>
                  {m.uid === authUser.uid && <span style={{ fontSize: 10, fontWeight: 900, color: '#6C8EFF', background: 'rgba(108,142,255,.12)', border: '1px solid rgba(108,142,255,.24)', borderRadius: 999, padding: '2px 7px' }}>나</span>}
                  <LevelChip levelInfo={m.levelInfo} score={m.totalScore} />
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--dm-sub)', background: 'var(--dm-input)', borderRadius: 999, padding: '4px 8px' }}>인증 {m.totalCerts}회</span>
                  <span style={{ fontSize: 11, color: '#6C8EFF', background: 'rgba(108,142,255,.12)', border: '1px solid rgba(108,142,255,.18)', borderRadius: 999, padding: '4px 8px' }}>누적 {m.totalScore.toLocaleString()} XP</span>
                  <span style={{ fontSize: 11, color: '#FBBF24', background: 'rgba(251,191,36,.12)', border: '1px solid rgba(251,191,36,.18)', borderRadius: 999, padding: '4px 8px' }}>🔥 연속 {m.streak || 0}일</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

function CreateChallenge({ authUser, nickname, habits = [], onDone, onBack, showToast }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [certType, setCertType] = useState("check"); // check | text
  const [isPublic, setIsPublic] = useState(true);
  const [endDate, setEndDate] = useState("");
  const [linkedHabitId, setLinkedHabitId] = useState("");
  const [saving, setSaving] = useState(false);

  const canSave = title.trim();

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const id = await createChallenge(authUser.uid, nickname, {
        title: title.trim(),
        description: description.trim(),
        certType,
        isPublic,
        endDate: endDate || null,
        linkedHabitId: linkedHabitId || null,
      });
      showToast('🎉 챌린지가 만들어졌어요!');
      onDone(id);
    } catch (e) {
      if (e.message === 'challenge_limit_reached') showToast('진행 중인 내 챌린지는 최대 3개까지 만들 수 있어요');
      else if (e.message === 'invalid_end_date') showToast('마감일은 오늘 이후로만 설정할 수 있어요');
      else if (e.message === 'end_date_too_far') showToast('마감일은 최대 90일 안으로만 설정할 수 있어요');
      else showToast('❌ 생성 실패');
    }
    finally { setSaving(false); }
  };

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--dm-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onBack} style={{ ...S.btnGhost, width: 36, height: 36, marginTop: 0, padding: 0, fontSize: 18 }}>←</button>
        <div style={{ fontSize: 15, fontWeight: 900 }}>챌린지 만들기</div>
      </div>

      <div style={{ padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: 'var(--dm-card)', border: '1.5px solid var(--dm-border)', borderRadius: 14, padding: '12px 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 6 }}>생성 정책</div>
          <div style={{ fontSize: 11, color: 'var(--dm-muted)', lineHeight: 1.7 }}>
            생성 보너스 XP는 없고, 진행 중인 내 챌린지는 최대 3개까지 만들 수 있어요. 마감일은 오늘부터 90일 이내만 설정됩니다.
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--dm-sub)', marginBottom: 6 }}>챌린지 이름 *</div>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 매일 1만보 걷기" maxLength={40} style={{ ...S.input, marginBottom: 0 }} />
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--dm-sub)', marginBottom: 6 }}>설명 (선택)</div>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="챌린지 목표나 규칙을 간단히 적어주세요" maxLength={150} rows={3} style={{ ...S.input, resize: 'none', marginBottom: 0 }} />
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--dm-sub)', marginBottom: 6 }}>인증 방식</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ key: 'check', label: '✓ 체크만' }, { key: 'text', label: '✏️ 한 줄 텍스트' }].map(t => (
              <button key={t.key} onClick={() => setCertType(t.key)} style={{
                flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none',
                background: certType === t.key ? '#6C8EFF' : 'var(--dm-input)',
                color: certType === t.key ? '#fff' : 'var(--dm-sub)',
              }}>{t.label}</button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--dm-sub)', marginBottom: 6 }}>마감일 (선택)</div>
          <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginBottom: 6 }}>최대 90일 안으로만 설정할 수 있어요.</div>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={toDateStr()} style={{ ...S.input, marginBottom: 0 }} />
        </div>

        {habits.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--dm-sub)', marginBottom: 6 }}>습관 연결 (선택)</div>
            <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginBottom: 8 }}>인증하면 연결된 습관이 자동으로 체크돼요</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[{ id: '', title: '연결 안 함', icon: '✕' }, ...habits].map(h => {
                const selected = linkedHabitId === h.id;
                return (
                  <button key={h.id} onClick={() => setLinkedHabitId(h.id)} style={{
                    padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    border: selected ? '1.5px solid #6C8EFF' : '1.5px solid var(--dm-border)',
                    background: selected ? 'rgba(108,142,255,.2)' : 'var(--dm-card)',
                    color: selected ? '#6C8EFF' : 'var(--dm-text)',
                  }}>{h.icon || '📌'} {h.name || h.title}</button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--dm-card)', border: '1.5px solid var(--dm-border)', borderRadius: 12, padding: '12px 14px' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dm-text)' }}>공개 챌린지</div>
            <div style={{ fontSize: 11, color: 'var(--dm-muted)' }}>누구나 탐색에서 찾아 참여 가능</div>
          </div>
          <div onClick={() => setIsPublic(p => !p)} style={{ width: 44, height: 24, borderRadius: 999, background: isPublic ? '#6C8EFF' : 'var(--dm-input)', cursor: 'pointer', position: 'relative', transition: 'background .2s' }}>
            <div style={{ position: 'absolute', top: 2, left: isPublic ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.2)' }} />
          </div>
        </div>

        <button onClick={handleSave} disabled={!canSave || saving} style={{ ...S.btn, marginTop: 0, opacity: canSave ? 1 : 0.5 }}>
          {saving ? '생성 중...' : '챌린지 시작하기'}
        </button>
      </div>
    </div>
  );
}
