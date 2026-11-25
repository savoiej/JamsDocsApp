"use client";

import { useActionState } from "react";
import Link from "next/link";
import { setNewPassword } from "./actions";

export default function ResetForm({ email }: { email?: string }) {
  const [state, action, pending] = useActionState(setNewPassword, undefined);
  if (!email)
    return (
      <div className="auth-card">
        <h2>Link expired</h2>
        <p>This password reset link has expired or was already used.</p>
        <Link className="btn primary" href="/login/forgot">Send a new link</Link>
      </div>
    );
  return (
    <form action={action} className="auth-card">
      <h2>Choose a new password</h2>
      <p>For {email}. Use at least 8 characters.</p>
      {state?.error && <div className="msg err" role="alert">{state.error}</div>}
      <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
      <label className="field">New password<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
      <label className="field">Type it again<input name="again" type="password" autoComplete="new-password" minLength={8} required /></label>
      <button className="btn primary" disabled={pending}>{pending ? "Saving…" : "Save password and sign in"}</button>
    </form>
  );
}
