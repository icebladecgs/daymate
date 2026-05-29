import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const callHaikuJSON = async (prompt, maxTokens = 1200) => {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = response.content.find(b => b.type === 'text')?.text || '{}';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
};

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
  {
    name: 'add_someday',
    description: '언젠가 할일 목록에 항목을 추가합니다',
    input_schema: {
      type: 'object',
      properties: { title: { type: 'string', description: '언젠가 할일 제목' } },
      required: ['title'],
    },
  },
  {
    name: 'delete_someday',
    description: '언젠가 할일 목록에서 항목을 삭제합니다',
    input_schema: {
      type: 'object',
      properties: { number: { type: 'number', description: '언젠가 할일 번호 (1부터 시작)' } },
      required: ['number'],
    },
  },
  {
    name: 'move_someday_to_task',
    description: '언젠가 할일 항목을 오늘 할일로 이동합니다',
    input_schema: {
      type: 'object',
      properties: { number: { type: 'number', description: '언젠가 할일 번호 (1부터 시작)' } },
      required: ['number'],
    },
  },
  {
    name: 'move_task_to_someday',
    description: '오늘 할일 항목을 언젠가 할일로 내립니다',
    input_schema: {
      type: 'object',
      properties: { number: { type: 'number', description: '할일 번호 (1부터 시작)' } },
      required: ['number'],
    },
  },
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // ?action=life-coach → 인생 코칭 액션플랜 생성
  if (req.query.action === 'life-coach') {
    const { answers = [], userName = '사용자' } = req.body || {};
    if (!answers.length) return res.status(400).json({ error: 'answers 필요' });

    const qnaText = answers.map((a, i) => `Q${i+1}. ${a.question}\nA: ${a.answer}`).join('\n\n');

    const prompt = `너는 ${userName}님의 인생 코치야. 따뜻하지만 직설적이고, 핑계는 안 받아주는 스타일이야. 아첨하지 않고, 진짜 필요한 말을 해주는 코치야.

아래는 ${userName}님이 직접 답한 인생 질문들이야:

${qnaText}

이 답변을 바탕으로 아래 JSON 형식으로 응답해줘. JSON만 출력하고 다른 텍스트는 없어야 해.

{
  "keywords": ["이 사람을 한마디로 표현하는 핵심 키워드 3개"],
  "message": "${userName}님에게 코치로서 직접 쓰는 메시지. 3-4문장. 잘못된 점은 직언으로 혼내고, 강점은 인정하고, 할 수 있다는 확신을 줘. '${userName}님,' 으로 시작해. 존댓말.",
  "analysis": "현재 상태의 핵심 문제를 날카롭게 1-2문장으로 짚어줘. 듣기 좋은 말 말고 진짜 문제.",
  "goals": ["이번 달 반드시 해야 할 목표 3개. 뜬구름 잡는 말 말고 구체적으로."],
  "habits": ["매일 해야 할 습관 2-3개. 짧고 명확하게. 이 사람 상황에 딱 맞는 것."],
  "tasks": ["오늘 당장 할 수 있는 첫 걸음 3개. 아주 작고 구체적으로. 오늘 안에 가능한 것만."]
}`;

    try {
      return res.status(200).json(await callHaikuJSON(prompt, 1200));
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ?action=monthly-review → 월간 AI 코치 리뷰
  if (req.query.action === 'monthly-review') {
    const { monthLabel, completionRate, filledDaysCount, perfectDaysCount, bestStreak, habitStats = [], userName = '사용자' } = req.body || {};

    const habitLines = habitStats.length > 0
      ? habitStats.map(h => `  - ${h.icon || ''} ${h.name}: ${h.rate}% 달성`).join('\n')
      : '  (등록된 습관 없음)';

    const prompt = `당신은 삶의 코치입니다. 아래 ${userName}님의 ${monthLabel} 월간 기록을 보고 솔직하고 실용적인 피드백을 주세요.

[${monthLabel} 기록]
- 기록한 날: ${filledDaysCount}일
- 완벽한 날(할일+체크인+일기 모두): ${perfectDaysCount}일
- 할일 완료율: ${completionRate}%
- 최고 연속: ${bestStreak}일

[습관 달성률]
${habitLines}

아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "grade": "이 달 전반적인 등급 (S/A/B/C/D)",
  "summary": "${userName}님에게 이 달을 총평하는 한 문장. 칭찬이든 쓴소리든 솔직하게.",
  "strengths": ["잘한 점 1~2가지. 구체적으로."],
  "improvements": ["개선할 점 1~2가지. 뜬구름 말고 이 수치 기반으로."],
  "nextMonth": ["다음 달에 집중할 것 2가지. 아주 구체적으로."]
}`;

    try {
      return res.status(200).json(await callHaikuJSON(prompt, 800));
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ?action=fortune → 오늘의 운세
  if (req.query.action === 'fortune') {
    const { birthDate, birthTime, userName = '사용자', today } = req.body || {};
    if (!birthDate) return res.status(400).json({ error: 'birthDate 필요' });

    // 날짜 + 생년월일 기반 결정론적 점수 산출 (매일 다른 값)
    const seedStr = `${today}_${birthDate}`;
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = ((hash << 5) - hash + seedStr.charCodeAt(i)) | 0;
    }
    const rng = (offset) => {
      let h = ((hash + offset) ^ (hash >> 16)) >>> 0;
      h = Math.imul(h, 0x9e3779b9) >>> 0;
      return (h >>> 0) / 0xffffffff;
    };
    const scores = {
      overall:  Math.floor(rng(1) * 5) + 1,
      money:    Math.floor(rng(2) * 5) + 1,
      health:   Math.floor(rng(3) * 5) + 1,
      relation: Math.floor(rng(4) * 5) + 1,
      luckyNumber: Math.floor(rng(5) * 99) + 1,
    };

    const prompt = `당신은 전문 역술가입니다. 아래 운세 점수를 바탕으로 오늘의 운세 메시지를 작성해주세요.

생년월일: ${birthDate}
출생시간: ${birthTime || '미상'}
오늘 날짜: ${today}
이름: ${userName}

오늘의 운세 점수 (이 수치는 고정값입니다. 절대 바꾸지 마세요):
- 전체운: ${scores.overall}/5
- 금전운: ${scores.money}/5
- 건강운: ${scores.health}/5
- 인간관계: ${scores.relation}/5

아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "overall": ${scores.overall},
  "money": ${scores.money},
  "health": ${scores.health},
  "relation": ${scores.relation},
  "message": "오늘 하루 전반적인 운세 메시지 (3~4문장, 위 점수에 맞게 구체적이고 실용적으로)",
  "advice": "오늘의 핵심 조언 한 줄",
  "luckyColor": "행운의 색",
  "luckyNumber": ${scores.luckyNumber}
}`;

    try {
      const data = await callHaikuJSON(prompt, 600);
      return res.status(200).json({ ...data, ...scores });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ?action=saju → 평생 사주 분석
  if (req.query.action === 'saju') {
    const { birthDate, birthTime, userName = '사용자' } = req.body || {};
    if (!birthDate) return res.status(400).json({ error: 'birthDate 필요' });

    const prompt = `당신은 전문 사주 역술가입니다. 아래 생년월일시를 바탕으로 사주팔자를 분석해주세요.

생년월일: ${birthDate}
출생시간: ${birthTime || '미상'}
이름: ${userName}

아래 JSON 형식으로만 응답하세요:
{
  "pillars": "사주팔자 (년주·월주·일주·시주 천간지지)",
  "dayMaster": "일간 (예: 갑목, 경금 등)",
  "personality": "성격 및 기질 분석 (3~4문장)",
  "strengths": ["강점 3가지"],
  "weaknesses": ["약점 2가지"],
  "career": "적합한 직업/분야 (2~3문장)",
  "wealth": "재물운 분석 (2~3문장)",
  "health": "건강 주의사항 (2~3문장)",
  "lifeAdvice": "인생 전반적인 조언 (3~4문장)",
  "luckyDirections": ["행운의 방향 2가지"],
  "luckyColors": ["행운의 색 2가지"]
}`;

    try {
      return res.status(200).json(await callHaikuJSON(prompt, 1200));
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ?action=tojeong → 토정비결
  if (req.query.action === 'tojeong') {
    const { birthDate, birthTime, userName = '사용자', year } = req.body || {};
    if (!birthDate) return res.status(400).json({ error: 'birthDate 필요' });

    const prompt = `당신은 조선시대 토정비결 스타일의 역술가입니다. ${year || new Date().getFullYear()}년 한 해 운세를 봐주세요.

생년월일: ${birthDate}
출생시간: ${birthTime || '미상'}
이름: ${userName}
대상 연도: ${year || new Date().getFullYear()}년

토정비결 특유의 고풍스럽고 함축적인 문체로, 아래 JSON 형식으로만 응답하세요:
{
  "hexagram": "괘 이름 (예: 수화기제, 건위천 등)",
  "summary": "올해 총운 한 줄 요약",
  "overall": "총운 (3~4문장, 토정비결 스타일로)",
  "monthly": [
    {"month": 1, "fortune": "1월 운세 한 줄"},
    {"month": 2, "fortune": "2월 운세 한 줄"},
    {"month": 3, "fortune": "3월 운세 한 줄"},
    {"month": 4, "fortune": "4월 운세 한 줄"},
    {"month": 5, "fortune": "5월 운세 한 줄"},
    {"month": 6, "fortune": "6월 운세 한 줄"},
    {"month": 7, "fortune": "7월 운세 한 줄"},
    {"month": 8, "fortune": "8월 운세 한 줄"},
    {"month": 9, "fortune": "9월 운세 한 줄"},
    {"month": 10, "fortune": "10월 운세 한 줄"},
    {"month": 11, "fortune": "11월 운세 한 줄"},
    {"month": 12, "fortune": "12월 운세 한 줄"}
  ],
  "caution": "올해 주의할 점 (2문장)",
  "advice": "올해의 핵심 조언 한 줄"
}`;

    try {
      return res.status(200).json(await callHaikuJSON(prompt, 1500));
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ?action=invest-content → 투자 기록 인사이트 생성
  if (req.query.action === 'invest-content') {
    const { log } = req.body || {};
    if (!log) return res.status(400).json({ error: 'log 데이터 필요' });

    const actionMap = { BUY: '매수', HOLD: '보유', SELL: '매도' };
    const reviewLine = log.review?.result
      ? `복기 결과: ${log.review.result === 'WIN' ? '✅ 맞음' : log.review.result === 'LOSE' ? '❌ 틀림' : '❓ 모름'}${log.review.note ? ` — ${log.review.note}` : ''}`
      : '복기 미완료';

    const prompt = `다음 투자 기록을 바탕으로 인사이트 있는 짧은 글을 작성해줘.

투자 기록:
- 자산: ${log.assetLabel || log.asset} (${log.asset})
- 액션: ${actionMap[log.action] || log.action}
- 날짜: ${log.date}
- 금액: ${log.amountKRW ? `₩${Number(log.amountKRW).toLocaleString()}` : ''}${log.amountUSD ? ` / $${log.amountUSD}` : ''}
- 판단 이유: ${log.reason}
- 시장 메모: ${log.marketNote || '없음'}
- 확신도: ${log.confidence}/5
- ${reviewLine}

아래 형식으로 작성해줘:

📌 제목: [한 줄 제목]

1️⃣ 시장 상황
[당시 시장 맥락 2-3문장]

2️⃣ 투자 판단
[이 판단의 논리와 근거 2-3문장]

3️⃣ 인사이트
[이 기록에서 배울 수 있는 점 2-3문장]

한국어로, 500자 이내로 간결하게.`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      });
      const content = response.content.find(b => b.type === 'text')?.text || '';
      return res.status(200).json({ content });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  const { message, history = [], context = {} } = req.body || {};
  if (!message) return res.status(400).json({ error: '메시지가 없어요' });

  const { tasks = [], memo = '', habits = [], habitChecks = {}, someday = [], userName = '사용자' } = context;
  const today = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
  const filledTasks = tasks.filter(t => t.title?.trim());
  const doneCount = filledTasks.filter(t => t.done).length;

  const systemPrompt = `당신은 DayMate 앱의 AI 어시스턴트입니다. ${userName}님의 하루 관리를 돕습니다.
한국어로 친근하고 간결하게 답변하세요. 불필요한 서두 없이 바로 답변하세요.
할일 추가/완료/삭제, 메모 추가, 습관 완료/취소, 언젠가 할일 추가/삭제/이동 등을 요청하면 도구를 사용해 실제로 처리해주세요.

오늘(${today}) 현황:
- 할일(${doneCount}/${filledTasks.length} 완료): ${filledTasks.length === 0 ? '없음' : filledTasks.map((t, i) => `${i+1}. ${t.title}[${t.done ? '완료' : '미완료'}]`).join(', ')}
- 메모: ${memo?.trim() || '없음'}
- 습관: ${habits.length === 0 ? '없음' : habits.map(h => `${h.name}[${habitChecks[h.id] ? '완료' : '미완료'}]`).join(', ')}
- 언젠가 할일: ${someday.length === 0 ? '없음' : someday.map((s, i) => `${i+1}. ${s.title}`).join(', ')}`;

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
