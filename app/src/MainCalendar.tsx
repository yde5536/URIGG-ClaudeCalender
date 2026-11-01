import { useCallback, useEffect, useRef, useState } from "react";
import type { EventContentArg, EventDropArg, EventInput, EventSourceFuncArg } from "@fullcalendar/core";
import koLocale from "@fullcalendar/core/locales/ko";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type EventResizeDoneArg } from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { listen } from "@tauri-apps/api/event";
import { WEEKDAYS, addDays } from "./dates";
import { EventDialog, type DialogTarget } from "./EventDialog";
import { moveEvent } from "./eventsApi";
import { supabase, type CalEvent } from "./supabase";
import { COLUMNS, useRealtimeVersion } from "./useEvents";
import { GOTO_DATE_EVENT } from "./window";

function toFcEvent(e: CalEvent): EventInput {
  return {
    id: e.id,
    title: e.title,
    start: e.start_at,
    end: e.end_at,
    allDay: e.all_day,
    // 칩의 면은 공통, 지정한 색은 왼쪽 선에만
    ...(e.color ? { borderColor: e.color } : {}),
    extendedProps: { row: e },
  };
}

function fetchEvents(
  info: EventSourceFuncArg,
  success: (events: EventInput[]) => void,
  failure: (error: Error) => void,
) {
  supabase
    .from("events")
    .select(COLUMNS)
    .lt("start_at", info.end.toISOString())
    .gte("end_at", info.start.toISOString())
    .order("start_at")
    .limit(2000)
    .then(({ data, error }) => (error ? failure(new Error(error.message)) : success((data as CalEvent[]).map(toFcEvent))));
}

function renderEvent(arg: EventContentArg) {
  // 주/일 보기에서 빈 칸을 드래그할 때 그려지는 선택 미리보기에는 row가 없다
  const row = arg.event.extendedProps.row as CalEvent | undefined;
  return (
    <div className="fc-ev">
      {row?.emoji && <span className="fc-ev-emoji">{row.emoji}</span>}
      {arg.timeText && <span className="fc-ev-time">{arg.timeText}</span>}
      <span className="fc-ev-title">{arg.event.title}</span>
    </div>
  );
}

/** 위젯에서 넘겨준 #date=2026-11-05 */
const initialDate = new URLSearchParams(window.location.hash.slice(1)).get("date") ?? undefined;

export function MainCalendar() {
  const calRef = useRef<FullCalendar>(null);
  const { version } = useRealtimeVersion();
  const [dialog, setDialog] = useState<DialogTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    calRef.current?.getApi().refetchEvents();
  }, [version]);

  useEffect(() => {
    const unlisten = listen<string>(GOTO_DATE_EVENT, (e) => calRef.current?.getApi().gotoDate(e.payload));
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // 드래그로 옮기거나 길이를 바꾼 일정 저장. 실패하면 원위치.
  const persistMove = useCallback(async (info: EventDropArg | EventResizeDoneArg) => {
    const ev = info.event;
    const start = ev.start!;
    const end = ev.end ?? (ev.allDay ? addDays(start, 1) : new Date(+start + 60 * 60_000));
    try {
      setError(null);
      await moveEvent(ev.id, start, end, ev.allDay);
    } catch (err) {
      info.revert();
      setError(`저장 실패: ${(err as { message?: string })?.message ?? err}`);
    }
  }, []);

  return (
    <div className="main-app">
      <FullCalendar
        ref={calRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        locale={koLocale}
        initialView="dayGridMonth"
        initialDate={initialDate}
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay newEvent",
        }}
        customButtons={{
          newEvent: {
            text: "새 일정",
            click: () => {
              // 보고 있는 날짜(오늘이 화면에 있으면 오늘)의 오전 9시로 시작
              const api = calRef.current!.getApi();
              const now = new Date();
              const base = now >= api.view.activeStart && now < api.view.activeEnd ? now : api.getDate();
              const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 9);
              setDialog({ kind: "new", start, end: new Date(+start + 60 * 60_000), allDay: false });
            },
          },
        }}
        eventDisplay="block"
        fixedWeekCount={false}
        dayCellContent={(arg) => arg.dayNumberText.replace(/일$/, "")}
        dayHeaderContent={(arg) =>
          arg.view.type === "dayGridMonth" ? (
            WEEKDAYS[arg.date.getDay()]
          ) : (
            <span className="fc-dh">
              <span className="fc-dh-wd">{WEEKDAYS[arg.date.getDay()]}</span>
              <span className="fc-dh-day">{arg.date.getDate()}</span>
            </span>
          )
        }
        height="100%"
        events={fetchEvents}
        eventContent={renderEvent}
        eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        scrollTime="08:00:00"
        // 월 보기에서 주/일 보기로 바꿀 때도 0시가 아니라 오전 8시부터 보이게
        viewDidMount={(arg) => {
          if (arg.view.type.startsWith("timeGrid")) setTimeout(() => arg.view.calendar.scrollToTime("08:00:00"));
        }}
        nowIndicator
        dayMaxEvents
        selectable
        selectMirror
        editable
        select={(info) => {
          setDialog({ kind: "new", start: info.start, end: info.end, allDay: info.allDay });
          info.view.calendar.unselect();
        }}
        eventClick={(info) => setDialog({ kind: "edit", event: info.event.extendedProps.row as CalEvent })}
        eventDrop={persistMove}
        eventResize={persistMove}
      />
      {error && (
        <div className="toast" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      {dialog && <EventDialog target={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}
