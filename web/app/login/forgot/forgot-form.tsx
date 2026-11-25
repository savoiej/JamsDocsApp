"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestReset } from "./actions";

export default function ForgotForm({ expired }: { expired?: boolean }) {
  const [state, action, pending] = useActionState(requestReset, undefined);
  return (
    <form action={action} className="auth-card">
      <h2>Reset your password</h2>
      <p>Enter the email for your SITREP account and we’ll send you a link to choose a new password.</p>
      {expired && !state && <div className="msg err" role="alert">That reset link has expired or was already used. Send yourself a new one.</div>}
      {state?.notice && <div className="msg ok" role="status">{state.notice}</div>}
      {state?.error && <div className="msg err" role="alert">{state.error}</div>}
      <label className="field">Email<input name="email" type="email" autoComplete="email" required /></label>
      <button className="btn primary" disabled={pending}>{pending ? "Sending…" : "Email me a reset link"}</button>
      <p><Link href="/login">Back to sign in</Link></p>
    </form>
  );
}
