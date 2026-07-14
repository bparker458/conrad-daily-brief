import { NextRequest, NextResponse } from "next/server";
import { authenticate, unauthorized, apiError } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { areaProgress } from "@/lib/derive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/areas — areas with derived progress. */
export async function GET(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();
  try {
    const store = await getStore();
    const [areas, tasks] = await Promise.all([
      store.listAreas(),
      store.listTasks({ areaId: "all", includeDone: true }),
    ]);
    return NextResponse.json(areaProgress(areas, tasks));
  } catch (e) {
    console.error("[/api/areas]", e);
    return apiError("areas read failed", 500);
  }
}
