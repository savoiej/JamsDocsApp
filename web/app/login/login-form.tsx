"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn } from "./actions";

export default function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="auth-card">
      <h2>Sign in</h2>
      <p>Use the email and password for your SITREP account.</p>
      {notice && <div className="msg ok">{notice}</div>}
      {state?.error && <div className="msg err" role="alert">{state.error}</div>}
      <input type="hidden" name="next" value={next} />
      <label className="field">Email<input name="email" type="email" autoComplete="email" required /></label>
      <label className="field">Password<input name="password" type="password" autoComplete="current-password" required /></label>
      <button className="btn primary" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      <p>New to the team? <Link href="/signup">Create an account</Link></p>
    </form>
  );
}
