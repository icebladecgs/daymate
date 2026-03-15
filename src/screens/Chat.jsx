import { useEffect, useRef, useState } from "react";
import S from "../styles.js";

export default function Chat({ user, todayData, habits, scores, onBack }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: `안녕하세요 ${user?.name || ''}님! 오늘 하루 어떻게 도와드릴까요?` }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');

    const newMessages = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const history = newMessages.slice(0, -1); // 마지막 유저 메시지 제외
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: history.slice(-10), // 최근 10개만 전송
          context: {
            tasks: todayData?.tasks || [],
            memo: todayData?.memo || '',
            habits: habits || [],
            scores: scores || {},
            userName: user?.name || '사용자',
          },
        }),
      });
      const data = await res.json();
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: '오류가 발생했어요. 다시 시도해주세요.' }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '네트워크 오류가 발생했어요.' }]);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div style={{ ...S.content, display: 'flex', flexDirection: 'column' }}>
      {/* 상단 바 */}
      <div style={S.topbar}>
        <button onClick={onBack} style={{ ...S.btnGhost, width: 56, marginTop: 0, padding: 10 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={S.title}>AI 어시스턴트</div>
          <div style={S.sub}>DayMate Claude</div>
        </div>
        <button onClick={() => setMessages([{ role: 'assistant', content: `안녕하세요 ${user?.name || ''}님! 오늘 하루 어떻게 도와드릴까요?` }])}
          style={{ ...S.btnGhost, width: 56, marginTop: 0, padding: 10, fontSize: 18 }}>↺</button>
      </div>

      {/* 메시지 목록 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.role === 'assistant' && (
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#4B6FFF,#6C8EFF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, marginRight: 8, marginTop: 2 }}>
                ✦
              </div>
            )}
            <div style={{
              maxWidth: '75%',
              padding: '10px 14px',
              borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              background: m.role === 'user' ? 'linear-gradient(135deg,#4B6FFF,#6C8EFF)' : 'var(--dm-card)',
              color: m.role === 'user' ? '#fff' : 'var(--dm-text)',
              fontSize: 14,
              lineHeight: 1.6,
              border: m.role === 'assistant' ? '1.5px solid var(--dm-border)' : 'none',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#4B6FFF,#6C8EFF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>✦</div>
            <div style={{ padding: '10px 14px', borderRadius: '18px 18px 18px 4px', background: 'var(--dm-card)', border: '1.5px solid var(--dm-border)', fontSize: 14, color: 'var(--dm-muted)' }}>
              ···
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div style={{ padding: '10px 14px 20px', borderTop: '1px solid var(--dm-border)', display: 'flex', gap: 8, background: 'var(--dm-bg)' }}>
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="메시지를 입력하세요..."
          style={{
            ...S.input,
            flex: 1,
            resize: 'none',
            borderRadius: 20,
            padding: '10px 16px',
            fontSize: 14,
            lineHeight: 1.5,
            maxHeight: 100,
            overflow: 'auto',
          }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading}
          style={{
            width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer', flexShrink: 0, alignSelf: 'flex-end',
            background: input.trim() && !loading ? 'linear-gradient(135deg,#4B6FFF,#6C8EFF)' : 'var(--dm-input)',
            color: input.trim() && !loading ? '#fff' : 'var(--dm-muted)',
            fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
