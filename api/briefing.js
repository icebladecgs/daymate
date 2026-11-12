// Vercel Cron — 📰 오늘의 브리핑 만들기 (2026-11-12, 매일 06:00 KST = 21:00 UTC, Pro 플랜이라 정시 실행)
// 언론사 RSS(제목·앞부분만) + 시장 지표(실제 값) + 오늘 경제 일정 → AI가 자기 말로 정리 → briefings/{날짜}에 저장.
// 화면은 src/screens/Briefing.jsx가 이 문서를 읽기만 한다(보안 규칙: 로그인한 사람 읽기, 쓰기는 서버만).
// 원칙·지시문·형식은 src/utils/briefing.js 한 곳.
import Anthropic from '@anthropic-ai/sdk';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  BRIEFING_FEEDS, INDICATORS, BRIEFING_SYSTEM, BRIEFING_SCHEMA,
  parseRss, recentItems, briefingUserContent, normalizeBriefing, kstDateStr,
} from '../src/utils/briefing.js';
import { marketEventsOf } from '../src/utils/marketEvents.js';

export const BRIEFING_MODEL = 'claude-opus-5-5';
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; DayMateBriefing/1.0)' };

function getDb() {
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  return getFirestore();
}

async function fetchFeed(feed) {
  try {
    const r = await fetch(feed.url, { headers: UA, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return { feed, items: parseRss(await r.text()) };
  } catch (e) {
    console.error(`[briefing] feed failed ${feed.id}:`, e?.message);
    return { feed, items: [] };
  }
}

async function fetchIndicator(ind) {
  try {
    if (ind.upbit) {
      const r = await fetch(`https://api.upbit.com/v1/ticker?markets=${ind.upbit}`, { signal: AbortSignal.timeout(6000) });
      const t = (await r.json())?.[0];
      if (!(t?.trade_price > 0)) return null;
      return { key: ind.key, label: ind.label, value: t.trade_price, chgPct: t.signed_change_rate != null ? t.signed_change_rate * 100 : null, digits: ind.digits, unit: ind.unit || '' };
    }
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ind.sym)}?interval=1d&range=1d`, { headers: UA, signal: AbortSignal.timeout(6000) });
    const meta = (await r.json())?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    if (!(price > 0)) return null;
    const prev = meta.chartPreviousClose || meta.previousClose || null;
    const mult = ind.mult || 1;
    return {
      key: ind.key, label: ind.label, value: price * mult,
      chgPct: prev > 0 ? ((price - prev) / prev) * 100 : null,
      digits: ind.digits, unit: ind.unit || '',
    };
  } catch (e) {
    console.error(`[briefing] indicator failed ${ind.key}:`, e?.message);
    return null;
  }
}

// 브리핑 만들기 (저장 없음 — 시험에서도 이 함수를 그대로 부른다)
export async function buildBriefing(now = new Date()) {
  const date = kstDateStr(now);
  const [feeds, markets] = await Promise.all([
    Promise.all(BRIEFING_FEEDS.map(fetchFeed)),
    Promise.all(INDICATORS.map(fetchIndicator)),
  ]);
  const items = recentItems(
    feeds.flatMap(({ feed, items: list }) => list.map((it) => ({ ...it, source: feed.name, cat: feed.cat }))),
    now.getTime(),
  );
  if (items.length < 10) throw new Error(`기사가 너무 적어요 (${items.length}개)`);

  const [y, m, d] = date.split('-').map(Number);
  const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const events = marketEventsOf(y, m - 1, ['kr', 'us']).filter((e) => e.ds === date).map(({ market, title, time }) => ({ market, title, time }));
  const mk = markets.filter(Boolean);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.beta.messages.create({
    model: BRIEFING_MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: BRIEFING_SCHEMA } },
    system: BRIEFING_SYSTEM,
    messages: [{ role: 'user', content: briefingUserContent({ dateLabel: `${y}년 ${m}월 ${d}일 (${dow})`, items, markets: mk, events }) }],
  });
  if (response.stop_reason === 'refusal') throw new Error('AI가 정리를 거절했어요');
  if (response.stop_reason === 'max_tokens') throw new Error('AI 답이 너무 길어 잘렸어요');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const brief = normalizeBriefing(JSON.parse(text), { allowedSources: [...new Set(BRIEFING_FEEDS.map((f) => f.name))] });
  if (!brief) throw new Error('AI 답에 소식이 없어요');
  return {
    doc: {
      date, ...brief, markets: mk, events,
      sources: [...new Set(feeds.filter((f) => f.items.length).map((f) => f.feed.name))],
      itemCount: items.length,
      model: response.model || BRIEFING_MODEL,
    },
    usage: response.usage,
  };
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });
  const force = req.query.force === '1';
  const now = new Date();
  const date = kstDateStr(now);
  try {
    const ref = getDb().doc(`briefings/${date}`);
    if (!force && (await ref.get()).exists) return res.status(200).json({ ok: true, skipped: 'already made', date });
    const { doc, usage } = await buildBriefing(now);
    await ref.set({ ...doc, createdAt: FieldValue.serverTimestamp() });
    console.log(`[briefing] saved ${date}: ${doc.news.length} news, ${doc.markets.length} indicators, ${doc.itemCount} items, usage in=${usage?.input_tokens} out=${usage?.output_tokens}`);
    return res.status(200).json({ ok: true, date, news: doc.news.length, indicators: doc.markets.length, items: doc.itemCount });
  } catch (e) {
    console.error('[briefing] failed:', e?.status || '', e?.message);
    return res.status(500).json({ ok: false, error: e?.message || 'failed' });
  }
}
