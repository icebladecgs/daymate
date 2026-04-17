import { useEffect, useMemo, useState } from "react";
import { toDateStr, pad2, monthLabel, formatKoreanDate } from "../utils/date.js";
import { isPerfectDay } from "../data/stats.js";
import { gcalFetchRangeEvents } from "../api/gcal.js";
import { getCurrentGoalMonthKey, getMonthGoals, getYearGoals, normalizeGoals, setMonthGoals, setYearGoals, updateYearGoal } from "../utils/goals.js";
import { store } from "../utils/storage.js";
import S from "../styles.js";
import WeeklySchedule from "../components/WeeklySchedule.jsx";
import SearchViewer from "./SearchViewer.jsx";

export default function History({ plans, onOpenDate, habits, getValidGcalToken, onGcalConnect, onSyncGcal, goals = { year: [], month: [] }, onSaveGoals, initialGoalsOpen = false, onToggleTaskForDate, onUpdateDayData }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month0, setMonth0] = useState(new Date().getMonth());
  const [gcalEvents, setGcalEvents] = useState({});
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [viewMode, setViewMode] = useState('monthly'); // 'monthly' | 'weekly'
  const [goalsOpen, setGoalsOpen] = useState(initialGoalsOpen);
  const [editingYearGoals, setEditingYearGoals] = useState(false);
  const [editingMonthGoals, setEditingMonthGoals] = useState(false);
  const normalizedGoals = normalizeGoals(goals, getCurrentGoalMonthKey());
  const yearGoals = getYearGoals(normalizedGoals);
  const [selectedGoalMonthKey, setSelectedGoalMonthKey] = useState(getCurrentGoalMonthKey());
  const monthGoals = getMonthGoals(normalizedGoals, selectedGoalMonthKey);
  const [expandedYearGoalId, setExpandedYearGoalId] = useState(null);
  const [yearDraft, setYearDraft] = useState(() => yearGoals.map((goal) => goal.title));
  const [monthDraft, setMonthDraft] = useState(() => [...monthGoals]);
  const [newYearInput, setNewYearInput] = useState('');
  const [newMonthInput, setNewMonthInput] = useState('');
  const [actionDrafts, setActionDrafts] = useState({});

  const [gcalRefreshing, setGcalRefreshing] = useState(false);
  const [gcalToast, setGcalToast] = useState(null);

  const showToast = (msg) => {
    setGcalToast(msg);
    setTimeout(() => setGcalToast(null), 2500);
  };

  useEffect(() => {
    setGoalsOpen(initialGoalsOpen);
  }, [initialGoalsOpen]);

  useEffect(() => {
    if (!editingYearGoals) setYearDraft(yearGoals.map((goal) => goal.title));
  }, [yearGoals, editingYearGoals]);

  useEffect(() => {
    if (!editingMonthGoals) setMonthDraft([...monthGoals]);
  }, [monthGoals, editingMonthGoals]);

  useEffect(() => {
    if (expandedYearGoalId && !yearGoals.some((goal) => goal.id === expandedYearGoalId)) {
      setExpandedYearGoalId(null);
    }
  }, [expandedYearGoalId, yearGoals]);

  const fetchGcal = async (forceRefresh = false) => {
    const token = getValidGcalToken?.();
    if (!token) return;
    const cacheKey = `dm_gcal_month_${year}_${pad2(month0 + 1)}`;
    if (!forceRefresh) {
      const cached = store.get(cacheKey, null);
      if (cached && cached._fetchedAt && Date.now() - cached._fetchedAt < 60 * 60 * 1000) {
        setGcalEvents(cached);
        return;
      }
    }
    setGcalRefreshing(true);
    const startDateStr = `${year}-${pad2(month0 + 1)}-01`;
    const daysInMonth = new Date(year, month0 + 1, 0).getDate();
    gcalFetchRangeEvents(token, startDateStr, daysInMonth).then(byDate => {
      const toStore = { ...byDate, _fetchedAt: Date.now() };
      store.set(cacheKey, toStore);
      setGcalEvents(byDate);
      if (forceRefresh) {
        const added = onSyncGcal?.(byDate) ?? 0;
        showToast(added > 0 ? `📅 ${added}개 일정이 할일에 추가됨` : '📅 구글 캘린더 최신 상태');
      }
    }).catch(() => {
      if (forceRefresh) showToast('❌ 불러오기 실패');
    }).finally(() => setGcalRefreshing(false));
  };

  useEffect(() => { fetchGcal(); }, [year, month0]); // eslint-disable-line
  const [showSearch, setShowSearch] = useState(false);
  const [preview, setPreview] = useState(null);
  const [quickTaskInput, setQuickTaskInput] = useState('');
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');
  const [previewMemoEdit, setPreviewMemoEdit] = useState(false);
  const [previewMemoDraft, setPreviewMemoDraft] = useState('');

  useEffect(() => {
    if (preview) {
      setPreviewMemoEdit(false);
      setPreviewMemoDraft(plans[preview]?.memo ?? '');
    }
  }, [preview]); // eslint-disable-line

  const firstDay = new Date(year, month0, 1).getDay();
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const today = toDateStr();

  const monthStats = useMemo(() => {
    let completedDays = 0, memoDays = 0, journalDays = 0, perfectDays = 0;
    for (let i = 1; i <= daysInMonth; i++) {
      const ds = `${year}-${pad2(month0 + 1)}-${pad2(i)}`;
      if (ds > today) continue;
      const d = plans[ds];
      if (!d) continue;
      const tasks = (d.tasks || []).filter(t => t.title.trim());
      if (tasks.length > 0 && tasks.every(t => t.done)) completedDays++;
      if (d.memo?.trim()) memoDays++;
      if (d.journal?.body?.trim()) journalDays++;
      if (isPerfectDay(d)) perfectDays++;
    }
    return { completedDays, memoDays, journalDays, perfectDays };
  }, [plans, year, month0]); // eslint-disable-line

  const rateOf = (dateStr) => {
    const d = plans[dateStr];
    if (!d) return null;
    const filled = d.tasks.filter((t) => t.title.trim()).length;
    if (filled === 0) return 0;
    const done = d.tasks.filter((t) => t.done && t.title.trim()).length;
    return Math.min(100, Math.round((done / filled) * 100));
  };

  const styleOf = (r, isToday, isPerfect) => {
    const base = {
      background: "transparent",
      color: "var(--dm-muted)",
      fontWeight: 700,
      border: "1px solid transparent",
    };

    if (r === null) {
      return {
        ...base,
        color: isPerfect ? "var(--dm-text)" : "var(--dm-muted)",
        border: isToday ? "1.5px solid #6C8EFF" : "1px solid transparent",
      };
    }

    if (r >= 80) {
      return {
        ...base,
        background: "rgba(75,111,255,.22)",
        color: "#DCE5FF",
        fontWeight: 900,
        border: isToday ? "1.5px solid #6C8EFF" : "1px solid rgba(108,142,255,.18)",
      };
    }

    if (r > 0) {
      return {
        ...base,
        background: "rgba(75,111,255,.10)",
        color: "#9CB3FF",
        fontWeight: 800,
        border: isToday ? "1.5px solid #6C8EFF" : "1px solid rgba(108,142,255,.12)",
      };
    }

    return {
      ...base,
      background: "rgba(255,255,255,.03)",
      color: "var(--dm-sub)",
      fontWeight: 700,
      border: isToday ? "1.5px solid #6C8EFF" : "1px solid rgba(255,255,255,.05)",
    };
  };

  const prev = () => {
    if (month0 === 0) { setMonth0(11); setYear((y) => y - 1); }
    else setMonth0((m) => m - 1);
  };
  const next = () => {
    if (month0 === 11) { setMonth0(0); setYear((y) => y + 1); }
    else setMonth0((m) => m + 1);
  };

  const shiftGoalMonth = (delta) => {
    const [targetYear, targetMonth] = selectedGoalMonthKey.split('-').map(Number);
    const nextDate = new Date(targetYear, targetMonth - 1 + delta, 1);
    setSelectedGoalMonthKey(`${nextDate.getFullYear()}-${pad2(nextDate.getMonth() + 1)}`);
  };

  const selectedGoalMonthLabel = (() => {
    const [targetYear, targetMonth] = selectedGoalMonthKey.split('-').map(Number);
    return `${targetYear}년 ${targetMonth}월`;
  })();

  const saveYearGoals = () => {
    const final = [...yearDraft, ...(newYearInput.trim() ? [newYearInput.trim()] : [])].filter(goal => goal.trim()).slice(0, 5);
    onSaveGoals?.(setYearGoals(normalizedGoals, final));
    setEditingYearGoals(false);
    setNewYearInput('');
  };

  const saveMonthGoals = () => {
    const final = [...monthDraft, ...(newMonthInput.trim() ? [newMonthInput.trim()] : [])].filter(goal => goal.trim()).slice(0, 5);
    onSaveGoals?.(setMonthGoals(normalizedGoals, selectedGoalMonthKey, final));
    setEditingMonthGoals(false);
    setNewMonthInput('');
  };

  const addYearGoalAction = (goalId) => {
    const title = (actionDrafts[goalId] || '').trim();
    if (!title) return;
    onSaveGoals?.(
      updateYearGoal(normalizedGoals, goalId, (goal) => ({
        ...goal,
        actions: [...(goal.actions || []), { id: `yga_${Date.now()}`, title }],
      }))
    );
    setActionDrafts((prev) => ({ ...prev, [goalId]: '' }));
  };

  const removeYearGoalAction = (goalId, actionId) => {
    onSaveGoals?.(
      updateYearGoal(normalizedGoals, goalId, (goal) => ({
        ...goal,
        actions: (goal.actions || []).filter((action) => action.id !== actionId),
      }))
    );
  };

  const renderGoalBlock = ({ title, accent, emoji, items, editing, draft, setDraft, newInput, setNewInput, onStartEdit, onSave, onCancel, extraHeader }) => (
    <div style={{ borderRadius: 16, border: '1px solid var(--dm-border)', background: 'var(--dm-card)', padding: '14px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--dm-text)' }}>{emoji} {title}</div>
          <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginTop: 3 }}>{items.length > 0 ? `${items.length}개 등록됨` : '아직 등록된 목표가 없어요'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {extraHeader}
          <button onClick={editing ? onSave : onStartEdit} style={{ fontSize: 11, fontWeight: 900, color: editing ? '#4ADE80' : accent, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
            {editing ? '저장 ✓' : '편집'}
          </button>
        </div>
      </div>

      {editing ? (
        <>
          {draft.map((goal, index) => (
            <div key={`${title}-${index}`} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                style={{ ...S.input, flex: 1, marginBottom: 0 }}
                value={goal}
                onChange={(e) => setDraft(prev => prev.map((item, itemIndex) => itemIndex === index ? e.target.value : item))}
                placeholder={`${title} ${index + 1}`}
                maxLength={40}
              />
              <button onClick={() => setDraft(prev => prev.filter((_, itemIndex) => itemIndex !== index))} style={{ background: 'transparent', border: 'none', color: '#F87171', cursor: 'pointer', fontSize: 18, flexShrink: 0 }}>✕</button>
            </div>
          ))}
          {draft.length < 5 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ ...S.input, flex: 1, marginBottom: 0 }}
                value={newInput}
                onChange={(e) => setNewInput(e.target.value)}
                placeholder={`${title} 추가`}
                maxLength={40}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newInput.trim()) {
                    setDraft(prev => [...prev, newInput.trim()]);
                    setNewInput('');
                  }
                }}
              />
              <button onClick={() => {
                if (!newInput.trim()) return;
                setDraft(prev => [...prev, newInput.trim()]);
                setNewInput('');
              }} style={{ ...S.btn, width: 'auto', marginTop: 0, padding: '0 14px', fontSize: 18 }}>+</button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={onSave} style={{ ...S.btn, flex: 1, marginTop: 0 }}>저장</button>
            <button onClick={onCancel} style={{ ...S.btnGhost, flex: 1, marginTop: 0 }}>취소</button>
          </div>
        </>
      ) : items.length > 0 ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {items.map((goal, index) => (
            <div key={`${title}-item-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: index < items.length - 1 ? '1px solid var(--dm-row)' : 'none' }}>
              <div style={{ width: 20, height: 20, borderRadius: 999, background: accent, color: '#fff', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{index + 1}</div>
              <div style={{ fontSize: 13, color: 'var(--dm-text)', lineHeight: 1.5 }}>{goal}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
          <div style={{ fontSize: 12, color: 'var(--dm-muted)', lineHeight: 1.6 }}>아직 비어 있어요. 필요할 때만 짧게 적어두세요.</div>
        </div>
      )}
    </div>
  );

  const renderYearGoalsBlock = () => (
    <div style={{ borderRadius: 16, border: '1px solid var(--dm-border)', background: 'var(--dm-card)', padding: '14px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--dm-text)' }}>🌱 올해 목표</div>
          <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginTop: 3 }}>{yearGoals.length > 0 ? `${yearGoals.length}개 등록됨` : '아직 등록된 목표가 없어요'}</div>
        </div>
        <button onClick={editingYearGoals ? saveYearGoals : () => {
          setGoalsOpen(true);
          setYearDraft(yearGoals.map((goal) => goal.title));
          setNewYearInput('');
          setEditingYearGoals(true);
        }} style={{ fontSize: 11, fontWeight: 900, color: editingYearGoals ? '#4ADE80' : '#6C8EFF', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
          {editingYearGoals ? '저장 ✓' : '편집'}
        </button>
      </div>

      {editingYearGoals ? (
        <>
          {yearDraft.map((goal, index) => (
            <div key={`year-draft-${index}`} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                style={{ ...S.input, flex: 1, marginBottom: 0 }}
                value={goal}
                onChange={(e) => setYearDraft(prev => prev.map((item, itemIndex) => itemIndex === index ? e.target.value : item))}
                placeholder={`올해 목표 ${index + 1}`}
                maxLength={40}
              />
              <button onClick={() => setYearDraft(prev => prev.filter((_, itemIndex) => itemIndex !== index))} style={{ background: 'transparent', border: 'none', color: '#F87171', cursor: 'pointer', fontSize: 18, flexShrink: 0 }}>✕</button>
            </div>
          ))}
          {yearDraft.length < 5 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ ...S.input, flex: 1, marginBottom: 0 }}
                value={newYearInput}
                onChange={(e) => setNewYearInput(e.target.value)}
                placeholder="올해 목표 추가"
                maxLength={40}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newYearInput.trim()) {
                    setYearDraft(prev => [...prev, newYearInput.trim()]);
                    setNewYearInput('');
                  }
                }}
              />
              <button onClick={() => {
                if (!newYearInput.trim()) return;
                setYearDraft(prev => [...prev, newYearInput.trim()]);
                setNewYearInput('');
              }} style={{ ...S.btn, width: 'auto', marginTop: 0, padding: '0 14px', fontSize: 18 }}>+</button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={saveYearGoals} style={{ ...S.btn, flex: 1, marginTop: 0 }}>저장</button>
            <button onClick={() => {
              setEditingYearGoals(false);
              setYearDraft(yearGoals.map((goal) => goal.title));
              setNewYearInput('');
            }} style={{ ...S.btnGhost, flex: 1, marginTop: 0 }}>취소</button>
          </div>
        </>
      ) : yearGoals.length > 0 ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {yearGoals.map((goal, index) => {
            const expanded = expandedYearGoalId === goal.id;
            return (
              <div key={goal.id} style={{ borderRadius: 14, border: `1px solid ${expanded ? 'rgba(108,142,255,.28)' : 'var(--dm-border)'}`, background: expanded ? 'rgba(108,142,255,.05)' : 'rgba(255,255,255,.02)' }}>
                <button type="button" onClick={() => setExpandedYearGoalId(prev => prev === goal.id ? null : goal.id)} style={{ width: '100%', background: 'transparent', border: 'none', padding: '12px 12px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ width: 22, height: 22, borderRadius: 999, background: '#6C8EFF', color: '#fff', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{index + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--dm-text)', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{goal.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginTop: 3 }}>액션플랜 {(goal.actions || []).length}개</div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--dm-muted)', fontWeight: 900 }}>{expanded ? '▲' : '▼'}</div>
                </button>
                {expanded && (
                  <div style={{ padding: '0 12px 12px', borderTop: '1px solid rgba(255,255,255,.05)' }}>
                    {(goal.actions || []).length > 0 ? (
                      <div style={{ display: 'grid', gap: 6, marginTop: 10, marginBottom: 10 }}>
                        {(goal.actions || []).map((action) => (
                          <div key={action.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.05)' }}>
                            <div style={{ fontSize: 12, color: '#AFC0FF', flexShrink: 0 }}>•</div>
                            <div style={{ flex: 1, fontSize: 12, color: 'var(--dm-text)', lineHeight: 1.5 }}>{action.title}</div>
                            <button onClick={() => removeYearGoalAction(goal.id, action.id)} style={{ background: 'transparent', border: 'none', color: '#F87171', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>✕</button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ marginTop: 10, marginBottom: 10, fontSize: 12, color: 'var(--dm-muted)' }}>아직 액션플랜이 없어요.</div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input style={{ ...S.input, flex: 1, marginBottom: 0 }} value={actionDrafts[goal.id] || ''} onChange={(e) => setActionDrafts(prev => ({ ...prev, [goal.id]: e.target.value }))} placeholder="세부 액션플랜 추가" maxLength={60} onKeyDown={(e) => { if (e.key === 'Enter') addYearGoalAction(goal.id); }} />
                      <button onClick={() => addYearGoalAction(goal.id)} style={{ ...S.btn, width: 'auto', marginTop: 0, padding: '0 14px', fontSize: 18 }}>+</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
          <div style={{ fontSize: 12, color: 'var(--dm-muted)', lineHeight: 1.6 }}>아직 비어 있어요. 목표를 등록한 뒤 각 항목을 눌러 액션플랜을 적을 수 있어요.</div>
        </div>
      )}
    </div>
  );

  if (showSearch) return <SearchViewer plans={plans} onClose={() => setShowSearch(false)} onOpenDate={onOpenDate} onUpdateDayData={onUpdateDayData} />;

  return (
    <div style={{ ...S.content, overflowX: "hidden" }}>
      {gcalToast && (
        <div style={{ position: 'fixed', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 999, background: 'var(--dm-card)', border: '1px solid var(--dm-border)', borderRadius: 12, padding: '10px 18px', fontSize: 13, fontWeight: 700, color: 'var(--dm-text)', boxShadow: '0 4px 20px rgba(0,0,0,.3)', whiteSpace: 'nowrap' }}>
          {gcalToast}
        </div>
      )}
      <div style={S.topbar}>
        <div>
          <div style={S.title}>달력</div>
          <div style={S.sub}>달력에서 날짜를 눌러 확인</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowSearch(true)} style={{ ...S.btnGhost, marginTop: 0, padding: '6px 10px', fontSize: 11, width: 'auto' }}>🔍</button>
          <button
            onClick={async () => {
              const token = getValidGcalToken?.();
              if (!token) {
                showToast('📅 구글 캘린더 연동이 필요해요');
                await onGcalConnect?.();
                fetchGcal(true);
              } else {
                fetchGcal(true);
              }
            }}
            disabled={gcalRefreshing}
            style={{ ...S.btnGhost, marginTop: 0, padding: '6px 10px', fontSize: 11, width: 'auto', opacity: gcalRefreshing ? 0.5 : 1 }}
          >
            {gcalRefreshing ? '⟳' : '📅'}
          </button>
          <button onClick={() => { const n = new Date(); setYear(n.getFullYear()); setMonth0(n.getMonth()); }} style={{ ...S.btnGhost, marginTop: 0, padding: '5px 8px', fontSize: 11, width: 'auto', fontWeight: 900 }}>오늘</button>
          <button onClick={prev} style={{ ...S.btnGhost, width: 44, marginTop: 0, padding: 10 }}>‹</button>
          <button onClick={next} style={{ ...S.btnGhost, width: 44, marginTop: 0, padding: 10 }}>›</button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 4px" }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 900 }}>{monthLabel(year, month0)}</div>
          <div style={{ display: 'flex', background: 'var(--dm-input)', borderRadius: 8, padding: 2, gap: 2 }}>
            {['monthly', 'weekly'].map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 900, cursor: 'pointer', border: 'none',
                  background: viewMode === mode ? 'var(--dm-card)' : 'transparent',
                  color: viewMode === mode ? 'var(--dm-text)' : 'var(--dm-muted)' }}>
                {mode === 'monthly' ? '월간' : '주간'}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setGoalsOpen(v => !v)} style={{ ...S.btnGhost, marginTop: 0, padding: '5px 12px', fontSize: 12, width: 'auto' }}>
          🎯 목표 {goalsOpen ? '▲' : '▼'}
        </button>
      </div>

      {/* 목표 — 월 레이블 바로 아래 인라인 펼침 */}
      {goalsOpen && (
        <div style={{ padding: '8px 16px 4px', display: 'grid', gap: 10 }}>
          {renderYearGoalsBlock()}
          {renderGoalBlock({
            title: '월별 목표',
            accent: '#4ADE80',
            emoji: '🗓️',
            items: monthGoals,
            editing: editingMonthGoals,
            draft: monthDraft,
            setDraft: setMonthDraft,
            newInput: newMonthInput,
            setNewInput: setNewMonthInput,
            onStartEdit: () => {
              setGoalsOpen(true);
              setMonthDraft([...monthGoals]);
              setNewMonthInput('');
              setEditingMonthGoals(true);
            },
            onSave: saveMonthGoals,
            onCancel: () => {
              setEditingMonthGoals(false);
              setMonthDraft([...monthGoals]);
              setNewMonthInput('');
            },
            extraHeader: (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button onClick={() => shiftGoalMonth(-1)} style={{ ...S.btnGhost, marginTop: 0, width: 28, height: 28, padding: 0, fontSize: 12 }}>‹</button>
                <div style={{ minWidth: 78, textAlign: 'center', fontSize: 11, color: 'var(--dm-text)', fontWeight: 800 }}>{selectedGoalMonthLabel}</div>
                <button onClick={() => shiftGoalMonth(1)} style={{ ...S.btnGhost, marginTop: 0, width: 28, height: 28, padding: 0, fontSize: 12 }}>›</button>
              </div>
            ),
          })}
        </div>
      )}

      {viewMode === 'monthly' && <>
      {/* 월간 요약 */}
      <div style={{ display: 'flex', gap: 8, padding: '0 16px 10px', flexWrap: 'wrap' }}>
        {[
          { label: '완전완료', value: monthStats.completedDays, color: '#4ADE80', icon: '✅' },
          { label: '메모', value: monthStats.memoDays, color: '#6C8EFF', icon: '📝' },
          { label: '일기', value: monthStats.journalDays, color: '#A78BFA', icon: '📖' },
          { label: '완벽', value: monthStats.perfectDays, color: '#FBBF24', icon: '★' },
        ].map(({ label, value, color, icon }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 20, background: 'var(--dm-card)', border: '1px solid var(--dm-border)' }}>
            <span style={{ fontSize: 12 }}>{icon}</span>
            <span style={{ fontSize: 12, fontWeight: 900, color }}>{value}</span>
            <span style={{ fontSize: 10, color: 'var(--dm-muted)' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* 범례 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 18px 10px', flexWrap: 'wrap' }}>
        {[
          { color: 'rgba(75,111,255,0.75)', label: '캘린더' },
          { color: 'rgba(75,158,255,0.55)', label: '할일' },
          { color: 'rgba(252,211,77,0.75)', label: '중요' },
          { color: 'rgba(74,222,128,0.3)', label: '완료' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 20, height: 10, borderRadius: 3, background: color }} />
            <span style={{ fontSize: 10, color: 'var(--dm-muted)' }}>{label}</span>
          </div>
        ))}
        {[
          { dot: '#6C8EFF', label: '메모' },
          { dot: '#A78BFA', label: '일기' },
        ].map(({ dot, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: 999, background: dot }} />
            <span style={{ fontSize: 10, color: 'var(--dm-muted)' }}>{label}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: '#FBBF24' }}>★</span>
          <span style={{ fontSize: 10, color: 'var(--dm-muted)' }}>완벽한 날</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 16, height: 3, borderRadius: 2, background: 'linear-gradient(to right, #4B6FFF, #4ADE80)' }} />
          <span style={{ fontSize: 10, color: 'var(--dm-muted)' }}>완료율</span>
        </div>
      </div>

      <div style={{ padding: "0 10px 12px", boxSizing: "border-box" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 3, marginBottom: 6 }}>
          {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
            <div key={d} style={{ textAlign: "center", fontSize: 11, color: "var(--dm-muted)", fontWeight: 900 }}>
              {d}
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 3 }}>
          {Array(firstDay).fill(null).map((_, i) => <div key={"e" + i} />)}
          {Array(daysInMonth).fill(null).map((_, i) => {
            const day = i + 1;
            const ds = `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
            const r = rateOf(ds);
            const isToday = ds === today;
            const perfect = isPerfectDay(plans[ds]);
            const isFutureDate = ds > today;
            const st = isFutureDate && r === null
              ? { background: "var(--dm-input)", color: "var(--dm-muted)", border: "1px dashed var(--dm-border)" }
              : styleOf(r, isToday, perfect);
            const hasMemo = !!(plans[ds]?.memo?.trim());
            const hasJournal = !!(plans[ds]?.journal?.body?.trim());
            const dayGcalEvents = (gcalEvents[ds] || []).filter(e => !e.extendedProperties?.private?.daymateId);
            // 셀에 표시할 이벤트 목록: GCal 일정 우선, 이후 데이메이트 할일
            const gcalItems = dayGcalEvents.map(e => ({ title: e.summary || '(제목없음)', color: 'rgba(75,111,255,0.75)' }));
            const taskItems = (plans[ds]?.tasks || []).filter(t => t.title?.trim()).map(t => ({ title: t.title, color: t.done ? 'rgba(74,222,128,0.3)' : t.priority ? 'rgba(252,211,77,0.75)' : 'rgba(75,158,255,0.55)' }));
            const allItems = [...gcalItems, ...taskItems];
            const visibleItems = allItems.slice(0, 2);
            const moreCount = allItems.length - visibleItems.length;
            return (
              <div
                key={ds}
                onClick={() => { setPreview(ds); setQuickTaskInput(''); setEditingTaskId(null); }}
                style={{
                  minHeight: 72,
                  borderRadius: 10,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "stretch",
                  justifyContent: "flex-start",
                  position: "relative",
                  cursor: "pointer",
                  overflow: "hidden",
                  padding: "4px 1px 5px",
                  boxSizing: "border-box",
                  ...st,
                }}
                title={perfect ? `${day}일 · 완벽한 하루 ✓` : r !== null ? `${day}일 · ${r}%` : undefined}
              >
                {/* 날짜 숫자 + 별 */}
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1, marginBottom: 2, minHeight: 18 }}>
                  <span style={{ fontSize: 12, fontWeight: st.fontWeight, lineHeight: 1 }}>{day}</span>
                  {perfect && <span style={{ fontSize: 7, color: "#FBBF24", lineHeight: 1 }}>★</span>}
                </div>
                {/* 이벤트 칩 */}
                {visibleItems.map((item, idx) => (
                  <div key={idx} style={{
                    fontSize: 8,
                    lineHeight: 1.4,
                    padding: '1px 2px',
                    borderRadius: 3,
                    background: item.color,
                    color: '#fff',
                    marginBottom: 2,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    fontWeight: 700,
                  }}>
                    {item.title}
                  </div>
                ))}
                {moreCount > 0 && (
                  <div style={{ fontSize: 9, color: 'var(--dm-muted)', paddingLeft: 3, lineHeight: 1.3 }}>+{moreCount}개</div>
                )}
                {/* 완료율 진행바 */}
                {r !== null && r > 0 && (
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3 }}>
                    <div style={{ height: "100%", width: `${r}%`, background: r >= 100 ? "#4ADE80" : r >= 60 ? "#6C8EFF" : "#4B6FFF", opacity: 0.9 }} />
                  </div>
                )}
                {/* 메모 점 */}
                {hasMemo && (
                  <span style={{ position: "absolute", top: 3, right: hasJournal ? 9 : 3, width: 4, height: 4, borderRadius: 999, background: "#6C8EFF" }} />
                )}
                {/* 일기 점 */}
                {hasJournal && (
                  <span style={{ position: "absolute", top: 3, right: 3, width: 4, height: 4, borderRadius: 999, background: "#A78BFA" }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 빈 상태: 이번 달 기록이 하나도 없을 때 */}
      {(() => {
        const hasAnyRecord = Array(daysInMonth).fill(null).some((_, i) => {
          const ds = `${year}-${pad2(month0 + 1)}-${pad2(i + 1)}`;
          return !!plans[ds];
        });
        if (hasAnyRecord) return null;
        const isCurrentMonth = year === new Date().getFullYear() && month0 === new Date().getMonth();
        return (
          <div style={{ margin: "4px 16px 12px", borderRadius: 16, background: "var(--dm-card)", border: "1.5px dashed var(--dm-border)", padding: "22px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📅</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: "var(--dm-text)", marginBottom: 6 }}>
              {isCurrentMonth ? "아직 이번 달 기록이 없어요" : "이 달은 기록이 없어요"}
            </div>
            <div style={{ fontSize: 12, color: "var(--dm-muted)", lineHeight: 1.7 }}>
              {isCurrentMonth
                ? "오늘 할 일 3가지를 완료하면\n달력에 색이 채워져요 🌈"
                : "할일을 완료하거나 일기를 쓰면\n달력에 기록이 남아요"}
            </div>
          </div>
        );
      })()}
      </>
      }

      {viewMode === 'weekly' && (
        <div style={{ padding: "0 16px 12px" }}>
          <WeeklySchedule plans={plans} habits={habits} onOpenDate={onOpenDate} onToggleTask={onToggleTaskForDate} gcalEvents={gcalEvents} />
        </div>
      )}

      <div style={{ height: 12 }} />

      {preview && (() => {
        const d = plans[preview];
        const tasks = (d?.tasks || []).filter(t => t.title.trim());
        const done = tasks.filter(t => t.done).length;
        const sortedTasks = [...tasks].sort((a, b) => {
          if (a.time && b.time) return a.time.localeCompare(b.time);
          if (a.time) return -1;
          if (b.time) return 1;
          return 0;
        });
        const mood = d?.journal?.mood;
        const moodMap = { '행복': '😊', '평온': '😌', '보통': '🤔', '피곤': '😴', '우울': '😔' };
        const isPast = preview <= today;

        const addQuickTask = () => {
          const title = quickTaskInput.trim();
          if (!title) return;
          onUpdateDayData?.(preview, prev => ({
            ...(prev || {}),
            tasks: [...((prev?.tasks) || []), { id: `t${Date.now()}`, title, done: false, checkedAt: null, priority: false }],
          }));
          setQuickTaskInput('');
        };

        return (
          <div onClick={() => setPreview(null)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
            zIndex: 200, display: "flex", alignItems: "flex-end",
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: "var(--dm-bg)",
              border: "1px solid var(--dm-border2)",
              borderRadius: "24px 24px 0 0",
              width: "100%",
              maxHeight: "92vh",
              display: "flex", flexDirection: "column",
              boxShadow: "0 -12px 48px rgba(0,0,0,0.5)",
              animation: "slideUp 0.22s ease-out",
            }}>
              {/* 드래그 핸들 */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--dm-border2)' }} />
              </div>

              {/* 헤더 */}
              <div style={{ padding: "8px 20px 12px", display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: "var(--dm-text)" }}>
                    {formatKoreanDate(preview)}
                    {mood && <span style={{ fontSize: 18, marginLeft: 8 }}>{moodMap[mood] || ''}</span>}
                  </div>
                  {tasks.length > 0 && (
                    <div style={{ fontSize: 12, color: done === tasks.length ? '#4ADE80' : 'var(--dm-muted)', fontWeight: 700, marginTop: 2 }}>
                      {done === tasks.length ? '✓ 전체 완료' : `${done}/${tasks.length} 완료`}
                    </div>
                  )}
                </div>
                <button onClick={() => setPreview(null)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>✕</button>
              </div>

              {/* 완료율 바 */}
              {tasks.length > 0 && (
                <div style={{ height: 4, background: "var(--dm-row)", margin: '0 20px 0' }}>
                  <div style={{ height: "100%", transition: "width 0.3s",
                    background: done === tasks.length ? "#4ADE80" : "#4B6FFF",
                    width: `${Math.round(done / tasks.length * 100)}%`, borderRadius: 2 }} />
                </div>
              )}

              {/* 내용 스크롤 영역 */}
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 20px 0" }}>

                {/* 할일 목록 — 시간 있는/없는 구분 */}
                {(() => {
                  const timed = sortedTasks.filter(t => t.time);
                  const untimed = sortedTasks.filter(t => !t.time);
                  const renderTask = (t, i, arr) => (
                    <div key={t.id || i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0",
                      borderBottom: i < arr.length - 1 ? "1px solid var(--dm-row)" : "none" }}>
                      {/* 체크박스 */}
                      <div onClick={() => onToggleTaskForDate?.(preview, t.id)}
                        style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                          background: t.done ? "#4B6FFF" : "transparent",
                          border: t.done ? "none" : "2px solid var(--dm-border2)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "all 0.15s", cursor: 'pointer' }}>
                        {t.done && <span style={{ color: "#fff", fontSize: 12, fontWeight: 900 }}>✓</span>}
                      </div>
                      {/* 제목 or 인라인 편집 */}
                      {editingTaskId === t.id ? (
                        <input
                          autoFocus
                          value={editingTaskTitle}
                          onChange={e => setEditingTaskTitle(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              const title = editingTaskTitle.trim();
                              if (title) onUpdateDayData?.(preview, prev => ({ ...prev, tasks: (prev.tasks || []).map(tk => tk.id === t.id ? { ...tk, title } : tk) }));
                              setEditingTaskId(null);
                            }
                            if (e.key === 'Escape') setEditingTaskId(null);
                          }}
                          onBlur={() => {
                            const title = editingTaskTitle.trim();
                            if (title) onUpdateDayData?.(preview, prev => ({ ...prev, tasks: (prev.tasks || []).map(tk => tk.id === t.id ? { ...tk, title } : tk) }));
                            setEditingTaskId(null);
                          }}
                          maxLength={60}
                          style={{ ...S.input, flex: 1, marginBottom: 0, fontSize: 13, padding: '4px 8px' }}
                        />
                      ) : (
                        <div style={{ fontSize: 14, color: t.done ? "var(--dm-muted)" : "var(--dm-text)",
                          textDecoration: t.done ? "line-through" : "none", flex: 1, lineHeight: 1.4, display: 'flex', alignItems: 'center', gap: 4, opacity: t.done ? 0.6 : 1 }}>
                          {String(t.id || '').startsWith('gcal_') && <span style={{ fontSize: 12, opacity: 0.7, flexShrink: 0 }}>📅</span>}
                          {t.title}
                          {t.time && <span style={{ fontSize: 11, color: '#6C8EFF', fontWeight: 700, flexShrink: 0, background: 'rgba(108,142,255,.12)', padding: '1px 6px', borderRadius: 6 }}>{t.time}</span>}
                        </div>
                      )}
                      {/* 수정/삭제 버튼 */}
                      {editingTaskId !== t.id && (
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button onClick={() => { setEditingTaskId(t.id); setEditingTaskTitle(t.title); }}
                            style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}>✏️</button>
                          <button onClick={() => onUpdateDayData?.(preview, prev => ({ ...prev, tasks: (prev.tasks || []).map(tk => tk.id === t.id ? { ...tk, title: '' } : tk) }))}
                            style={{ background: 'transparent', border: 'none', color: '#F87171', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}>🗑</button>
                        </div>
                      )}
                    </div>
                  );
                  return (
                    <>
                      {timed.length > 0 && (
                        <>
                          <div style={{ fontSize: 10, color: '#6C8EFF', fontWeight: 900, padding: '4px 0 2px', letterSpacing: 0.5 }}>⏰ 시간 일정</div>
                          {timed.map((t, i) => renderTask(t, i, timed))}
                        </>
                      )}
                      {timed.length > 0 && untimed.length > 0 && (
                        <div style={{ borderTop: '1px dashed var(--dm-border)', margin: '8px 0 4px' }} />
                      )}
                      {untimed.length > 0 && (
                        <>
                          {timed.length > 0 && <div style={{ fontSize: 10, color: 'var(--dm-muted)', fontWeight: 700, padding: '2px 0' }}>할일</div>}
                          {untimed.map((t, i) => renderTask(t, i, untimed))}
                        </>
                      )}
                    </>
                  );
                })()}

                {/* 할일 빠른 추가 — 날짜 제한 없이 항상 표시 */}
                <div style={{ display: 'flex', gap: 8, marginTop: tasks.length > 0 ? 10 : 0, marginBottom: 4 }}>
                  <input
                    value={quickTaskInput}
                    onChange={e => setQuickTaskInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addQuickTask()}
                    placeholder={tasks.length === 0 ? "할일을 추가해보세요..." : "+ 할일 추가..."}
                    maxLength={60}
                    style={{ ...S.input, flex: 1, marginBottom: 0, fontSize: 13, padding: '8px 12px' }}
                  />
                  <button onClick={addQuickTask}
                    style={{ padding: '8px 14px', borderRadius: 10, background: 'rgba(108,142,255,.15)', border: '1.5px solid rgba(108,142,255,.3)', color: '#6C8EFF', fontWeight: 900, cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>
                    추가
                  </button>
                </div>

                {/* 메모 — 인라인 편집 */}
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--dm-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ fontSize: 11, color: "#6C8EFF", fontWeight: 900 }}>📝 메모</div>
                    {!previewMemoEdit ? (
                      <button onClick={() => setPreviewMemoEdit(true)}
                        style={{ fontSize: 11, color: '#6C8EFF', background: 'transparent', border: 'none', cursor: 'pointer', padding: '1px 6px', fontWeight: 700 }}>✏️ 편집</button>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { onUpdateDayData?.(preview, prev => ({ ...prev, memo: previewMemoDraft })); setPreviewMemoEdit(false); }}
                          style={{ fontSize: 11, color: '#4ADE80', background: 'transparent', border: 'none', cursor: 'pointer', padding: '1px 6px', fontWeight: 900 }}>저장</button>
                        <button onClick={() => { setPreviewMemoDraft(d?.memo ?? ''); setPreviewMemoEdit(false); }}
                          style={{ fontSize: 11, color: 'var(--dm-muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '1px 6px', fontWeight: 700 }}>취소</button>
                      </div>
                    )}
                  </div>
                  {previewMemoEdit ? (
                    <textarea
                      autoFocus
                      value={previewMemoDraft}
                      onChange={e => setPreviewMemoDraft(e.target.value)}
                      rows={4}
                      maxLength={1200}
                      style={{ ...S.input, width: '100%', resize: 'none', lineHeight: 1.6, fontSize: 13, boxSizing: 'border-box' }}
                    />
                  ) : (
                    <div style={{ fontSize: 13, color: previewMemoDraft.trim() ? "var(--dm-sub)" : 'var(--dm-muted)', lineHeight: 1.65,
                      background: "var(--dm-row)", borderRadius: 10, padding: "10px 12px", whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {previewMemoDraft.trim() || '메모 없음'}
                    </div>
                  )}
                </div>

                {/* 일기 — 전문 + 자세히 버튼 */}
                {d?.journal?.body?.trim() && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--dm-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ fontSize: 11, color: "#A78BFA", fontWeight: 900 }}>
                        📖 일기 {mood ? `· ${moodMap[mood] || ''} ${mood}` : ''}
                      </div>
                      <button onClick={() => { onOpenDate(preview); setPreview(null); }}
                        style={{ fontSize: 11, color: '#A78BFA', background: 'transparent', border: 'none', cursor: 'pointer', padding: '1px 6px', fontWeight: 700 }}>자세히 →</button>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--dm-sub)", lineHeight: 1.65,
                      background: "var(--dm-row)", borderRadius: 10, padding: "10px 12px",
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {d.journal.body.trim()}
                    </div>
                  </div>
                )}

                <div style={{ height: 16 }} />
              </div>

              {/* 하단 버튼 */}
              <div style={{ display: "flex", gap: 10, padding: "12px 20px 100px", borderTop: "1px solid var(--dm-border)" }}>
                <button onClick={() => setPreview(null)}
                  style={{ flex: 1, padding: 13, borderRadius: 12, background: "var(--dm-row)", border: "1px solid var(--dm-border2)", color: "var(--dm-text)", fontWeight: 900, cursor: "pointer", fontSize: 14 }}>
                  닫기
                </button>
                <button onClick={() => { onOpenDate(preview); setPreview(null); }}
                  style={{ flex: 2, padding: 13, borderRadius: 12, background: "linear-gradient(135deg,#4B6FFF,#818cf8)", border: "none", color: "#fff", fontWeight: 900, cursor: "pointer", fontSize: 15, boxShadow: "0 4px 16px rgba(75,111,255,.4)" }}>
                  자세히보기 →
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
