import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, doc } from "firebase/firestore";
import { db, createCommunity, findCommunityByCode, joinCommunity, addCommunityEvent, deleteCommunityEvent, leaveCommunity, loadCommunityMembers, checkinCommunity, loadPublicCommunities, joinPublicCommunity, loadCommunityData } from "../firebase.js";
import { toDateStr } from "../utils/date.js";
import S from "../styles.js";

export default function Community({ user, authUser, communityIds, activeCommunityId, setActiveCommunityId, addCommunityId, removeCommunityId, getValidGcalToken, onGcalConnect, setToast, todayCompletion }) {
  const communityId = activeCommunityId;
  const [community, setCommunity] = useState(null);
  const [members, setMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [checkingIn, setCheckingIn] = useState(false);
  const [loading, setLoading] = useState(true);

  // 커뮤니티 이름 캐시 (스위처용)
  const [communityNames, setCommunityNames] = useState({});
  useEffect(() => {
    (communityIds || []).forEach(id => {
      if (!communityNames[id]) {
        loadCommunityData(id).then(data => {
          if (data) setCommunityNames(prev => ({ ...prev, [id]: data.name }));
        }).catch(() => {});
      }
    });
  }, [communityIds]); // eslint-disable-line

  // 생성/가입 UI
  const [mode, setMode] = useState(null); // 'create' | 'join'
  const [nameInput, setNameInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [nicknameInput, setNicknameInput] = useState(() => user?.name || '');
  const [submitting, setSubmitting] = useState(false);
  // 공개/비공개 생성
  const [isPublic, setIsPublic] = useState(false);
  const [createPassword, setCreatePassword] = useState('');
  // 공개 커뮤니티 가입
  const [joinTab, setJoinTab] = useState('public'); // 'public' | 'code'
  const [publicList, setPublicList] = useState([]);
  const [publicLoading, setPublicLoading] = useState(false);
  const [selectedPublic, setSelectedPublic] = useState(null);
  const [pubPassword, setPubPassword] = useState('');

  // 이벤트 추가 UI
  const [showAdd, setShowAdd] = useState(false);
  const [evTitle, setEvTitle] = useState('');
  const [evDate, setEvDate] = useState(toDateStr());
  const [evStart, setEvStart] = useState('');
  const [evEnd, setEvEnd] = useState('');
  const [evDesc, setEvDesc] = useState('');
  const [addingEvent, setAddingEvent] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  // 실시간 커뮤니티 데이터
  useEffect(() => {
    if (!communityId) { setLoading(false); return; }
    setLoading(true);

    const unsubCom = onSnapshot(doc(db, 'communities', communityId), (snap) => {
      if (snap.exists()) setCommunity({ id: snap.id, ...snap.data() });
      else { setCommunityId(null); }
    });

    loadCommunityMembers(communityId).then(setMembers).catch(() => {});

    const q = query(collection(db, 'communities', communityId, 'events'), orderBy('date', 'asc'));
    const unsubEv = onSnapshot(q, (snap) => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));

    const unsubCheckins = onSnapshot(collection(db, 'communities', communityId, 'checkins'), (snap) => {
      setCheckins(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
    }, () => {});

    return () => { unsubCom(); unsubEv(); unsubCheckins(); };
  }, [communityId]); // eslint-disable-line

  useEffect(() => {
    if (mode === 'join' && joinTab === 'public') {
      setPublicLoading(true);
      loadPublicCommunities().then(list => { setPublicList(list); setPublicLoading(false); }).catch(() => setPublicLoading(false));
    }
  }, [mode, joinTab]);

  const handleCreate = async () => {
    if (!nameInput.trim() || !nicknameInput.trim()) return;
    setSubmitting(true);
    try {
      const { communityId: id } = await createCommunity(authUser.uid, nameInput.trim(), nicknameInput.trim(), isPublic, createPassword.trim() || null);
      addCommunityId(id);
      setMode(null);
    } catch { setToast('생성 실패 ❌'); }
    setSubmitting(false);
  };

  const handleJoin = async () => {
    if (!codeInput.trim() || !nicknameInput.trim()) return;
    setSubmitting(true);
    try {
      const result = await findCommunityByCode(codeInput.trim());
      if (!result) { setToast('커뮤니티를 찾을 수 없어요'); setSubmitting(false); return; }
      await joinCommunity(authUser.uid, result.communityId, nicknameInput.trim());
      addCommunityId(result.communityId);
      setMode(null);
    } catch { setToast('가입 실패 ❌'); }
    setSubmitting(false);
  };

  const handleJoinPublic = async () => {
    if (!selectedPublic || !nicknameInput.trim()) return;
    setSubmitting(true);
    try {
      await joinPublicCommunity(authUser.uid, selectedPublic.id, nicknameInput.trim(), pubPassword.trim());
      addCommunityId(selectedPublic.id);
      setMode(null);
    } catch (e) {
      setToast(e.message === 'wrong password' ? '비밀번호가 틀렸어요 ❌' : '가입 실패 ❌');
    }
    setSubmitting(false);
  };

  const handleAddEvent = async () => {
    if (!evTitle.trim() || !evDate) return;
    setAddingEvent(true);
    try {
      const nickname = members.find(m => m.uid === authUser?.uid)?.nickname || user?.name || '익명';
      await addCommunityEvent(communityId, {
        title: evTitle.trim(),
        date: evDate,
        startTime: evStart || null,
        endTime: evEnd || null,
        description: evDesc.trim() || null,
        createdBy: authUser.uid,
        creatorNickname: nickname,
      });
      setEvTitle(''); setEvDate(toDateStr()); setEvStart(''); setEvEnd(''); setEvDesc('');
      setShowAdd(false);
      setToast('일정 추가 완료 ✅');
    } catch { setToast('추가 실패 ❌'); }
    setAddingEvent(false);
  };

  const handleAddToGcal = async (event) => {
    let token = getValidGcalToken?.();
    if (!token) {
      token = await onGcalConnect?.();
      if (!token) { setToast('캘린더 연동이 필요해요'); return; }
    }
    try {
      const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: `[${community?.name}] ${event.title}`,
          description: event.description || '',
          ...(event.startTime
            ? { start: { dateTime: `${event.date}T${event.startTime}:00`, timeZone: 'Asia/Seoul' }, end: { dateTime: `${event.date}T${(event.endTime || event.startTime)}:00`, timeZone: 'Asia/Seoul' } }
            : { start: { date: event.date }, end: { date: event.date } }
          ),
        }),
      });
      if (!res.ok) throw new Error();
      setToast('내 캘린더에 추가됐어요 ✅');
    } catch { setToast('캘린더 추가 실패 ❌'); }
  };

  const handleLeave = async () => {
    if (!window.confirm('커뮤니티에서 나가시겠어요?')) return;
    try {
      await leaveCommunity(communityId, authUser.uid);
      removeCommunityId(communityId);
      setCommunity(null);
    } catch { setToast('오류가 발생했어요'); }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm('일정을 삭제할까요?')) return;
    try { await deleteCommunityEvent(communityId, eventId); }
    catch { setToast('삭제 실패 ❌'); }
  };

  const today = toDateStr();
  const todayCheckins = checkins.filter(c => c.date === today);
  const myCheckin = todayCheckins.find(c => c.uid === authUser?.uid);

  const handleCheckin = async () => {
    if (myCheckin || checkingIn) return;
    setCheckingIn(true);
    try {
      const nickname = members.find(m => m.uid === authUser?.uid)?.nickname || user?.name || '익명';
      await checkinCommunity(communityId, authUser.uid, nickname, todayCompletion);
      setToast('출석 완료 ✅');
    } catch { setToast('출석 실패 ❌'); }
    setCheckingIn(false);
  };

  // 날짜별 그룹핑
  const grouped = events.reduce((acc, ev) => {
    if (!acc[ev.date]) acc[ev.date] = [];
    acc[ev.date].push(ev);
    return acc;
  }, {});
  const upcomingDates = Object.keys(grouped).filter(d => d >= today).sort();
  const pastDates = Object.keys(grouped).filter(d => d < today).sort().reverse();

  if (!authUser) return (
    <div style={S.content}>
      <div style={S.topbar}><div style={{ flex: 1 }}><div style={S.title}>커뮤니티</div></div></div>
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--dm-muted)', fontSize: 14 }}>
        로그인 후 이용할 수 있어요
      </div>
    </div>
  );

  if (communityIds.length === 0 || mode === 'create' || mode === 'join') return (
    <div style={S.content}>
      <div style={S.topbar}>
        <div style={{ flex: 1 }}><div style={S.title}>커뮤니티</div><div style={S.sub}>함께하는 일정 공유</div></div>
        {communityIds.length > 0 && mode !== null && (
          <button onClick={() => setMode(null)} style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 22, cursor: 'pointer', padding: '4px 8px' }}>✕</button>
        )}
      </div>

      {mode === null && (
        <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ textAlign: 'center', fontSize: 48, marginBottom: 8 }}>👥</div>
          <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 4 }}>커뮤니티에 참여해보세요</div>
          <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--dm-muted)', marginBottom: 20, lineHeight: 1.6 }}>멤버들과 일정을 공유하고<br/>서로의 캘린더에 추가할 수 있어요</div>
          <button style={S.btn} onClick={() => setMode('create')}>✨ 새 커뮤니티 만들기</button>
          <button style={S.btnGhost} onClick={() => setMode('join')}>🔗 커뮤니티 가입하기</button>
        </div>
      )}

      {mode === 'create' && (
        <div style={{ padding: '24px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 8 }}>새 커뮤니티 만들기</div>
          <input style={S.input} placeholder="커뮤니티 이름 (예: 우리 팀)" value={nameInput} onChange={e => setNameInput(e.target.value)} maxLength={30} />
          <input style={S.input} placeholder="내 닉네임" value={nicknameInput} onChange={e => setNicknameInput(e.target.value)} maxLength={20} />
          {/* 공개/비공개 선택 */}
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ v: false, label: '🔒 비공개', desc: '초대코드로만 입장' }, { v: true, label: '🌐 공개', desc: '목록에 표시됨' }].map(({ v, label, desc }) => (
              <button key={String(v)} onClick={() => setIsPublic(v)} style={{
                flex: 1, padding: '10px 8px', borderRadius: 12, border: `1.5px solid ${isPublic === v ? '#6C8EFF' : 'var(--dm-border)'}`,
                background: isPublic === v ? 'rgba(108,142,255,.12)' : 'var(--dm-input)',
                color: isPublic === v ? '#6C8EFF' : 'var(--dm-sub)', cursor: 'pointer', fontWeight: 700, fontSize: 12, fontFamily: 'inherit',
              }}>
                <div>{label}</div>
                <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2, color: 'var(--dm-muted)' }}>{desc}</div>
              </button>
            ))}
          </div>
          {isPublic && (
            <input style={S.input} placeholder="입장 비밀번호 (없으면 빈칸)" value={createPassword} onChange={e => setCreatePassword(e.target.value)} maxLength={20} />
          )}
          <button style={S.btn} onClick={handleCreate} disabled={submitting || !nameInput.trim() || !nicknameInput.trim()}>
            {submitting ? '생성 중...' : '만들기'}
          </button>
          <button style={S.btnGhost} onClick={() => setMode(null)}>취소</button>
        </div>
      )}

      {mode === 'join' && (
        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 4 }}>커뮤니티 가입</div>
          {/* 탭 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            {[{ v: 'public', label: '🌐 공개 목록' }, { v: 'code', label: '🔒 초대코드' }].map(({ v, label }) => (
              <button key={v} onClick={() => { setJoinTab(v); setSelectedPublic(null); setPubPassword(''); }} style={{
                flex: 1, padding: '8px', borderRadius: 10, border: `1.5px solid ${joinTab === v ? '#6C8EFF' : 'var(--dm-border)'}`,
                background: joinTab === v ? 'rgba(108,142,255,.12)' : 'var(--dm-input)',
                color: joinTab === v ? '#6C8EFF' : 'var(--dm-sub)', cursor: 'pointer', fontWeight: 700, fontSize: 12, fontFamily: 'inherit',
              }}>{label}</button>
            ))}
          </div>

          {joinTab === 'public' && (
            <>
              {publicLoading && <div style={{ textAlign: 'center', color: 'var(--dm-muted)', fontSize: 13, padding: 12 }}>불러오는 중...</div>}
              {!publicLoading && publicList.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--dm-muted)', fontSize: 13, padding: 12 }}>공개 커뮤니티가 없어요</div>
              )}
              {publicList.map(c => (
                <button key={c.id} onClick={() => setSelectedPublic(selectedPublic?.id === c.id ? null : c)} style={{
                  textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1.5px solid ${selectedPublic?.id === c.id ? '#6C8EFF' : 'var(--dm-border)'}`,
                  background: selectedPublic?.id === c.id ? 'rgba(108,142,255,.1)' : 'var(--dm-input)',
                }}>
                  <div style={{ fontWeight: 900, fontSize: 14, color: 'var(--dm-text)' }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginTop: 2 }}>
                    멤버 {c.memberCount}명 {c.password ? '· 🔑 비밀번호 있음' : '· 자유 입장'}
                  </div>
                </button>
              ))}
              {selectedPublic && (
                <>
                  {selectedPublic.password && (
                    <input style={S.input} placeholder="비밀번호" type="password" value={pubPassword} onChange={e => setPubPassword(e.target.value)} maxLength={20} />
                  )}
                  <input style={S.input} placeholder="내 닉네임" value={nicknameInput} onChange={e => setNicknameInput(e.target.value)} maxLength={20} />
                  <button style={S.btn} onClick={handleJoinPublic} disabled={submitting || !nicknameInput.trim()}>
                    {submitting ? '가입 중...' : `"${selectedPublic.name}" 가입하기`}
                  </button>
                </>
              )}
            </>
          )}

          {joinTab === 'code' && (
            <>
              <input style={{ ...S.input, textTransform: 'uppercase', letterSpacing: 4, fontSize: 18, textAlign: 'center' }}
                placeholder="A1B2C3" value={codeInput} onChange={e => setCodeInput(e.target.value.toUpperCase())} maxLength={6} />
              <input style={S.input} placeholder="내 닉네임" value={nicknameInput} onChange={e => setNicknameInput(e.target.value)} maxLength={20} />
              <button style={S.btn} onClick={handleJoin} disabled={submitting || codeInput.length < 6 || !nicknameInput.trim()}>
                {submitting ? '가입 중...' : '가입하기'}
              </button>
            </>
          )}

          <button style={S.btnGhost} onClick={() => setMode(null)}>취소</button>
        </div>
      )}
    </div>
  );

  return (
    <div style={S.content}>
      {/* 상단 */}
      <div style={S.topbar}>
        <div style={{ flex: 1 }}>
          <div style={S.title}>{community?.name || '커뮤니티'}</div>
          <div style={{ ...S.sub, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            멤버 {community?.memberCount || 0}명 · 초대코드: <b style={{ color: 'var(--dm-text)', letterSpacing: 2 }}>{community?.inviteCode}</b>
            <button onClick={() => {
              const text = `DayMate 커뮤니티 초대 코드: ${community?.inviteCode}`;
              navigator.clipboard?.writeText(text).then(() => { setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); });
            }} style={{ background: codeCopied ? 'rgba(74,222,128,.15)' : 'var(--dm-input)', border: '1px solid var(--dm-border)', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, color: codeCopied ? '#4ADE80' : 'var(--dm-sub)', cursor: 'pointer' }}>
              {codeCopied ? '✓ 복사됨' : '복사'}
            </button>
          </div>
        </div>
        <button onClick={() => setShowAdd(v => !v)}
          style={{ background: 'linear-gradient(135deg,#4B6FFF,#6C8EFF)', border: 'none', borderRadius: 20, padding: '8px 16px', color: '#fff', fontWeight: 900, fontSize: 13, cursor: 'pointer' }}>
          + 일정
        </button>
      </div>

      {/* 커뮤니티 스위처 */}
      {communityIds.length > 1 && (
        <div style={{ display: 'flex', gap: 6, padding: '8px 16px', overflowX: 'auto' }}>
          {communityIds.map(id => (
            <button key={id} onClick={() => setActiveCommunityId(id)} style={{
              flexShrink: 0, padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
              border: `1.5px solid ${id === activeCommunityId ? '#6C8EFF' : 'var(--dm-border)'}`,
              background: id === activeCommunityId ? 'rgba(108,142,255,.15)' : 'var(--dm-input)',
              color: id === activeCommunityId ? '#818cf8' : 'var(--dm-sub)',
            }}>
              {communityNames[id] || '...'}
            </button>
          ))}
          <button onClick={() => setMode('join')} style={{
            flexShrink: 0, padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
            border: '1.5px dashed var(--dm-border)', background: 'transparent', color: 'var(--dm-muted)',
          }}>+ 추가</button>
        </div>
      )}
      {communityIds.length === 1 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 16px 0' }}>
          <button onClick={() => setMode('join')} style={{
            fontSize: 11, fontWeight: 700, color: 'var(--dm-muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0',
          }}>+ 다른 커뮤니티 추가</button>
        </div>
      )}

      {/* 일정 추가 폼 */}
      {showAdd && (
        <div style={{ ...S.card, border: '1.5px solid #4B6FFF' }}>
          <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 10 }}>새 일정 추가</div>
          <input style={{ ...S.input, marginBottom: 8 }} placeholder="일정 제목 (예: 팀 회의)" value={evTitle} onChange={e => setEvTitle(e.target.value)} maxLength={50} />
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input type="date" style={{ ...S.input, flex: 1 }} value={evDate} onChange={e => setEvDate(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input type="time" style={{ ...S.input, flex: 1 }} placeholder="시작" value={evStart} onChange={e => setEvStart(e.target.value)} />
            <input type="time" style={{ ...S.input, flex: 1 }} placeholder="종료" value={evEnd} onChange={e => setEvEnd(e.target.value)} />
          </div>
          <input style={{ ...S.input, marginBottom: 10 }} placeholder="설명 (선택)" value={evDesc} onChange={e => setEvDesc(e.target.value)} maxLength={100} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...S.btn, flex: 1, marginTop: 0 }} onClick={handleAddEvent} disabled={addingEvent || !evTitle.trim()}>
              {addingEvent ? '추가 중...' : '추가'}
            </button>
            <button style={{ ...S.btnGhost, flex: 1, marginTop: 0 }} onClick={() => setShowAdd(false)}>취소</button>
          </div>
        </div>
      )}

      {/* 오늘 출석 현황 */}
      <div style={S.sectionTitle}><span style={S.sectionEmoji}>✋</span>오늘 출석</div>
      <div style={S.card}>
        {/* 출석 버튼 */}
        <button onClick={handleCheckin} disabled={!!myCheckin || checkingIn} style={{
          width: '100%', padding: '12px', borderRadius: 12, border: 'none', cursor: myCheckin ? 'default' : 'pointer', fontWeight: 900, fontSize: 14, fontFamily: 'inherit',
          background: myCheckin ? 'rgba(74,222,128,.12)' : 'linear-gradient(135deg,#4B6FFF,#6C8EFF)',
          color: myCheckin ? '#4ADE80' : '#fff',
          boxShadow: myCheckin ? 'none' : '0 4px 16px rgba(75,111,255,.3)',
        }}>
          {myCheckin
            ? `✅ 출석 완료${myCheckin.streak > 1 ? ` · 🔥 ${myCheckin.streak}일 연속` : ''}${myCheckin.completionRate != null ? ` · ${myCheckin.completionRate}%` : ''}`
            : checkingIn ? '출석 중...' : '✋ 오늘 출석하기'}
        </button>

        {/* 오늘 출석 멤버 현황 */}
        {todayCheckins.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--dm-muted)', fontWeight: 700, marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              오늘 {todayCheckins.length}명 출석
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {todayCheckins.map(c => (
                <div key={c.uid} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#4B6FFF,#6C8EFF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: '#fff', flexShrink: 0 }}>
                    {c.nickname?.[0] || '?'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--dm-text)' }}>{c.nickname}</span>
                    {c.streak > 1 && <span style={{ fontSize: 11, color: '#F97316', marginLeft: 6, fontWeight: 900 }}>🔥 {c.streak}일</span>}
                  </div>
                  {c.completionRate != null && (
                    <div style={{ fontSize: 13, fontWeight: 900, color: c.completionRate >= 100 ? '#4ADE80' : c.completionRate >= 50 ? '#6C8EFF' : 'var(--dm-muted)' }}>
                      {c.completionRate}%
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {todayCheckins.length === 0 && !myCheckin && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--dm-muted)', textAlign: 'center' }}>
            아직 아무도 출석하지 않았어요
          </div>
        )}
      </div>

      {loading && <div style={{ padding: 32, textAlign: 'center', color: 'var(--dm-muted)' }}>불러오는 중...</div>}

      {/* 다가오는 일정 */}
      {upcomingDates.length > 0 && (
        <>
          <div style={S.sectionTitle}><span style={S.sectionEmoji}>📅</span> 다가오는 일정</div>
          {upcomingDates.map(date => (
            <div key={date}>
              <div style={{ padding: '6px 16px 2px', fontSize: 12, fontWeight: 900, color: date === today ? '#4B6FFF' : 'var(--dm-sub)' }}>
                {date === today ? '오늘' : new Date(date + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
              </div>
              {grouped[date].map(ev => (
                <EventCard key={ev.id} ev={ev} authUid={authUser.uid} onAddToGcal={() => handleAddToGcal(ev)} onDelete={() => handleDeleteEvent(ev.id)} />
              ))}
            </div>
          ))}
        </>
      )}

      {/* 지난 일정 */}
      {pastDates.length > 0 && (
        <>
          <div style={S.sectionTitle}><span style={S.sectionEmoji}>🗂</span> 지난 일정</div>
          {pastDates.map(date => (
            <div key={date}>
              <div style={{ padding: '6px 16px 2px', fontSize: 12, fontWeight: 700, color: 'var(--dm-muted)' }}>
                {new Date(date + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
              </div>
              {grouped[date].map(ev => (
                <EventCard key={ev.id} ev={ev} authUid={authUser.uid} onAddToGcal={() => handleAddToGcal(ev)} onDelete={() => handleDeleteEvent(ev.id)} past />
              ))}
            </div>
          ))}
        </>
      )}

      {!loading && events.length === 0 && (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--dm-muted)', fontSize: 13 }}>
          아직 공유된 일정이 없어요<br />
          <span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>+ 일정 버튼으로 추가해보세요</span>
        </div>
      )}

      {/* 커뮤니티 나가기 */}
      <div style={{ padding: '24px 16px 0' }}>
        <button onClick={handleLeave}
          style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
          커뮤니티 나가기
        </button>
      </div>
    </div>
  );
}

function EventCard({ ev, authUid, onAddToGcal, onDelete, past }) {
  return (
    <div style={{ ...S.card, opacity: past ? 0.6 : 1, margin: '0 16px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 2 }}>{ev.title}</div>
          {(ev.startTime || ev.endTime) && (
            <div style={{ fontSize: 12, color: '#6C8EFF', marginBottom: 2 }}>
              🕐 {ev.startTime}{ev.endTime && ev.endTime !== ev.startTime ? ` ~ ${ev.endTime}` : ''}
            </div>
          )}
          {ev.description && <div style={{ fontSize: 12, color: 'var(--dm-sub)', marginBottom: 4 }}>{ev.description}</div>}
          <div style={{ fontSize: 11, color: 'var(--dm-muted)' }}>by {ev.creatorNickname}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          <button onClick={onAddToGcal}
            style={{ background: 'rgba(75,111,255,.15)', border: '1px solid rgba(75,111,255,.3)', borderRadius: 8, padding: '5px 10px', color: '#6C8EFF', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            📅 내 캘린더
          </button>
          {ev.createdBy === authUid && (
            <button onClick={onDelete}
              style={{ background: 'transparent', border: 'none', color: '#F87171', fontSize: 11, cursor: 'pointer', padding: '2px 4px' }}>
              삭제
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
