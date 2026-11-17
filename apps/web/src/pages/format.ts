// Dates come from the API as ISO strings in UTC. They are shown in the viewer's own time
// zone and date format, for example "23 Nov 2026, 14:42"
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}
