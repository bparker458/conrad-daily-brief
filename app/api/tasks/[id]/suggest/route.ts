import { NextRequest, NextResponse } from "next/server";
import { authenticate, unauthorized, apiError } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { generateSteps, suggestConfigured } from "@/lib/suggest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/tasks/:id/suggest — "I'm not sure. Conrad, what do I do?"
 *
 * Order matters here:
 *   1. Write unsure=true through the store FIRST. Even if the AI call
 *      fails or times out, the task is honestly flagged and Conrad's
 *      morning sweep will still see it. (This also doubles as the 404
 *      check — updateTask returns null for an unknown id.)
 *   2. Ask Claude for the next concrete steps (lib/suggest.ts).
 *   3. Store the steps in conrad_note through the same single door
 *      both faces use, and return the updated task.
 *
 * Response: { task, suggested: boolean, reason?: string }
 *   suggested=false is NOT an HTTP error — the flag write succeeded and
 *   the phone falls back to "Flagged for Conrad." Real failures (bad id,
 *   store down) still return real HTTP statuses per Section 6.
 *
 * Both faces may call this: the phone via the session cookie, Conrad via
 * the bearer secret (Conrad may prefer writing conradNote directly via
 * PATCH — same field, either path is legitimate).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!authenticate(req)) return unauthorized();
  try {
    const store = await getStore();

    const flagged = await store.updateTask(params.id, { unsure: true });
    if (!flagged) return apiError("task not found", 404);

    if (!suggestConfigured()) {
      return NextResponse.json({
        task: flagged,
        suggested: false,
        reason: "not configured",
      });
    }

    const areas = await store.listAreas();
    const area = areas.find((a) => a.id === flagged.areaId) || null;

    try {
      const steps = await generateSteps(flagged, area);
      const updated = await store.updateTask(params.id, { conradNote: steps });
      return NextResponse.json({ task: updated ?? flagged, suggested: true });
    } catch (e) {
      console.error("[/api/tasks/:id/suggest] generation failed", e);
      return NextResponse.json({
        task: flagged,
        suggested: false,
        reason: "unavailable",
      });
    }
  } catch (e) {
    console.error("[/api/tasks/:id/suggest]", e);
    return apiError("suggest failed", 500);
  }
}
