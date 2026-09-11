"use client";

import { useEffect, useState } from "react";

/**
 * Renders its children only in the browser.
 *
 * The dashboard is date-driven ("Thursday, September 10", done today, due
 * tomorrow). Netlify renders on a UTC server, so every evening after 5pm
 * Pacific the server's "today" is already tomorrow, React sees two different
 * pages, throws hydration errors #418/#423/#425 and re-renders from scratch.
 * All of the data is fetched client-side anyway, so server rendering bought
 * nothing but the mismatch. Now the server sends the frame and the phone
 * draws the day in its own timezone.
 */
export default function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="min-h-screen" aria-busy="true" />;
  return <>{children}</>;
}
