// Dates come from the API as ISO strings in UTC. They are shown in the viewer's own time zone,
// in English like the rest of the interface, for example "23 Nov 2026, 14:42"
const dateTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

// A due date is a calendar day without time, "2026-11-30", the same for everyone. It is not a
// moment, so it must not go through the viewer's time zone: new Date('2026-11-30') is midnight
// UTC, which in New York is still 29 November. Instead the day is put at midnight UTC on purpose
// and formatted in UTC, so the numbers come out exactly as written.
const dayThisYear = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const dayOtherYear = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

// "Mon 30 Nov", or "Mon, 4 Jan 2027" for another year
export function formatDueDate(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date));
  return (year === new Date().getFullYear() ? dayThisYear : dayOtherYear).format(utc);
}

// Today in the viewer's own calendar, as "YYYY-MM-DD". Days in this form compare correctly as
// strings, so "is it overdue" is a plain dueDate < today()
export function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
