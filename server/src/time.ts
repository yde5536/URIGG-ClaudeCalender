// 날짜/시간 변환. DB는 timestamptz, 사람/LLM에게는 현지 시각 문자열로 주고받는다.
// 종일 일정은 DB에 [시작일 00:00, 마지막날+1 00:00) 로 저장하고, 밖으로는 마지막 날(포함)을 보여준다.

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

function offsetMinutes(offset: string): number {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!m) throw new Error(`Invalid TZ_OFFSET: ${offset}`);
  const mins = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === "-" ? -mins : mins;
}

/** "2026-11-03", "2026-11-03T14:00", ISO 문자열(오프셋 포함)을 Date로. 오프셋 없으면 현지 시각으로 본다. */
export function parseDateTime(s: string, offset: string): Date {
  let iso = s.trim();
  if (DATE_RE.test(iso)) iso = `${iso}T00:00:00${offset}`;
  else if (LOCAL_DATETIME_RE.test(iso)) iso = `${iso.length === 16 ? `${iso}:00` : iso}${offset}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date/time: "${s}"`);
  return d;
}

/** Date → "2026-11-03T14:00:00+09:00" */
export function toLocalIso(d: Date, offset: string): string {
  const local = new Date(d.getTime() + offsetMinutes(offset) * 60_000);
  return local.toISOString().slice(0, 19) + offset;
}

export function toLocalDate(d: Date, offset: string): string {
  return toLocalIso(d, offset).slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface EventInput {
  title: string;
  start: string;
  end?: string;
  all_day?: boolean;
  memo?: string | null;
  color?: string | null;
  emoji?: string | null;
}

export interface EventRow {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  memo: string | null;
  color: string | null;
  emoji: string | null;
  batch_id: string | null;
  source: string;
  updated_at: string;
}

/** 입력을 DB 컬럼 값으로 변환 */
export function normalizeEvent(input: EventInput, offset: string) {
  const allDay = input.all_day ?? DATE_RE.test(input.start.trim());
  let start: Date;
  let end: Date;

  if (allDay) {
    const startDate = toLocalDate(parseDateTime(input.start, offset), offset);
    const lastDate = input.end ? toLocalDate(parseDateTime(input.end, offset), offset) : startDate;
    start = parseDateTime(startDate, offset);
    end = parseDateTime(addDays(lastDate, 1), offset);
  } else {
    start = parseDateTime(input.start, offset);
    end = input.end ? parseDateTime(input.end, offset) : new Date(start.getTime() + 60 * 60_000);
  }
  if (end < start) throw new Error(`End is before start for "${input.title}"`);

  return {
    title: input.title.trim(),
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    all_day: allDay,
    memo: input.memo?.trim() || null,
    color: input.color?.trim() || null,
    emoji: input.emoji?.trim() || null,
  };
}

/** DB 행 → 입력과 같은 모양 (수정 시 병합용, 응답용) */
export function rowToInput(row: EventRow, offset: string): EventInput {
  const start = new Date(row.start_at);
  const end = new Date(row.end_at);
  return row.all_day
    ? {
        title: row.title,
        start: toLocalDate(start, offset),
        end: addDays(toLocalDate(end, offset), -1),
        all_day: true,
        memo: row.memo,
        color: row.color,
        emoji: row.emoji,
      }
    : {
        title: row.title,
        start: toLocalIso(start, offset),
        end: toLocalIso(end, offset),
        all_day: false,
        memo: row.memo,
        color: row.color,
        emoji: row.emoji,
      };
}

export function rowToView(row: EventRow, offset: string) {
  return { id: row.id, ...rowToInput(row, offset), batch_id: row.batch_id, source: row.source };
}
