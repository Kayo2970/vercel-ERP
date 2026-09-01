# LEADS Dashboard — Backend Sync Fix: Implementation Spec

Target: `leads-dashboard/` (Next.js App Router, TypeScript). Goal: make task/rating/event/etc. changes made by one account persist to a shared backend and appear correctly for other accounts/devices, with no data loss under concurrent use, ready to run on a self-hosted server (TrueNAS) and test across devices.

## Context (current state)
- `src/app/api/data/route.ts` — single API route, `GET`/`POST`, reads/writes one file `data/database.json` on disk.
- `src/lib/local-data.ts` — every `saveX()` (saveMembers, saveTasks, saveRatings, saveReimbursements, saveAnnouncements, saveForms, etc.) writes to `localStorage` synchronously, then calls `flushToServer()`, which debounces 300ms and POSTs **all 9 collections** (members, events, tasks, ratings, reimbursements, announcements, forms, submissions, auditLogs) to `/api/data` in one payload, regardless of which one actually changed.
- `syncWithServer()` GETs the file and overwrites `localStorage` per-collection, but only if the incoming array is non-empty, and only runs once (on mount, presumably) — not on an interval.
- Every getter (`getMembers()`, `getTasks()`, etc.) reads `localStorage` first and, if a key is missing, **synchronously seeds it with hardcoded sample data** before any async server fetch can complete.
- `data/database.json` is currently committed to git.

## Bugs to fix, in order

### 1. Stop tracking the runtime database file in git
```
git rm --cached leads-dashboard/data/database.json
echo "data/database.json" >> leads-dashboard/.gitignore
git commit -m "Stop tracking runtime database file"
```
Reason: it's server state, not source — committing it causes merge conflicts the moment two people/devices write to it, and it should never need to be pushed/pulled at all (see deployment note at the bottom).

### 2. Fix the load race: server data must win over sample/seed data
In every getter in `local-data.ts` (`getMembers`, `getEvents`, `getTasks`, `getRatings`, `getReimbursements`, `getAnnouncements`, `getForms`, `getSubmissions`, `getAuditLogs`):
- Do **not** synchronously write `initialX` into `localStorage` as a side effect of a plain getter call.
- On app/page mount, `await syncWithServer()` **before** rendering real data — show a loading state until that resolves. Only fall back to `initialX` sample data if the server fetch fails AND `localStorage` is also empty (true first-run/offline case).

### 3. Stop sending the whole database on every save — split into per-collection, per-record API routes
Replace the single `/api/data` route with one route per collection, each handling single-record operations:
- `src/app/api/members/route.ts` — `GET` (list), `POST` (create one)
- `src/app/api/members/[id]/route.ts` — `PATCH` (update one), `DELETE`
- Same pattern for: `events`, `tasks`, `ratings`, `reimbursements`, `announcements`, `forms`, `submissions`, `auditLogs`.
- Each route still reads/writes the same `data/database.json` file server-side (no new datastore needed yet), but only touches the one array it owns — read the file, mutate just that collection, write the file back. This removes the "last full save wins and clobbers everything else" bug.
- Update every `saveX()` / `addX()` / `updateX()` / `deleteX()` in `local-data.ts` to call its specific endpoint with just the one changed record, `await` the response, and update local state/`localStorage` cache from the response — not from a full-database flush.

### 4. Add live sync between open sessions
Simplest option (do this first): poll. In whichever hook/effect currently calls `syncWithServer()` once, change it to `setInterval(syncWithServer, 7000)` (7–10s is fine for this use case), cleared on unmount. This is enough for "assign a task on one laptop, see it show up on another" testing.
- Optional follow-up, not required for first pass: replace polling with a Server-Sent Events route (`src/app/api/stream/route.ts`) that pushes a message whenever `data/database.json` changes, so updates appear instantly instead of within the poll interval.

### 5. Keep the existing audit log
`logAuditEvent(...)` calls already exist throughout `local-data.ts` — keep them wired to every mutation above; they're useful for verifying which device/account made which change while testing.

## Deployment note (do this after the above, not instead of it)
Data does not need to travel through git at all. Run **one** instance of this app on the TrueNAS box; every test device (laptop, phone, teammate's machine) points its browser at that one server's LAN address. Because they all hit the same server process and the same `data/database.json` on its disk, they're automatically in sync — git only needs to carry code changes (push from dev machine → pull on the TrueNAS box → rebuild/restart the container). Mount `data/` as a persistent TrueNAS dataset so the live test data survives redeploys.

## Acceptance check before calling this done
1. Two browser sessions (can be two browser profiles on one machine to start) logged in as two different accounts.
2. Account A assigns a task to Account B → within one poll interval, Account B's Tasks page shows it without a manual refresh.
3. Account A rates a completed task while Account B is mid-edit on an unrelated reimbursement claim on another session → both changes persist; neither is lost.
4. Refresh either session — data still matches the server, not stale localStorage.
