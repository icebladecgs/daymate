import { useEffect, useRef, useState } from "react";
import { toDateStr, formatKoreanDate } from "../utils/date.js";
import { playSuccessSound } from "../utils/sound.js";
import { gcalCreateEvent, gcalDeleteEvent, gcalUpdateEvent, gcalFetchTodayEvents } from "../api/gcal.js";
import S from "../styles.js";
import Toast from "../components/Toast.jsx";
import MemoTimeline, { genMemoId, getMemoTimeStr } from "../components/MemoTimeline.jsx";

export default function DayDetail({ dateStr, data, setData, onBack, toast, setToast, habits, scrollToMemo, getValidGcalToken, onGcalConnect, onImportGcalEvents, someday, setSomeday, onNavigateDay }) {
  const isToday = dateStr === toDateStr();
  const isPast = dateStr < toDateStr();
  const doneCount = data.tasks.filter((t) => t.done && t.title.trim()).length;
  const filledCount = data.tasks.filter((t) => t.title.trim()).length;
  const memoRef = useRef(null);
  const contentRef = useRef(null);
  const pendingGcalRef = useRef(new Set());
  const newTaskIdRef = useRef(null);
  const taskInputsRef = useRef({});
  const [gcalImporting, setGcalImporting] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState(null);
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
    const newId = `t${Date.now()}`;
    newTaskIdRef.current = newId;
    setData((prev) => ({
      ...prev,
      tasks: [...prev.tasks, { id: newId, title: "", done: false, checkedAt: null, priority: false }],
    }));
    // useEffect가 아닌 setTimeout으로 DOM 렌더 후 포커스
    setTimeout(() => {
      taskInputsRef.current[newId]?.focus();
      newTaskIdRef.current = null;
    }, 50);
  };

  const removeTask = (id) => {
    const token = getValidGcalToken?.();
    const task = data.tasks.find(t => t.id === id);
    const isImported = task?.gcalEventId && String(task.id || '').startsWith('gcal_');
    if (token && task?.gcalEventId && !isImported) gcalDeleteEvent(token, task.gcalEventId).catch(() => setToast('캘린더 삭제 실패'));
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
    setToast("일기 저장 ✅ · +15 XP");
  };

  const importCalendarTasks = async (token, emptyMessage, successPrefix = '') => {
    if (!token || !onImportGcalEvents || gcalImporting) return;
    setGcalImporting(true);
    try {
      const events = await gcalFetchTodayEvents(token, dateStr);
      const external = events.filter((event) => !event.extendedProperties?.private?.daymateId && event.summary?.trim());
      if (external.length === 0) {
        setToast(emptyMessage);
        return;
      }
      const added = onImportGcalEvents(dateStr, external);
      if (added === 0) {
        setToast(successPrefix ? `${successPrefix}이미 모두 추가됨` : '이미 모두 추가됨');
        return;
      }
      setToast(successPrefix ? `${successPrefix}${added}개 가져왔어요 ✅` : `${added}개 추가됨`);
    } catch {
      setToast(successPrefix ? `${successPrefix}일정 가져오기 실패` : '캘린더 가져오기 실패');
    } finally {
      setGcalImporting(false);
    }
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
        {onNavigateDay && (
          <div style={{ display: 'flex', gap: 2 }}>
            <button onClick={() => onNavigateDay(-1)} aria-label="전날" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: '8px 6px', color: 'var(--dm-muted)' }}>‹</button>
            <button onClick={() => onNavigateDay(1)} aria-label="다음날" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: '8px 6px', color: 'var(--dm-muted)' }}>›</button>
          </div>
        )}
      </div>

      <div style={{ ...S.sectionTitle, justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={S.sectionEmoji}>✅</span>할 일 ({data.tasks.length}개)</span>
        {getValidGcalToken && (getValidGcalToken() ? (
          <button onClick={async () => {
            const token = getValidGcalToken();
            if (!token) return;
            await importCalendarTasks(token, '가져올 일정이 없어요');
          }} disabled={gcalImporting} style={{ fontSize: 12, padding: '3px 8px', background: 'var(--dm-input)', border: '1px solid var(--dm-border)', borderRadius: 6, cursor: gcalImporting ? 'default' : 'pointer', color: 'var(--dm-sub)', opacity: gcalImporting ? 0.5 : 1 }}>
            {gcalImporting ? '⏳ 가져오는 중...' : '📅 캘린더에서 가져오기'}
          </button>
        ) : (
          <button onClick={async () => {
            if (!onGcalConnect || gcalImporting) return;
            setToast('구글 로그인 중...');
            const token = await onGcalConnect();
            if (!token) { setToast('연동 실패'); return; }
            await importCalendarTasks(token, '연동 완료 · 가져올 일정 없음', '연동 완료 · ');
          }} disabled={gcalImporting} style={{ fontSize: 12, padding: '3px 8px', background: 'rgba(75,111,255,.12)', border: '1px solid #4B6FFF', borderRadius: 6, cursor: gcalImporting ? 'default' : 'pointer', color: '#6C8EFF', fontWeight: 900, opacity: gcalImporting ? 0.5 : 1 }}>
            {gcalImporting ? '⏳ 연결 중...' : '📅 GCal 연동'}
          </button>
        ))}
      </div>

      {/* GCal 미연동 시 온보딩 배너 */}
      {getValidGcalToken && !getValidGcalToken() && onGcalConnect && (
        <div onClick={async () => {
          if (gcalImporting) return;
          setToast('구글 로그인 중...');
          const token = await onGcalConnect();
          if (!token) { setToast('연동 실패'); return; }
          await importCalendarTasks(token, '연동 완료 · 가져올 일정 없음', '연동 완료 · ');
        }}
          style={{ margin: '0 0 10px', padding: '12px 14px', borderRadius: 12, background: 'linear-gradient(135deg,rgba(75,111,255,.08),rgba(108,142,255,.04))', border: '1.5px dashed rgba(108,142,255,.35)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>📅</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#6C8EFF', marginBottom: 2 }}>구글 캘린더 연동하기</div>
            <div style={{ fontSize: 11, color: 'var(--dm-muted)', lineHeight: 1.4 }}>연동하면 캘린더 일정이 할일로 자동 추가돼요</div>
          </div>
          <span style={{ fontSize: 16, color: 'rgba(108,142,255,.6)' }}>›</span>
        </div>
      )}

      <div style={S.card}>
        {data.tasks.map((t, idx) => (
          <div key={t.id} style={{ marginBottom: idx < data.tasks.length - 1 ? 12 : 0 }}>
            {/* 1행: 체크버튼 + 입력창 (풀 너비) */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={() => toggleDone(t.id)}
                style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0, position: 'relative',
                  border: `1.5px solid ${t.done ? "#4ADE80" : t.priority ? "rgba(252,211,77,.6)" : "var(--dm-border)"}`,
                  background: t.done ? "rgba(74,222,128,.12)" : t.priority ? "rgba(252,211,77,.08)" : "var(--dm-input)",
                  color: t.done ? "#4ADE80" : "var(--dm-sub)",
                  fontSize: 14, cursor: "pointer",
                }}
              >
                {t.done ? "✓" : idx + 1}
                {t.priority && !t.done && (
                  <span style={{ position: 'absolute', top: -4, right: -4, fontSize: 9, lineHeight: 1 }}>⭐</span>
                )}
              </button>
              {String(t.id || '').startsWith('gcal_') && (
                <span style={{ fontSize: 13, flexShrink: 0, opacity: 0.8 }}>📅</span>
              )}
              <input
                ref={el => { taskInputsRef.current[t.id] = el; }}
                style={{ ...S.input, flex: 1 }}
                value={t.title}
                onChange={(e) => setTitle(t.id, e.target.value)}
                onFocus={() => setActiveTaskId(t.id)}
                onBlur={(e) => {
                  setTimeout(() => setActiveTaskId(prev => prev === t.id ? null : prev), 150);
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
            {/* 2행: 액션 버튼들 — 포커스 시 표시, 시간 설정된 경우 항상 표시 */}
            {(activeTaskId === t.id || t.time || t.title?.trim()) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, paddingLeft: 44 }}>
                {activeTaskId === t.id && (
                  <>
                    <button onMouseDown={e => e.preventDefault()} onClick={() => setData(prev => ({ ...prev, tasks: prev.tasks.map(x => x.id === t.id ? { ...x, priority: !x.priority } : x) }))}
                      style={{ background: t.priority ? 'rgba(252,211,77,.15)' : 'transparent', border: `1px solid ${t.priority ? 'rgba(252,211,77,.4)' : 'var(--dm-border)'}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: t.priority ? '#FCD34D' : 'var(--dm-muted)', flexShrink: 0 }}>
                      ⭐ 중요
                    </button>
                    {setSomeday && t.title?.trim() && (
                      <button onMouseDown={e => e.preventDefault()} onClick={() => moveToSomeday(t.id)}
                        style={{ background: 'transparent', border: '1px solid var(--dm-border)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--dm-muted)', flexShrink: 0 }}>
                        ↓ 나중에
                      </button>
                    )}
                    <button onMouseDown={e => e.preventDefault()} onClick={() => removeTask(t.id)}
                      style={{ background: 'transparent', border: '1px solid rgba(248,113,113,.3)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: '#F87171', flexShrink: 0 }}>
                      ✕ 삭제
                    </button>
                  </>
                )}
                {t.title?.trim() && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: activeTaskId === t.id ? 'auto' : 0 }}>
                    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: t.time ? 'rgba(108,142,255,.15)' : 'var(--dm-input)', border: `1px solid ${t.time ? 'rgba(108,142,255,.4)' : 'var(--dm-border)'}`, borderRadius: 8, padding: '3px 8px', fontSize: 11, color: t.time ? '#6C8EFF' : 'var(--dm-muted)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                        <span>⏰</span>
                        {t.time && <span style={{ fontWeight: 700 }}>{t.time}</span>}
                      </div>
                      <input type="time" value={t.time || ''}
                        onFocus={() => setActiveTaskId(t.id)}
                        onChange={e => setData(prev => ({ ...prev, tasks: prev.tasks.map(x => x.id === t.id ? { ...x, time: e.target.value || undefined } : x) }))}
                        style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', fontSize: 0 }} />
                    </div>
                    {t.time && (
                      <button onMouseDown={e => e.preventDefault()} onClick={() => setData(prev => ({ ...prev, tasks: prev.tasks.map(x => x.id === t.id ? { ...x, time: undefined } : x) }))}
                        style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', cursor: 'pointer', fontSize: 12, padding: '0 2px' }}>✕</button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        <button style={{ ...S.btn, marginTop: 8 }} onClick={addTask}>➕ 할 일 추가</button>
        {!isToday && (
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--dm-muted)" }}>
            {isPast ? "✏️ 과거 날짜 기록을 편집 중이에요" : "📝 미래 날짜를 미리 계획 중이에요"}
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
        <MemoTimeline
          memos={data.memos || (data.memo?.trim() ? [{ id: 'legacy', text: data.memo.trim(), createdAt: '' }] : [])}
          onAdd={(text, time) => setData(prev => ({
            ...prev,
            memos: [...(prev.memos || []), { id: genMemoId(), text, createdAt: time }],
            memo: '',
          }))}
          onUpdate={(id, text) => setData(prev => ({
            ...prev,
            memos: (prev.memos || []).map(m => m.id === id ? { ...m, text } : m),
          }))}
          onDelete={(id) => setData(prev => ({
            ...prev,
            memos: (prev.memos || []).filter(m => m.id !== id),
          }))}
          placeholder="메모를 남겨보세요"
        />
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
