import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const tools = [
  {
    name: 'add_task',
    description: '오늘 할일을 추가합니다',
    input_schema: {
      type: 'object',
      properties: { title: { type: 'string', description: '할일 제목' } },
      required: ['title'],
    },
  },
  {
    name: 'complete_task',
    description: '할일을 완료 처리합니다',
    input_schema: {
      type: 'object',
      properties: { number: { type: 'number', description: '할일 번호 (1부터 시작)' } },
      required: ['number'],
    },
  },
  {
    name: 'delete_task',
    description: '할일을 삭제합니다',
    input_schema: {
      type: 'object',
      properties: { number: { type: 'number', description: '할일 번호 (1부터 시작)' } },
      required: ['number'],
    },
  },
  {
    name: 'add_memo',
    description: '오늘 메모에 내용을 추가합니다',
    input_schema: {
      type: 'object',
      properties: { content: { type: 'string', description: '추가할 메모 내용' } },
      required: ['content'],
    },
  },
  {
    name: 'set_tasks',
    description: '오늘 할일 목록을 새로 설정합니다 (기존 할일 전체 교체)',
    input_schema: {
      type: 'object',
      properties: {
        titles: { type: 'array', items: { type: 'string' }, description: '할일 제목 배열' },
      },
      required: ['titles'],
    },
  },
  {
    name: 'toggle_habit',
    description: '습관을 완료 또는 취소 처리합니다',
    input_schema: {
      type: 'object',
      properties: {
        habit_name: { type: 'string', description: '습관 이름 (부분 일치 가능)' },
        done: { type: 'boolean', description: '완료 여부 (true=완료, false=취소)' },
      },
      required: ['habit_name', 'done'],
    },
  },
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { message, history = [], context = {} } = req.body || {};
  if (!message) return res.status(400).json({ error: '메시지가 없어요' });

  const { tasks = [], memo = '', habits = [], habitChecks = {}, userName = '사용자' } = context;
  const today = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
  const filledTasks = tasks.filter(t => t.title?.trim());
  const doneCount = filledTasks.filter(t => t.done).length;

  const systemPrompt = `당신은 DayMate 앱의 AI 어시스턴트입니다. ${userName}님의 하루 관리를 돕습니다.
한국어로 친근하고 간결하게 답변하세요. 불필요한 서두 없이 바로 답변하세요.
할일 추가/완료/삭제, 메모 추가, 습관 완료/취소 등을 요청하면 도구를 사용해 실제로 처리해주세요.

오늘(${today}) 현황:
- 할일(${doneCount}/${filledTasks.length} 완료): ${filledTasks.length === 0 ? '없음' : filledTasks.map((t, i) => `${i+1}. ${t.title}[${t.done ? '완료' : '미완료'}]`).join(', ')}
- 메모: ${memo?.trim() || '없음'}
- 습관: ${habits.length === 0 ? '없음' : habits.map(h => `${h.name}[${habitChecks[h.id] ? '완료' : '미완료'}]`).join(', ')}`;

  try {
    const messages = [
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages,
    });

    // tool use 처리
    const actions = [];
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

    for (const block of toolUseBlocks) {
      actions.push({ type: block.name, ...block.input, id: block.id });
    }

    // tool 사용했으면 결과 포함해서 최종 응답
    let reply = '';
    if (toolUseBlocks.length > 0) {
      const toolResults = toolUseBlocks.map(b => ({
        type: 'tool_result',
        tool_use_id: b.id,
        content: '처리됨',
      }));

      const followUp = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: systemPrompt,
        tools,
        messages: [
          ...messages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        ],
      });
      reply = followUp.content.find(b => b.type === 'text')?.text || '완료했어요.';
    } else {
      reply = response.content.find(b => b.type === 'text')?.text || '죄송해요, 다시 말씀해주세요.';
    }

    res.status(200).json({ reply, actions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
