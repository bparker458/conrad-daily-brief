import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { SupabaseStore } from "@/lib/supabase-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — { status, db, schema }.
 * Unauthenticated on purpose: it leaks nothing but whether the migrations
 * have run, which the dashboard needs in order to say "run 004" plainly
 * instead of failing quietly.
 */
export async function GET() {
  try {
    const store = await getStore();
    const ok = await store.health();
    if (!ok) {
      return NextResponse.json({ status: "error", db: "unreachable" }, { status: 500 });
    }
    let schema: Record<string, boolean> | { probe: string } = { probe: "dev store, no schema" };
    if (store instanceof SupabaseStore) {
      const s = await store.schemaStatus();
      schema = { ...s, ready: s.dashboardTables && s.statusModel && s.calendar };
    }
    return NextResponse.json({ status: "ok", db: "ok", schema, version: "dashboard-os-2026-09-07" });
  } catch (e) {
    console.error("[/api/health]", e);
    return NextResponse.json({ status: "error", db: "unreachable" }, { status: 500 });
  }
}
