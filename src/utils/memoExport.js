import { formatKoreanDate, monthLabel } from './date.js';

export const listMonthKeys = (plans) => {
  const keys = new Set();
  Object.keys(plans || {}).forEach((ds) => {
    const day = plans[ds];
    const hasMemo = (day?.memos?.length > 0) || day?.memo?.trim() || day?.journal?.body?.trim();
    if (hasMemo) keys.add(ds.slice(0, 7));
  });
  return [...keys].sort();
};

export const buildMemoMarkdown = (plans, monthKey) => {
  const [y, m] = monthKey.split('-').map(Number);
  const dateStrs = Object.keys(plans || {})
    .filter((ds) => ds.startsWith(monthKey))
    .sort();

  const sections = dateStrs.map((ds) => {
    const day = plans[ds];
    const memos = day?.memos?.length > 0
      ? day.memos
      : day?.memo?.trim()
        ? [{ text: day.memo.trim(), createdAt: '' }]
        : [];
    const journalBody = day?.journal?.body?.trim() || '';
    if (memos.length === 0 && !journalBody) return null;

    const parts = [`## ${ds} (${formatKoreanDate(ds).split(' ').pop()})`];
    if (memos.length > 0) {
      parts.push('### 메모');
      parts.push(memos.map((m) => `- ${m.createdAt ? `${m.createdAt} ` : ''}${m.text}`).join('\n'));
    }
    if (journalBody) {
      parts.push('### 일기');
      parts.push(journalBody);
    }
    return parts.join('\n\n');
  }).filter(Boolean);

  return `# Daymate 메모 백업 — ${monthLabel(y, m - 1)}\n\n${sections.join('\n\n---\n\n')}\n`;
};
