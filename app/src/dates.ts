import type { CalEvent } from "./supabase";

// 화면 표시는 PC의 현지 시간대 기준

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** 일요일부터 시작하는 6주(42칸) 달력 */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export const pad2 = (n: number) => String(n).padStart(2, "0");

export const fmtTime = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

/** "2026-11-05" (현지 날짜) */
export const toDateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** "2026-11-05" → 현지 0시. new Date("2026-11-05")는 UTC로 해석되므로 쓰지 않는다. */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** <input type="datetime-local"> 값 "2026-11-05T14:00" */
export const toLocalInput = (d: Date) => `${toDateKey(d)}T${fmtTime(d)}`;

export const fmtDay = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;

export const fmtShortDay = (d: Date) => `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS[d.getDay()]})`;

/** 일정이 해당 날짜에 걸쳐 있는지. 종일 일정의 end는 다음날 0시(미포함). */
export function isOnDay(e: CalEvent, day: Date): boolean {
  const s = new Date(e.start_at);
  const en = new Date(e.end_at);
  const ds = startOfDay(day);
  const de = addDays(ds, 1);
  if (+s === +en) return s >= ds && s < de;
  return s < de && en > ds;
}

export function eventTimeLabel(e: CalEvent): string {
  return e.all_day ? "종일" : fmtTime(new Date(e.start_at));
}
