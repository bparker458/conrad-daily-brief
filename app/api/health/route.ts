import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TEMP DIAGNOSTIC — reverts after root-cause found.
export async function GET() {
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const diag: Record<string, unknown> = {
    urlLen: url.length,
    urlHost: url.replace(/^https?:\/\//, "").slice(0, 45),
    urlTrailingWS: /\s$/.test(url),
    keyLen: key.length,
    keyPrefix: key.slice(0, 8),
    keyRole: (() => { try { return JSON.parse(atob(key.split(".")[1])).role; } catch { return "n/a"; } })(),
  };
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await c.from("areas").select("id").limit(1);
    diag.directError = error ? `${error.message} :: ${JSON.stringify(error)}` : null;
    diag.directData = data;
  } catch (e) {
    diag.directThrow = e instanceof Error ? `${e.message} :: ${e.stack?.split("\n")[0]}` : String(e);
  }
  return NextResponse.json(diag, { status: 200 });
}
