import { useState, useEffect, useRef } from "react";
import { toDateStr, formatKoreanDate } from "../utils/date.js";
import { newDay } from "../data/model.js";
import S from "../styles.js";
import MemoTimeline, { genMemoId } from "../components/MemoTimeline.jsx";

function shiftDate(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

function genId() {
  return `dp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function TaskRow({ task, onToggle, onSave, onDelete }) {
  const [title, setTitle] = useState(task.title);
  const prevTitle = useRef(task.title);

  useEffect(() => {
    if (task.title !== prevTitle.current) {
      setTitle(task.title);
      prevTitle.current = task.title;
    }
  }, [task.title]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--dm-row)" }}>
      <div
        onClick={() => onToggle(task.id)}
        style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
          border: task.done ? "none" : "2px solid #3A4260",
          background: task.done ? "#4B6FFF" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        }}
      >
        {task.done && <span style={{ color: "#fff", fontSize: 12, fontWeight: 900 }}>✓</span>}
      </div>
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        onBlur={() => { if (title !== task.title) onSave(task.id, title); }}
        onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
        placeholder="할 일 입력"
        style={{
          ...S.input, flex: 1, marginBottom: 0, padding: "7px 10px", fontSize: 14,
          textDecoration: task.done ? "line-through" : "none",
          color: task.done ? "var(--dm-muted)" : "var(--dm-text)",
          background: "transparent", border: "1px solid transparent",
        }}
        onFocus={e => { e.target.style.background = "var(--dm-input)"; e.target.style.border = "1.5px solid var(--dm-border)"; }}
      />
      <button
        onClick={() => onDelete(task.id)}
        style={{ background: "transparent", border: "none", color: "#F87171", cursor: "pointer", fontSize: 18, flexShrink: 0, lineHeight: 1, padding: "0 2px" }}
      >✕</button>
    </div>
  );
}

function ListItem({ item, onSave, onDelete, placeholder }) {
  const [text, setText] = useState(item.text);
  const prevText = useRef(item.text);

  useEffect(() => {
    if (item.text !== prevText.current) {
      setText(item.text);
      prevText.current = item.text;
    }
  }, [item.text]);

  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--dm-muted)", flexShrink: 0, marginTop: 1 }} />
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={() => { if (text !== item.text) onSave(item.id, text); }}
        onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
        placeholder={placeholder}
        style={{ ...S.input, flex: 1, marginBottom: 0, padding: "8px 10px", fontSize: 13, background: "transparent", border: "1px solid transparent" }}
        onFocus={e => { e.target.style.background = "var(--dm-input)"; e.target.style.border = "1.5px solid var(--dm-border)"; }}
      />
      <button
        onClick={() => onDelete(item.id)}
        style={{ background: "transparent", border: "none", color: "#F87171", cursor: "pointer", fontSize: 16, flexShrink: 0, lineHeight: 1, padding: "0 2px" }}
      >✕</button>
    </div>
  );
}

function SectionCard({ icon, title, onAdd, addLabel = "+ 추가", children, emptyMsg }) {
  return (
    <div style={{ ...S.card, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: "var(--dm-text)" }}>{icon} {title}</div>
        {onAdd && (
          <button
            onClick={onAdd}
            style={{
              background: "rgba(75,111,255,0.12)", border: "1px solid rgba(75,111,255,0.3)",
              color: "#6C8EFF", borderRadius: 8, padding: "4px 10px", fontSize: 12,
              fontWeight: 900, cursor: "pointer", fontFamily: "inherit",
            }}
          >{addLabel}</button>
        )}
      </div>
      {children}
      {emptyMsg}
    </div>
  );
}

export default function DailyPage({ plans, setDayData, todayStr, onToggleMode }) {
  const [dateStr, setDateStr] = useState(todayStr);

  const dayData = plans[dateStr] || newDay(dateStr);
  const canGoNext = dateStr < todayStr;
  const tasks = dayData.tasks || [];
  const doneTasks = tasks.filter(t => t.done && t.title.trim());
  const memos = dayData.memos?.length ? dayData.memos : (dayData.memo?.trim() ? [{ id: `legacy_${dateStr}`, text: dayData.memo.trim(), createdAt: '' }] : []);
  const wins = dayData.wins || [];
  const regrets = dayData.regrets || [];
  const nextDayItems = dayData.nextDay || [];

  const addMemo = (text, time) => {
    setDayData(dateStr, prev => ({
      ...prev,
      memos: [...(prev.memos || []), { id: genMemoId(), text, createdAt: time }],
    }));
  };
  const updateMemo = (id, text) => {
    setDayData(dateStr, prev => ({
      ...prev,
      memos: (prev.memos || []).map(m => m.id === id ? { ...m, text } : m),
    }));
  };
  const deleteMemo = (id) => {
    setDayData(dateStr, prev => ({
      ...prev,
      memos: (prev.memos || []).filter(m => m.id !== id),
    }));
  };

  const toggleTask = (taskId) => {
    setDayData(dateStr, prev => ({
      ...prev,
      tasks: (prev.tasks || []).map(t =>
        t.id === taskId ? { ...t, done: !t.done, checkedAt: !t.done ? new Date().toISOString() : null } : t
      ),
    }));
  };

  const saveTaskTitle = (taskId, title) => {
    setDayData(dateStr, prev => ({
      ...prev,
      tasks: (prev.tasks || []).map(t => t.id === taskId ? { ...t, title } : t),
    }));
  };

  const addTask = () => {
    const newTask = { id: genId(), title: "", done: false, checkedAt: null, priority: false };
    setDayData(dateStr, prev => ({ ...prev, tasks: [...(prev.tasks || []), newTask] }));
  };

  const deleteTask = (taskId) => {
    setDayData(dateStr, prev => ({
      ...prev,
      tasks: (prev.tasks || []).filter(t => t.id !== taskId),
    }));
  };

  const addListItem = (field) => {
    setDayData(dateStr, prev => ({
      ...prev,
      [field]: [...(prev[field] || []), { id: genId(), text: "" }],
    }));
  };

  const saveListItem = (field, itemId, text) => {
    setDayData(dateStr, prev => ({
      ...prev,
      [field]: (prev[field] || []).map(item => item.id === itemId ? { ...item, text } : item),
    }));
  };

  const deleteListItem = (field, itemId) => {
    setDayData(dateStr, prev => ({
      ...prev,
      [field]: (prev[field] || []).filter(item => item.id !== itemId),
    }));
  };

  const navBtnStyle = {
    background: "var(--dm-card)", border: "1px solid var(--dm-border)",
    color: "var(--dm-text)", borderRadius: 8, padding: "7px 14px",
    fontSize: 14, cursor: "pointer", fontFamily: "inherit",
  };

  const empty = (msg) => (
    <div style={{ fontSize: 12, color: "var(--dm-muted)", textAlign: "center", padding: "10px 0", fontStyle: "italic" }}>
      {msg}
    </div>
  );

  return (
    <div style={S.content}>
      {/* 상단 바 */}
      <div style={S.topbar}>
        <div>
          <div style={S.title}>오늘의 페이지</div>
          <div style={S.sub}>{formatKoreanDate(dateStr)}</div>
        </div>
        <button
          onClick={onToggleMode}
          style={{
            ...S.btnGhost, width: "auto", marginTop: 0, padding: "5px 12px",
            borderRadius: 10, fontSize: 12, display: "flex", flexDirection: "column",
            alignItems: "center", gap: 1,
          }}
        >
          <span>🏠</span>
          <span style={{ fontSize: 9, color: "var(--dm-muted)" }}>대시보드</span>
        </button>
      </div>

      {/* 날짜 네비게이션 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px 0" }}>
        <button style={navBtnStyle} onClick={() => setDateStr(shiftDate(dateStr, -1))}>◀</button>
        <button
          onClick={() => setDateStr(todayStr)}
          style={{
            background: dateStr === todayStr ? "rgba(75,111,255,0.15)" : "transparent",
            border: dateStr === todayStr ? "1px solid rgba(75,111,255,0.4)" : "1px solid transparent",
            color: dateStr === todayStr ? "#6C8EFF" : "var(--dm-muted)",
            borderRadius: 8, padding: "5px 16px", fontSize: 12, fontWeight: 900, cursor: "pointer",
          }}
        >오늘</button>
        <button
          style={{ ...navBtnStyle, color: canGoNext ? "var(--dm-text)" : "var(--dm-muted)", cursor: canGoNext ? "pointer" : "default" }}
          onClick={() => canGoNext && setDateStr(shiftDate(dateStr, 1))}
          disabled={!canGoNext}
        >▶</button>
      </div>

      <div style={{ padding: "10px 0 0" }}>
        {/* 1. 메모 */}
        <SectionCard icon="📝" title="메모">
          <MemoTimeline
            memos={memos}
            onAdd={addMemo}
            onUpdate={updateMemo}
            onDelete={deleteMemo}
            placeholder="메모 입력 후 Enter (시간 자동 기록)"
          />
        </SectionCard>

        {/* 2. 기획한 일 */}
        <SectionCard icon="📋" title="기획한 일" onAdd={addTask}>
          {tasks.length === 0 && empty("할 일을 추가해보세요")}
          {tasks.map(task => (
            <TaskRow key={task.id} task={task} onToggle={toggleTask} onSave={saveTaskTitle} onDelete={deleteTask} />
          ))}
        </SectionCard>

        {/* 3. 한 일 */}
        <SectionCard icon="✅" title="한 일">
          {doneTasks.length === 0 && empty("체크된 항목이 없어요")}
          {doneTasks.map(task => (
            <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--dm-row)" }}>
              <div
                onClick={() => toggleTask(task.id)}
                style={{ width: 22, height: 22, borderRadius: 6, background: "#4B6FFF", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
              >
                <span style={{ color: "#fff", fontSize: 12, fontWeight: 900 }}>✓</span>
              </div>
              <span style={{ fontSize: 14, color: "var(--dm-muted)", textDecoration: "line-through", flex: 1 }}>{task.title}</span>
            </div>
          ))}
        </SectionCard>

        {/* 4. 잘한 일 */}
        <SectionCard icon="🌟" title="잘한 일" onAdd={() => addListItem("wins")}>
          {wins.length === 0 && empty("오늘 잘한 일을 기록해보세요")}
          {wins.map(item => (
            <ListItem key={item.id} item={item}
              onSave={(id, text) => saveListItem("wins", id, text)}
              onDelete={id => deleteListItem("wins", id)}
              placeholder="잘한 일을 입력하세요"
            />
          ))}
        </SectionCard>

        {/* 5. 아쉬운 점 */}
        <SectionCard icon="💭" title="아쉬운 점" onAdd={() => addListItem("regrets")}>
          {regrets.length === 0 && empty("아쉬운 점을 솔직하게 적어보세요")}
          {regrets.map(item => (
            <ListItem key={item.id} item={item}
              onSave={(id, text) => saveListItem("regrets", id, text)}
              onDelete={id => deleteListItem("regrets", id)}
              placeholder="아쉬운 점을 입력하세요"
            />
          ))}
        </SectionCard>

        {/* 6. 내일 다짐 */}
        <SectionCard icon="🚀" title="내일 다짐" onAdd={() => addListItem("nextDay")}>
          {nextDayItems.length === 0 && empty("내일의 나에게 전할 다짐을 적어보세요")}
          {nextDayItems.map(item => (
            <ListItem key={item.id} item={item}
              onSave={(id, text) => saveListItem("nextDay", id, text)}
              onDelete={id => deleteListItem("nextDay", id)}
              placeholder="내일 다짐을 입력하세요"
            />
          ))}
        </SectionCard>
      </div>
    </div>
  );
}
