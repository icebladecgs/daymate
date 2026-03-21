import { useEffect, useRef } from "react";
import { toDateStr, formatKoreanDate } from "../utils/date.js";
import { playSuccessSound } from "../utils/sound.js";
import { gcalCreateEvent, gcalDeleteEvent, gcalUpdateEvent, gcalFetchTodayEvents } from "../api/gcal.js";
import S from "../styles.js";
import Toast from "../components/Toast.jsx";

export default function DayDetail({ dateStr, data, setData, onBack, toast, setToast, habits, scrollToMemo, getValidGcalToken, onGcalConnect, someday, setSomeday }) {
  const isToday = dateStr === toDateStr();
  const doneCount = data.tasks.filter((t) => t.done && t.title.trim()).length;
  const filledCount = data.tasks.filter((t) => t.title.trim()).length;
  const memoRef = useRef(null);
  const contentRef = useRef(null);
  const pendingGcalRef = useRef(new Set());
  useEffect(() => {
    if (scrollToMemo && memoRef.current) {
      setTimeout(() => memoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } else {
      setTimeout(() => { if (contentRef.current) contentRef.current.scrollTop = 0; }, 50);
    }
  }, [scrollToMemo]);

  const toggleDone = (id) => {
    setData((prev) => {
      const next = { ...prev };
      const wasUndone = !prev.tasks.find(t => t.id === id)?.done;
      next.tasks = next.tasks.map((t) =>
        t.id === id ? { ...t, done: !t.done, checkedAt: new Date().toISOString() } : t
      );
      if (wasUndone) playSuccessSound();
      return next;
    });
  };

  const setTitle = (id, title) => {
    setData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => t.id === id ? { ...t, title } : t),
    }));
  };

  const addTask = () => {
    setData((prev) => ({
      ...prev,
      tasks: [...prev.tasks, { id: `t${Date.now()}`, title: "", done: false, checkedAt: null, priority: false }],
    }));
  };

  const removeTask = (id) => {
    const token = getValidGcalToken?.();
    const task = data.tasks.find(t => t.id === id);
    if (token && task?.gcalEventId) gcalDeleteEvent(token, task.gcalEventId).catch(() => setToast('캘린더 삭제 실패'));
    setData((prev) => ({ ...prev, tasks: prev.tasks.filter(t => t.id !== id) }));
  };

  const moveToSomeday = (id) => {
    const task = data.tasks.find(t => t.id === id);
    if (!task?.title?.trim()) return;
    removeTask(id);
    setSomeday(prev => [...(prev || []), { id: `sd${Date.now()}`, title: task.title.trim(), done: false }]);
    setToast('언젠가 할일로 이동 ✅');
  };

  const moveToTask = (sdId) => {
    const item = (someday || []).find(s => s.id === sdId);
    if (!item) return;
    setSomeday(prev => prev.filter(s => s.id !== sdId));
    setData(prev => ({
      ...prev,
      tasks: [...prev.tasks, { id: `t${Date.now()}`, title: item.title, done: false, checkedAt: null, priority: false }],
    }));
    setToast('할일로 이동 ✅');
  };

  const saveJournal = () => {
    setData((prev) => ({
      ...prev,
      journal: { ...prev.journal, savedAt: new Date().toISOString() },
    }));
    setToast("일기 저장 ✅");
  };

  const isPerfect = filledCount >= 3 && doneCount === filledCount && !!data.journal?.body?.trim();

  return (
    <div ref={contentRef} style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
      <div style={S.topbar}>
        <button onClick={onBack} style={{ ...S.btnGhost, width: 56, marginTop: 0, padding: 10 }}>
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div style={S.title}>{formatKoreanDate(dateStr)}</div>
          <div style={S.sub}>
            {doneCount}/{filledCount} 완료
            {isPerfect && " · 🎉 완벽한 하루"}
          </div>
        </div>
        <div />
      </div>

      <div style={{ ...S.sectionTitle, justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={S.sectionEmoji}>✅</span>할 일 ({data.tasks.length}개)</span>
        {getValidGcalToken && (getValidGcalToken() ? (
          <button onClick={async () => {
            const token = getValidGcalToken();
            if (!token) return;
            try {
              const events = await gcalFetchTodayEvents(token, dateStr);
              const external = events.filter(e => !e.extendedProperties?.private?.daymateId && e.summary?.trim());
              if (external.length === 0) { setToast('가져올 일정이 없어요'); return; }
              const existingTitles = new Set(data.tasks.map(t => t.title.trim().toLowerCase()));
              const toAdd = external
                .filter(e => !existingTitles.has(e.summary.trim().toLowerCase()))
                .map(e => ({ id: `gcal_${e.id}`, title: e.summary.trim(), done: false, checkedAt: null, priority: false, gcalEventId: e.id }));
              if (toAdd.length === 0) { setToast('이미 모두 추가됨'); return; }
              setData(prev => {
                const tasks = [...prev.tasks];
                const remaining = [...toAdd];
                for (let i = 0; i < tasks.length && remaining.length > 0; i++) {
                  if (!tasks[i].title.trim()) tasks[i] = remaining.shift();
                }
                return { ...prev, tasks: [...tasks, ...remaining] };
              });
              setToast(`${toAdd.length}개 추가됨`);
            } catch { setToast('캘린더 가져오기 실패'); }
          }} style={{ fontSize: 12, padding: '3px 8px', background: 'var(--dm-input)', border: '1px solid var(--dm-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--dm-sub)' }}>
            📅 캘린더에서 가져오기
          </button>
        ) : (
          <button onClick={async () => {
            if (!onGcalConnect) return;
            setToast('구글 로그인 중...');
            const token = await onGcalConnect();
            if (!token) { setToast('연동 실패'); return; }
            try {
              const events = await gcalFetchTodayEvents(token, dateStr);
              const external = events.filter(e => !e.extendedProperties?.private?.daymateId && e.summary?.trim());
              if (external.length === 0) { setToast('연동 완료 · 가져올 일정 없음'); return; }
              const existingTitles = new Set(data.tasks.map(t => t.title.trim().toLowerCase()));
              const toAdd = external
                .filter(e => !existingTitles.has(e.summary.trim().toLowerCase()))
                .map(e => ({ id: `gcal_${e.id}`, title: e.summary.trim(), done: false, checkedAt: null, priority: false, gcalEventId: e.id }));
              if (toAdd.length === 0) { setToast('연동 완료 · 이미 모두 추가됨'); return; }
              setData(prev => {
                const tasks = [...prev.tasks];
                const remaining = [...toAdd];
                for (let i = 0; i < tasks.length && remaining.length > 0; i++) {
                  if (!tasks[i].title.trim()) tasks[i] = remaining.shift();
                }
                return { ...prev, tasks: [...tasks, ...remaining] };
              });
              setToast(`연동 완료 · ${toAdd.length}개 가져왔어요 ✅`);
            } catch { setToast('연동 완료 · 일정 가져오기 실패'); }
          }} style={{ fontSize: 12, padding: '3px 8px', background: 'rgba(75,111,255,.12)', border: '1px solid #4B6FFF', borderRadius: 6, cursor: 'pointer', color: '#6C8EFF', fontWeight: 900 }}>
            📅 캘린더 연동하기
          </button>
        ))}
      </div>
      <div style={S.card}>
        {data.tasks.map((t, idx) => (
          <div key={t.id} style={{ marginBottom: idx < data.tasks.length - 1 ? 12 : 0 }}>
            {/* 1행: 체크버튼 + 입력창 (풀 너비) */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={() => toggleDone(t.id)}
                style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  border: `1.5px solid ${t.done ? "#4ADE80" : "var(--dm-border)"}`,
                  background: t.done ? "rgba(74,222,128,.12)" : "var(--dm-input)",
                  color: t.done ? "#4ADE80" : "var(--dm-sub)",
                  fontSize: 14, cursor: "pointer",
                }}
              >
                {t.done ? "✓" : idx + 1}
              </button>
              <input
                style={{ ...S.input, flex: 1 }}
                value={t.title}
                onChange={(e) => setTitle(t.id, e.target.value)}
                onBlur={(e) => {
                  const token = getValidGcalToken?.();
                  const title = e.target.value.trim();
                  if (!token || !title) return;
                  if (t.gcalEventId) {
                    gcalUpdateEvent(token, t.gcalEventId, title).catch(() => setToast('캘린더 수정 실패'));
                  } else if (!pendingGcalRef.current.has(t.id)) {
                    pendingGcalRef.current.add(t.id);
                    gcalCreateEvent(token, dateStr, { ...t, title })
                      .then(gcalEventId => setData(prev => ({
                        ...prev,
                        tasks: prev.tasks.map(x => x.id === t.id ? { ...x, gcalEventId } : x),
                      })))
                      .catch(() => {})
                      .finally(() => pendingGcalRef.current.delete(t.id));
                  }
                }}
                placeholder={`할 일 ${idx + 1}`}
                maxLength={60}
              />
            </div>
            {/* 2행: 액션 버튼들 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, paddingLeft: 44 }}>
              <button onClick={() => setData(prev => ({ ...prev, tasks: prev.tasks.map(x => x.id === t.id ? { ...x, priority: !x.priority } : x) }))}
                style={{ background: t.priority ? 'rgba(252,211,77,.15)' : 'transparent', border: `1px solid ${t.priority ? 'rgba(252,211,77,.4)' : 'var(--dm-border)'}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: t.priority ? '#FCD34D' : 'var(--dm-muted)', flexShrink: 0 }}>
                ⭐ 중요
              </button>
              {setSomeday && t.title?.trim() && (
                <button onClick={() => moveToSomeday(t.id)}
                  style={{ background: 'transparent', border: '1px solid var(--dm-border)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--dm-muted)', flexShrink: 0 }}>
                  ↓ 나중에
                </button>
              )}
              <button onClick={() => removeTask(t.id)}
                style={{ background: 'transparent', border: '1px solid rgba(248,113,113,.3)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: '#F87171', flexShrink: 0 }}>
                ✕ 삭제
              </button>
              {t.title?.trim() && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                  <span style={{ fontSize: 11, color: t.time ? '#6C8EFF' : 'var(--dm-muted)' }}>⏰</span>
                  <input type="time" value={t.time || ''}
                    onChange={e => setData(prev => ({ ...prev, tasks: prev.tasks.map(x => x.id === t.id ? { ...x, time: e.target.value || undefined } : x) }))}
                    style={{ ...S.input, width: 95, padding: '3px 6px', fontSize: 11, color: t.time ? 'var(--dm-text)' : 'var(--dm-muted)' }} />
                  {t.time && (
                    <button onClick={() => setData(prev => ({ ...prev, tasks: prev.tasks.map(x => x.id === t.id ? { ...x, time: undefined } : x) }))}
                      style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', cursor: 'pointer', fontSize: 12 }}>✕</button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        <button style={{ ...S.btn, marginTop: 8 }} onClick={addTask}>➕ 할 일 추가</button>
        {!isToday && (
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--dm-muted)" }}>
            ✏️ 과거 날짜 기록을 편집 중이에요
          </div>
        )}
      </div>

      {someday && someday.length > 0 && (
        <>
          <div style={S.sectionTitle}><span style={S.sectionEmoji}>📋</span>언젠가 할일</div>
          <div style={S.card}>
            {someday.map((item) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--dm-row)' }}
                className="someday-row">
                <div style={{ flex: 1, fontSize: 14, color: 'var(--dm-sub)' }}>{item.title}</div>
                <button onClick={() => moveToTask(item.id)}
                  style={{ background: 'rgba(75,111,255,.12)', border: '1px solid rgba(75,111,255,.3)', borderRadius: 8, padding: '4px 10px', color: '#6C8EFF', fontSize: 12, fontWeight: 900, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  ↑ 할일로
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {(habits || []).length > 0 && (() => {
        const habitChecks = data.habitChecks || {};
        const toggleHabit = (id) => setData(prev => {
          const cur = prev.habitChecks || {};
          return { ...prev, habitChecks: { ...cur, [id]: !cur[id] } };
        });
        return (
          <>
            <div style={S.sectionTitle}><span style={S.sectionEmoji}>🎯</span>습관</div>
            <div style={S.card}>
              {(habits || []).map((h, i) => {
                const checked = !!habitChecks[h.id];
                return (
                  <div key={h.id} onClick={() => toggleHabit(h.id)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                      borderBottom: i < habits.length - 1 ? `1px solid var(--dm-row)` : "none",
                      cursor: "pointer" }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      border: checked ? "none" : "2px solid #3A4260",
                      background: checked ? "#A78BFA" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {checked && <span style={{ color: "#fff", fontSize: 12, fontWeight: 900 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{h.icon}</span>
                    <div style={{
                      fontSize: 14, fontWeight: 700, flex: 1,
                      color: checked ? "var(--dm-muted)" : "var(--dm-text)",
                      textDecoration: checked ? "line-through" : "none",
                    }}>{h.name || "(이름 없음)"}</div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      <div ref={memoRef} style={S.sectionTitle}><span style={S.sectionEmoji}>📝</span>메모</div>
      <div style={S.card}>
        <textarea
          rows={3}
          style={{ ...S.input, resize: "none", lineHeight: 1.6 }}
          value={data.memo ?? ""}
          onChange={(e) =>
            setData((prev) => ({ ...prev, memo: e.target.value }))
          }
          placeholder="메모를 남겨보세요."
          maxLength={1200}
        />
        <button
          style={S.btn}
          onClick={() => {
            setData((prev) => ({ ...prev, memo: prev.memo ?? "" }));
            setToast("메모 저장 ✅");
          }}
        >
          메모 저장
        </button>
        <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 6, textAlign: "right" }}>
          {(data.memo ?? "").length} / 1200
        </div>
      </div>

      <div style={S.sectionTitle}><span style={S.sectionEmoji}>📖</span>일기</div>
      <div style={S.card}>
        <textarea
          rows={6}
          style={{ ...S.input, resize: "none", lineHeight: 1.6 }}
          value={data.journal?.body || ""}
          onChange={(e) =>
            setData((prev) => ({
              ...prev,
              journal: { ...prev.journal, body: e.target.value },
            }))
          }
          placeholder="이 날의 기록을 남겨보세요."
          maxLength={1200}
        />
        <button style={S.btn} onClick={saveJournal}>일기 저장</button>
        {(() => {
          const len = (data.journal?.body || "").length;
          const pct = Math.min(100, Math.round(len / 1200 * 100));
          const color = len >= 500 ? "#4ADE80" : len >= 150 ? "#4B6FFF" : "var(--dm-border2)";
          return (
            <div style={{ marginTop: 8 }}>
              <div style={{ height: 3, background: "var(--dm-row)", borderRadius: 2, overflow: "hidden", marginBottom: 4 }}>
                <div style={{ height: "100%", borderRadius: 2, background: color, width: `${pct}%`, transition: "width 0.2s" }} />
              </div>
              <div style={{ fontSize: 11, color: "var(--dm-muted)", textAlign: "right" }}>{len} / 1200</div>
            </div>
          );
        })()}
      </div>
      <div style={{ height: 12 }} />
    </div>
  );
}
