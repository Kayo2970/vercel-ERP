# LEADS Dashboard — Full Codebase Bug Audit
Read directly from `Kayo2970/ERP@main` (all `leads-dashboard/src` files: every page, every API route, `local-data.ts`, `server-db.ts`, shared components) on Aug 18, 2026. Ordered by severity.

**Status as of 2026-08-17 (re-verified against current `main` + PR #1):** 6 of 8 items below are confirmed resolved (#1, #2, #3, #4, #5, #7). #6 is still open. #8 (per-event committee model) not re-checked this pass — status left as originally audited. See each item's **Status** line for what was verified and how.

## Critical

### 1. ✅ RESOLVED — The write mutex permanently breaks after the first error (`src/lib/server-db.ts`)
```js
writeLock = writeLock.then(async () => { ... });
```
`mutateCollection` chains every write onto one shared promise. If the mutator callback throws — which happens on purpose in `/api/members` (duplicate email check) and implicitly whenever a `[id]/route.ts` doesn't find the record — `writeLock` becomes a **rejected** promise. Every future call does `.then(fn)` on that rejected promise; with only a fulfillment handler, `.then()` skips `fn` and just re-rejects. From that point on, `data/database.json` **stops being written at all, for every collection, for the life of the server process** — not just the one that errored. Symptom you'd see while testing: saves work fine for a while, then silently stop persisting anything, with no error surfaced anywhere except the one request that happened to trigger it.
- **Fix:** inside the `.then()` callback, wrap the read/mutate/write in try/catch; on error, resolve the lock anyway (don't let the rejection propagate into the shared `writeLock` chain) and communicate the failure back to the caller through a separate mechanism (e.g. a thrown error captured before resolving).
- **Status:** Confirmed fixed in current `server-db.ts` — `mutateCollection`/`writeDb` always resolve `writeLock` inside their own try/catch and rethrow the captured error separately after `await writeLock`, so one failing mutator no longer poisons every future write.

### 2. ✅ RESOLVED — Committee-assigned tasks are invisible to everyone (`canViewTask` in `local-data.ts`)
```js
export function canViewTask(task, user) {
  if (user.tier <= 3) return true;
  if (user.tier === 4) return true;
  return Boolean(task.assignee === user.name || task.assigneeEmail === user.email || task.assigneeId === user.id);
}
```
There is no branch at all for `task.assigneeType === 'committee'`. Any task assigned to a whole committee — which the UI explicitly supports (`assigneeType: 'individual' | 'committee'`) — is unreachable by every tier 5/6 member, because none of them will ever match `task.assignee` (which holds a committee name, not a person) by name/email/id.
- **Fix:** add a branch: when `assigneeType === 'committee'`, check the task's `eventCommitteeId`/`eventCommitteeName` against the committees the user belongs to (via `EventCommittee.memberIds` on the parent event).
- **Status:** Confirmed fixed — `canViewTask` now has a full `task.assigneeType === 'committee'` branch checking legacy `user.committee` name match and event-committee `memberIds`/`leadMemberId` membership.

### 3. ✅ RESOLVED (2026-08-17) — Cross-device polling never actually updates an open screen
`dashboard-shell.tsx` polls `syncWithServer()` every 7s, which only writes to `localStorage`. Nothing dispatches an event afterward, and every page (`Tasks`, `Events`, `Ratings`, etc.) reads its data once in a mount `useEffect` and never listens for anything else. So a change made on another device updates `localStorage` in the background but **the screen you're looking at never re-renders** — you have to navigate away and back or hard-refresh to see it. This defeats the actual goal (seeing another account's change appear live).
- **Fix:** at the end of `syncWithServer()`, `window.dispatchEvent(new Event('leads-data-sync'))`; add a listener for that event in each page's data-loading effect (same pattern the persona-switcher already uses for `'storage'`).
- **Status:** This was the actual bug behind the "Person B never sees Person A's changes, even on the server" report. A prior commit (`dd7a317`) added the `'leads-data-sync'` listener to every page as described above, but **never added the matching `dispatchEvent` call inside `syncWithServer()`** — so the listeners existed but nothing ever fired them for a same-tab background poll (the native `'storage'` event only fires in *other* tabs). Fixed in `local-data.ts` by dispatching `'leads-data-sync'` at the end of a successful `syncWithServer()`. Verified live with two concurrent browser sessions: Person A creates a task via the UI, Person B's already-open Tasks page (no reload) picks it up within one 7s poll cycle. See PR #1.

## High

### 4. ✅ RESOLVED — Test-persona tiers contradict the app's own role/tier table
`TEST_PERSONAS` in `dashboard-shell.tsx` assigns:
- "Dr. Ananya Sharma" — **Centre Head** — **tier 1**
- "Prof. S. Ramesh" — **Faculty Advisor** — **tier 1**
- "Rahul Verma" — **Head of Events** — **tier 1**

But `Settings → Roles & Permissions Matrix` (and every permission check in the codebase — `tier <= 3`, `tier === 1`, etc.) defines Centre Head as tier 2 and Head of Events as tier 3. Switching to these test personas silently grants them **Super User-level access** (tier 1) instead of the tier their role name implies, which will make any RBAC testing you do with the persona switcher misleading — you'll think Centre Head can do something because your test persona for "Centre Head" is actually running as Super User.
- **Fix:** correct each persona's `tier` field to match its role: Centre Head → 2, Head of Events → 3, Faculty Advisor/Advisory Board → 4, etc.
- **Status:** Confirmed fixed — `TEST_PERSONAS` in `dashboard-shell.tsx` now lists Centre Head as tier 2, Head of Events as tier 3, Faculty Advisor/Alumni Advisor as tier 4, matching the permission checks used throughout the app.

### 5. ✅ RESOLVED — Public form slugs aren't checked for uniqueness server-side
`isSlugUnique()` only checks the client's local cache before calling `addForm()`. The `/api/forms` POST route has no equivalent server-side check (unlike `/api/members`, which does reject duplicate emails server-side). Two people creating a form around the same time, or one person with a stale local cache, can create two forms sharing a slug — the public `/forms/[slug]` page will only ever resolve to whichever one `.find()` hits first, silently shadowing the other.
- **Fix:** add the same duplicate check pattern used in `/api/members/route.ts` to `/api/forms/route.ts`, keyed on `slug`.
- **Status:** Confirmed fixed — `/api/forms/route.ts` POST now rejects a duplicate slug (case-insensitive) inside the `mutateCollection` mutator, same pattern as `/api/members/route.ts`.

### 6. ❌ NOT FIXED — Settings → Change Password is fully decorative
`handleUpdateAccount` in `dashboard/settings/page.tsx` validates `newPassword` (length, confirmation match) but never stores it anywhere — there's no password field on `Member`, nothing is hashed or persisted — and then shows "Account details and credentials saved successfully." Users will believe they changed their password when nothing happened. (Consistent with login already accepting any password ≥ 4 characters — there's no real credential store yet anywhere in the app.)
- **Fix:** either remove the password fields until real auth exists, or clearly label the account system as demo-only or wire it to real credential storage.
- **Status:** Still open. Not touched by this session's fix — worth prioritizing before wider rollout since it actively misleads users into thinking they've changed their password.

### 7. ✅ RESOLVED — Dead, un-mutex'd write path still exists (`src/app/api/data/route.ts`)
The original monolithic route is still present with a working `POST` that writes `data/database.json` directly via `fs.writeFileSync`, completely bypassing `server-db.ts`'s write lock. Nothing in the current client code calls it (confirmed — `local-data.ts` only ever does `fetch('/api/data', ...)` as a `GET` inside `syncWithServer`), but it's live, reachable, unauthenticated surface area. If anything is ever wired back to it (or someone calls it directly), it can race a queued `mutateCollection` write and corrupt/overwrite the file non-atomically.
- **Fix:** delete the `POST` export entirely; if `GET /api/data` is still wanted as a "fetch everything" convenience endpoint, have it call `readDb()` from `server-db.ts` instead of its own duplicate file-read logic.
- **Status:** Confirmed fixed — `src/app/api/data/route.ts` now only exports `GET`, and it calls `readDb()` from `server-db.ts` as suggested.

## Medium

### 8. `getCommittees()` fallback list doesn't reflect the per-event committee model
```js
if (names.size === 0) return ['Logistics & Venue Committee', 'Technical & AV Committee', 'Design & Media Committee'];
```
Committees now live per-event (`EventItem.committees[]`), so this global function collects names across *all* events. If two different events happen to create differently-scoped committees with the same display name (e.g. two "Design & Media Committee"s for two different events), callers of `getCommittees()` can't tell them apart — it returns a flat `string[]`, losing which event/id each name belongs to. Anywhere this flat list is used to attribute or filter data (e.g. ratings), it's matching by name only, not by the actual committee record.
- **Fix:** return `{id, name, eventId}[]` instead of `string[]`, or scope `getCommittees()` calls to a specific event where that's the actual use case.

### 9. Reimbursement approval stage isn't enforced by role, only by whichever button is clicked
Looking at `updateReimbursementStatus(id, status, reviewerInfo)`: the `stage: 'firstPass' | 'final'` is passed in by the caller, not derived from `reviewerInfo`'s actual tier. If the Reimbursements page UI ever calls this with the wrong stage for a given user's role (worth double-checking the page component, not just the data layer), the two-stage approval could be bypassed by a tier-5 user's action being recorded as `finalApprover`.
- **Fix:** derive `stage` inside `updateReimbursementStatus` from the reviewer's own tier (`tier === 5` → `'firstPass'`, `tier <= 3` → `'final'`) instead of trusting the caller's label.

### 10. Audit log is unbounded on the client, capped inconsistently on the server
`logAuditEvent()` keeps the last 100 entries in `localStorage`, but `/api/auditlogs`'s `mutateCollection` keeps the last 200 on the server. Since the client always re-syncs from the server (`syncWithServer` overwrites `leads_audit_logs` with whatever the server has, uncapped at the sync step), the two limits don't line up — not a functional break, just worth aligning to avoid confusion when a Super User compares what they see across a page reload.

## Low / cleanup
- `saveMembers()`'s comment ("bulk saves still write to /api/data for simplicity") is stale — the actual code path uses per-member `serverPatch` calls in `bulkUpdateMembers`, not `/api/data`. Update or remove the comment.
- Login page's password hint ("Use any password (e.g. leads2026)") openly documents that auth is fake — fine for internal testing, but make sure this string is removed before anything resembling a real deployment.
- `EmptyState`/`ConfirmModal` components are solid and consistently used — no changes needed there.

## Suggested fix order
1. #1 (write-lock poisoning) — this can make every other fix look "broken" during testing if left in place.
2. #3 (live sync not reflected in UI) — otherwise your cross-device test will look like it's failing even once #1 and #2 are fixed.
3. #2 (committee task visibility) — functional gap affecting real usage, not just testing.
4. #4 (persona tiers) — fix before doing any more RBAC testing with the switcher, or your results will be wrong.
5. #5, #7 (server-side slug check, dead route) — hardening, do before opening this to more than one device.
6. #6, #9, #10 — lower urgency, fix when convenient.
