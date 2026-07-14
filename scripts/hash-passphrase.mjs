#!/usr/bin/env node
/**
 * Generate the bcrypt hash for APP_PASSPHRASE_HASH.
 * Usage:  npm run hash -- "the passphrase Brad picked"
 */
import bcrypt from "bcryptjs";

const phrase = process.argv[2];
if (!phrase) {
  console.error('Usage: npm run hash -- "the passphrase"');
  process.exit(1);
}
const hash = bcrypt.hashSync(phrase, 12);
console.log("\nFor the Netlify environment-variable UI, paste the value AS IS:\n");
console.log("  " + hash + "\n");
console.log("For a local .env.local file, use this line instead — the backslashes");
console.log("protect the $ characters from Next's env expansion:\n");
console.log("  APP_PASSPHRASE_HASH=" + hash.replace(/\$/g, "\\$") + "\n");
