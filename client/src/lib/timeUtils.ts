function parseSessionDateTime(dateStr: string, timeStr: string): Date | null {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;

  const match24 = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    d.setHours(parseInt(match24[1]), parseInt(match24[2]), 0, 0);
    return d;
  }

  const match12 = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12) {
    let hours = parseInt(match12[1]);
    const mins = parseInt(match12[2]);
    const period = match12[3].toUpperCase();
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    d.setHours(hours, mins, 0, 0);
    return d;
  }

  d.setHours(12, 0, 0, 0);
  return d;
}

export function getRelativeTimeLabel(date: Date | string, startTime: string): string {
  const dateStr =
    typeof date === 'string'
      ? date.slice(0, 10)
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  const sessionDateTime = parseSessionDateTime(dateStr, startTime);
  if (!sessionDateTime) return '';

  const now = new Date();
  const diffMs = sessionDateTime.getTime() - now.getTime();
  if (diffMs <= 0) return '';

  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const sessionMidnight = new Date(dateStr + 'T00:00:00');
  const daysDiff = Math.round(
    (sessionMidnight.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysDiff === 0) {
    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours < 1) {
      const mins = Math.max(1, Math.round(diffMs / 60000));
      return `In ${mins} minute${mins !== 1 ? 's' : ''}`;
    }
    if (diffHours < 6) {
      const hours = Math.floor(diffHours);
      return `In ${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    return `Today at ${startTime}`;
  }

  if (daysDiff === 1) return `Tomorrow at ${startTime}`;
  if (daysDiff < 7) return `In ${daysDiff} days`;

  return `${sessionMidnight.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })} at ${startTime}`;
}
