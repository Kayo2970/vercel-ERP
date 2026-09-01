# LEADS All-in-One Dashboard — Sitemap & URL Structure
**LEADS Next Gen Centre | MSRUAS | Version 1.0 | August 2026**

---

## Version History

| Version | Date | Author | Change |
|---------|------|--------|--------|
| v1.0 | Aug 2026 | Kayomarz Pavri | Initial document |

---

## 1. Site Architecture

```
LEADS All-in-One Dashboard (dashboard.leads.msruas.ac.in)
│
├── / (Login — role-based, private)
│
├── /forms/[form-slug]  (PUBLIC — no login required)
│   └── /forms/[form-slug]/thank-you
│
└── /dashboard  (after login — access varies by role tier)
    │
    ├── /dashboard/home  (personalized overview, role-specific widgets)
    │
    ├── /dashboard/events
    │   ├── /dashboard/events/new
    │   └── /dashboard/events/[event-id]
    │       ├── /dashboard/events/[event-id]/committees
    │       ├── /dashboard/events/[event-id]/tasks
    │       └── /dashboard/events/[event-id]/ratings
    │
    ├── /dashboard/tasks
    │   ├── /dashboard/tasks/new
    │   ├── /dashboard/tasks/[task-id]
    │   │   ├── /dashboard/tasks/[task-id]/acknowledge
    │   │   └── /dashboard/tasks/[task-id]/extension
    │   └── /dashboard/tasks/my-tasks
    │
    ├── /dashboard/ratings
    │   ├── /dashboard/ratings/individual/[member-id]
    │   └── /dashboard/ratings/committee/[committee-id]
    │
    ├── /dashboard/reimbursements
    │   ├── /dashboard/reimbursements/new
    │   ├── /dashboard/reimbursements/[claim-id]
    │   └── /dashboard/reimbursements/pending-approval  (core committee / centre head only)
    │
    ├── /dashboard/forms  (form builder — super user, core committee)
    │   ├── /dashboard/forms/new
    │   ├── /dashboard/forms/[form-id]/edit
    │   └── /dashboard/forms/[form-id]/responses
    │
    ├── /dashboard/reports
    │   ├── /dashboard/reports/by-event/[event-id]
    │   ├── /dashboard/reports/by-committee/[committee-id]
    │   ├── /dashboard/reports/by-individual/[member-id]
    │   └── /dashboard/reports/export  (PDF/CSV export queue)
    │
    ├── /dashboard/announcements
    │   └── /dashboard/announcements/new
    │
    ├── /dashboard/directory
    │   ├── /dashboard/directory/members
    │   ├── /dashboard/directory/members/[member-id]
    │   └── /dashboard/directory/committees
    │
    └── /dashboard/settings
        ├── /dashboard/settings/account
        ├── /dashboard/settings/users  (super user only)
        ├── /dashboard/settings/roles  (super user only)
        └── /dashboard/settings/audit-log  (super user, centre head)
```

## 2. Access Matrix by Route Group

| Route group | Super user | Centre head | Head of events | Advisory board | Core committee | Training associate | Public |
|---|---|---|---|---|---|---|---|
| /dashboard/home | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| /dashboard/events (create) | ✅ | ✅ | ✅ | ❌ view only | ✅ | ❌ | ❌ |
| /dashboard/tasks (assign) | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ receive only | ❌ |
| /dashboard/ratings (give) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ view own only | ❌ |
| /dashboard/reimbursements (approve) | ✅ | ✅ final | ✅ final | ❌ | ✅ first-pass | ❌ submit only | ❌ |
| /dashboard/forms (build) | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| /forms/[slug] (respond) | — | — | — | — | — | — | ✅ |
| /dashboard/reports | ✅ | ✅ | ✅ | ✅ | ✅ own committee | ❌ own only | ❌ |
| /dashboard/settings/users | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

## 3. Page Notes

- `/forms/[form-slug]` is the only route group with zero authentication — deliberately isolated from `/dashboard` so a public link can never expose internal navigation.
- `/dashboard/tasks/[task-id]/extension` is a sub-action, not a full page — implemented as a modal/drawer off the task detail view.
- `/dashboard/reports/export` queues PDF/CSV generation server-side and notifies the user by email + in-app when ready, since chart-heavy PDF exports for 140 users can take a few seconds each.
