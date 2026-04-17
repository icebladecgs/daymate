export const pad2 = (n) => String(n).padStart(2, "0");

export const toDateStr = (d = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const formatKoreanDate = (dateStr) => {
  const d = new Date(dateStr + "T00:00:00");
  const dow = "일월화수목금토"[d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${dow}요일`;
};

export const monthLabel = (y, m0) => `${y}년 ${m0 + 1}월`;

export const getWeekKey = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
};

export const formatRelativeTime = (ts) => {
  if (!ts) return '';
  const date = ts?.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
};

export const getWeekDates = (weekOffset = 0) => {
  const today = new Date();
  const day = today.getDay(); // 0=일
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(today);
  mon.setDate(today.getDate() + diffToMon + weekOffset * 7);
  return Array(7).fill(null).map((_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return toDateStr(d);
  });
};
