import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { log } = req.body;
  if (!log) return res.status(400).json({ error: "log 데이터 필요" });

  const actionMap = { BUY: "매수", HOLD: "보유", SELL: "매도" };
  const reviewLine = log.review?.result
    ? `복기 결과: ${log.review.result === "WIN" ? "✅ 맞음" : log.review.result === "LOSE" ? "❌ 틀림" : "❓ 모름"}${log.review.note ? ` — ${log.review.note}` : ""}`
    : "복기 미완료";

  const prompt = `다음 투자 기록을 바탕으로 인사이트 있는 짧은 글을 작성해줘.

투자 기록:
- 자산: ${log.assetLabel || log.asset} (${log.asset})
- 액션: ${actionMap[log.action] || log.action}
- 날짜: ${log.date}
- 금액: ${log.amountKRW ? `₩${Number(log.amountKRW).toLocaleString()}` : ""}${log.amountUSD ? ` / $${log.amountUSD}` : ""}
- 판단 이유: ${log.reason}
- 시장 메모: ${log.marketNote || "없음"}
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
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });
    const content = response.content.find(b => b.type === "text")?.text || "";
    res.status(200).json({ content });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
