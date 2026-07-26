import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health — { status:'ok', db:'ok' }. Unauthenticated on purpose: it leaks nothing. */
export async function GET() {
  try {
    const store = await getStore();
    const ok = await store.health();
    if (!ok) {
      return NextResponse.json({ status: "error", db: "unreachable" }, { status: 500 });
    }
    return NextResponse.json({ status: "ok", db: "ok" });
  } catch (e) {
    console.error("[/api/health]", e);
    return NextResponse.json({ status: "error", db: "unreachable" }, { status: 500 });
  }
}
