#!/usr/bin/env node
/**
 * One-time helper for Marshall (RUNBOOK.md step 6): turn a Google OAuth
 * client into the GOOGLE_REFRESH_TOKEN env value. Read-only scopes only.
 *
 *   node scripts/google-refresh-token.mjs <CLIENT_ID> <CLIENT_SECRET>
 *
 * 1. Prints a URL — open it in a browser signed in as Brad's Google account.
 * 2. Approve the two read-only permissions.
 * 3. Google shows a code — paste it back here.
 * 4. The script prints GOOGLE_REFRESH_TOKEN for the Netlify env vars.
 */
import { createInterface } from "readline";

const [clientId, clientSecret] = process.argv.slice(2);
if (!clientId || !clientSecret) {
  console.error("Usage: node scripts/google-refresh-token.mjs <CLIENT_ID> <CLIENT_SECRET>");
  process.exit(1);
}

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
].join(" ");
const REDIRECT = "urn:ietf:wg:oauth:2.0:oob"; // manual copy-paste flow
// If Google rejects the oob flow for this client type, use http://localhost
// as the redirect URI in the OAuth client and paste the ?code= from the
// browser's address bar instead — RUNBOOK.md walks through it.

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth" +
  `?client_id=${encodeURIComponent(clientId)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT)}` +
  "&response_type=code" +
  `&scope=${encodeURIComponent(SCOPES)}` +
  "&access_type=offline&prompt=consent";

console.log("\n1) Open this URL in a browser signed in as Brad's Google account:\n");
console.log(authUrl);
console.log("\n2) Approve, copy the code Google shows you.\n");

const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.question("3) Paste the code here: ", async (code) => {
  rl.close();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: code.trim(),
      grant_type: "authorization_code",
      redirect_uri: REDIRECT,
    }),
  });
  const data = await res.json();
  if (!data.refresh_token) {
    console.error("\nNo refresh token returned. Full response:\n", data);
    console.error("\nUsual causes: consent screen not in Testing/Published, or a previously granted consent — revoke at myaccount.google.com/permissions and retry.");
    process.exit(1);
  }
  console.log("\nGOOGLE_REFRESH_TOKEN=" + data.refresh_token + "\n");
  console.log("Add that to the Netlify environment variables along with the client id and secret.");
});
