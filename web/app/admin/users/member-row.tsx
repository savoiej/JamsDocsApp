"use client";

import { useState, useTransition } from "react";
import type { Profile } from "@/lib/supabase/server";
import { updateMember } from "./actions";

export default function MemberRow({ person, isMe }: { person: Profile; isMe: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (change: { role?: "admin" | "user"; active?: boolean }) =>
    start(async () => {
      setError(null);
      const r = await updateMember(person.id, change);
      if (r?.error) setError(r.error);
    });
  return (
    <tr>
      <td>
        <b>{person.full_name || "—"}</b>
        {isMe && <span className="muted"> (you)</span>}
        <div className="muted" style={{ fontSize: 13 }}>{person.email}</div>
        {error && <div className="msg err" style={{ marginTop: 6 }}>{error}</div>}
      </td>
      <td>
        <select
          aria-label={`Role for ${person.email}`}
          value={person.role}
          disabled={pending}
          onChange={(e) => run({ role: e.target.value as "admin" | "user" })}
          style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px", background: "var(--surface)" }}
        >
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
      </td>
      <td>{person.active ? <span className="chip on">Active</span> : <span className="chip wait">Waiting</span>}</td>
      <td className="muted">{new Date(person.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
      <td style={{ textAlign: "right" }}>
        {person.active ? (
          <button className="btn sm" disabled={pending} onClick={() => run({ active: false })}>Turn off access</button>
        ) : (
          <button className="btn sm primary" disabled={pending} onClick={() => run({ active: true })}>Approve</button>
        )}
      </td>
    </tr>
  );
}
