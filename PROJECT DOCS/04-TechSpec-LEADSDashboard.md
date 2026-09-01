# LEADS All-in-One Dashboard — Technical Specification
**LEADS Next Gen Centre | MSRUAS | Version 1.0 | August 2026**

---

## Version History

| Version | Date | Author | Change |
|---------|------|--------|--------|
| v1.0 | Aug 2026 | Kayomarz Pavri | Initial document |

---

## 1. Recommended Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | Next.js 14 (App Router) + TypeScript | Server components reduce client bundle for a data-heavy dashboard; good fit for a solo builder |
| Styling | Tailwind CSS | Fast to build consistent components solo, matches design system tokens directly |
| Database | PostgreSQL via Supabase | Built-in Row-Level Security, auth, storage, and realtime — covers 80% of backend needs out of the box |
| Auth | Supabase Auth (email/password + optional Google SSO for @msruas.ac.in) | Handles password hashing, session tokens, and role claims natively |
| File storage | Supabase Storage | Reimbursement receipts, form attachments — encrypted at rest by provider |
| Charts | Recharts or Chart.js | Both render clean bar/line/radar charts; Recharts has better React ergonomics |
| PDF export | React-PDF or Puppeteer server-side render | For formatted, chart-inclusive report exports |
| Email | Resend or Supabase's SMTP integration | Transactional emails for task alerts, extension decisions, announcements |
| Hosting | Vercel | Native Next.js support, automatic HTTPS, easy environment variable management |

This is marked **(recommended)** — any stack works as long as it supports Row-Level Security or an equivalent database-level access control layer; that is the non-negotiable part, not the specific framework.

## 2. Data Models (Summary)

- **users** — id, name, email, role_tier (1–6), committee_ids[], created_at
- **committees** — id, name, parent_committee_id (nullable, for sub-committees), advisor_id
- **events** — id, title, status, start_date, end_date, linked_committee_ids[]
- **tasks** — id, title, event_id (nullable = standalone), assignee_type (individual/group/committee), assignee_ids[], status, due_date, extension_requested (bool), extension_new_date
- **contributions** — id, task_id, member_id, description, logged_at
- **ratings** — id, target_type (individual/committee), target_id, rater_id, event_id (nullable), scores (jsonb: quality/timeliness/initiative/collaboration), overall_score, created_at
- **reimbursements** — id, member_id, amount, category, receipt_url, status, approved_by_first[], approved_by_final[], bank_details_encrypted (see Security)
- **forms** — id, title, slug (public URL), created_by, fields (jsonb schema), is_public (always true for this module)
- **form_responses** — id, form_id, response_data (jsonb), submitted_at, respondent_email (optional, not required)
- **announcements** — id, title, body, scope (all/committee/role_tier), scope_id (nullable), created_by
- **audit_log** — id, actor_id, action, target_type, target_id, timestamp

See the companion Data Model & ERD document for the full entity-relationship diagram.

## 3. Security & Encryption Strategy

### 3.1 Encryption in Transit
- HTTPS enforced site-wide (TLS 1.2+), no HTTP fallback
- Vercel/Cloudflare issue and auto-renew certificates
- Supabase connections (app ↔ database) are TLS by default

### 3.2 Encryption at Rest
- Database disk-level encryption (AES-256) — standard on Supabase/any managed Postgres host, confirm it's enabled rather than build it
- File storage (receipts, form attachments) stored in encrypted object storage, never on local disk

### 3.3 Field-Level Encryption
- Reimbursement bank account details and any government ID numbers are encrypted at the application layer using `pgcrypto` (Postgres extension) before storage — so a raw database dump does not expose them in plaintext
- Passwords are never stored directly — Supabase Auth handles bcrypt/argon2 hashing

### 3.4 Access Control (Row-Level Security)
- RLS policies enforced at the database level, mapped to the 6 role tiers — not just checked in the frontend
- Example policy logic: a training associate's query for `reimbursements` can only ever return rows where `member_id = auth.uid()`; a core committee member's query is scoped to their `committee_ids[]`
- Public form responses (`form_responses` table) allow anonymous INSERT only — no read access without authentication

### 3.5 Operational Hygiene
- Secrets/environment variables never committed to the repository; managed via Vercel's encrypted environment variable store
- `audit_log` table records every sensitive action (rating given, reimbursement approved, user role changed) with actor, timestamp, and target — immutable, append-only
- Automated encrypted daily backups with a tested restore procedure documented in the Maintenance runbook
- Rate limiting on the public form endpoints to prevent spam submissions

## 4. Deployment

1. Repository on GitHub (private)
2. Vercel project linked to the repo, auto-deploy on push to `main`
3. Supabase project provisioned separately, connection string + service keys stored as Vercel environment variables
4. Staging environment (separate Supabase project + Vercel preview deployments) recommended before production changes go live, given 140 active users

## 5. Non-Functional Requirements

- Page load under 2 seconds on campus wifi for dashboard home
- Mobile-responsive down to 375px for task/acknowledgment/rating views
- 99% uptime target (acceptable for an internal tool, not mission-critical infrastructure)
- Accessible charts: every chart has a data-table fallback for screen readers and export
