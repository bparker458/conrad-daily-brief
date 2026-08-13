import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { authenticate } from "@/lib/auth";
import { probeAll } from "@/lib/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — { status:'ok', db:'ok' }.
 *
 * Unauthenticated on purpose: it leaks nothing and Conrad's contract
 * depends on being able to check it before trusting any read.
 *
 * GET /api/health?deep=1 with a caller (session or bearer) also probes
 * every connector and returns per-source results. The shallow answer
 * stays exactly the shape Conrad already checks, so nothing breaks.
 */
export async function GET(req: NextRequest) {
  try {
    const store = await getStore();
    const ok = await store.health();
    if (!ok) {
      return NextResponse.json({ status: "error", db: "unreachable" }, { status: 500 });
    }

    const url = new URL(req.url);
    if (url.searchParams.get("deep") === "1" && authenticate(req)) {
      const [probes, health] = await Promise.all([
        probeAll(store),
        store.listSourceHealth().catch(() => []),
      ]);
      return NextResponse.json({ status: "ok", db: "ok", probes, sourceHealth: health });
    }

    return NextResponse.json({ status: "ok", db: "ok" });
  } catch (e) {
    console.error("[/api/health]", e);
    return NextResponse.json({ status: "error", db: "unreachable" }, { status: 500 });
  }
}
