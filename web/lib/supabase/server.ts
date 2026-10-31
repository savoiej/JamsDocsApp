import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component; the proxy refreshes sessions, so this is safe to ignore.
          }
        },
      },
    },
  );
}

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: "admin" | "user";
  active: boolean;
  created_at: string;
};

/** The signed-in person and their profile, or nulls. Uses getClaims(), which verifies the token. */
export async function getViewer() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) return { supabase, userId: null, profile: null as Profile | null };
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return { supabase, userId, profile: (profile as Profile | null) ?? null };
}
