import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { message, history = [], context = {} } = req.body || {};
  if (!message) return res.status(400).json({ error: '메시지가 없어요' });

  const { tasks = [], memo = '', scores = {}, habits = [], userName = '사용자' } = context;

  const today = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
  const filledTasks = tasks.filter(t => t.title?.trim());
  const doneCount = filledTasks.filter(t => t.done).length;

  const systemPrompt = `당신은 DayMate 앱의 AI 어시스턴트입니다. ${userName}님의 하루 관리를 돕습니다.
한국어로 친근하고 간결하게 답변하세요. 불필요한 서두 없이 바로 답변하세요.

오늘(${today}) 현황:
- 할일: ${filledTasks.length === 0 ? '없음' : filledTasks.map((t, i) => `${i+1}. ${t.title}(${t.done ? '완료' : '미완료'})`).join(', ')}
- 완료: ${doneCount}/${filledTasks.length}
- 메모: ${memo?.trim() || '없음'}
- 습관: ${habits.length === 0 ? '없음' : habits.map(h => h.name).join(', ')}`;

  try {
    const messages = [
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const reply = response.content.find(b => b.type === 'text')?.text || '죄송해요, 다시 말씀해주세요.';
    res.status(200).json({ reply });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
