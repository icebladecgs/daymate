import { useState, useEffect } from "react";
import { calcLevel } from "../data/stats.js";
import { createChallenge, loadPublicChallenges, loadMyChallenges, joinChallenge, certifyChallenge, loadChallengeCerts, cheerCert, deleteCert, loadChallengeMembers, deleteChallengeFull } from "../firebase.js";
import { toDateStr, formatRelativeTime } from "../utils/date.js";
import { store } from "../utils/storage.js";
import S from "../styles.js";

const NICKNAME_KEY = 'dm_challenge_nickname';

export default function Challenge({ authUser, myTotalScore = 0 }) {
  const [tab, setTab] = useState("my"); // my | explore
  const [myChallenges, setMyChallenges] = useState([]);
  const [publicChallenges, setPublicChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // 선택된 챌린지 상세
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const [nickname, setNickname] = useState(() => store.get(NICKNAME_KEY, authUser?.displayName?.split(" ")[0] || authUser?.email?.split("@")[0] || ""));
  const [editingNickname, setEditingNickname] = useState(!store.get(NICKNAME_KEY, null));
  const [nicknameInput, setNicknameInput] = useState(nickname);

  useEffect(() => {
    if (!authUser) return;
    load();
  }, [authUser]); // eslint-disable-line

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

  if (showCreate) return <CreateChallenge authUser={authUser} nickname={nickname} onDone={(id) => { setShowCreate(false); load(); }} onBack={() => setShowCreate(false)} showToast={showToast} />;
  if (selected) return <ChallengeDetail challenge={selected} authUser={authUser} nickname={nickname} myLevel={calcLevel(myTotalScore)} onBack={() => { setSelected(null); load(); }} showToast={showToast} />;

  return (
    <div style={{ paddingBottom: 80 }}>
      {toast && (
        <div style={{ position: 'fixed', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 999, background: 'var(--dm-card)', border: '1px solid var(--dm-border)', borderRadius: 12, padding: '10px 18px', fontSize: 13, fontWeight: 700, color: 'var(--dm-text)', boxShadow: '0 4px 20px rgba(0,0,0,.3)', whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}

      {/* 닉네임 */}
      <div style={{ padding: '8px 16px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--dm-muted)' }}>닉네임</span>
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

      {/* 탭 + 만들기 버튼 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px 8px' }}>
        <div style={{ display: 'flex', flex: 1, gap: 6 }}>
          {[{ key: 'my', label: '내 챌린지' }, { key: 'explore', label: '탐색' }].map(t => (
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
        myChallenges.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🏁</div>
            <div style={{ fontSize: 14, color: 'var(--dm-muted)', marginBottom: 16 }}>참여 중인 챌린지가 없어요</div>
            <button onClick={() => setTab('explore')} style={{ ...S.btn, width: 'auto', padding: '10px 24px', marginTop: 0, fontSize: 13 }}>챌린지 탐색하기</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px' }}>
            {myChallenges.map(c => (
              <ChallengeCard key={c.id} challenge={c} myMember={c.myMember} today={toDateStr()} onClick={() => setSelected(c)} />
            ))}
          </div>
        )
      ) : (
        publicChallenges.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 14, color: 'var(--dm-muted)' }}>공개 챌린지가 없어요</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px' }}>
            {publicChallenges.map(c => (
              <ChallengeCard key={c.id} challenge={c} today={toDateStr()} onClick={() => setSelected(c)} />
            ))}
          </div>
        )
      )}
    </div>
  );
}

function ChallengeCard({ challenge: c, myMember, today, onClick }) {
  const daysLeft = c.endDate ? Math.max(0, Math.ceil((new Date(c.endDate) - new Date(today)) / 86400000)) : null;
  const certedToday = myMember?.lastCertDate === today;

  return (
    <div onClick={onClick} style={{ background: 'var(--dm-card)', border: `1.5px solid ${certedToday ? 'rgba(74,222,128,.4)' : 'var(--dm-border)'}`, borderRadius: 14, padding: '14px', cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 3 }}>{c.title}</div>
          {c.description && <div style={{ fontSize: 12, color: 'var(--dm-muted)', lineHeight: 1.5 }}>{c.description}</div>}
        </div>
        {certedToday && <span style={{ fontSize: 11, fontWeight: 900, color: '#4ADE80', background: 'rgba(74,222,128,.12)', border: '1px solid rgba(74,222,128,.3)', borderRadius: 8, padding: '2px 8px', flexShrink: 0, marginLeft: 8 }}>✓ 인증완료</span>}
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--dm-muted)' }}>👥 {c.memberCount || 1}명</span>
        {myMember && <span style={{ fontSize: 11, color: '#FBBF24', fontWeight: 700 }}>🔥 {myMember.streak || 0}일 연속</span>}
        {daysLeft !== null && <span style={{ fontSize: 11, color: 'var(--dm-muted)' }}>⏰ {daysLeft}일 남음</span>}
        <span style={{ fontSize: 11, color: 'var(--dm-muted)', background: 'var(--dm-input)', borderRadius: 6, padding: '1px 7px' }}>
          {c.certType === 'check' ? '✓ 체크' : '✏️ 텍스트'}
        </span>
      </div>
    </div>
  );
}

function ChallengeDetail({ challenge: c, authUser, nickname, myLevel, onBack, showToast, onDeleted }) {
  const [certs, setCerts] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [certText, setCertText] = useState("");
  const [certifying, setCertifying] = useState(false);
  const [joining, setJoining] = useState(false);
  const [isMember, setIsMember] = useState(!!c.myMember);
  const [myMember, setMyMember] = useState(c.myMember || null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [detailTab, setDetailTab] = useState("feed"); // feed | members
  const [cheeredCerts, setCheeredCerts] = useState(() => new Set(JSON.parse(store.get(`dm_cheer_${c.id}`, '[]'))));
  const today = toDateStr();
  const certedToday = myMember?.lastCertDate === today;

  useEffect(() => {
    loadData();
  }, []); // eslint-disable-line

  const loadData = async () => {
    setLoading(true);
    try {
      const [certsData, membersData] = await Promise.all([loadChallengeCerts(c.id), loadChallengeMembers(c.id)]);
      setCerts(certsData);
      setMembers(membersData);
      const me = membersData.find(m => m.uid === authUser.uid);
      if (me) { setIsMember(true); setMyMember(me); }
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
    } catch { showToast('❌ 참여 실패'); }
    finally { setJoining(false); }
  };

  const handleCert = async () => {
    if (certedToday) return;
    if (c.certType === 'text' && !certText.trim()) return;
    setCertifying(true);
    try {
      await certifyChallenge(authUser.uid, nickname, c.id, certText.trim() || '✓');
      setCertText("");
      showToast('🎉 인증 완료! 오늘도 수고했어요');
      loadData();
    } catch (e) {
      if (e.message === 'already_certified') showToast('오늘은 이미 인증했어요');
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
  const isHost = c.hostUid === authUser?.uid;

  const handleDeleteChallenge = async () => {
    try {
      await deleteChallengeFull(c.id);
      showToast('챌린지가 삭제됐어요');
      onDeleted?.();
      onBack();
    } catch (e) {
      showToast('삭제 실패: ' + (e?.message || '권한을 확인하세요'));
      setDeleteConfirm(false);
    }
  };

  const handleDeleteCert = async (certId) => {
    if (!window.confirm('인증을 삭제할까요?')) return;
    await deleteCert(c.id, certId);
    setCerts(prev => prev.filter(cert => cert.id !== certId));
  };

  const daysLeft = c.endDate ? Math.max(0, Math.ceil((new Date(c.endDate) - new Date(today)) / 86400000)) : null;
  const todayCerts = certs.filter(cert => cert.dateKey === today).length;

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* 헤더 */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--dm-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: c.description ? 8 : 0 }}>
          <button onClick={onBack} style={{ ...S.btnGhost, width: 36, height: 36, marginTop: 0, padding: 0, fontSize: 18, flexShrink: 0 }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--dm-text)' }}>{c.title}</div>
            <div style={{ fontSize: 11, color: 'var(--dm-muted)' }}>👥 {c.memberCount || 1}명 · {daysLeft !== null ? `⏰ ${daysLeft}일 남음` : '기간 없음'}</div>
          </div>
          {(isHost || isAdmin) && (
            deleteConfirm ? (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => setDeleteConfirm(false)} style={{ background: 'var(--dm-card)', border: '1px solid var(--dm-border)', borderRadius: 8, color: 'var(--dm-muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '5px 10px' }}>취소</button>
                <button onClick={handleDeleteChallenge} style={{ background: 'rgba(248,113,113,.2)', border: '1px solid rgba(248,113,113,.5)', borderRadius: 8, color: '#F87171', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '5px 10px' }}>삭제확인</button>
              </div>
            ) : (
              <button onClick={() => setDeleteConfirm(true)} style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 18, cursor: 'pointer', padding: '4px', flexShrink: 0 }}>🗑</button>
            )
          )}
        </div>
        {c.description && (
          <div style={{ fontSize: 12, color: 'var(--dm-sub)', lineHeight: 1.7, background: 'var(--dm-input)', borderRadius: 10, padding: '10px 12px' }}>
            {c.description}
          </div>
        )}
      </div>

      {/* 내 상태 카드 */}
      {isMember && (
        <div style={{ margin: '12px 16px', background: 'var(--dm-card)', border: '1.5px solid var(--dm-border)', borderRadius: 14, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: certedToday ? 0 : 12 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--dm-muted)', marginBottom: 2 }}>내 현황</div>
              <div style={{ display: 'flex', gap: 16 }}>
                <span style={{ fontSize: 20, fontWeight: 900, color: '#FBBF24' }}>🔥 {myMember?.streak || 0}일</span>
                <span style={{ fontSize: 13, color: 'var(--dm-muted)', alignSelf: 'flex-end', marginBottom: 2 }}>총 {myMember?.totalCerts || 0}회</span>
              </div>
            </div>
            {certedToday && (
              <div style={{ fontSize: 13, fontWeight: 900, color: '#4ADE80' }}>✓ 오늘 인증완료</div>
            )}
          </div>

          {!certedToday && (
            <div>
              {c.certType === 'text' && (
                <input
                  value={certText}
                  onChange={e => setCertText(e.target.value)}
                  placeholder="오늘 한 것을 한 줄로 적어주세요"
                  maxLength={100}
                  style={{ ...S.input, marginBottom: 8, fontSize: 13 }}
                />
              )}
              <button onClick={handleCert} disabled={certifying || (c.certType === 'text' && !certText.trim())} style={{
                ...S.btn, marginTop: 0, fontSize: 13,
                background: certifying ? 'var(--dm-input)' : 'linear-gradient(135deg,#4ADE80,#22C55E)',
                opacity: certifying ? 0.6 : 1,
              }}>
                {certifying ? '인증 중...' : '✓ 오늘 인증하기'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 참여 버튼 (비참여자) */}
      {!isMember && (
        <div style={{ margin: '12px 16px' }}>
          {c.description && <div style={{ fontSize: 13, color: 'var(--dm-sub)', marginBottom: 12, lineHeight: 1.6 }}>{c.description}</div>}
          <button onClick={handleJoin} disabled={joining} style={{ ...S.btn, marginTop: 0, fontSize: 14 }}>
            {joining ? '참여 중...' : '🏁 챌린지 참여하기'}
          </button>
        </div>
      )}

      {/* 피드/멤버 탭 */}
      <div style={{ display: 'flex', gap: 6, padding: '4px 16px 12px' }}>
        {[{ key: 'feed', label: `인증 피드 (오늘 ${todayCerts}명)` }, { key: 'members', label: `참여자 ${members.length}명` }].map(t => (
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
          ) : certs.map(cert => (
            <div key={cert.id} style={{ background: 'var(--dm-card)', border: '1.5px solid var(--dm-border)', borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: cert.text && cert.text !== '✓' ? 6 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#4B6FFF22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: '#6C8EFF' }}>
                    {cert.nickname?.[0] || '?'}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--dm-text)' }}>{cert.nickname}</span>
                      {cert.uid === authUser.uid && myLevel && <span style={{ fontSize: 11 }}>{myLevel.icon}</span>}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--dm-muted)' }}>{cert.dateKey === today ? '오늘' : cert.dateKey} · {formatRelativeTime(cert.createdAt)}</div>
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
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 16px' }}>
          {[...members].map(m => ({ ...m, totalCerts: certs.filter(cert => cert.uid === m.uid).length }))
            .sort((a, b) => b.totalCerts - a.totalCerts)
            .map((m, i) => (
            <div key={m.uid} style={{ background: 'var(--dm-card)', border: '1.5px solid var(--dm-border)', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: i < 3 ? ['#FBBF24','#94A3B8','#CD7C3E'][i] : 'var(--dm-muted)', width: 20, textAlign: 'center' }}>{i + 1}</div>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#4B6FFF22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: '#6C8EFF' }}>
                {m.nickname?.[0] || '?'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--dm-text)' }}>{m.nickname} {m.uid === authUser.uid ? '(나)' : ''}</span>
                  {m.uid === authUser.uid && myLevel && <span style={{ fontSize: 11 }}>{myLevel.icon} <span style={{ fontSize: 10, color: 'var(--dm-muted)' }}>{myLevel.title}</span></span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--dm-muted)' }}>총 {m.totalCerts}회</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#FBBF24' }}>🔥 {m.streak || 0}일</div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

function CreateChallenge({ authUser, nickname, onDone, onBack, showToast }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [certType, setCertType] = useState("check"); // check | text
  const [isPublic, setIsPublic] = useState(true);
  const [endDate, setEndDate] = useState("");
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
      });
      showToast('🎉 챌린지가 만들어졌어요!');
      onDone(id);
    } catch { showToast('❌ 생성 실패'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--dm-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onBack} style={{ ...S.btnGhost, width: 36, height: 36, marginTop: 0, padding: 0, fontSize: 18 }}>←</button>
        <div style={{ fontSize: 15, fontWeight: 900 }}>챌린지 만들기</div>
      </div>

      <div style={{ padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
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
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={toDateStr()} style={{ ...S.input, marginBottom: 0 }} />
        </div>

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
