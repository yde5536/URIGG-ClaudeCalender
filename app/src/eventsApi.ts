import { supabase } from "./supabase";

export interface EventFields {
  title: string;
  emoji: string | null;
  all_day: boolean;
  start: Date;
  end: Date;
  memo: string | null;
  color: string | null;
}

function toRow(f: EventFields) {
  return {
    title: f.title.trim(),
    emoji: f.emoji?.trim() || null,
    all_day: f.all_day,
    start_at: f.start.toISOString(),
    end_at: f.end.toISOString(),
    memo: f.memo?.trim() || null,
    color: f.color || null,
  };
}

/** id가 null이면 새로 만든다 */
export async function saveEvent(id: string | null, fields: EventFields) {
  const { error } = id
    ? await supabase.from("events").update(toRow(fields)).eq("id", id)
    : await supabase.from("events").insert({ ...toRow(fields), source: "manual" });
  if (error) throw error;
}

export async function moveEvent(id: string, start: Date, end: Date, allDay: boolean) {
  const { error } = await supabase
    .from("events")
    .update({ start_at: start.toISOString(), end_at: end.toISOString(), all_day: allDay })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteEvent(id: string) {
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) throw error;
}
