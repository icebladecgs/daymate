import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, doc } from "firebase/firestore";
import { db, createCommunity, findCommunityByCode, joinCommunity, addCommunityEvent, deleteCommunityEvent, leaveCommunity, loadCommunityMembers } from "../firebase.js";
import { toDateStr } from "../utils/date.js";
import S from "../styles.js";

export default function Community({ user, authUser, communityId, setCommunityId, getValidGcalToken, onGcalConnect, setToast }) {
  const [community, setCommunity] = useState(null);
  const [members, setMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // 생성/가입 UI
  const [mode, setMode] = useState(null); // 'create' | 'join'
  const [nameInput, setNameInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [nicknameInput, setNicknameInput] = useState(() => user?.name || '');
  const [submitting, setSubmitting] = useState(false);

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

    return () => { unsubCom(); unsubEv(); };
  }, [communityId]); // eslint-disable-line

  const handleCreate = async () => {
    if (!nameInput.trim() || !nicknameInput.trim()) return;
    setSubmitting(true);
    try {
      const { communityId: id } = await createCommunity(authUser.uid, nameInput.trim(), nicknameInput.trim());
      setCommunityId(id);
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
      setCommunityId(result.communityId);
      setMode(null);
    } catch { setToast('가입 실패 ❌'); }
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
      setCommunityId(null);
      setCommunity(null);
    } catch { setToast('오류가 발생했어요'); }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm('일정을 삭제할까요?')) return;
    try { await deleteCommunityEvent(communityId, eventId); }
    catch { setToast('삭제 실패 ❌'); }
  };

  // 날짜별 그룹핑
  const grouped = events.reduce((acc, ev) => {
    if (!acc[ev.date]) acc[ev.date] = [];
    acc[ev.date].push(ev);
    return acc;
  }, {});
  const today = toDateStr();
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

  if (!communityId) return (
    <div style={S.content}>
      <div style={S.topbar}><div style={{ flex: 1 }}><div style={S.title}>커뮤니티</div><div style={S.sub}>함께하는 일정 공유</div></div></div>

      {mode === null && (
        <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ textAlign: 'center', fontSize: 48, marginBottom: 8 }}>👥</div>
          <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 4 }}>커뮤니티에 참여해보세요</div>
          <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--dm-muted)', marginBottom: 20, lineHeight: 1.6 }}>멤버들과 일정을 공유하고<br/>서로의 캘린더에 추가할 수 있어요</div>
          <button style={S.btn} onClick={() => setMode('create')}>✨ 새 커뮤니티 만들기</button>
          <button style={S.btnGhost} onClick={() => setMode('join')}>🔗 초대 코드로 가입하기</button>
        </div>
      )}

      {mode === 'create' && (
        <div style={{ padding: '24px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 8 }}>새 커뮤니티 만들기</div>
          <input style={S.input} placeholder="커뮤니티 이름 (예: 우리 팀)" value={nameInput} onChange={e => setNameInput(e.target.value)} maxLength={30} />
          <input style={S.input} placeholder="내 닉네임" value={nicknameInput} onChange={e => setNicknameInput(e.target.value)} maxLength={20} />
          <button style={S.btn} onClick={handleCreate} disabled={submitting || !nameInput.trim() || !nicknameInput.trim()}>
            {submitting ? '생성 중...' : '만들기'}
          </button>
          <button style={S.btnGhost} onClick={() => setMode(null)}>취소</button>
        </div>
      )}

      {mode === 'join' && (
        <div style={{ padding: '24px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 8 }}>초대 코드로 가입</div>
          <input style={{ ...S.input, textTransform: 'uppercase', letterSpacing: 4, fontSize: 18, textAlign: 'center' }}
            placeholder="A1B2C3" value={codeInput} onChange={e => setCodeInput(e.target.value.toUpperCase())} maxLength={6} />
          <input style={S.input} placeholder="내 닉네임" value={nicknameInput} onChange={e => setNicknameInput(e.target.value)} maxLength={20} />
          <button style={S.btn} onClick={handleJoin} disabled={submitting || codeInput.length < 6 || !nicknameInput.trim()}>
            {submitting ? '가입 중...' : '가입하기'}
          </button>
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
