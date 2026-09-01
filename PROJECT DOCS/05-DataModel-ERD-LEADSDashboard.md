# LEADS All-in-One Dashboard — Data Model & ERD
**LEADS Next Gen Centre | MSRUAS | Version 1.0 | August 2026**

---

## Version History

| Version | Date | Author | Change |
|---------|------|--------|--------|
| v1.0 | Aug 2026 | Kayomarz Pavri | Initial document |

---

## 1. Entity-Relationship Diagram

```mermaid
erDiagram
  USERS ||--o{ TASKS : assigned
  USERS ||--o{ CONTRIBUTIONS : logs
  USERS ||--o{ RATINGS : gives
  USERS ||--o{ REIMBURSEMENTS : submits
  USERS }o--o{ COMMITTEES : belongs_to
  COMMITTEES ||--o{ EVENTS : linked_to
  COMMITTEES ||--o{ COMMITTEES : sub_committee_of
  EVENTS ||--o{ TASKS : contains
  TASKS ||--o{ CONTRIBUTIONS : produces
  TASKS ||--o{ RATINGS : evaluated_by
  COMMITTEES ||--o{ RATINGS : rated_as
  USERS ||--o{ FORMS : creates
  FORMS ||--o{ FORM_RESPONSES : collects
  USERS ||--o{ ANNOUNCEMENTS : posts
  USERS ||--o{ AUDIT_LOG : performs

  USERS {
    uuid id PK
    string name
    string email
    int role_tier
    timestamp created_at
  }
  COMMITTEES {
    uuid id PK
    string name
    uuid parent_committee_id FK
    uuid advisor_id FK
  }
  EVENTS {
    uuid id PK
    string title
    string status
    date start_date
    date end_date
  }
  TASKS {
    uuid id PK
    uuid event_id FK
    string title
    string assignee_type
    string status
    date due_date
    boolean extension_requested
  }
  CONTRIBUTIONS {
    uuid id PK
    uuid task_id FK
    uuid member_id FK
    string description
    timestamp logged_at
  }
  RATINGS {
    uuid id PK
    string target_type
    uuid target_id
    uuid rater_id FK
    uuid event_id FK
    jsonb scores
    float overall_score
  }
  REIMBURSEMENTS {
    uuid id PK
    uuid member_id FK
    float amount
    string category
    string status
    string bank_details_encrypted
  }
  FORMS {
    uuid id PK
    string title
    string slug
    uuid created_by FK
    jsonb fields
  }
  FORM_RESPONSES {
    uuid id PK
    uuid form_id FK
    jsonb response_data
    timestamp submitted_at
  }
  ANNOUNCEMENTS {
    uuid id PK
    string title
    string body
    string scope
    uuid created_by FK
  }
  AUDIT_LOG {
    uuid id PK
    uuid actor_id FK
    string action
    string target_type
    uuid target_id
    timestamp timestamp
  }
```

## 2. Key Relationship Notes

- **TASKS.event_id is nullable** — this is what allows a task to be standalone (no event) or event-linked. Every query that lists "my tasks" must handle both cases.
- **RATINGS.target_type is a discriminator** — a single ratings table serves both individual ratings (`target_type = 'individual'`, `target_id` → users.id) and committee ratings (`target_type = 'committee'`, `target_id` → committees.id). This avoids two parallel rating systems that could drift out of sync.
- **COMMITTEES.parent_committee_id** is self-referencing, enabling sub-committees under a parent committee without a separate table.
- **FORM_RESPONSES has no required link to USERS** — public form respondents are not required to have an account; `respondent_email` is optional metadata only, never an FK to `users`.
- **AUDIT_LOG is append-only** — no UPDATE or DELETE policy should ever be granted on this table, including to the super user, to preserve its integrity as a record.

## 3. Indexing Notes (for the developer)

- Index `tasks.assignee_ids` (if using an array column) or the join table (if normalized) — this is the most frequently queried field ("my tasks")
- Index `ratings.target_id` + `target_type` composite — reports query this heavily
- Index `form_responses.form_id` — response exports filter by form
