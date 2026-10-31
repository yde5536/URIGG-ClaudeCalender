import { useEffect, useState, type FormEvent } from "react";
import { addDays, fromDateKey, toDateKey, toLocalInput } from "./dates";
import { deleteEvent, saveEvent } from "./eventsApi";
import type { CalEvent } from "./supabase";

const QUICK_EMOJIS = ["💼", "📅", "📞", "🍽️", "☕", "🏃", "🏋️", "🏥", "📚", "✈️", "🎂", "🎉", "🛒", "🏠", "🚗", "💻"];
const COLORS = ["#6aa8ff", "#5ccf8f", "#f6c453", "#ff8a5c", "#ff6b8b", "#b48cff", "#8b90a0"];

/** 날짜/시간을 입력란 형식으로 들고 있는 편집용 상태 */
interface Draft {
  title: string;
  emoji: string;
  allDay: boolean;
  startDate: string;
  endDate: string; // 마지막 날 (포함)
  startTime: string;
  endTime: string;
  memo: string;
  color: string;
}

export type DialogTarget =
  | { kind: "new"; start: Date; end: Date; allDay: boolean }
  | { kind: "edit"; event: CalEvent };

function initialDraft(t: DialogTarget): Draft {
  if (t.kind === "new") {
    const day = toDateKey(t.start);
    return {
      title: "",
      emoji: "",
      allDay: t.allDay,
      startDate: day,
      endDate: t.allDay ? toDateKey(addDays(t.end, -1)) : day,
      startTime: t.allDay ? `${day}T09:00` : toLocalInput(t.start),
      endTime: t.allDay ? `${day}T10:00` : toLocalInput(t.end),
      memo: "",
      color: "",
    };
  }
  const e = t.event;
  const start = new Date(e.start_at);
  const end = new Date(e.end_at);
  const day = toDateKey(start);
  return {
    title: e.title,
    emoji: e.emoji ?? "",
    allDay: e.all_day,
    startDate: day,
    endDate: e.all_day ? toDateKey(addDays(end, -1)) : toDateKey(end),
    startTime: e.all_day ? `${day}T09:00` : toLocalInput(start),
    endTime: e.all_day ? `${day}T10:00` : toLocalInput(end),
    memo: e.memo ?? "",
    color: e.color ?? "",
  };
}

export function EventDialog({ target, onClose }: { target: DialogTarget; onClose: () => void }) {
  const [d, setD] = useState(() => initialDraft(target));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const id = target.kind === "edit" ? target.event.id : null;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err));
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const start = d.allDay ? fromDateKey(d.startDate) : new Date(d.startTime);
    const end = d.allDay ? addDays(fromDateKey(d.endDate), 1) : new Date(d.endTime);
    if (Number.isNaN(+start) || Number.isNaN(+end)) return setError("날짜/시간을 확인하세요");
    if (end < start) return setError("종료가 시작보다 빠릅니다");
    run(() =>
      saveEvent(id, {
        title: d.title,
        emoji: d.emoji,
        all_day: d.allDay,
        start,
        end,
        memo: d.memo,
        color: d.color,
      }),
    );
  }

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <form className="dialog" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>{id ? "일정 수정" : "새 일정"}</h3>

        <div className="row">
          <input
            className="emoji-input"
            value={d.emoji}
            onChange={(e) => set("emoji", e.target.value)}
            placeholder="🙂"
            maxLength={16}
            title="이모지 (Win + . 으로 입력)"
          />
          <input
            className="grow"
            value={d.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="제목"
            maxLength={200}
            required
            autoFocus
          />
        </div>
        <div className="emoji-picks">
          {QUICK_EMOJIS.map((em) => (
            <button type="button" key={em} className={d.emoji === em ? "on" : ""} onClick={() => set("emoji", em)}>
              {em}
            </button>
          ))}
        </div>

        <label className="check">
          <input type="checkbox" checked={d.allDay} onChange={(e) => set("allDay", e.target.checked)} />
          종일
        </label>

        {d.allDay ? (
          <div className="row">
            <input type="date" value={d.startDate} onChange={(e) => set("startDate", e.target.value)} required />
            <span className="sep">~</span>
            <input type="date" value={d.endDate} onChange={(e) => set("endDate", e.target.value)} required />
          </div>
        ) : (
          <div className="row">
            <input
              type="datetime-local"
              value={d.startTime}
              onChange={(e) => set("startTime", e.target.value)}
              required
            />
            <span className="sep">~</span>
            <input type="datetime-local" value={d.endTime} onChange={(e) => set("endTime", e.target.value)} required />
          </div>
        )}

        <textarea value={d.memo} onChange={(e) => set("memo", e.target.value)} placeholder="메모" rows={3} />

        <div className="colors">
          <button type="button" className={`swatch none ${d.color === "" ? "on" : ""}`} onClick={() => set("color", "")}>
            기본
          </button>
          {COLORS.map((c) => (
            <button
              type="button"
              key={c}
              className={`swatch ${d.color === c ? "on" : ""}`}
              style={{ background: c }}
              onClick={() => set("color", c)}
            />
          ))}
        </div>

        {error && <p className="error">{error}</p>}

        <div className="actions">
          {id &&
            (confirmDelete ? (
              <button type="button" className="danger" disabled={busy} onClick={() => run(() => deleteEvent(id))}>
                정말 삭제
              </button>
            ) : (
              <button type="button" className="ghost-danger" onClick={() => setConfirmDelete(true)}>
                삭제
              </button>
            ))}
          <span className="grow" />
          <button type="button" className="ghost" onClick={onClose}>
            취소
          </button>
          <button className="primary" disabled={busy}>
            저장
          </button>
        </div>
      </form>
    </div>
  );
}
