#!/usr/bin/env node
/**
 * Phase 2 verification — acts as Conrad (Face B) against the live API.
 *
 *   BASE=http://localhost:3010 CONRAD_API_SECRET=<secret> npm run conrad:test
 *
 * Exercises the whole contract in CONRAD-INTEGRATION.md:
 *   1. requests without the secret are rejected 401
 *   2. voice-capture create lands in the right area
 *   3. the created task is visible to the phone face (same list)
 *   4. done via API stamps doneAt and leaves the default list
 *   5. delegate / conradNote / inbox-sort round-trips
 */

const BASE = process.env.BASE || "http://localhost:3010";
const SECRET = process.env.CONRAD_API_SECRET || "";

if (!SECRET) {
  console.error("Set CONRAD_API_SECRET (and BASE if not localhost:3010).");
  process.exit(1);
}

let fails = 0;
const check = (label, ok) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) fails++;
};

const conrad = (path, opts = {}) =>
  fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });

console.log(`── Conrad contract verification against ${BASE}`);

// 1. No secret → 401
{
  const res = await fetch(`${BASE}/api/tasks`);
  check(`no secret → 401 (got ${res.status})`, res.status === 401);
  const bad = await fetch(`${BASE}/api/tasks`, {
    headers: { Authorization: "Bearer wrong-secret" },
  });
  check(`wrong secret → 401 (got ${bad.status})`, bad.status === 401);
}

// 2. Voice capture
const title = `Conrad voice test ${new Date().toISOString()}`;
let taskId = null;
{
  const res = await conrad("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ area: "dash-farms", title, source: "voice" }),
  });
  const t = res.ok ? await res.json() : null;
  taskId = t?.id ?? null;
  check(
    `voice capture created in dash-farms (status ${res.status}, source ${t?.source})`,
    res.status === 201 && t?.areaId === "dash-farms" && t?.source === "voice"
  );
}

// 3. Visible in the shared list
{
  const res = await conrad("/api/tasks?area=dash-farms");
  const list = res.ok ? await res.json() : [];
  check(
    "created task visible in the shared list (same rows the phone reads)",
    list.some((t) => t.id === taskId)
  );
}

// 4. Done via API: stamps doneAt, leaves default list, shows in include=all
{
  const res = await conrad(`/api/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "done" }),
  });
  const t = res.ok ? await res.json() : null;
  check(
    `mark done stamps doneAt (status ${t?.status}, doneAt ${t?.doneAt ? "set" : "missing"})`,
    t?.status === "done" && Boolean(t?.doneAt)
  );

  const open = await (await conrad("/api/tasks?area=dash-farms")).json();
  const all = await (await conrad("/api/tasks?area=dash-farms&include=all")).json();
  check(
    "done task off the default list, present with include=all as done",
    !open.some((t2) => t2.id === taskId) &&
      all.some((t2) => t2.id === taskId && t2.status === "done")
  );
}

// 5. Delegate, conradNote answer, inbox sort
{
  const inboxRes = await conrad("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ area: "", title: `Conrad sort test ${Date.now()}`, source: "voice" }),
  });
  const inboxTask = await inboxRes.json();
  check(`empty area lands in inbox (${inboxTask.areaId})`, inboxTask.areaId === "inbox");

  const sorted = await (
    await conrad(`/api/tasks/${inboxTask.id}`, {
      method: "PATCH",
      body: JSON.stringify({ areaId: "properties" }),
    })
  ).json();
  check(`inbox sort moves to properties (${sorted.areaId})`, sorted.areaId === "properties");

  const delegated = await (
    await conrad(`/api/tasks/${sorted.id}`, {
      method: "PATCH",
      body: JSON.stringify({ delegatedTo: "Jessica" }),
    })
  ).json();
  check(
    `delegate sets waiting (${delegated.status} / ${delegated.delegatedTo})`,
    delegated.status === "waiting" && delegated.delegatedTo === "Jessica"
  );

  const answered = await (
    await conrad(`/api/tasks/${delegated.id}`, {
      method: "PATCH",
      body: JSON.stringify({ conradNote: "Suggested next step from Conrad.", unsure: false }),
    })
  ).json();
  check(
    "conradNote written (phone shows it inline on the unsure card)",
    answered.conradNote === "Suggested next step from Conrad."
  );

  const todayStr = new Date().toISOString().slice(0, 10);
  const dated = await (
    await conrad(`/api/tasks/${answered.id}`, {
      method: "PATCH",
      body: JSON.stringify({ dueDate: todayStr }),
    })
  ).json();
  check(
    `due date stamps for Today's Plan (${dated.dueDate})`,
    dated.dueDate === todayStr
  );

  // tidy: close the sort-test task
  await conrad(`/api/tasks/${answered.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "done" }),
  });
}

// 6. Progress endpoints
{
  const areas = await (await conrad("/api/areas")).json();
  const progress = await (await conrad("/api/progress")).json();
  check(
    "progress endpoints return rollups for a morning brief",
    Array.isArray(areas) &&
      areas.length > 0 &&
      areas.every((a) => "pct" in a) &&
      Array.isArray(progress.areas) &&
      Array.isArray(progress.projects)
  );
}

console.log("");
if (fails === 0) {
  console.log("── CONRAD CONTRACT: ALL CHECKS PASSED");
} else {
  console.log(`── CONRAD CONTRACT: ${fails} CHECK(S) FAILED`);
  process.exit(1);
}
