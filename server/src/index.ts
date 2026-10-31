import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createClient } from "@supabase/supabase-js";
import { resolveUser } from "./auth.js";
import { buildIcs } from "./ics.js";
import { buildMcpServer } from "./mcp.js";

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  TZ_OFFSET: string;
}

// 경로:
//   POST /mcp/<token>      코워크(claude.ai 커스텀 커넥터)용 MCP 엔드포인트
//   GET  /ics/<token>.ics  아이폰 캘린더 구독 주소
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const [, kind, rawToken = ""] = new URL(req.url).pathname.split("/");
    if (kind !== "mcp" && kind !== "ics") return new Response("Not found", { status: 404 });

    const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = kind === "ics" ? rawToken.replace(/\.ics$/, "") : rawToken;
    const userId = await resolveUser(db, token, kind);
    // 토큰이 틀리면 존재 자체를 숨긴다
    if (!userId) return new Response("Not found", { status: 404 });

    if (kind === "ics") {
      if (req.method !== "GET" && req.method !== "HEAD") return new Response(null, { status: 405 });
      return new Response(await buildIcs(db, userId, env.TZ_OFFSET), {
        headers: {
          "content-type": "text/calendar; charset=utf-8",
          "cache-control": "no-cache",
        },
      });
    }

    // 상태 없는(stateless) MCP: 요청마다 서버를 새로 만든다
    if (req.method !== "POST") {
      return new Response(null, { status: 405, headers: { allow: "POST" } });
    }
    const server = buildMcpServer(db, userId, env.TZ_OFFSET);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(req);
  },
} satisfies ExportedHandler<Env>;
