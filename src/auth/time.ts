// Formats timestamps in Indian Standard Time (Asia/Kolkata, UTC+5:30)
// regardless of the server's own timezone, so logs/notifications/digests
// read correctly for an India-based team.
const IST_TIME_ZONE = 'Asia/Kolkata';

function istParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '00';
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

// "YYYY-MM-DD HH:mm:ss" in IST - used for notification/audit log timestamps.
export function istTimestamp(date: Date = new Date()): string {
  const p = istParts(date);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

// "YYYY-MM-DD" in IST - used as a calendar-day key (e.g. daily digest dedup).
export function istDateKey(date: Date = new Date()): string {
  const p = istParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}
