import { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, orderBy, query, doc } from "firebase/firestore";
import { db, createCommunity, findCommunityByCode, joinCommunity, addCommunityEvent, deleteCommunityEvent, leaveCommunity, deleteCommunityFull, loadCommunityMembers, checkinCommunity, loadPublicCommunities, joinPublicCommunity, loadCommunityData, addCommunityNotice, deleteCommunityNotice, addNoticeComment, deleteNoticeComment, updateMemberNickname } from "../firebase.js";
import { toDateStr, formatRelativeTime } from "../utils/date.js";
import { store } from "../utils/storage.js";
import Challenge from "./Challenge.jsx";
import S from "../styles.js";

// ── 미니 달력 컴포넌트 ────────────────────────────────────────
function MiniCalendar({ eventDates, selectedDate, onSelectDate }) {
  const today = toDateStr();
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());

  const firstDay = new Date(viewYear, viewMonth, 1).getDay(); // 0=일
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const eventSet = new Set(eventDates);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = (d) => `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`;

  return (
    <div style={{ margin: '0 16px 8px', borderRadius: 16, background: 'var(--dm-card)', border: '1px solid var(--dm-border)', padding: '14px 12px' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={prevMonth} style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 18, cursor: 'pointer', padding: '0 6px' }}>‹</button>
        <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--dm-text)' }}>
          {viewYear}년 {viewMonth + 1}월
        </div>
        <button onClick={nextMonth} style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 18, cursor: 'pointer', padding: '0 6px' }}>›</button>
      </div>
      {/* 요일 헤더 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 6 }}>
        {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700,
            color: i === 0 ? '#F87171' : i === 6 ? '#6C8EFF' : 'var(--dm-muted)', padding: '2px 0' }}>
            {d}
          </div>
        ))}
      </div>
      {/* 날짜 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px 0' }}>
        {cells.map((d, i) => {
          if (!d) return <div key={`empty-${i}`} />;
          const ds = dateStr(d);
          const isToday = ds === today;
          const hasEvent = eventSet.has(ds);
          const isSelected = ds === selectedDate;
          const dayOfWeek = (firstDay + d - 1) % 7;
          return (
            <div key={ds} onClick={() => onSelectDate(isSelected ? null : ds)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3px 0', cursor: hasEvent ? 'pointer' : 'default', borderRadius: 8,
                background: isSelected ? 'rgba(108,142,255,.2)' : isToday ? 'rgba(75,111,255,.1)' : 'transparent' }}>
              <div style={{ fontSize: 13, fontWeight: isToday ? 900 : 500, lineHeight: 1.4,
                color: isSelected ? '#6C8EFF' : isToday ? '#4B6FFF' : dayOfWeek === 0 ? '#F87171' : dayOfWeek === 6 ? '#6C8EFF' : 'var(--dm-text)',
                borderBottom: isToday ? '2px solid #4B6FFF' : 'none' }}>
                {d}
              </div>
              <div style={{ width: 5, height: 5, borderRadius: '50%', marginTop: 2,
                background: hasEvent ? '#6C8EFF' : 'transparent' }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Community({ user, authUser, communityIds, activeCommunityId, setActiveCommunityId, addCommunityId, removeCommunityId, getValidGcalToken, onGcalConnect, setToast, todayCompletion, onUnreadChange }) {
  const [mainTab, setMainTab] = useState("community"); // community | challenge
  const communityId = activeCommunityId;
  const [community, setCommunity] = useState(null);
  const [members, setMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [checkingIn, setCheckingIn] = useState(false);
  const [loading, setLoading] = useState(true);

  // 공지
  const [notices, setNotices] = useState([]);
  const [showNoticeForm, setShowNoticeForm] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeBody, setNoticeBody] = useState('');
  const [postingNotice, setPostingNotice] = useState(false);
  const isAdmin = community?.createdBy === authUser?.uid;
  const noticeReadKey = `dm_notice_read_${communityId}`;
  const lastReadNotice = store.get(noticeReadKey, null);
  const unreadCount = notices.filter(n => !lastReadNotice || n.createdAt > lastReadNotice).length;

  useEffect(() => { onUnreadChange?.(unreadCount); }, [unreadCount]); // eslint-disable-line

  // 알림 소리
  const [soundOn, setSoundOn] = useState(() => store.get('dm_community_sound', true));
  const soundOnRef = useRef(soundOn);
  useEffect(() => { soundOnRef.current = soundOn; store.set('dm_community_sound', soundOn); }, [soundOn]);
  const noticeInitRef = useRef(false);
  const commentInitRef = useRef(false);
  const playNotifySound = (type = 'notice') => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = type === 'notice' ? 880 : 660;
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } catch {}
  };

  // 댓글
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const myNickname = members.find(m => m.uid === authUser?.uid)?.nickname || user?.name || '익명';
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameEdit, setNicknameEdit] = useState('');

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
  const [mode, setMode] = useState(null);
  const [nameInput, setNameInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [nicknameInput, setNicknameInput] = useState(() => user?.name || '');
  const [submitting, setSubmitting] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [createPassword, setCreatePassword] = useState('');
  const [joinTab, setJoinTab] = useState('public');
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
  const [addToGcal, setAddToGcal] = useState(true); // ← 내 캘린더에도 추가 토글 (기본 ON)
  const [codeCopied, setCodeCopied] = useState(false);

  // 달력/리스트 뷰 토글
  const [calView, setCalView] = useState(false);
  const [selectedCalDate, setSelectedCalDate] = useState(null);

  // 실시간 커뮤니티 데이터
  useEffect(() => {
    if (!communityId) { setLoading(false); return; }
    setLoading(true);

    const unsubCom = onSnapshot(doc(db, 'communities', communityId), (snap) => {
      if (snap.exists()) setCommunity({ id: snap.id, ...snap.data() });
      else { removeCommunityId?.(communityId); }
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

    noticeInitRef.current = false;
    const qNotices = query(collection(db, 'communities', communityId, 'notices'), orderBy('createdAt', 'desc'));
    const unsubNotices = onSnapshot(qNotices, (snap) => {
      if (noticeInitRef.current) {
        const hasNew = snap.docChanges().some(ch => ch.type === 'added' && ch.doc.data().createdBy !== authUser?.uid);
        if (hasNew && soundOnRef.current) playNotifySound('notice');
      } else {
        noticeInitRef.current = true;
      }
      setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error('[notices onSnapshot]', err));

    return () => { unsubCom(); unsubEv(); unsubCheckins(); unsubNotices(); };
  }, [communityId]); // eslint-disable-line

  useEffect(() => {
    if (mode === 'join' && joinTab === 'public') {
      setPublicLoading(true);
      loadPublicCommunities().then(list => { setPublicList(list); setPublicLoading(false); }).catch(() => setPublicLoading(false));
    }
  }, [mode, joinTab]);

  // 댓글 실시간 구독
  useEffect(() => {
    if (!selectedNotice) { setComments([]); return; }
    commentInitRef.current = false;
    const q = query(
      collection(db, 'communities', communityId, 'notices', selectedNotice.id, 'comments'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      if (commentInitRef.current) {
        const hasNew = snap.docChanges().some(ch => ch.type === 'added' && ch.doc.data().uid !== authUser?.uid);
        if (hasNew && soundOnRef.current) playNotifySound('comment');
      } else {
        commentInitRef.current = true;
      }
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return () => unsub();
  }, [selectedNotice, communityId]); // eslint-disable-line

  const handlePostComment = async () => {
    if (!commentText.trim() || !selectedNotice) return;
    setPostingComment(true);
    try {
      await addNoticeComment(communityId, selectedNotice.id, {
        text: commentText.trim(), uid: authUser.uid, nickname: myNickname,
      });
      setCommentText('');
    } catch { setToast('댓글 등록 실패 ❌'); }
    setPostingComment(false);
  };

  const handleDeleteComment = async (commentId) => {
    try {
      await deleteNoticeComment(communityId, selectedNotice.id, commentId);
    } catch { setToast('삭제 실패 ❌'); }
  };

  const handleUpdateNickname = async () => {
    const trimmed = nicknameEdit.trim();
    if (!trimmed || trimmed === myNickname) { setEditingNickname(false); return; }
    try {
      await updateMemberNickname(communityId, authUser.uid, trimmed);
      loadCommunityMembers(communityId).then(setMembers).catch(() => {});
      setToast('닉네임 변경 완료 ✅');
    } catch { setToast('변경 실패 ❌'); }
    setEditingNickname(false);
  };

  const handlePostNotice = async () => {
    if (!noticeTitle.trim()) return;
    setPostingNotice(true);
    try {
      await addCommunityNotice(communityId, { title: noticeTitle.trim(), body: noticeBody.trim(), uid: authUser.uid });
      setNoticeTitle(''); setNoticeBody(''); setShowNoticeForm(false);
      setToast('공지 등록 완료 ✅');
    } catch (e) { console.error('[addNotice]', e); setToast(`공지 등록 실패: ${e?.code || e?.message || '알 수 없는 오류'}`); }
    setPostingNotice(false);
  };

  const handleDeleteNotice = async (noticeId) => {
    try {
      await deleteCommunityNotice(communityId, noticeId);
      setToast('공지 삭제됨');
    } catch { setToast('삭제 실패 ❌'); }
  };

  const markNoticesRead = () => {
    if (notices.length > 0) store.set(noticeReadKey, notices[0].createdAt);
  };

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
      // 내 구글 캘린더에도 추가
      if (addToGcal) {
        let token = getValidGcalToken?.();
        if (!token) token = await onGcalConnect?.();
        if (token) {
          try {
            await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                summary: `[${community?.name}] ${evTitle.trim()}`,
                description: evDesc.trim() || '',
                ...(evStart
                  ? { start: { dateTime: `${evDate}T${evStart}:00`, timeZone: 'Asia/Seoul' }, end: { dateTime: `${evDate}T${(evEnd || evStart)}:00`, timeZone: 'Asia/Seoul' } }
                  : { start: { date: evDate }, end: { date: evDate } }
                ),
              }),
            });
          } catch {}
        }
      }
      setEvTitle(''); setEvDate(toDateStr()); setEvStart(''); setEvEnd(''); setEvDesc('');
      setShowAdd(false);
      setToast(addToGcal ? '일정 추가 + 내 캘린더에도 저장 ✅' : '일정 추가 완료 ✅');
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
    const isLast = members.length <= 1;
    const msg = isLast
      ? '마지막 멤버입니다. 나가면 커뮤니티가 완전히 삭제돼요. 정말 나가시겠어요?'
      : '커뮤니티에서 나가시겠어요?';
    if (!window.confirm(msg)) return;
    try {
      await leaveCommunity(communityId, authUser.uid);
      if (isLast) deleteCommunityFull(communityId).catch(() => {});
    } catch { setToast('오류가 발생했어요'); }
    removeCommunityId(communityId);
    setCommunity(null);
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
  const allEventDates = Object.keys(grouped);
  const upcomingDates = allEventDates.filter(d => d >= today).sort();
  const pastDates = allEventDates.filter(d => d < today).sort().reverse();

  if (!authUser) return (
    <div style={S.content}>
      <div style={S.topbar}><div style={{ flex: 1 }}><div style={S.title}>커뮤니티</div></div></div>
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--dm-muted)', fontSize: 14 }}>
        로그인 후 이용할 수 있어요
      </div>
    </div>
  );

  if (communityIds.length === 0 || mode === 'create' || mode === 'join' || mode === 'add') return (
    <div style={S.content}>
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--dm-border)' }}>
        {[{ key: 'community', label: '👥 커뮤니티' }, { key: 'challenge', label: '🏁 챌린지' }].map(t => (
          <button key={t.key} onClick={() => setMainTab(t.key)} style={{
            flex: 1, padding: '12px 0', fontSize: 13, fontWeight: 800, cursor: 'pointer', border: 'none', background: 'transparent',
            color: mainTab === t.key ? '#6C8EFF' : 'var(--dm-muted)',
            borderBottom: mainTab === t.key ? '2.5px solid #6C8EFF' : '2.5px solid transparent',
            marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>
      {mainTab === 'challenge' && <Challenge authUser={authUser} />}
      {mainTab === 'community' && <>
      <div style={S.topbar}>
        <div style={{ flex: 1 }}><div style={S.title}>커뮤니티</div><div style={S.sub}>함께하는 일정 공유</div></div>
        {communityIds.length > 0 && mode !== null && (
          <button onClick={() => setMode(null)} style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 22, cursor: 'pointer', padding: '4px 8px' }}>✕</button>
        )}
      </div>

      {(mode === null || mode === 'add') && (
        <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ textAlign: 'center', fontSize: 48, marginBottom: 8 }}>👥</div>
          <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 4 }}>
            {mode === 'add' ? '커뮤니티 추가' : '커뮤니티에 참여해보세요'}
          </div>
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
      </>}
    </div>
  );

  // 달력 뷰에서 선택된 날짜의 일정
  const calSelectedEvents = selectedCalDate ? (grouped[selectedCalDate] || []) : [];
  const hasCommentText = !!commentText.trim();

  return (
    <div style={S.content}>
      {/* 메인 탭: 커뮤니티 / 챌린지 */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--dm-border)' }}>
        {[{ key: 'community', label: '👥 커뮤니티' }, { key: 'challenge', label: '🏁 챌린지' }].map(t => (
          <button key={t.key} onClick={() => setMainTab(t.key)} style={{
            flex: 1, padding: '12px 0', fontSize: 13, fontWeight: 800, cursor: 'pointer', border: 'none', background: 'transparent',
            color: mainTab === t.key ? '#6C8EFF' : 'var(--dm-muted)',
            borderBottom: mainTab === t.key ? '2.5px solid #6C8EFF' : '2.5px solid transparent',
            marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      {mainTab === 'challenge' && <Challenge authUser={authUser} />}
      {mainTab === 'challenge' && null /* 아래 커뮤니티 콘텐츠 숨김 */}
      {mainTab === 'community' && <>

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
        <button onClick={() => setSoundOn(v => !v)}
          title={soundOn ? '알림 소리 끄기' : '알림 소리 켜기'}
          style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', padding: '4px 8px', opacity: soundOn ? 1 : 0.4 }}>
          {soundOn ? '🔔' : '🔕'}
        </button>
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
          <button onClick={() => setMode('add')} style={{
            flexShrink: 0, padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
            border: '1.5px dashed var(--dm-border)', background: 'transparent', color: 'var(--dm-muted)',
          }}>+ 추가</button>
        </div>
      )}
      {communityIds.length === 1 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 16px 0' }}>
          <button onClick={() => setMode('add')} style={{
            fontSize: 11, fontWeight: 700, color: 'var(--dm-muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0',
          }}>+ 다른 커뮤니티 추가</button>
        </div>
      )}

      {/* 내 닉네임 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px 2px' }}>
        <span style={{ fontSize: 11, color: 'var(--dm-muted)' }}>내 닉네임</span>
        {editingNickname ? (
          <input
            value={nicknameEdit}
            onChange={e => setNicknameEdit(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleUpdateNickname(); if (e.key === 'Escape') setEditingNickname(false); }}
            onBlur={handleUpdateNickname}
            autoFocus
            maxLength={20}
            style={{ ...S.input, fontSize: 12, padding: '3px 8px', marginBottom: 0, width: 120 }}
          />
        ) : (
          <button onClick={() => { setNicknameEdit(myNickname); setEditingNickname(true); }}
            style={{ background: 'transparent', border: 'none', color: 'var(--dm-text)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
            {myNickname} <span style={{ fontSize: 11 }}>✏️</span>
          </button>
        )}
      </div>

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

          {/* 내 구글 캘린더에도 추가 토글 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '10px 14px', background: 'var(--dm-input)', borderRadius: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dm-text)' }}>📅 내 구글 캘린더에도 추가</div>
              <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginTop: 2 }}>커뮤니티 일정을 내 달력에서도 확인</div>
            </div>
            <div onClick={() => setAddToGcal(v => !v)} style={{
              width: 48, height: 26, borderRadius: 999,
              background: addToGcal ? '#6C8EFF' : 'var(--dm-border)',
              cursor: 'pointer', position: 'relative', flexShrink: 0,
            }}>
              <div style={{ position: 'absolute', top: 3, left: addToGcal ? 25 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...S.btn, flex: 1, marginTop: 0 }} onClick={handleAddEvent} disabled={addingEvent || !evTitle.trim()}>
              {addingEvent ? '추가 중...' : '추가'}
            </button>
            <button style={{ ...S.btnGhost, flex: 1, marginTop: 0 }} onClick={() => setShowAdd(false)}>취소</button>
          </div>
        </div>
      )}

      {/* ── 공지사항 ── */}
      {(notices.length > 0 || isAdmin) && (
        <>
          <div style={{ ...S.sectionTitle, justifyContent: 'space-between', paddingRight: 16 }}
            onClick={() => { markNoticesRead(); }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={S.sectionEmoji}>📢</span>공지사항
              {unreadCount > 0 && (
                <span style={{ fontSize: 10, fontWeight: 900, background: '#F87171', color: '#fff', borderRadius: 999, padding: '2px 7px' }}>{unreadCount}</span>
              )}
            </span>
            {isAdmin && (
              <button onClick={() => setShowNoticeForm(v => !v)}
                style={{ fontSize: 11, fontWeight: 900, color: '#6C8EFF', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
                {showNoticeForm ? '취소' : '+ 공지 작성'}
              </button>
            )}
          </div>

          {/* 공지 작성 폼 */}
          {isAdmin && showNoticeForm && (
            <div style={{ ...S.card, marginBottom: 8 }}>
              <input value={noticeTitle} onChange={e => setNoticeTitle(e.target.value)}
                placeholder="공지 제목 (필수)"
                style={{ ...S.input, marginBottom: 8, fontWeight: 700 }} maxLength={60} />
              <textarea value={noticeBody} onChange={e => setNoticeBody(e.target.value)}
                placeholder="내용 (선택)"
                rows={3} style={{ ...S.input, resize: 'none', marginBottom: 10 }} maxLength={300} />
              <button onClick={handlePostNotice} disabled={postingNotice || !noticeTitle.trim()}
                style={{ ...S.btn, marginTop: 0, background: 'linear-gradient(135deg,#4B6FFF,#6C8EFF)' }}>
                {postingNotice ? '등록 중...' : '📢 공지 등록'}
              </button>
            </div>
          )}

          {/* 공지 목록 */}
          {loading && notices.length === 0 && (
            <div style={{ margin: '0 16px 8px', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--dm-border)' }}>
              {[1, 2].map(i => (
                <div key={i} style={{ padding: '14px', borderBottom: i < 2 ? '1px solid var(--dm-border)' : 'none' }}>
                  <div style={{ height: 14, width: '60%', borderRadius: 6, background: 'var(--dm-input)', animation: 'dm-skeleton 1.4s ease-in-out infinite', marginBottom: 8 }} />
                  <div style={{ height: 10, width: '40%', borderRadius: 6, background: 'var(--dm-input)', animation: 'dm-skeleton 1.4s ease-in-out infinite 0.2s' }} />
                </div>
              ))}
            </div>
          )}
          {notices.length > 0 && (
            <div style={{ margin: '0 16px 8px', borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(108,142,255,.3)', background: 'linear-gradient(135deg,rgba(75,111,255,.06),rgba(108,142,255,.03))' }}>
              {notices.slice(0, 3).map((n, i) => {
                const isUnread = !lastReadNotice || n.createdAt > lastReadNotice;
                return (
                  <div key={n.id} onClick={() => setSelectedNotice(n)}
                    style={{ display: 'flex', borderBottom: i < Math.min(notices.length, 3) - 1 ? '1px solid var(--dm-border)' : 'none', cursor: 'pointer' }}>
                    {/* 미읽음 파란 바 */}
                    <div style={{ width: 4, flexShrink: 0, background: isUnread ? '#6C8EFF' : 'transparent', borderRadius: i === 0 ? '14px 0 0 0' : i === Math.min(notices.length, 3) - 1 ? '0 0 0 14px' : '0', transition: 'background 0.2s' }} />
                    <div style={{ flex: 1, padding: '12px 14px 12px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: isUnread ? 900 : 700, color: isUnread ? 'var(--dm-text)' : 'var(--dm-sub)', marginBottom: n.body ? 4 : 0 }}>
                            📢 {n.title}
                          </div>
                          {n.body && <div style={{ fontSize: 12, color: 'var(--dm-sub)', lineHeight: 1.6 }}>{n.body}</div>}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                            <span style={{ fontSize: 10, color: 'var(--dm-muted)' }}>
                              {new Date(n.createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span style={{ fontSize: 10, color: '#6C8EFF', fontWeight: 700 }}>💬 {n.commentCount || 0}</span>
                            {isUnread && <span style={{ fontSize: 10, color: '#6C8EFF', fontWeight: 900 }}>NEW</span>}
                          </div>
                        </div>
                        {isAdmin && (
                          <button onClick={e => { e.stopPropagation(); handleDeleteNotice(n.id); }}
                            style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 16, cursor: 'pointer', flexShrink: 0, padding: '0 4px' }}>✕</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 오늘 출석 현황 */}
      <div style={S.sectionTitle}><span style={S.sectionEmoji}>✋</span>오늘 출석</div>
      <div style={S.card}>
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

      {/* 일정 섹션 — 달력/리스트 탭 */}
      <div style={{ ...S.sectionTitle, justifyContent: 'space-between', paddingRight: 16 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={S.sectionEmoji}>📅</span>커뮤니티 일정
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[{ v: false, label: '≡ 목록' }, { v: true, label: '📅 달력' }].map(({ v, label }) => (
            <button key={String(v)} onClick={() => { setCalView(v); setSelectedCalDate(null); }} style={{
              padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${calView === v ? '#6C8EFF' : 'var(--dm-border)'}`,
              background: calView === v ? 'rgba(108,142,255,.15)' : 'var(--dm-input)',
              color: calView === v ? '#6C8EFF' : 'var(--dm-muted)',
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* 달력 뷰 */}
      {calView && (
        <>
          <MiniCalendar
            eventDates={allEventDates}
            selectedDate={selectedCalDate}
            onSelectDate={setSelectedCalDate}
          />
          {selectedCalDate && (
            <div style={{ padding: '0 0 8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px 6px' }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: selectedCalDate === today ? '#4B6FFF' : 'var(--dm-sub)' }}>
                  {new Date(selectedCalDate + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
                </div>
                <button onClick={() => { setEvDate(selectedCalDate); setShowAdd(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  style={{ background: 'rgba(75,111,255,.15)', border: '1px solid rgba(75,111,255,.3)', borderRadius: 8, padding: '4px 10px', color: '#6C8EFF', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  + 일정 추가
                </button>
              </div>
              {calSelectedEvents.length > 0
                ? calSelectedEvents.map(ev => (
                  <EventCard key={ev.id} ev={ev} authUid={authUser.uid} onAddToGcal={() => handleAddToGcal(ev)} onDelete={() => handleDeleteEvent(ev.id)} past={selectedCalDate < today} />
                ))
                : <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--dm-muted)' }}>이 날은 일정이 없어요</div>
              }
            </div>
          )}
          {!selectedCalDate && (
            <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--dm-muted)', textAlign: 'center' }}>
              날짜를 탭하면 일정을 확인할 수 있어요
            </div>
          )}
        </>
      )}

      {/* 리스트 뷰 */}
      {!calView && (
        <>
          {upcomingDates.length > 0 && (
            <>
              <div style={{ padding: '4px 16px 2px', fontSize: 12, fontWeight: 900, color: 'var(--dm-sub)' }}>다가오는 일정</div>
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

          {pastDates.length > 0 && (
            <>
              <div style={{ padding: '8px 16px 2px', fontSize: 12, fontWeight: 900, color: 'var(--dm-muted)' }}>지난 일정</div>
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
            <div style={{ margin: '8px 16px 16px', borderRadius: 16, background: 'var(--dm-card)', border: '1.5px dashed var(--dm-border)', padding: '32px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🗓️</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 6 }}>아직 공유된 일정이 없어요</div>
              <div style={{ fontSize: 12, color: 'var(--dm-muted)', lineHeight: 1.7, marginBottom: 16 }}>
                함께하고 싶은 일정을 추가해보세요.<br/>구글 캘린더에도 연동할 수 있어요.
              </div>
            </div>
          )}
        </>
      )}

      {/* 커뮤니티 나가기 */}
      <div style={{ padding: '24px 16px 0' }}>
        <button onClick={handleLeave}
          style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
          커뮤니티 나가기
        </button>
      </div>

      {/* ── 댓글 모달 ── */}
      {selectedNotice && (
        <div onClick={() => setSelectedNotice(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--dm-bg)', borderRadius: '22px 22px 0 0',
            width: '100%', maxWidth: 480, maxHeight: 'calc(90vh - 84px)',
            marginBottom: 84,
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 -12px 48px rgba(0,0,0,0.5)',
            animation: 'slideUp 0.22s ease-out',
          }}>
            {/* 헤더 */}
            <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid var(--dm-border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 2 }}>📢 {selectedNotice.title}</div>
                {selectedNotice.body && <div style={{ fontSize: 12, color: 'var(--dm-sub)', lineHeight: 1.6, marginTop: 4 }}>{selectedNotice.body}</div>}
                <div style={{ fontSize: 10, color: 'var(--dm-muted)', marginTop: 4 }}>
                  {new Date(selectedNotice.createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <button onClick={() => setSelectedNotice(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 20, cursor: 'pointer', padding: 4, lineHeight: 1, flexShrink: 0 }}>✕</button>
            </div>

            {/* 댓글 목록 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
              {comments.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--dm-muted)', fontSize: 13, padding: '24px 0' }}>
                  아직 댓글이 없어요. 첫 댓글을 남겨보세요 💬
                </div>
              ) : (
                comments.map((c, i) => {
                  const isMine = c.uid === authUser?.uid;
                  return (
                    <div key={c.id} style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'flex-start' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 999, background: isMine ? 'rgba(75,111,255,.2)' : 'var(--dm-row)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: isMine ? '#6C8EFF' : 'var(--dm-muted)', flexShrink: 0 }}>
                        {(c.nickname || '?')[0]}
                      </div>
                      <div style={{ flex: 1, background: isMine ? 'rgba(75,111,255,.07)' : 'var(--dm-card)', border: `1px solid ${isMine ? 'rgba(108,142,255,.25)' : 'var(--dm-border)'}`, borderRadius: 12, padding: '8px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 900, color: isMine ? '#6C8EFF' : 'var(--dm-text)' }}>{c.nickname}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10, color: 'var(--dm-muted)' }}>
                              {formatRelativeTime(c.createdAt)}
                            </span>
                            {(isMine || isAdmin) && (
                              <button onClick={() => handleDeleteComment(c.id)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 13, cursor: 'pointer', padding: 0, lineHeight: 1 }}>✕</button>
                            )}
                          </div>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--dm-text)', lineHeight: 1.6 }}>{c.text}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 댓글 입력 */}
            <div style={{ padding: '10px 16px 14px', borderTop: '1px solid var(--dm-border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, position: 'sticky', bottom: 0, background: 'var(--dm-bg)', zIndex: 10 }}>
              <input
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handlePostComment()}
                placeholder={postingComment ? '등록 중...' : '댓글을 입력하세요'}
                maxLength={200}
                disabled={postingComment}
                style={{ ...S.input, flex: 1, marginBottom: 0, fontSize: 14, boxSizing: 'border-box' }}
              />
              <button
                onClick={handlePostComment}
                disabled={postingComment || !hasCommentText}
                style={{
                  background: hasCommentText ? '#4B6FFF' : 'var(--dm-input)',
                  border: 'none', borderRadius: 12, padding: '0 16px', height: 40,
                  color: hasCommentText ? '#fff' : 'var(--dm-muted)',
                  fontSize: 13, fontWeight: 700, cursor: hasCommentText ? 'pointer' : 'default',
                  flexShrink: 0, transition: 'background 0.15s',
                }}>
                등록
              </button>
            </div>
          </div>
        </div>
      )}
      </>}
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
