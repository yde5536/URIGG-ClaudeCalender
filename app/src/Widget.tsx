import { useEffect, useMemo, useState } from "react";
import {
  WEEKDAYS,
  addDays,
  eventTimeLabel,
  fmtDay,
  fmtShortDay,
  isOnDay,
  monthGrid,
  sameDay,
  startOfDay,
} from "./dates";
import { supabase, type CalEvent } from "./supabase";
import { Icon } from "./Icon";
import { useEvents, useRealtimeVersion } from "./useEvents";
import { closeApp, openMainWindow } from "./window";

const UPCOMING_DAYS = 7;
const UPCOMING_MAX = 6;
/** 날짜 칸 하나에 보여줄 이모지/점 개수 */
const MAX_MARKS = 2;

const OPACITY_STEPS = [1, 0.9, 0.8, 0.7];
const OPACITY_KEY = "widgetOpacity";

/** 위젯 배경 불투명도. 이 PC에만 저장된다. */
function useWidgetOpacity() {
  const [opacity, setOpacity] = useState(() => {
    try {
      const v = Number(localStorage.getItem(OPACITY_KEY));
      return OPACITY_STEPS.includes(v) ? v : 0.9;
    } catch {
      return 0.9;
    }
  });
  useEffect(() => {
    document.documentElement.style.setProperty("--widget-opacity", String(opacity));
    try {
      localStorage.setItem(OPACITY_KEY, String(opacity));
    } catch {
      /* 저장 실패해도 이번 실행에는 적용됨 */
    }
  }, [opacity]);
  return [opacity, setOpacity] as const;
}

function useToday(): Date {
  const [today, setToday] = useState(() => startOfDay(new Date()));
  useEffect(() => {
    const timer = setInterval(() => {
      const now = startOfDay(new Date());
      setToday((prev) => (+prev === +now ? prev : now));
    }, 30_000);
    return () => clearInterval(timer);
  }, []);
  return today;
}

function EventRow({ e, dayLabel }: { e: CalEvent; dayLabel?: string }) {
  return (
    <li className="event" title={e.memo ?? undefined}>
      {e.color && <span className="event-bar" style={{ background: e.color }} />}
      {dayLabel && <span className="event-day">{dayLabel}</span>}
      <span className="event-time">{eventTimeLabel(e)}</span>
      {e.emoji && <span className="event-emoji">{e.emoji}</span>}
      <span className="event-title">{e.title}</span>
    </li>
  );
}

export function Widget() {
  const today = useToday();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(today);
  const [menuOpen, setMenuOpen] = useState(false);
  const { version, refresh } = useRealtimeVersion();
  const [opacity, setOpacity] = useWidgetOpacity();

  // 자정이 지나면 "오늘"을 보고 있던 선택도 새 날짜로
  useEffect(() => {
    setSelected((prev) => (sameDay(prev, addDays(today, -1)) ? today : prev));
  }, [today]);

  const grid = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const lastCell = grid[grid.length - 1];
  const month = useEvents(grid[0], addDays(lastCell, 1), version);
  const near = useEvents(today, addDays(today, UPCOMING_DAYS + 1), version);

  const selectedInGrid = selected >= grid[0] && selected <= lastCell;
  const dayEvents = (selectedInGrid ? month.events : near.events).filter((e) => isOnDay(e, selected));
  const tomorrow = addDays(today, 1);
  const upcoming = sameDay(selected, today)
    ? near.events.filter((e) => new Date(e.start_at) >= tomorrow).slice(0, UPCOMING_MAX)
    : [];
  const error = month.error ?? near.error;

  const goToday = () => {
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelected(today);
  };
  const shiftMonth = (n: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));

  return (
    <div className="panel" onClick={() => menuOpen && setMenuOpen(false)}>
      <header className="header" data-tauri-drag-region>
        <button className="icon-btn" onClick={() => shiftMonth(-1)} title="이전 달" aria-label="이전 달">
          <Icon name="prev" />
        </button>
        <span className="title" data-tauri-drag-region>
          {cursor.getFullYear()}년 {cursor.getMonth() + 1}월
        </span>
        <button className="icon-btn" onClick={() => shiftMonth(1)} title="다음 달" aria-label="다음 달">
          <Icon name="next" />
        </button>
        <span className="spacer" data-tauri-drag-region />
        <button
          className="icon-btn"
          onClick={(ev) => {
            ev.stopPropagation();
            setMenuOpen((o) => !o);
          }}
          title="메뉴"
          aria-label="메뉴"
        >
          <Icon name="more" />
        </button>
        {menuOpen && (
          <div className="menu">
            <button onClick={() => openMainWindow(selected)}>전체 창 열기</button>
            <button onClick={goToday}>오늘로 이동</button>
            <button onClick={refresh}>새로고침</button>
            <div className="menu-sep" />
            <div className="menu-row" onClick={(ev) => ev.stopPropagation()}>
              불투명도
              <span className="opacity-steps">
                {OPACITY_STEPS.map((v) => (
                  <button key={v} className={v === opacity ? "on" : ""} onClick={() => setOpacity(v)}>
                    {Math.round(v * 100)}
                  </button>
                ))}
              </span>
            </div>
            <div className="menu-sep" />
            <button onClick={() => supabase.auth.signOut()}>로그아웃</button>
            <button onClick={closeApp}>종료</button>
          </div>
        )}
      </header>

      <div className="grid">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`weekday ${i === 0 ? "sun" : i === 6 ? "sat" : ""}`}>
            {w}
          </div>
        ))}
        {grid.map((day) => {
          const events = month.events.filter((e) => isOnDay(e, day));
          const cls = [
            "day",
            day.getMonth() !== cursor.getMonth() && "other",
            sameDay(day, today) && "today",
            sameDay(day, selected) && "selected",
            day.getDay() === 0 && "sun",
            day.getDay() === 6 && "sat",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={+day}
              className={cls}
              onClick={() => setSelected(day)}
              onDoubleClick={() => openMainWindow(day)}
              title="더블클릭: 전체 창"
            >
              <span className="day-num">{day.getDate()}</span>
              <span className="marks">
                {events.slice(0, MAX_MARKS).map((e) =>
                  e.emoji ? (
                    <span key={e.id} className="mark-emoji">
                      {e.emoji}
                    </span>
                  ) : (
                    <span key={e.id} className="dot" style={e.color ? { background: e.color } : undefined} />
                  ),
                )}
                {events.length > MAX_MARKS && <span className="mark-more">+{events.length - MAX_MARKS}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <section className="list">
        <h2>{sameDay(selected, today) ? `오늘 · ${fmtDay(selected)}` : fmtDay(selected)}</h2>
        {dayEvents.length ? (
          <ul>
            {dayEvents.map((e) => (
              <EventRow key={e.id} e={e} />
            ))}
          </ul>
        ) : (
          <p className="empty">일정 없음</p>
        )}

        {upcoming.length > 0 && (
          <>
            <h2>다가오는 일정</h2>
            <ul>
              {upcoming.map((e) => (
                <EventRow key={e.id} e={e} dayLabel={fmtShortDay(new Date(e.start_at))} />
              ))}
            </ul>
          </>
        )}
        {error && <p className="error">불러오기 실패: {error}</p>}
      </section>
    </div>
  );
}
