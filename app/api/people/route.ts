import { NextRequest, NextResponse } from "next/server";
import { authenticate, unauthorized, apiError } from "@/lib/auth";
import { listPeople, upsertPerson, NotConfiguredError } from "@/lib/dashboard-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/people — the walking-over tiles. */
export async function GET(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();
  try {
    return NextResponse.json(await listPeople());
  } catch (e) {
    if (e instanceof NotConfiguredError) return apiError("store not configured", 503);
    console.error("[/api/people GET]", e);
    return apiError("people read failed", 500);
  }
}

/** PUT /api/people — Conrad only. Body: a person object with id and name. */
export async function PUT(req: NextRequest) {
  const caller = authenticate(req);
  if (!caller) return unauthorized();
  if (caller !== "conrad") return apiError("people are written by Conrad only", 403);
  try {
    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return apiError("bad request body", 400);
    }
    const id = typeof payload.id === "string" ? payload.id.trim() : "";
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    if (!id || !name) return apiError("id and name are required", 400);

    const person = await upsertPerson({
      id,
      name,
      role: typeof payload.role === "string" ? payload.role : "",
      areaId: typeof payload.areaId === "string" ? payload.areaId : null,
      remember: typeof payload.remember === "string" ? payload.remember : "",
      openWithThem: typeof payload.openWithThem === "string" ? payload.openWithThem : "",
      lastTalkedAt: typeof payload.lastTalkedAt === "string" ? payload.lastTalkedAt : null,
      sortOrder: typeof payload.sortOrder === "number" ? payload.sortOrder : 0,
    });
    return NextResponse.json(person);
  } catch (e) {
    if (e instanceof NotConfiguredError) return apiError("store not configured", 503);
    console.error("[/api/people PUT]", e);
    return apiError("person write failed", 500);
  }
}
