import { type NextRequest, NextResponse } from "next/server";
import { getViewer } from "@/lib/supabase/server";

/**
 * /api/ai — one Claude turn for SITREP's assistant features (reading spec sheets, drafting
 * scopes of work, the assistant chat) when the app runs on this site instead of claude.ai.
 * The browser bridge (lib/jams-bridge.ts) runs any tool loop; this route only relays a turn.
 * Needs ANTHROPIC_API_KEY (or ClaudeSITREP) in the Vercel project. Only signed-in, approved people can call it.
 */
export const maxDuration = 120;

const MODELS: Record<string, string> = {
  quick: process.env.ANTHROPIC_MODEL_QUICK || "claude-haiku-5-5",
  default: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
  complex: process.env.ANTHROPIC_MODEL_COMPLEX || "claude-opus-5-5",
};

const apiKey = () => process.env.ANTHROPIC_API_KEY || process.env.ClaudeSITREP || "";

async function allowed() {
  const { userId, profile } = await getViewer();
  return !!userId && !!profile?.active;
}

export async function GET() {
  if (!(await allowed())) return NextResponse.json({ ready: false }, { status: 403 });
  return NextResponse.json({ ready: !!apiKey() });
}

type Block = { type: string; [k: string]: unknown };
type Msg = { role: "user" | "assistant"; content: string | Block[] };

export async function POST(request: NextRequest) {
  if (!(await allowed())) return NextResponse.json({ code: "not_granted", message: "Sign in to use the assistant." }, { status: 403 });
  const key = apiKey();
  if (!key) return NextResponse.json({ code: "not_configured", message: "The assistant isn't set up on this site yet." }, { status: 503 });

  let body: { messages?: Msg[]; system?: string; tools?: unknown[]; tier?: string; maxTokens?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: "bad_request", message: "Unreadable request." }, { status: 400 });
  }
  const messages = Array.isArray(body.messages) ? body.messages.filter((m) => m && (m.role === "user" || m.role === "assistant")) : [];
  if (!messages.length || messages[messages.length - 1].role !== "user")
    return NextResponse.json({ code: "bad_request", message: "The conversation must end with a user message." }, { status: 400 });

  const payload: Record<string, unknown> = {
    model: MODELS[body.tier || "default"] || MODELS.default,
    max_tokens: Math.max(256, Math.min(16000, Number(body.maxTokens) || 8000)),
    messages,
  };
  if (typeof body.system === "string" && body.system.trim()) payload.system = body.system.slice(0, 100_000);
  if (Array.isArray(body.tools) && body.tools.length) payload.tools = body.tools.slice(0, 32);

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(payload),
    signal: request.signal,
  }).catch(() => null);
  if (!r) return NextResponse.json({ code: "unavailable", message: "Couldn't reach the assistant." }, { status: 502 });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data) {
    const status = r.status === 429 || r.status === 529 ? 429 : 502;
    return NextResponse.json({ code: status === 429 ? "rate_limited" : "unavailable", message: (data && data.error && data.error.message) || "The assistant returned an error." }, { status });
  }
  return NextResponse.json({ content: data.content, stop_reason: data.stop_reason });
}
