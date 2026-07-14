import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const SESSION_COOKIE = "cb_session";
const SESSION_DAYS = 180; // single-user personal app; Netlify password is the outer gate
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;

function secret(): string {
  return process.env.SESSION_SECRET || "";
}

function hmac(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Token format: "<expiryEpochMs>.<hmac(expiry)>" — httpOnly cookie only. */
export function signSession(): string {
  const exp = String(Date.now() + SESSION_MAX_AGE * 1000);
  return `${exp}.${hmac(exp)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token || !secret()) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(exp)) return false;
  if (Number(exp) < Date.now()) return false;
  return safeEqual(sig, hmac(exp));
}

export type Caller = "session" | "conrad";

/**
 * Both faces come through here (Section 6): the phone via the session
 * cookie, Conrad via `Authorization: Bearer <CONRAD_API_SECRET>`.
 */
export function authenticate(req: NextRequest): Caller | null {
  const authz = req.headers.get("authorization") || "";
  if (authz.startsWith("Bearer ")) {
    const token = authz.slice(7).trim();
    const expected = process.env.CONRAD_API_SECRET || "";
    if (expected && token && safeEqual(token, expected)) return "conrad";
    return null; // a bad bearer never falls through to cookie auth
  }
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (verifySessionToken(cookie)) return "session";
  return null;
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

/** Standard error body per Section 6: `{ error: string }` with a real status. */
export function apiError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
