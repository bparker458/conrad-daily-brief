import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import Brief from "@/components/Brief";
import Gate from "@/components/Gate";

export const dynamic = "force-dynamic";

export default function Page() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const authed = verifySessionToken(token);
  return authed ? <Brief /> : <Gate />;
}
