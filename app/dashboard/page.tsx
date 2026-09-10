import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** The dashboard IS the home page. Old links land in the right place. */
export default function DashboardRedirect() {
  redirect("/");
}
