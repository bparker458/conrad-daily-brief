import { NextRequest, NextResponse } from "next/server";
import { authenticate, unauthorized, apiError } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { areaProgress, projectProgress } from "@/lib/derive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/progress — rollups per project and per area. */
export async function GET(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();
  try {
    const store = await getStore();
    const [areas, projects, tasks] = await Promise.all([
      store.listAreas(),
      store.listProjects(),
      store.listTasks({ areaId: "all", includeDone: true }),
    ]);
    return NextResponse.json({
      areas: areaProgress(areas, tasks),
      projects: projectProgress(projects, tasks),
    });
  } catch (e) {
    console.error("[/api/progress]", e);
    return apiError("progress read failed", 500);
  }
}
