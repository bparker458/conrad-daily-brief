#!/usr/bin/env node
/**
 * Mint a Microsoft Graph refresh token for Brad's own mailbox.
 *
 *   MS_CLIENT_ID=... MS_CLIENT_SECRET=... [MS_TENANT_ID=...] \
 *     node scripts/ms-refresh-token.mjs
 *
 * Delegated access, read only. This is the one-time human step: it prints
 * a URL, Brad signs in and consents, pastes the code back, and it prints
 * the MS_REFRESH_TOKEN line to paste into Netlify. Nothing is written to
 * disk and the token is never echoed anywhere else.
 *
 * Azure app registration (RUNBOOK.md has the click path):
 *   - Redirect URI (type "Mobile and desktop"): http://localhost:5599/callback
 *   - Delegated permissions: offline_access, Mail.Read, Calendars.Read, User.Read
 *   - No admin consent needed for a personal mailbox on a work tenant in
 *     most configurations; if the tenant requires it, an admin approves once.
 */
import { createServer } from "http";
import { createInterface } from "readline";

const CLIENT_ID = process.env.MS_CLIENT_ID || "";
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET || "";
const TENANT = process.env.MS_TENANT_ID || "common";
const REDIRECT = "http://localhost:5599/callback";
const SCOPE = "offline_access Mail.Read Calendars.Read User.Read";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set MS_CLIENT_ID and MS_CLIENT_SECRET first.");
  process.exit(1);
}

const authUrl =
  `https://login.microsoftonline.com/${encodeURIComponent(TENANT)}/oauth2/v2.0/authorize?` +
  new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT,
    response_mode: "query",
    scope: SCOPE,
    prompt: "consent",
  });

console.log("\n1. Open this in a browser signed in as Brad:\n");
console.log(authUrl);
console.log("\n2. Approve the read-only access. You'll land on a localhost page.\n");

async function exchange(code) {
  const res = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(TENANT)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT,
        grant_type: "authorization_code",
        scope: SCOPE,
      }),
    }
  );
  const data = await res.json();
  if (!res.ok || !data.refresh_token) {
    console.error("\nToken exchange failed:", JSON.stringify(data, null, 2));
    process.exit(1);
  }
  console.log("\n── Paste this into Netlify env vars (and nowhere else):\n");
  console.log(`MS_REFRESH_TOKEN=${data.refresh_token}`);
  console.log("\nScopes granted:", data.scope || SCOPE, "\n");
}

/* Catch the redirect automatically when the browser is on the same machine. */
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:5599");
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }
  const code = url.searchParams.get("code");
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(code ? "Got it. Back to the terminal." : "No code in the callback.");
  server.close();
  if (code) await exchange(code);
  process.exit(0);
});

server.listen(5599, () => {
  console.log("Waiting on http://localhost:5599/callback …");
  console.log("(If the browser is on another machine, paste the ?code= value here and press enter.)\n");
});

/* Fallback for a browser on a different machine. */
const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.question("code> ", async (answer) => {
  const code = answer.trim();
  rl.close();
  if (code) {
    server.close();
    await exchange(code);
    process.exit(0);
  }
});
