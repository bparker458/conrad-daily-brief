#!/usr/bin/env bash
# Phase 1 acceptance checks (Section 11 of the build handoff).
# Runs against a live server. Usage:
#   BASE=http://localhost:3010 PASS=peaches bash scripts/verify-phase1.sh
# Requires: curl, python3.

set -u
BASE="${BASE:-http://localhost:3010}"
PASS="${PASS:-peaches}"
JAR="$(mktemp)"
FAILS=0

say() { printf "%s\n" "$*"; }
check() { # check <label> <ok:0|1>
  if [ "$2" = "0" ]; then say "  PASS  $1"; else say "  FAIL  $1"; FAILS=$((FAILS+1)); fi
}
json() { python3 -c "import json,sys;$1"; }

say "── Phase 1 verification against $BASE"

# Health
H=$(curl -s -m 10 "$BASE/api/health")
echo "$H" | grep -q '"ok"'; check "health reports ok ($H)" $?

# Auth gate: no cookie → 401
C=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/tasks")
[ "$C" = "401" ]; check "GET /api/tasks without auth → 401 (got $C)" $?

# Wrong passphrase → 401
C=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/session" -H 'Content-Type: application/json' -d '{"passphrase":"definitely-wrong"}')
[ "$C" = "401" ]; check "wrong passphrase → 401 (got $C)" $?

# Right passphrase → cookie
R=$(curl -s -c "$JAR" -X POST "$BASE/api/session" -H 'Content-Type: application/json' -d "{\"passphrase\":\"$PASS\"}")
echo "$R" | grep -q '"ok":true'; check "correct passphrase → ok:true + session cookie" $?

# Seed data visible; red flag sorts to top
TOP=$(curl -s -b "$JAR" "$BASE/api/tasks?area=all" | json "ts=json.load(sys.stdin);print(len(ts),'|',ts[0]['flag'])")
echo "$TOP" | grep -q "| red"; check "seed tasks load; red-flagged task sorts first ($TOP)" $?

# Create a task via + (defaults to inbox when area unknown)
NEW=$(curl -s -b "$JAR" -X POST "$BASE/api/tasks" -H 'Content-Type: application/json' -d '{"area":"no-such-area","title":"Verify capture flow","source":"phone"}')
NEW_ID=$(echo "$NEW" | json "t=json.load(sys.stdin);print(t['id'])")
echo "$NEW" | grep -q '"areaId":"inbox"'; check "POST create: unknown area lands in inbox" $?

# Create in a chosen area
NEW2=$(curl -s -b "$JAR" -X POST "$BASE/api/tasks" -H 'Content-Type: application/json' -d '{"area":"dash-farms","title":"Verify area capture","source":"phone"}')
NEW2_ID=$(echo "$NEW2" | json "t=json.load(sys.stdin);print(t['id'])")
echo "$NEW2" | grep -q '"areaId":"dash-farms"'; check "POST create: chosen area honored (dash-farms)" $?

# Progress before/after done
BEFORE=$(curl -s -b "$JAR" "$BASE/api/areas" | json "a=json.load(sys.stdin);d=[x for x in a if x['id']=='dash-farms'][0];print(d['done'],d['total'])")
DONE=$(curl -s -b "$JAR" -X PATCH "$BASE/api/tasks/$NEW2_ID" -H 'Content-Type: application/json' -d '{"status":"done"}')
echo "$DONE" | json "t=json.load(sys.stdin);import sys;sys.exit(0 if (t['status']=='done' and t['doneAt']) else 1)"; check "PATCH done sets status=done and doneAt" $?
AFTER=$(curl -s -b "$JAR" "$BASE/api/areas" | json "a=json.load(sys.stdin);d=[x for x in a if x['id']=='dash-farms'][0];print(d['done'],d['total'])")
[ "$BEFORE" != "$AFTER" ]; check "area progress moved after check ($BEFORE → $AFTER)" $?

# Done task off the active list, present with include=all
curl -s -b "$JAR" "$BASE/api/tasks?area=dash-farms" | grep -q "$NEW2_ID"; T1=$?
curl -s -b "$JAR" "$BASE/api/tasks?area=dash-farms&include=all" | grep -q "$NEW2_ID"; T2=$?
[ "$T1" = "1" ] && [ "$T2" = "0" ]; check "done task excluded by default, included with include=all" $?

# Unsure flag persists
curl -s -b "$JAR" -X PATCH "$BASE/api/tasks/$NEW_ID" -H 'Content-Type: application/json' -d '{"unsure":true}' > /dev/null
U=$(curl -s -b "$JAR" "$BASE/api/tasks?area=inbox" | json "ts=json.load(sys.stdin);print([t['unsure'] for t in ts if t['id']=='$NEW_ID'][0])")
[ "$U" = "True" ]; check "I'm-not-sure sets unsure=true and persists" $?

# Delegation → waiting; pull back → open
W=$(curl -s -b "$JAR" -X PATCH "$BASE/api/tasks/$NEW_ID" -H 'Content-Type: application/json' -d '{"delegatedTo":"Gretchen"}')
echo "$W" | json "t=json.load(sys.stdin);import sys;sys.exit(0 if (t['status']=='waiting' and t['delegatedTo']=='Gretchen') else 1)"; check "delegate sets waiting + delegatedTo" $?
P=$(curl -s -b "$JAR" -X PATCH "$BASE/api/tasks/$NEW_ID" -H 'Content-Type: application/json' -d '{"status":"open","delegatedTo":null}')
echo "$P" | json "t=json.load(sys.stdin);import sys;sys.exit(0 if (t['status']=='open' and t['delegatedTo'] is None) else 1)"; check "pull back returns to open" $?

# Note append persists
curl -s -b "$JAR" -X PATCH "$BASE/api/tasks/$NEW_ID" -H 'Content-Type: application/json' -d '{"note":"[Jul 13] test note"}' > /dev/null
N=$(curl -s -b "$JAR" "$BASE/api/tasks?area=inbox" | json "ts=json.load(sys.stdin);print([t['note'] for t in ts if t['id']=='$NEW_ID'][0])")
echo "$N" | grep -q "test note"; check "note persists" $?

# Uncheck clears doneAt
UD=$(curl -s -b "$JAR" -X PATCH "$BASE/api/tasks/$NEW2_ID" -H 'Content-Type: application/json' -d '{"status":"open"}')
echo "$UD" | json "t=json.load(sys.stdin);import sys;sys.exit(0 if (t['status']=='open' and t['doneAt'] is None) else 1)"; check "uncheck clears doneAt" $?
curl -s -b "$JAR" -X PATCH "$BASE/api/tasks/$NEW2_ID" -H 'Content-Type: application/json' -d '{"status":"done"}' > /dev/null

# 404 on unknown id
C=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X PATCH "$BASE/api/tasks/00000000-0000-0000-0000-000000000000" -H 'Content-Type: application/json' -d '{"status":"done"}')
[ "$C" = "404" ]; check "PATCH unknown id → 404 (got $C)" $?

# Progress endpoint shape
PR=$(curl -s -b "$JAR" "$BASE/api/progress")
echo "$PR" | grep -q '"areas"' && echo "$PR" | grep -q '"projects"'; check "GET /api/progress returns areas + projects rollups" $?

say ""
if [ "$FAILS" = "0" ]; then say "── ALL PHASE 1 API CHECKS PASSED (persistence-across-restart tested separately)"; else say "── $FAILS CHECK(S) FAILED"; exit 1; fi
echo "$NEW2_ID" > /tmp/cb-verify-taskid  # handed to the restart-persistence step
