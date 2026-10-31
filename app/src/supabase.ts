import { createClient } from "@supabase/supabase-js";

// publishable 키는 공개용이라 코드에 둬도 된다 (데이터 보호는 RLS 담당)
const SUPABASE_URL = "https://dfvcgacadkaglgtooxdy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_QizHB60p_MUv45grEeFt8w_8UBZjvpK";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export interface CalEvent {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  memo: string | null;
  color: string | null;
}
