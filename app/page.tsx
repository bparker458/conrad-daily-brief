import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import Dashboard from "@/components/Dashboard";
import Gate from "@/components/Gate";

export const dynamic = "force-dynamic";

export default function Page() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const authed = verifySessionToken(token);
  return authed ? <Dashboard /> : <Gate />;
}
