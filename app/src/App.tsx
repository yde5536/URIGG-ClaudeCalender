import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Login } from "./Login";
import { MainCalendar } from "./MainCalendar";
import { Widget } from "./Widget";
import { supabase } from "./supabase";
import { isMainWindow } from "./window";
import "./App.css";
import "./Main.css";

const IS_MAIN = isMainWindow();

export default function App() {
  // undefined: 세션 확인 중
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <div className={IS_MAIN ? "main-app" : "panel"} data-tauri-drag-region />;
  if (!session) return <Login />;
  // 사용자가 바뀌면 상태(실시간 채널 포함)를 새로 만든다
  return IS_MAIN ? <MainCalendar key={session.user.id} /> : <Widget key={session.user.id} />;
}
