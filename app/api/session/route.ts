import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { apiError, signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  let passphrase = "";
  try {
    const body = await req.json();
    passphrase = typeof body?.passphrase === "string" ? body.passphrase : "";
  } catch {
    return apiError("bad request body", 400);
  }
  const hash = process.env.APP_PASSPHRASE_HASH || "";
  if (!hash || !process.env.SESSION_SECRET) {
    return apiError("app not configured", 500);
  }
  // Small fixed delay to blunt brute force; Netlify site password is the outer gate.
  await sleep(350);
  const ok = passphrase.length > 0 && (await bcrypt.compare(passphrase, hash));
  if (!ok) return apiError("wrong passphrase", 401);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, signSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
