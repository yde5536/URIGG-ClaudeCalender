import type { SupabaseClient } from "@supabase/supabase-js";

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** URL에 들어있는 토큰으로 사용자 ID를 찾는다. 없으면 null. */
export async function resolveUser(
  db: SupabaseClient,
  token: string,
  kind: "mcp" | "ics",
): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null;
  const { data, error } = await db
    .from("access_tokens")
    .select("user_id")
    .eq("kind", kind)
    .eq("token_hash", await sha256Hex(token))
    .maybeSingle();
  if (error) throw error;
  return data?.user_id ?? null;
}
