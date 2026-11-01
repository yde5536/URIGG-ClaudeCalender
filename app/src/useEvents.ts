import { useEffect, useState } from "react";
import { supabase, type CalEvent } from "./supabase";

export const COLUMNS = "id,title,start_at,end_at,all_day,memo,color,emoji";

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

const cacheKey = (fromIso: string, toIso: string) => `events:${fromIso}|${toIso}`;

/** 오프라인일 때 보여줄 수 있게 마지막으로 받은 일정을 이 PC에 저장해 둔다 */
function readCache(key: string): CalEvent[] | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as CalEvent[]) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, events: CalEvent[]) {
  try {
    localStorage.setItem(key, JSON.stringify(events));
  } catch {
    /* 저장 공간이 없으면 캐시 없이 동작 */
  }
}

/** 로그아웃할 때 이 PC에 저장해 둔 일정을 지운다 */
export function clearEventCache() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("events:"))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* 저장소를 못 쓰면 지울 것도 없음 */
  }
}

/** [from, to) 구간과 겹치는 일정. 불러오지 못하면 저장해 둔 일정을 그대로 보여준다. */
export function useEvents(from: Date, to: Date, version: number) {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const key = cacheKey(fromIso, toIso);
  const [events, setEvents] = useState<CalEvent[]>(() => readCache(key) ?? []);
  const [error, setError] = useState<string | null>(null);

  // 구간이 바뀌면 저장된 일정부터 바로 보여준다
  useEffect(() => {
    setEvents(readCache(key) ?? []);
  }, [key]);

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
        if (error) {
          setError(readCache(key) ? "연결할 수 없어 저장된 일정을 보여주는 중" : `불러오기 실패: ${error.message}`);
        } else {
          setError(null);
          setEvents(data as CalEvent[]);
          writeCache(key, data as CalEvent[]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fromIso, toIso, key, version]);

  return { events, error };
}
