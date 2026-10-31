import { useState, type FormEvent } from "react";
import { supabase } from "./supabase";
import { closeApp } from "./window";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message === "Invalid login credentials" ? "이메일 또는 비밀번호가 틀렸습니다" : error.message);
  }

  return (
    <div className="panel">
      <header className="header" data-tauri-drag-region>
        <span className="title" data-tauri-drag-region>
          코워크 캘린더
        </span>
        <button className="icon-btn" onClick={closeApp} title="종료">
          ✕
        </button>
      </header>
      <form className="login" onSubmit={submit}>
        <p className="login-hint">Supabase에 만든 계정으로 로그인하세요.</p>
        <input type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? "로그인 중…" : "로그인"}
        </button>
      </form>
    </div>
  );
}
