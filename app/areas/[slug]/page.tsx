import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { renderMarkdown } from "@/lib/markdown";
import { getStateDoc } from "@/lib/dashboard-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The rendered state document.
 *
 * Brad has never once opened a .md file in the Conrad folder, and when he did
 * it opened in VS Code and looked like nothing. Markdown stays the source of
 * truth because it keeps him model agnostic; this page is the only way he ever
 * reads it.
 */
export default async function AreaStatePage({
  params,
}: {
  params: { slug: string };
}) {
  // Same gate as the home page: no passphrase cookie, no state document.
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!verifySessionToken(token)) redirect("/");

  let doc = null;
  let error: string | null = null;
  try {
    doc = await getStateDoc(params.slug);
  } catch (e) {
    error = e instanceof Error ? e.message : "state doc read failed";
  }

  if (error) {
    return (
      <Shell>
        <p className="text-redflag">
          Could not load this state document: {error}. What you are not seeing is
          a document, not an empty one.
        </p>
      </Shell>
    );
  }

  if (!doc) {
    return (
      <Shell>
        <p className="text-muted">
          No state document has been written for <code>{params.slug}</code> yet.
        </p>
      </Shell>
    );
  }

  const { frontMatter, html } = renderMarkdown(doc.body);
  const updated = frontMatter.updated || doc.updatedAt.slice(0, 10);
  const days = Math.floor(
    (Date.now() - new Date(doc.updatedAt).getTime()) / 86400000
  );

  return (
    <Shell>
      <header className="mb-6 border-b border-line pb-4">
        <h1 className="font-serif text-[24px] font-bold text-navy">{doc.title}</h1>
        <p className={"mt-1 text-sm " + (days > 30 ? "text-amber" : "text-muted")}>
          Updated {updated}
          {days > 30 && `, ${days} days ago, long enough to be worth a look`}
        </p>
      </header>
      <article className="statedoc" dangerouslySetInnerHTML={{ __html: html }} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-brief px-4 pb-24 pt-[calc(env(safe-area-inset-top)+18px)]">
      <a href="/" className="text-sm text-navysoft underline">
        Dashboard
      </a>
      <div className="mt-4">{children}</div>
    </main>
  );
}
