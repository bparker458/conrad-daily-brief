/**
 * Date helpers shared by the client views. Everything here is LOCAL time,
 * meaning the phone's clock, which is Brad's day. Never use toISOString()
 * for a calendar date on the client; it shifts the day after 5pm Pacific.
 */

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function ymdToday(): string {
  return ymd(new Date());
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Monday-start week, matching the retail calendar Brad reads. */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // Mon=0 ... Sun=6
  x.setDate(x.getDate() - day);
  return x;
}

export function startOfMonth(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

export function isSameLocalDay(iso: string | null, ref: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

export function daysBetween(fromIso: string, to: Date = new Date()): number {
  return Math.floor((startOfDay(to).getTime() - startOfDay(new Date(fromIso)).getTime()) / 86400000);
}

export function dayLabel(d: Date): string {
  const today = startOfDay(new Date());
  const diff = Math.round((startOfDay(d).getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** 'YYYY-MM-DD' to a local Date at noon (avoids DST edge shifts). */
export function fromYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}
