// Dedupe guard fixtures. Run: npx tsc lib/dedupe.ts --outDir /tmp/dd --module es2020 && node scripts/dedupe-test.mjs
import { sameTask, stripCandidatePrefix, findDuplicate } from "/tmp/dd/dedupe.js";

let fail = 0;
const ok = (cond, name) => { console.log((cond ? "PASS " : "FAIL ") + name); if (!cond) fail++; };

// Real duplicates from the live ledger, 2026-09-10
ok(sameTask("Cast your vote on the Trakwell Drata renewal - continue the compliance subscription or cut it",
            "CANDIDATE: Cast your vote on the Trakwell Drata renewal - Rusty called a poll, Todd already voted yes"), "drata two wordings");
ok(sameTask("Pay the past-due PGE bill for 17640 SW Shawnee Trl - $376.52, was due Aug 31 (or hand to Jessica)",
            "Pay the past-due PGE bill for 17640 SW Shawnee Trl - $376.52, was due Aug 31"), "pge parenthetical");
ok(sameTask("Decide by Sept 15 whether the G&S Partnership pays any part of Sandra's personal Q3 tax - about $826",
            "Decide whether the partnership pays any part of Sandra's personal Q3 tax (~$826)"), "sandra tax");
// Different asks that must stay separate
ok(!sameTask("Call Jessica about payroll", "Call Jessica about the lease"), "short different asks");
ok(!sameTask("Review Jessica's draft response letter to Hagen Law Office before it goes out",
             "Upload the signed Fidelity EFT form at Fidelity.com/upload-EFT - Jessica scanned it to you"), "unrelated");
ok(!sameTask("Pay the PGE bill for the Shawnee house", "Pay the NW Natural bill for the farm"), "different bills");
// Prefix handling
const s = stripCandidatePrefix("CANDIDATE: Decide on the Brix luncheon");
ok(s.hadPrefix && s.title === "Decide on the Brix luncheon", "strip prefix");
ok(!stripCandidatePrefix("Candidates for the store manager role").hadPrefix, "no false prefix");
// Closed tasks: recent blocks, old does not
const now = new Date().toISOString();
const old = new Date(Date.now() - 90 * 86400000).toISOString();
const base = { sourceLink: null, createdAt: now, doneAt: now };
ok(findDuplicate([{ ...base, title: "Sign the lease renewal for Delta Park", status: "done" }], "Sign the lease renewal for Delta Park", null) !== null, "recent done blocks");
ok(findDuplicate([{ ...base, title: "Sign the lease renewal for Delta Park", status: "done", doneAt: old, createdAt: old }], "Sign the lease renewal for Delta Park", null) === null, "old done does not block");
ok(findDuplicate([{ ...base, title: "Something else entirely here", status: "open", sourceLink: "msg-123" }], "New wording", "msg-123") !== null, "sourceLink match");

console.log(fail ? `DEDUPE: ${fail} FAILED` : "DEDUPE: ALL PASSED");
process.exit(fail ? 1 : 0);
