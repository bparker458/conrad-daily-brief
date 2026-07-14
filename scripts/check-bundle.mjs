#!/usr/bin/env node
/**
 * Build-time security check (Section 7 of the handoff):
 * fail the build if anything secret-shaped leaks into the CLIENT bundle.
 *
 * Scans .next/static (the only code shipped to browsers) for:
 *  - the literal strings SUPABASE_SERVICE_ROLE_KEY / service_role /
 *    CONRAD_API_SECRET / SESSION_SECRET / APP_PASSPHRASE_HASH
 *  - the actual VALUES of those env vars, when set
 *
 * Server bundles (.next/server) legitimately contain them — not scanned.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import path from "path";

const STATIC_DIR = path.join(process.cwd(), ".next", "static");

const NEEDLE_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "service_role",
  "CONRAD_API_SECRET",
  "SESSION_SECRET",
  "APP_PASSPHRASE_HASH",
];

const NEEDLE_VALUES = [
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  process.env.CONRAD_API_SECRET,
  process.env.SESSION_SECRET,
  process.env.APP_PASSPHRASE_HASH,
].filter((v) => typeof v === "string" && v.length >= 12);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else yield p;
  }
}

if (!existsSync(STATIC_DIR)) {
  console.error("check-bundle: .next/static not found — run `next build` first.");
  process.exit(1);
}

const hits = [];
for (const file of walk(STATIC_DIR)) {
  if (!/\.(js|css|txt|json)$/.test(file)) continue;
  const content = readFileSync(file, "utf8");
  for (const needle of NEEDLE_NAMES) {
    if (content.includes(needle)) hits.push({ file, needle: `name:${needle}` });
  }
  for (const value of NEEDLE_VALUES) {
    if (content.includes(value)) hits.push({ file, needle: "env value (redacted)" });
  }
}

if (hits.length > 0) {
  console.error("check-bundle: SECRET MATERIAL FOUND IN CLIENT BUNDLE — failing build.");
  for (const h of hits) console.error(`  ${h.needle}  →  ${path.relative(process.cwd(), h.file)}`);
  process.exit(1);
}

console.log("check-bundle: clean — no server secrets in the client bundle.");
