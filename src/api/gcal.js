import { pad2 } from '../utils/date.js';

export async function gcalCreateEvent(token, dateStr, task) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  const endDate = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: task.title,
      start: { date: dateStr },
      end: { date: endDate },
      extendedProperties: { private: { daymateId: task.id } },
    }),
  });
  if (!res.ok) throw new Error(`gcal ${res.status}`);
  return (await res.json()).id;
}

export async function gcalDeleteEvent(token, eventId) {
  await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function gcalUpdateEvent(token, eventId, title) {
  await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ summary: title }),
  });
}

export async function gcalFetchTodayEvents(token, dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  const nextDate = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const offsetMin = -new Date().getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const tzSuffix = `${sign}${pad2(Math.floor(Math.abs(offsetMin) / 60))}:${pad2(Math.abs(offsetMin) % 60)}`;
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(dateStr + 'T00:00:00' + tzSuffix)}&timeMax=${encodeURIComponent(nextDate + 'T00:00:00' + tzSuffix)}&singleEvents=true&orderBy=startTime`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`gcal fetch ${res.status}`);
  return (await res.json()).items || [];
}
