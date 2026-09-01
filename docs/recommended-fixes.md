# LEADS All-in-One Dashboard — Full System Review
Source: `Kayo2970/ERP` @ `leads-dashboard/src` (read Aug 18, 2026). Covers all 11 screens: Login, Dashboard Home, Events, Tasks, Ratings, Reimbursements, Public Forms Builder, Reports, Announcements, Directory, Settings, and the public `/forms/[slug]` page.

---

## 1. Errors & Shortfalls

### Cross-cutting (whole app)
- **No real backend or auth.** Login only checks that the email exists in `local-data.ts` — the password field is decorative and accepts anything. All roles, permissions and "Row-Level Security" the PRD calls for run client-side against `localStorage`; anyone can open devtools, set `localStorage.user` to a Super User record, and get full access.
- **Logout doesn't clear session.** Logout just navigates to `/`; `localStorage.user` is never removed, so back/forward or retyping `/dashboard/home` restores the old session.
- **No route guarding.** Any URL under `/dashboard/*` renders with no logged-in user — most widgets just silently show empty/zero states instead of redirecting to login.
- **Duplicated permission logic.** The tier-based task-visibility filter is copy-pasted (slightly differently) in both Dashboard Home and the Tasks page — Tasks page also handles committee-assigned tasks that Home's copy doesn't, so a Core Committee/Training Associate can see different task counts on the two screens.
- **Two disconnected announcement data sources.** Dashboard Home renders its own hardcoded announcement array; the real Announcements page reads/writes a separate `localStorage` list. Posting a new announcement never appears on the Home tab.
- **Header title breaks on sub-routes.** `dashboard-shell.tsx` matches the nav title by exact `pathname`, so any detail route (`/dashboard/events/e1`, once built) silently falls back to showing "Dashboard" in the header.

### Login
- Password is never validated — only email lookup.
- Email `<input>` is `type="text"`, not `type="email"`; no format validation.
- Page is hardcoded to dark theme (`className="... dark"`) regardless of the visitor's saved theme preference — the only screen that ignores the theme toggle.

### Dashboard Home
- "Active Events" stat counts **all** events (`getEvents().length`), not just status `active` — the label lies about what the number means.
- Leaderboard falls back to 4 hardcoded names whenever real ratings don't already fill 4 slots — a demo score can outrank a real one indefinitely.
- Notification bell shows an unread dot with no dropdown, no click target, no destination.
- Calendar's prev/next month buttons silently null out `selectedDay` — the day panel just goes blank with no explanation.

### Events
- "View Details" button on every event card has no `onClick` — a dead button.
- No edit or delete on an existing event, only create.
- No validation that End Date ≥ Start Date.

### Tasks
- Advisory Board (tier 4) is filtered out of every branch of the visibility logic — the page always renders "no tasks" for them with no explanation that this role simply doesn't get tasks.
- Committee-assigned tasks only appear for a member whose `user.committee` string exactly matches `task.assignee` — a member in multiple committees, or a slightly different string, silently sees nothing.
- Extension approve/deny is wired to tier ≤ 3 only, with no audit trail of who approved/denied or when.
- No way to edit a task's title/due date after it's created.

### Ratings
- The committee list in "Direct Evaluation Roster" is hardcoded to 3 names instead of calling `getCommittees()` — any committee created later in Directory never appears here as a ratable unit.
- Member roster for evaluation has no search/filter — will not scale past a handful of names toward the stated ~140 users.
- Submitted ratings can't be edited or deleted — one mis-slid slider is permanent.
- Ratings history table has no filtering (by quarter, rater, or target) despite the PRD's quarterly-rollup requirement.

### Reimbursements
- **The PRD's two-stage approval (core committee first-pass → centre head final) isn't implemented.** Any tier ≤ 3 user can Approve/Deny directly; Tier 5 (Core Committee) has no approval action at all, contradicting their documented "first-pass" role.
- Bank account details render as plain, unmasked text in the table and in the CSV export — directly contradicts the PRD's "field-level encryption" requirement.
- Receipt "upload" only stores the filename string; the file itself is never persisted, and there is no view/download action anywhere for an uploaded receipt.
- Amount field accepts 0 or negative values — no validation.

### Public Forms Builder
- Creation rights are `tier ≤ 3 || tier === 5`, i.e. also open to Centre Head/Head of Events — PRD scopes form-building to Super User and Core Committee only.
- No slug uniqueness check: two forms sharing a slug means the second is permanently unreachable (`.find()` always resolves the first match), with no warning at creation time.
- No edit or delete for a form once created — a typo in a live public-facing form can't be fixed.
- Demo seed data (one form, two submissions) ships baked into every fresh browser with no visual "sample data" marker, indistinguishable from real responses.

### Reports & Analytics
- No PDF export exists at all — the PRD explicitly requires PDF + CSV; only CSV is implemented.
- No quarter/date-range filter — contradicts the PRD's "quarterly rollups" requirement; every chart is an all-time average.
- Bar chart bars are hardcoded to one green (`#7FB069`) regardless of score — the design system mandates the 5-point rating color scale be used "consistently... never re-mapped per screen," which this violates outright.
- The raw table beneath the charts isn't marked as the chart's accessible plain-text alternative (required by the design system).

### Announcements
- The "Email Dispatch Simulator" is a fake `setInterval` loop — no email is actually sent, but nothing outside the simulator's own terminal-style log communicates that this is a simulation and not production email delivery.
- No specific-committee targeting exists (PRD asks for all/committee/role-tier scoping); the scope dropdown only offers a fixed 4-option list, and Advisory Board has no scope option to be targeted directly.
- No edit or delete for a published announcement.

### Directory
- CSV import has no duplicate-email check — re-uploading the same file doubles the roster.
- Editing a member's name doesn't cascade to existing tasks/ratings, which store the assignee as a plain name string — renaming someone orphans their historical task/rating rows silently.
- No pagination, sorting, or virtualization on a table meant to hold ~140+ rows.
- Delete uses a bare browser `confirm()` dialog, breaking from the rest of the app's styled modal pattern.

### Settings
- The entire page is a static stub (one heading, one paragraph). None of the sitemap's four sub-routes — Account, Users, Roles, Audit Log — exist yet, despite Users/Roles/Audit Log being restricted to Super User only in the access matrix, i.e. currently-undeliverable functionality the PRD treats as core.

### Public form page (`/forms/[slug]`)
- An unmatched slug silently falls back to a generic feedback form instead of a 404 — a typo'd shared link still "works" but the response is never visible anywhere in the builder's submissions list, since it's filed under the mistyped slug.
- No spam/bot protection (captcha, rate limiting) on a fully public, unauthenticated endpoint.
- Still uses the dark, LEADS-branded glass theme — the design system explicitly requires public forms to feel like a respondent "never entered an internal tool," which this contradicts.

---

## 2. Solutions

### Cross-cutting
- Stand up real authentication (hashed passwords, session/JWT) and move authorization to the server (Row-Level Security in the actual database, as the PRD specifies) — the current client-only model is not a security boundary.
- On logout, clear `localStorage.user` and redirect; add a route guard (middleware or a shared layout check) that redirects to `/` whenever no valid session exists.
- Extract the task-visibility filter into one shared function in `local-data.ts` (or a `lib/permissions.ts`) and import it in both Home and Tasks so the two screens can never drift.
- Make Dashboard Home's announcements tab read the same `leads_announcements` localStorage list the Announcements page uses; delete the hardcoded array.
- Match the header title by longest-prefix route match instead of exact equality, so nested/detail routes still show their parent nav label.

### Login
- Validate password against a real credential store (even a simple hash check for now) rather than ignoring it.
- Switch the email field to `type="email"` with native format validation.
- Respect the same `theme` localStorage key the rest of the app uses instead of hardcoding dark.

### Dashboard Home
- Compute "Active Events" from `events.filter(e => e.status === 'active').length`; rename the card if a total count is actually wanted.
- Remove the hardcoded leaderboard fallback; if fewer than 4 people have ratings, show a "not enough data yet" state for the remaining slots instead of fabricated names.
- Add a notification dropdown backed by real events (task assigned, extension decided, rating published, announcement posted) with a "mark all read" action.
- When changing month, keep the same day-of-month selected if it exists in the new month; otherwise show one line explaining why nothing is selected.

### Events
- Wire "View Details" to an event detail route/drawer (the sitemap already reserves `/dashboard/events/[event-id]`).
- Add edit and archive/delete actions to each event card, gated the same way "Create Event" already is.
- Validate `endDate >= startDate` before submit, inline error otherwise.

### Tasks
- Show Advisory Board a specific "your role doesn't receive task assignments — see Reports for read-only performance data" message instead of the generic empty state.
- Match committee-assigned tasks by committee ID rather than a free-text name string, and support members belonging to multiple committees.
- Log approver/denier + timestamp on every extension decision; surface it in the row (tooltip or expandable detail).
- Add an edit action (title/due date) for the task's creator/admin roles.

### Ratings
- Replace the hardcoded 3-committee list with `getCommittees()`.
- Add a search/filter box to the evaluation roster, same pattern as Directory's search bar.
- Allow the original rater (or a Super User) to edit/delete a rating within a short window, with the change logged.
- Add quarter and rater filters to the ratings history table.

### Reimbursements
- Implement the two-stage flow literally: a `Pending → Core-Committee-Approved → Final-Approved/Rejected → Paid` status chain, with distinct UI actions for tier 5 (first pass) and tier ≤ 3 (final sign-off).
- Mask bank account numbers in the UI (show last 4 digits) and encrypt at rest; keep full details out of any CSV unless explicitly re-authorized.
- Actually persist uploaded receipt files (object storage) and add a "View Receipt" link per claim.
- Add `min="1"` and step validation to the amount field.

### Public Forms Builder
- Restrict creation to `tier === 1 || tier === 5` to match the PRD.
- Validate slug uniqueness at creation time (block or auto-suffix with an inline warning).
- Add edit (rename fields, add/remove) and delete actions per form.
- Visually tag seed/demo forms and submissions (e.g. a "Sample data" badge) so real usage is never confused with fixtures.

### Reports & Analytics
- Add a "Generate PDF" action (even a simple print-styled route) alongside the existing CSV export.
- Add a quarter/date-range selector that filters `ratings` before computing averages and chart data.
- Color each bar/segment using the rating color scale (§3 of the design system) based on that row's actual score band, not one fixed color.
- Label the raw table explicitly as "Data table (accessible alternative)" directly under each chart.

### Announcements
- Add a persistent "Simulated — no email was actually sent" label to the dispatch modal's header, not just implied by the console-log styling.
- Add a "Specific Committee" scope option (dropdown of `getCommittees()`) and an Advisory Board tier option, matching the PRD's three scoping modes.
- Add edit/retract actions for a published announcement, with an "edited" timestamp shown.

### Directory
- Check for existing emails before adding/importing; skip or flag duplicates with a count in the success/error banner.
- Store task/rating assignments by member ID internally (keep the display name as a lookup, not the source of truth) so renames don't orphan history.
- Add pagination or a virtualized list once the roster exceeds ~50 rows; add column sorting.
- Replace `confirm()` with the app's existing styled modal pattern for delete confirmation.

### Settings
- Build out the four sitemap sub-pages incrementally, prioritized by who's already gated for them: Account (all users) first, then Users/Roles/Audit Log (Super User only).

### Public form page
- Return a proper "This form doesn't exist" state for unmatched slugs instead of a silent generic fallback.
- Add basic bot mitigation (honeypot field at minimum, captcha if volume warrants it).
- Give public forms their own light, unbranded-chrome visual treatment per the design system, distinct from the internal login/dashboard theme.

---

## 3. Design Improvements (all pages)

- **Type scale floor:** raise the smallest UI text (currently 9–10px badges, timestamps, weekday labels) to a 12px minimum; reserve anything smaller for pure decoration. Affects Home, Events, Tasks, Ratings, Reimbursements, Directory, Forms.
- **Icon-in-tinted-square fatigue:** nearly every stat card, avatar, and calendar cell uses the identical tinted-square-with-icon treatment. Differentiate primary vs. secondary metrics — e.g. outline icons for secondary stats, filled tint reserved for the one or two numbers you want to lead with.
- **Redundant "admin" signaling:** the "Internal Ops" topbar badge, the role/tier text next to the avatar, and the "Administrator Workspace" pill on Home's welcome banner all restate the same fact. Keep one (the role/tier line) and drop the others.
- **Continuous vs. discrete rating display:** the 4-of-5 segmented pill bar under "Performance Rollup" implies discrete steps a decimal score (4.8) doesn't have. Use one continuous progress track instead.
- **Sidebar grouping:** group the 10 flat nav items into "Workspace" (Dashboard, Events, Tasks, Ratings) and "Administration" (Reimbursements, Forms, Reports, Announcements, Directory, Settings) so the list reflects actual usage frequency, and to visually cue which items only some roles can act on.
- **Modal pattern consistency:** every create/edit flow (Events, Tasks, Ratings, Reimbursements, Forms, Announcements, Directory) opens an near-identical centered glass modal — good consistency — but destructive actions (Directory delete) break the pattern with a native `confirm()`. Bring it in line.
- **Empty states are one gray sentence everywhere.** Design one reusable empty-state component (icon + one line + a relevant primary action, e.g. "No events yet — Create your first event") and reuse it across Events, Tasks, Ratings, Reimbursements, Forms, Announcements, Directory instead of ad hoc text.
- **Loading/skeleton states are entirely absent.** Every page reads from `localStorage` synchronously in `useEffect`, so there's a flash of empty state on first paint; add lightweight skeletons for tables/cards.
- **Glassmorphism depends on an unverified background asset.** `.bg-space-theme` points to `/images/body-bg-light.jpg` / `body-bg-dark.jpg`; confirm these ship in `public/images/`, or the signature glass-panel look degrades to flat gray on every screen that uses it (Login, all `/dashboard/*` pages, public form page).
- **Dense financial/personal data has no masking pattern.** Reimbursements' bank details and Directory's email column are shown in full, unmasked, in a UI otherwise styled as an internal ops tool — add a consistent "reveal on click" or partial-mask treatment for sensitive fields, reusable across both screens.
- **Chart color governance (Reports):** codify the rating color scale as a shared lookup (`getRatingColor(score)`) so bar charts, badges, and any future chart types can't silently diverge from the design system's mandated palette.
- **Table scale readiness:** Directory, Ratings history, and Reimbursements' processed-claims list are all flat, unpaginated tables designed for a handful of rows but scoped (per the PRD) to grow into the hundreds — add consistent pagination/sort affordances as a shared table component rather than solving it per page later.
- **Public form visual identity:** the `/forms/[slug]` page currently borrows the same dark glass chrome as the private login screen. Give public forms a distinct, lighter, single-column identity (per the design system's own instruction) so respondents never mistake it for the internal tool.
