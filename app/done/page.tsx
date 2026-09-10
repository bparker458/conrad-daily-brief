import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import DoneView from "@/components/DoneView";

export const dynamic = "force-dynamic";

export default function DonePage() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!verifySessionToken(token)) redirect("/");
  return <DoneView />;
}
