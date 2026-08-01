import { pad2 } from '../utils/date.js';

const getTzSuffix = () => {
  const offsetMin = -new Date().getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  return `${sign}${pad2(Math.floor(Math.abs(offsetMin) / 60))}:${pad2(Math.abs(offsetMin) % 60)}`;
};

// 시작시간 + 기본 소요시간(30분)으로 종료시간 계산. 자정을 넘어가면 자동으로 다음날로 넘어감.
function buildTimedRange(dateStr, time, durationMin = 30) {
  const start = new Date(`${dateStr}T${time}:00`);
  const end = new Date(start.getTime() + durationMin * 60000);
  const fmt = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`;
  return { startStr: fmt(start), endStr: fmt(end) };
}

function buildEventTimeFields(dateStr, task) {
  if (task.time) {
    const tzSuffix = getTzSuffix();
    const { startStr, endStr } = buildTimedRange(dateStr, task.time);
    return { start: { dateTime: startStr + tzSuffix }, end: { dateTime: endStr + tzSuffix } };
  }
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  const endDate = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return { start: { date: dateStr }, end: { date: endDate } };
}

export async function gcalCreateEvent(token, dateStr, task) {
  const body = {
    summary: task.title,
    ...buildEventTimeFields(dateStr, task),
    extendedProperties: { private: { daymateId: task.id } },
  };
  console.log('[gcal-debug] CREATE request body', body);
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  console.log('[gcal-debug] CREATE response', res.status, json);
  if (!res.ok) throw new Error(`gcal ${res.status}`);
  return json.id;
}

export async function gcalDeleteEvent(token, eventId) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) throw new Error(`gcal delete ${res.status}`);
}

export async function gcalUpdateEvent(token, eventId, dateStr, task) {
  const body = { summary: task.title, ...buildEventTimeFields(dateStr, task) };
  console.log('[gcal-debug] UPDATE request body', eventId, body);
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  console.log('[gcal-debug] UPDATE response', res.status, json);
  if (!res.ok) throw new Error(`gcal update ${res.status}`);
}

// colorId: "2"=sage(완료), null=기본색(미완료)
export async function gcalSetEventColor(token, eventId, colorId) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ colorId: colorId ?? null }),
  });
  if (!res.ok && res.status !== 404) throw new Error(`gcal color ${res.status}`);
}

export async function gcalFetchWeekEvents(token, weekDates) {
  const startDate = weekDates[0];
  const endDate = weekDates[weekDates.length - 1];
  const tzSuffix = getTzSuffix();
  const nextDay = new Date(endDate + 'T00:00:00');
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDateStr = `${nextDay.getFullYear()}-${pad2(nextDay.getMonth() + 1)}-${pad2(nextDay.getDate())}`;
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(startDate + 'T00:00:00' + tzSuffix)}&timeMax=${encodeURIComponent(nextDateStr + 'T00:00:00' + tzSuffix)}&singleEvents=true&orderBy=startTime&maxResults=50`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`gcal fetch ${res.status}`);
  const items = (await res.json()).items || [];
  const byDate = {};
  const rangeStart = weekDates[0];
  const rangeEnd = weekDates[weekDates.length - 1];
  items.forEach(e => {
    const startDs = e.start?.date || e.start?.dateTime?.slice(0, 10);
    if (!startDs) return;
    const isAllDay = !!e.start?.date;
    const endDsRaw = e.end?.date || e.end?.dateTime?.slice(0, 10) || startDs;
    const endDate = new Date(endDsRaw + 'T00:00:00');
    if (isAllDay) endDate.setDate(endDate.getDate() - 1);
    const cur = new Date(startDs + 'T00:00:00');
    while (cur <= endDate) {
      const ds = `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}-${pad2(cur.getDate())}`;
      if (ds >= rangeStart && ds <= rangeEnd) {
        if (!byDate[ds]) byDate[ds] = [];
        if (!byDate[ds].find(x => x.id === e.id)) byDate[ds].push(e);
      }
      cur.setDate(cur.getDate() + 1);
    }
  });
  return byDate;
}

export async function gcalFetchRangeEvents(token, startDateStr, days = 30) {
  const tzSuffix = getTzSuffix();
  const end = new Date(startDateStr + 'T00:00:00');
  end.setDate(end.getDate() + days);
  const endDateStr = `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`;
  let allItems = [];
  let pageToken = null;
  do {
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(startDateStr + 'T00:00:00' + tzSuffix)}&timeMax=${encodeURIComponent(endDateStr + 'T00:00:00' + tzSuffix)}&singleEvents=true&orderBy=startTime&maxResults=250${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`gcal fetch ${res.status}`);
    const json = await res.json();
    allItems.push(...(json.items || []));
    pageToken = json.nextPageToken || null;
  } while (pageToken);
  const byDate = {};
  allItems.forEach(e => {
    const startDs = e.start?.date || e.start?.dateTime?.slice(0, 10);
    if (!startDs) return;
    const isAllDay = !!e.start?.date;
    const endDsRaw = e.end?.date || e.end?.dateTime?.slice(0, 10) || startDs;
    const endDate = new Date(endDsRaw + 'T00:00:00');
    if (isAllDay) endDate.setDate(endDate.getDate() - 1); // GCal all-day end is exclusive
    const cur = new Date(startDs + 'T00:00:00');
    while (cur <= endDate) {
      const ds = `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}-${pad2(cur.getDate())}`;
      if (ds >= startDateStr && ds < endDateStr) {
        if (!byDate[ds]) byDate[ds] = [];
        if (!byDate[ds].find(x => x.id === e.id)) byDate[ds].push(e);
      }
      cur.setDate(cur.getDate() + 1);
    }
  });
  return byDate;
}

export async function gcalFetchTodayEvents(token, dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  const nextDate = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const tzSuffix = getTzSuffix();
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(dateStr + 'T00:00:00' + tzSuffix)}&timeMax=${encodeURIComponent(nextDate + 'T00:00:00' + tzSuffix)}&singleEvents=true&orderBy=startTime`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`gcal fetch ${res.status}`);
  return (await res.json()).items || [];
}
