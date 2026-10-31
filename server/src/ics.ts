import type { SupabaseClient } from "@supabase/supabase-js";
import { toLocalDate, type EventRow } from "./time.js";

const COLUMNS = "id,title,start_at,end_at,all_day,memo,color,emoji,batch_id,source,updated_at";

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** RFC 5545: 한 줄 75바이트 제한. 한글이 깨지지 않도록 문자 단위로 자른다. */
function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function dateStamp(iso: string, offset: string): string {
  return toLocalDate(new Date(iso), offset).replace(/-/g, "");
}

export async function buildIcs(db: SupabaseClient, userId: string, offset: string): Promise<string> {
  const since = new Date(Date.now() - 365 * 24 * 60 * 60_000).toISOString();
  const { data, error } = await db
    .from("events")
    .select(COLUMNS)
    .eq("user_id", userId)
    .gte("end_at", since)
    .order("start_at")
    .limit(5000);
  if (error) throw error;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//cowork-calendar//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:코워크 캘린더",
    "X-WR-TIMEZONE:Asia/Seoul",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
  ];

  for (const e of data as EventRow[]) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@cowork-calendar`,
      `DTSTAMP:${utcStamp(e.updated_at)}`,
      `LAST-MODIFIED:${utcStamp(e.updated_at)}`,
      ...(e.all_day
        ? [
            `DTSTART;VALUE=DATE:${dateStamp(e.start_at, offset)}`,
            `DTEND;VALUE=DATE:${dateStamp(e.end_at, offset)}`,
          ]
        : [`DTSTART:${utcStamp(e.start_at)}`, `DTEND:${utcStamp(e.end_at)}`]),
      `SUMMARY:${escapeText(e.emoji ? `${e.emoji} ${e.title}` : e.title)}`,
      ...(e.memo ? [`DESCRIPTION:${escapeText(e.memo)}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
