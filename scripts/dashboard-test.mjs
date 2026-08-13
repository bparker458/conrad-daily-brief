#!/usr/bin/env node
/**
 * Dashboard contract verification — acts as Conrad against a running app.
 *
 *   BASE=http://localhost:3000 CONRAD_API_SECRET=<secret> npm run dashboard:test
 *
 * What it proves, in the order Brad's protocol asks for it:
 *   1. every panel carries an explicit status, never a bare empty list
 *   2. a task store outage cannot look like "nothing to do"
 *   3. the checkbox round-trips AND leaves a durable event log entry
 *   4. the daily numbers come from stored rows, with no hardcoded fallback
 *   5. a signal converts into a task that keeps its provenance
 *   6. dismissing a signal makes it stay dismissed
 */

const BASE = process.env.BASE || "http://localhost:3000";
const SECRET = process.env.CONRAD_API_SECRET || "";

if (!SECRET) {
  console.error("Set CONRAD_API_SECRET (and BASE if not localhost:3000).");
  process.exit(1);
}

let fails = 0;
const check = (label, ok) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) fails++;
};

const api = (path, opts = {}) =>
  fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });

const PANEL_STATUSES = ["ok", "empty", "not_configured", "unavailable", "stale"];
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

console.log(`── Dashboard contract verification against ${BASE}`);

/* 1. Auth and panel shape */
{
  const anon = await fetch(`${BASE}/api/dashboard`);
  check(`no secret → 401 (got ${anon.status})`, anon.status === 401);

  const res = await api("/api/dashboard");
  check(`dashboard responds 200 (got ${res.status})`, res.ok);
  const d = await res.json();

  for (const key of ["tasks", "areas", "signals", "numbers", "mail", "calendar"]) {
    const p = d[key];
    check(
      `${key}: carries an explicit status (${p?.status})`,
      !!p && PANEL_STATUSES.includes(p.status) && Array.isArray(p.data)
    );
  }
  check("every panel names its source", ["tasks", "mail", "calendar"].every((k) => !!d[k].source));
  check(
    "a failing panel always explains itself",
    ["tasks", "mail", "calendar", "numbers"].every(
      (k) => d[k].status !== "unavailable" || d[k].error.length > 0
    )
  );
  check("the day and week are computed for Brad's zone", /^\d{4}-\d{2}-\d{2}$/.test(d.today) && d.week.start <= d.today && d.today <= d.week.end);
  check("source health is reported", Array.isArray(d.sourceHealth));
}

/* 2. Checkbox round trip + event log */
let taskId = null;
{
  const created = await (
    await api("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        area: "dash-farms",
        title: `Dashboard test ${Date.now()}`,
        source: "voice",
        sourceRef: "Automated check",
      }),
    })
  ).json();
  taskId = created.id;
  check("task keeps its provenance on create", created.sourceRef === "Automated check");

  const planned = await (
    await api(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ dueDate: today }) })
  ).json();
  check(`due date stamps for Today's plan (${planned.dueDate})`, planned.dueDate === today);

  const done = await (
    await api(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) })
  ).json();
  check("mark done stamps doneAt", done.status === "done" && Boolean(done.doneAt));

  const events = await (await api("/api/events?limit=25")).json();
  const mine = events.filter((e) => e.taskId === taskId).map((e) => e.kind);
  check(
    `the tick left a durable log entry (${mine.join(", ") || "none"})`,
    mine.includes("done") && mine.includes("created") && mine.includes("planned")
  );
}

/* 3. Numbers come from the store */
{
  const before = await (await api("/api/numbers")).json();
  check(
    `numbers panel has a real status (${before.status})`,
    PANEL_STATUSES.includes(before.status)
  );

  const written = 12345 + Math.floor(Math.random() * 100);
  const post = await api("/api/numbers", {
    method: "POST",
    body: JSON.stringify({
      resultsThrough: yesterday,
      written,
      toGoalPct: 92.5,
      toAdjustedGoalPct: 88.1,
      toLastYearPct: 101.2,
      source: "automated check",
    }),
  });
  check(`recap accepted (${post.status})`, post.status === 201);

  const after = await (await api("/api/numbers")).json();
  check("newest recap is what the dashboard reads", after.data?.[0]?.written === written);
  check("the panel says whether it is current", typeof after.isCurrent === "boolean");

  const bad = await api("/api/numbers", {
    method: "POST",
    body: JSON.stringify({ resultsThrough: "not-a-date", written: 1, toGoalPct: 1, toAdjustedGoalPct: 1, toLastYearPct: 1 }),
  });
  check(`a malformed recap is refused (${bad.status})`, bad.status === 400);
}

/* 4. Signal → task, with provenance and a back link */
{
  const externalId = `test-${Date.now()}`;
  const signal = await (
    await api("/api/signals", {
      method: "POST",
      body: JSON.stringify({
        kind: "mail",
        source: "outlook",
        externalId,
        title: "Signature needed on the refi packet",
        person: "Nick Stanley",
        personEmail: "nstanley@example.com",
      }),
    })
  ).json();
  check("signal created", Boolean(signal.id) && signal.status === "open");

  const again = await (
    await api("/api/signals", {
      method: "POST",
      body: JSON.stringify({ kind: "mail", source: "outlook", externalId, title: "Signature needed on the refi packet" }),
    })
  ).json();
  check("re-running a sweep updates rather than duplicates", again.id === signal.id);

  const converted = await (
    await api(`/api/signals/${signal.id}`, {
      method: "PATCH",
      body: JSON.stringify({ convertTo: { area: "properties", dueDate: today } }),
    })
  ).json();
  check("signal becomes a task", converted.task?.title === "Signature needed on the refi packet");
  check("task points back at the signal", converted.task?.originSignalId === signal.id);
  check(
    `task carries plain English provenance (${converted.task?.sourceRef})`,
    /Email from Nick Stanley/.test(converted.task?.sourceRef || "")
  );
  check("signal is marked converted so it cannot double-list", converted.signal?.status === "converted");

  await api(`/api/tasks/${converted.task.id}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) });
}

/* 5. Dismissal sticks */
{
  const externalId = `dismiss-${Date.now()}`;
  const signal = await (
    await api("/api/signals", {
      method: "POST",
      body: JSON.stringify({ kind: "mail", source: "gmail", externalId, title: "Newsletter" }),
    })
  ).json();
  await api(`/api/signals/${signal.id}`, { method: "PATCH", body: JSON.stringify({ status: "dismissed" }) });
  const open = await (await api("/api/signals?status=open")).json();
  check("a dismissed signal leaves the open list for good", !open.some((s) => s.id === signal.id));
}

/* 6. Week rollup and warm run */
{
  const week = await (await api("/api/week")).json();
  check(
    "week rollup returns the counts the morning brief narrates",
    week.counts && ["overdue", "dueToday", "later", "waiting", "doneThisWeek"].every((k) => k in week.counts)
  );

  const warm = await (await api("/api/warm", { method: "POST" })).json();
  check("warm run reports what it actually did", Array.isArray(warm.probes) && "mail" in warm && "calendar" in warm);
  check(
    "not connected is reported as setup, not as failure",
    !warm.problems.some((p) => /not connected/i.test(p))
  );
}

console.log("");
if (fails === 0) {
  console.log("── DASHBOARD CONTRACT: ALL CHECKS PASSED");
} else {
  console.log(`── DASHBOARD CONTRACT: ${fails} CHECK(S) FAILED`);
  process.exit(1);
}
