import {router} from './router';
import type {LlmMessage} from './llm';

export type Alarm = {
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM (24h) — optional
  event: string;
};

const SYSTEM = `You extract upcoming dates and events from a passage. Return ONLY a valid JSON array.
Format each entry: {"date":"YYYY-MM-DD","time":"HH:MM","event":"short description"}.
- If time is not given, omit the "time" field.
- If year is missing, use the current year unless context implies otherwise.
- If no dates are present, return [].
- No prose, no markdown, no code fences — pure JSON.`;

export async function extractAlarms(text: string): Promise<Alarm[]> {
  const messages: LlmMessage[] = [
    {role: 'system', content: SYSTEM},
    {role: 'user', content: text.slice(0, 4000)}, // cap tokens for latency
  ];
  const raw = await router.complete(messages);
  return parseAlarms(raw);
}

function parseAlarms(raw: string): Alarm[] {
  // The model may wrap the JSON in prose despite instructions — grab the first
  // [ … ] block we see and try to parse it.
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        x =>
          x &&
          typeof x.date === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(x.date) &&
          typeof x.event === 'string',
      )
      .map(x => ({
        date: x.date,
        time: typeof x.time === 'string' && /^\d{1,2}:\d{2}$/.test(x.time) ? padTime(x.time) : undefined,
        event: x.event.slice(0, 240),
      }));
  } catch {
    return [];
  }
}

function padTime(hhmm: string): string {
  const [h, m] = hhmm.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

export function toIcs(alarms: Alarm[]): string {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const events = alarms
    .map(a => {
      const t = a.time ?? '09:00';
      const start = icsDateTime(a.date, t);
      const end = icsDateTime(a.date, addOneHour(t));
      return [
        'BEGIN:VEVENT',
        `UID:${rid()}@sidecar.local`,
        `DTSTAMP:${now}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${escapeIcs(a.event)}`,
        'BEGIN:VALARM',
        'TRIGGER:-PT30M',
        'ACTION:DISPLAY',
        `DESCRIPTION:Reminder: ${escapeIcs(a.event)}`,
        'END:VALARM',
        'END:VEVENT',
      ].join('\r\n');
    })
    .join('\r\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sidecar//Alarm//EN',
    'CALSCALE:GREGORIAN',
    events,
    'END:VCALENDAR',
  ].join('\r\n');
}

function icsDateTime(date: string, time: string): string {
  const [Y, M, D] = date.split('-');
  const [h, m] = time.split(':');
  return `${Y}${M}${D}T${h.padStart(2, '0')}${m.padStart(2, '0')}00`;
}

function addOneHour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const nh = (h + 1) % 24;
  return `${String(nh).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function escapeIcs(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function rid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ============================================================
// Phone alarm via Service Worker + TimestampTrigger
// ============================================================
// This uses the browser's own notification scheduler. Once we call
// showNotification with a TimestampTrigger, Chrome fires the notification at
// the target time — even if the tab is closed, even if the browser is
// backgrounded. Fires wake the phone the same way a Google Calendar alarm
// does. Requires: user has granted Notification permission and the SW is
// registered.

let swReg: ServiceWorkerRegistration | null = null;

export async function ensureAlarmReady(): Promise<
  {ok: true; reg: ServiceWorkerRegistration} | {ok: false; reason: string}
> {
  if (!('serviceWorker' in navigator)) {
    return {ok: false, reason: 'Service Workers not supported in this browser.'};
  }
  if (!('Notification' in window)) {
    return {ok: false, reason: 'Notifications not supported in this browser.'};
  }
  if (typeof (window as any).TimestampTrigger === 'undefined') {
    return {
      ok: false,
      reason:
        'This browser does not support scheduled notifications (TimestampTrigger). Use the calendar option instead.',
    };
  }
  try {
    if (!swReg) {
      swReg = await navigator.serviceWorker.register('/sw.js', {scope: '/'});
    }
    await navigator.serviceWorker.ready;
  } catch (e: any) {
    return {ok: false, reason: `Service worker registration failed: ${e?.message ?? e}`};
  }
  let perm = Notification.permission;
  if (perm === 'default') {
    perm = await Notification.requestPermission();
  }
  if (perm !== 'granted') {
    return {ok: false, reason: 'Notification permission denied. Enable it in browser site settings.'};
  }
  return {ok: true, reg: swReg!};
}

/**
 * Schedule a device alarm for an event via Chrome's TimestampTrigger.
 * Returns the timestamp we scheduled for so the UI can show it.
 */
export async function schedulePhoneAlarm(alarm: Alarm): Promise<
  {ok: true; firesAt: number} | {ok: false; reason: string}
> {
  const ready = await ensureAlarmReady();
  if (!ready.ok) return {ok: false, reason: ready.reason};
  const at = alarmTimestamp(alarm);
  const now = Date.now();
  const leadMs = 30 * 60 * 1000;
  const fireAt = at - leadMs;
  if (fireAt <= now) {
    return {ok: false, reason: `Event ${alarm.date} ${alarm.time ?? '09:00'} is in the past.`};
  }
  try {
    await ready.reg.showNotification(`⏰ ${alarm.event}`, {
      body: `In 30 min · ${alarm.date} at ${alarm.time ?? '09:00'}`,
      tag: `sidecar-alarm-${alarm.date}-${alarm.time ?? '0900'}-${slug(alarm.event)}`,
      // showTrigger is Chrome-only right now. Cast to any to keep TS happy.
      ...({showTrigger: new (window as any).TimestampTrigger(fireAt)} as any),
      requireInteraction: true,
    });
    return {ok: true, firesAt: fireAt};
  } catch (e: any) {
    return {ok: false, reason: `Failed to schedule: ${e?.message ?? e}`};
  }
}

function alarmTimestamp(a: Alarm): number {
  const [Y, M, D] = a.date.split('-').map(Number);
  const [h, m] = (a.time ?? '09:00').split(':').map(Number);
  return new Date(Y, M - 1, D, h, m, 0).getTime();
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24);
}

/**
 * Google Calendar quick-add URL. Opens the mobile app (or web calendar) with
 * the event pre-filled — user taps Save once. No OAuth, no keys, works with
 * whichever Google account is signed in on the phone.
 */
export function googleCalendarUrl(a: Alarm): string {
  const start = icsDateTime(a.date, a.time ?? '09:00');
  const end = icsDateTime(a.date, addOneHour(a.time ?? '09:00'));
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: a.event,
    dates: `${start}/${end}`,
    details: 'Extracted on-device by Sidecar.',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function downloadIcs(alarms: Alarm[], filename = 'sidecar-alarms.ics') {
  const ics = toIcs(alarms);
  const blob = new Blob([ics], {type: 'text/calendar;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
