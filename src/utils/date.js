export const pad2 = (n) => String(n).padStart(2, "0");

export const toDateStr = (d = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const formatKoreanDate = (dateStr) => {
  const d = new Date(dateStr + "T00:00:00");
  const dow = "일월화수목금토"[d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${dow}요일`;
};

export const monthLabel = (y, m0) => `${y}년 ${m0 + 1}월`;

export const getWeekDates = () => {
  const today = new Date();
  const day = today.getDay(); // 0=일
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(today);
  mon.setDate(today.getDate() + diffToMon);
  return Array(7).fill(null).map((_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return toDateStr(d);
  });
};
