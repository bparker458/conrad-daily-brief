import { NextRequest, NextResponse } from "next/server";
import { authenticate, unauthorized, apiError } from "@/lib/auth";
import { getStateDoc, putStateDoc, NotConfiguredError } from "@/lib/dashboard-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Markdown in OneDrive stays the source of truth. Conrad PUTs the current body
 * here after every rewrite so the dashboard has something to render. Brad never
 * opens the .md file; he opens /areas/<slug>.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  if (!authenticate(req)) return unauthorized();
  try {
    const doc = await getStateDoc(params.slug);
    if (!doc) return apiError("no state doc with that slug", 404);
    return NextResponse.json(doc);
  } catch (e) {
    if (e instanceof NotConfiguredError) return apiError("store not configured", 503);
    console.error("[/api/state-docs GET]", e);
    return apiError("state doc read failed", 500);
  }
}

/** PUT — Conrad only. Body: { title, areaId?, body } */
export async function PUT(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const caller = authenticate(req);
  if (!caller) return unauthorized();
  if (caller !== "conrad") return apiError("state docs are written by Conrad only", 403);
  try {
    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return apiError("bad request body", 400);
    }
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    const body = typeof payload.body === "string" ? payload.body : "";
    if (!title) return apiError("title is required", 400);

    const doc = await putStateDoc({
      slug: params.slug,
      title,
      areaId: typeof payload.areaId === "string" ? payload.areaId : null,
      body,
    });
    return NextResponse.json(doc);
  } catch (e) {
    if (e instanceof NotConfiguredError) return apiError("store not configured", 503);
    console.error("[/api/state-docs PUT]", e);
    return apiError("state doc write failed", 500);
  }
}
