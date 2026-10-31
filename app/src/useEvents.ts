import { useEffect, useState } from "react";
import { supabase, type CalEvent } from "./supabase";

const COLUMNS = "id,title,start_at,end_at,all_day,memo,color,emoji";

/** DB가 바뀔 때마다 증가하는 카운터. 이 값이 바뀌면 각 조회가 다시 실행된다. */
export function useRealtimeVersion() {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const channel = supabase
      .channel("events-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, bump)
      .subscribe((status) => {
        // 재연결되면 그 사이 놓친 변경을 반영
        if (status === "SUBSCRIBED") bump();
      });
    // 실시간 연결이 조용히 끊긴 경우를 대비한 주기적 새로고침
    const timer = setInterval(bump, 5 * 60_000);
    window.addEventListener("focus", bump);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", bump);
      supabase.removeChannel(channel);
    };
  }, []);

  return { version, refresh: () => setVersion((v) => v + 1) };
}

/** [from, to) 구간과 겹치는 일정 */
export function useEvents(from: Date, to: Date, version: number) {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("events")
      .select(COLUMNS)
      .lt("start_at", toIso)
      .gte("end_at", fromIso)
      .order("start_at")
      .limit(1000)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else {
          setError(null);
          setEvents(data as CalEvent[]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fromIso, toIso, version]);

  return { events, error };
}
