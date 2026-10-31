import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  addDays,
  normalizeEvent,
  parseDateTime,
  rowToInput,
  rowToView,
  toLocalIso,
  type EventRow,
} from "./time.js";

const COLUMNS = "id,title,start_at,end_at,all_day,memo,color,batch_id,source,updated_at";

const eventFields = {
  title: z.string().min(1).max(200).describe("Event title"),
  start: z
    .string()
    .describe(
      'Start. Timed event: "2026-11-03T14:00" (local Korea time if no offset). All-day event: "2026-11-03".',
    ),
  end: z
    .string()
    .optional()
    .describe(
      "End. Timed event: defaults to start + 1 hour. All-day event: the LAST day (inclusive), defaults to the start day.",
    ),
  all_day: z
    .boolean()
    .optional()
    .describe("All-day event. Defaults to true when start is a date without time."),
  memo: z.string().max(2000).optional().describe("Optional note"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .describe("Optional color as #RRGGBB"),
};

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

export function buildMcpServer(db: SupabaseClient, userId: string, offset: string): McpServer {
  const server = new McpServer(
    { name: "cowork-calendar", version: "0.1.0" },
    {
      jsonSchemaValidator: new CfWorkerJsonSchemaValidator(),
      instructions:
        "Personal calendar shown on the user's Windows desktop widget and iPhone. " +
        "All times are Korea time (UTC+09:00) unless an offset is given. " +
        "Call list_events first to avoid overlaps. Use add_events to upload a whole plan at once; " +
        "its batch_id can later undo the whole upload with delete_batch.",
    },
  );

  server.registerTool(
    "add_events",
    {
      description: "Add one or more events in a single batch. Returns the batch_id and the created events.",
      inputSchema: { events: z.array(z.object(eventFields)).min(1).max(200) },
    },
    async ({ events }) => {
      try {
        const batchId = crypto.randomUUID();
        const rows = events.map((e) => ({
          ...normalizeEvent(e, offset),
          user_id: userId,
          batch_id: batchId,
          source: "cowork",
        }));
        const { data, error } = await db.from("events").insert(rows).select(COLUMNS);
        if (error) throw error;
        return ok({
          batch_id: batchId,
          count: data.length,
          events: (data as EventRow[]).map((r) => rowToView(r, offset)),
        });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "list_events",
    {
      description: "List events that overlap a date range (inclusive).",
      inputSchema: {
        from: z.string().describe('First day, e.g. "2026-11-01"'),
        to: z.string().describe('Last day (inclusive), e.g. "2026-11-30"'),
      },
    },
    async ({ from, to }) => {
      try {
        const rangeStart = parseDateTime(from, offset);
        const rangeEnd = parseDateTime(addDays(to.slice(0, 10), 1), offset);
        const { data, error } = await db
          .from("events")
          .select(COLUMNS)
          .eq("user_id", userId)
          .lt("start_at", rangeEnd.toISOString())
          .gte("end_at", rangeStart.toISOString())
          .order("start_at")
          .limit(500);
        if (error) throw error;
        return ok((data as EventRow[]).map((r) => rowToView(r, offset)));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "update_event",
    {
      description: "Update an event. Only the given fields change. Pass an empty string to clear memo or color.",
      inputSchema: {
        id: z.string().uuid(),
        ...eventFields,
        title: eventFields.title.optional(),
        start: eventFields.start.optional(),
        memo: z.string().max(2000).optional(),
        color: z.string().regex(/^(#[0-9a-fA-F]{6})?$/).optional(),
      },
    },
    async ({ id, ...changes }) => {
      try {
        const { data: current, error: readErr } = await db
          .from("events")
          .select(COLUMNS)
          .eq("id", id)
          .eq("user_id", userId)
          .maybeSingle();
        if (readErr) throw readErr;
        if (!current) throw new Error(`Event not found: ${id}`);

        const base = rowToInput(current as EventRow, offset);
        // 종일 ↔ 시간 일정 전환 시 기존 end 형식이 맞지 않으므로 버린다
        if (changes.all_day !== undefined && changes.all_day !== base.all_day && !changes.end) {
          delete base.end;
        }
        // 시작만 바꾸면 기간을 유지한 채 이동
        const allDay = changes.all_day ?? base.all_day;
        if (changes.start && !changes.end && base.end && allDay === base.all_day) {
          const shift = parseDateTime(changes.start, offset).getTime() - parseDateTime(base.start, offset).getTime();
          base.end = allDay
            ? addDays(base.end, Math.round(shift / 86_400_000))
            : toLocalIso(new Date(parseDateTime(base.end, offset).getTime() + shift), offset);
        }

        const defined = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
        const { data, error } = await db
          .from("events")
          .update(normalizeEvent({ ...base, ...defined }, offset))
          .eq("id", id)
          .eq("user_id", userId)
          .select(COLUMNS)
          .single();
        if (error) throw error;
        return ok(rowToView(data as EventRow, offset));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "delete_event",
    {
      description: "Delete a single event by id.",
      inputSchema: { id: z.string().uuid() },
    },
    async ({ id }) => {
      try {
        const { data, error } = await db
          .from("events")
          .delete()
          .eq("id", id)
          .eq("user_id", userId)
          .select("id");
        if (error) throw error;
        if (!data.length) throw new Error(`Event not found: ${id}`);
        return ok({ deleted: 1 });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "delete_batch",
    {
      description: "Delete every event created by one add_events call (undo an uploaded plan).",
      inputSchema: { batch_id: z.string().uuid() },
    },
    async ({ batch_id }) => {
      try {
        const { data, error } = await db
          .from("events")
          .delete()
          .eq("batch_id", batch_id)
          .eq("user_id", userId)
          .select("id");
        if (error) throw error;
        return ok({ deleted: data.length });
      } catch (err) {
        return fail(err);
      }
    },
  );

  return server;
}
