/**
 * Stamp the service worker cache version with something unique to this build.
 *
 * Why this exists: Next writes a new content hash into every
 * /_next/static/chunks/... filename on each build, and Netlify stops serving
 * the previous build's files. The service worker's activate handler only
 * deletes caches whose key differs from VERSION, so a hard-coded VERSION means
 * a cache from an older deploy is never purged. It keeps a cached navigation
 * shell that points at chunk URLs which now 404, and the page renders blank.
 *
 * That is not hypothetical. VERSION sat at "cb-v2" from 2026-09-11 through the
 * 2026-09-14 deploy, which changed every chunk hash. On 2026-09-20 the stale
 * shell was served and app/page-a6b632811c80f1c5.js came back 404.
 *
 * Runs before `next build`. Idempotent: it rewrites the VERSION line in place,
 * so running it twice is the same as running it once.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const SW = new URL("../public/sw.js", import.meta.url);

function buildId() {
  // Netlify and most CI set the commit; a commit is the most useful token
  // because it ties a cache to the exact code that built it.
  const fromEnv =
    process.env.COMMIT_REF ||
    process.env.GITHUB_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    "";
  if (fromEnv) return fromEnv.slice(0, 12);
  try {
    return execSync("git rev-parse --short=12 HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    // No git and no CI env: fall back to the clock so the value still changes.
    return `t${Date.now().toString(36)}`;
  }
}

const version = `cb-${buildId()}`;
const src = readFileSync(SW, "utf8");
const line = /^const VERSION = "[^"]*";$/m;

if (!line.test(src)) {
  console.error(
    '[stamp-sw] Could not find a `const VERSION = "...";` line in public/sw.js. ' +
      "Refusing to build with an unstamped service worker, because an unstamped " +
      "one serves a blank page after the next deploy."
  );
  process.exit(1);
}

const out = src.replace(line, `const VERSION = "${version}";`);
writeFileSync(SW, out);
console.log(`[stamp-sw] service worker cache version = ${version}`);
