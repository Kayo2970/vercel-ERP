# LEADS All-in-One Dashboard — Project Requirements Document (PRD)
**LEADS Next Gen Centre | MSRUAS | Version 1.0 | August 2026**

---

## Version History

| Version | Date | Author | Change |
|---------|------|--------|--------|
| v1.0 | Aug 2026 | Kayomarz Pavri | Initial document |

---

## 1. What This Portal Does

LEADS All-in-One Dashboard is a private, internal management system for the LEADS Next Gen Centre at MSRUAS, Bengaluru. It brings together event management, task assignment, performance evaluation, reimbursements, and public-facing feedback collection into a single tool.

It is **not a public website**. Only the modules explicitly marked public (form responses) are accessible without login. Everything else sits behind role-based authentication.

## 2. The Problem It Solves

LEADS currently runs on a mix of WhatsApp groups, Excel sheets, and email threads across 6 role tiers and roughly 140 people. This creates:

1. **No task traceability** — no record of who was assigned what, when they acknowledged it, or whether they needed more time.
2. **No structured evaluation** — individual and committee performance isn't scored or tracked over time.
3. **No financial audit trail** — reimbursement claims are handled ad hoc with no approval record.
4. **No centralized feedback collection** — post-event surveys and reviews are scattered across whatever tool was used that week.
5. **No reporting** — leadership has no easy way to pull a performance report by event, committee, or individual.

LEADS All-in-One Dashboard solves all five.

## 3. Who Uses It

| Tier | Role | Core capability |
|---|---|---|
| 1 | Super user (Kayomarz) | Full system control, all modules, user management |
| 2 | Centre head | Rates individuals & committees, approves reimbursements (final), approves extensions |
| 3 | Head of events | Rates individuals & committees, manages event calendar |
| 4 | Advisory board | Views reports, provides strategic input, no rating authority |
| 5 | Core committee | Creates events/tasks, assigns work, first-pass reimbursement approval |
| 6 | Training associates | Receives tasks, acknowledges/requests extensions, logs contributions |

External respondents (no login) can only submit responses to public forms — they have no dashboard access.

## 4. Core Modules

### 4.1 Event Management
- Create events, link one or more committees to each event
- Break an event into sub-tasks
- Event status: planned → active → completed → archived

### 4.2 Task Management
- A task is either **event-linked** or **standalone**
- Assignable to an individual, a group of individuals, or an entire committee
- Full lifecycle: `Assigned → Acknowledged/In progress → (Extension requested → Extension approved/denied) → Completed → Rated`
- Students can flag "not yet started" and request a deadline extension; core committee or the assigning authority approves or denies

### 4.3 Rating & Evaluation
- 1–5 scale, applied per task and rolled up per event and per quarter
- **Individual ratings**: given only by centre head or head of events
- **Committee-level ratings**: a faculty member can rate an entire committee as a unit for a given event, separate from individual scores
- Evaluation criteria fields: quality, timeliness, initiative, collaboration (customizable per event)

### 4.4 Announcements & Email Alerts
- Post announcements to the dashboard, scoped to all users, a specific committee, or a specific role tier
- Automatic email alert triggered on: new task assignment, extension decision, new announcement, rating published

### 4.5 Reimbursement Portal
- Members submit claims with amount, category, and receipt upload
- Two-stage approval: core committee (first pass) → centre head/head of events (final sign-off)
- Status tracking: submitted → under review → approved/rejected → paid
- Bank account details encrypted at the field level (see Tech Spec, Security section)

### 4.6 Public Form Builder
- Super user and core committee can build custom feedback/review forms
- Each form generates a **public, no-login shareable link**
- Used for external members, event attendees, or anyone without portal access
- Responses collected inside the portal, viewable and exportable by the form's creator

### 4.7 Reports & Analytics
- Exportable reports filterable by: event, committee, individual
- Every report includes graphical representations (bar/line/radar charts) alongside the raw numbers — never numbers alone
- Export formats: PDF (formatted report) and CSV (raw data)
- Quarterly rollups combine task ratings + event ratings + committee ratings into a single performance snapshot per person and per committee

### 4.8 Member & Committee Directory
- ~140 users across the 6 role tiers
- Committees, sub-committees, and their membership rosters
- Profile includes role, committee memberships, historical performance summary

### 4.9 Security & Access Control
- Role-based access control mapped to the 6 tiers, enforced at the database level (Row-Level Security), not just the interface
- Full encryption strategy detailed in the Tech Spec

## 5. What's Explicitly Out of Scope for v1
- Payroll or salary processing (reimbursements only, not salaries)
- Mobile native app (web-based, mobile-responsive is sufficient)
- Integration with university's official ERP/SIS system
- Multi-language support

## 6. Success Criteria
- All 6 committees actively using task assignment within the first semester of launch
- Reimbursement turnaround time (submission to payout) tracked and reduced vs. current manual process
- 100% of events post-Sept 2026 have a completed rating cycle logged in the system
- At least one public form deployed and collecting responses within the first month

## 7. Scale
- ~140 users across 6 tiers
- 10+ committees and sub-committees
- Estimated 15–30 events per academic year
