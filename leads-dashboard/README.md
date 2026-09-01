# LEADS Next Gen Centre — Operations & Leadership Portal

An enterprise-grade, institutional management and operations platform designed for the **LEADS Next Gen Centre** at **Ramaiah University of Applied Sciences (MSRUAS)**.

---

## 🚀 Comprehensive Module Breakdown

### 📊 Workspace & Operational Modules

#### 1. Dashboard Home (`/dashboard/home`)
- **Executive Overview**: Centralized operations desk featuring friendly user greetings, official designation and committee breakdowns, active task counters, upcoming event schedules, and recent announcements.
- **Quick Action Hub**: Direct shortcuts for event creation, task assignment, design uploads, and announcement broadcasting.
- **Personal Deliverables**: Tailored dashboard widget highlighting deliverables assigned specifically to the logged-in user.

#### 2. Calendar Module (`/dashboard/calendar`)
- **Inter-Campus Operational Timeline**: Interactive calendar displaying event schedules, sub-committee milestones, and university deadlines.
- **Campus Filtering**: Filter view by **GG Campus**, **RTC Campus**, or **All Campuses**.
- **Event Highlights**: Clickable event cards showing start/end dates, venue details, committee leads, and status badges.

#### 3. Events Desk (`/dashboard/events`)
- **Lifecycle Management**: End-to-end event workflow: *Draft* → *Pending Approval* → *Published* → *Completed*.
- **Status Filter Tabs**: Filter the events grid by *All Events*, *Ongoing*, *Completed*, or *Archived* — computed from each event's actual end date, not just its stored status, so a past-dated event reads as completed even if nobody manually flipped it.
- **Sub-Committee Formation**: Create specialized committees (Logistics, Technical, Media, Operations) and assign member rosters.
- **Bulk Roster Import**: Download a CSV template and bulk-upload events, same pattern as the Member Directory and Guest Directory importers.
- **Approval Engine**: Event creation by Executive Council members (President, VP, Chief Coordinator) automatically triggers a Centre Head sign-off requirement.
- **Festivals & Observances Approval Gate**: Synced Indian national holidays and observances require explicit social media post sign-off (`holiday_social_approval`). Until a festival's post is approved and moved to content design (`holiday_design_social`), the festival event is hidden from event selection dropdowns across all dashboard modules.
- **Student Performance Evaluation**: Integrated dual-gate rating system for Centre Head and campus-specific Events Heads.

#### 4. Tasks Desk (`/dashboard/tasks`)
- **Task Delegation**: Assign tasks to individual members or entire sub-committees with priority tagging (*Urgent*, *High*, *Normal*, *Low*).
- **Status Tracking**: Visual progress pipeline: *To Do* → *In Progress* → *Under Review* → *Completed*.
- **Auto-Generated Design Tasks**: A finalized Design Portal submission (style-approved, and proofread-approved if proofreading was requested) automatically creates or completes a task here — linked to its event when tagged to one, or standalone otherwise — so it flows straight into the rating queue with no manual re-entry.
- **Extension Requests**: Assignees can submit task deadline extension requests, which Faculty Advisors or the Centre Head can approve or reject.
- **Executive Task Allotment & Universal Visibility**: Executive Council leadership (President & Vice President) hold complete platform-wide task visibility access to monitor all assigned tasks, while new executive task assignments route through Event Head approval.

#### 5. Ratings & Student Performance (`/dashboard/ratings`)
- **Rubric Evaluation**: 5-point performance scoring system for student deliverables and leadership contributions.
- **Time Period Filter**: Filter the evaluation history by a specific month or a custom date range — no fixed quarters.
- **Scoped Visibility**:
  - *Super User / Centre Head*: Universal visibility across all members and campuses.
  - *Department Heads*: Visibility over team members in their department.
  - *Executive Council*: Visibility over own performance and committees they belong to.
  - *Alumni*: Restricted strictly to viewing their own historical performance ratings.

#### 6. Design Portal (`/dashboard/designs`)
- **Asset Review Desk**: Dedicated portal for Design and Social Media department asset requests, proofreading, and approval workflows.
- **Proofreading Pipeline**: Upload design files, assign proofreaders, and manage review decisions (*Approved*, *Revisions Requested*, *Pending Proofread*). Feedback/comments are only required when requesting changes or rejecting — a plain approval doesn't need typed justification.
- **Design Style Approval**: A separate Design Head/Centre Head sign-off (*Style Approved* / *Style Rejected*) on top of proofreading — once both gates clear (or style alone, if proofreading wasn't requested), the design is finalized and its linked task completes automatically.
- **Asset Replacements**: Support for uploading updated asset revisions while retaining review logs.
- **Scoped Access**: Restricted to Design Head, Super User, and assigned proofreaders.

---

### 🛡️ Administration & Governance Modules

#### 7. Reimbursements System (`/dashboard/reimbursements`)
- **Expense Claims**: Member expense submission desk with receipt proof attachments and amount validation.
- **Two-Stage Approval Pipeline**:
  - **Stage 1 (Sector Head)**: Initial operational verification.
  - **Stage 2 (Finance Head)**: Final financial audit and reimbursement sign-off.
- **Visibility Isolation**: Claimants view own claims; Sector Heads view all pending Stage 1 claims; Finance Heads view claims only after Stage 1 verification.

#### 8. Budget & Funds (`/dashboard/budget`)
- **Financial Governance**: Ledger for university fund allocations, department budgets, and operational expenditures.
- **Income Sources & Sponsorships**: Track external corporate sponsors, research/institutional grants, alumni donations, and general Centre income. Income sources can be linked to specific events or assigned as General Centre Income.
- **Smart Sponsorship Calculation Engine**:
  - *Sponsor Depletion First*: Event expenses automatically deplete linked event sponsor funds first before touching the Centre's main budget allocation.
  - *Centre Budget Fallback*: Any expenses exceeding total sponsorship are deducted from the Centre's main account.
  - *Sponsor Surplus Return Rule*: If actual event spending is less than sponsorship received, unused sponsor funds automatically return to the Centre's main account, increasing the Centre's total available balance.
  - *Total Available Capital*: Real-time financial formula: `Annual Approved Budget + General Income/Grants + Returned Sponsor Surplus`.
- **Multi-Year Budgeting Engine**: Extended Financial Year selector allowing proposing, reviewing, editing, and inspecting budgets across a 9-year range (`-5` years back to `+3` years forward) for historical access and multi-year forward planning.
- **Financial Analytics & Metric Dashboard**: 6 real-time stat cards (Annual Approved Budget, General Income & Grants, Sponsor Surplus Returned, Total Available Capital, Realized Net Spent, Net Remaining Balance) along with event line-item badges (`🤝 Depleted` and `🔄 Returned to Centre`).
- **Encrypted API Data Layer**: Fully backed by AES-256-GCM encrypted server collection persistence via `/api/income-sources` and `/api/income-sources/[id]`.
- **Access Scoping**: Restricted strictly to Super User, Centre Head, and Finance Leadership.

#### 9. Public Forms Builder (`/dashboard/forms` & `/forms/[slug]`)
- **Interactive Form Builder**: Custom form creation engine for student signups, feedback collection, and event registrations.
- **QR Code Preview & Download**: Instant QR Code preview generated for every public form (`/forms/[slug]`), with a single-click download of a high-resolution PNG poster card (featuring official branding header, event title, scannable QR code, and URL string) for physical printing and distribution, plus direct browser printing.
- **Reusable Field Templates**: Save a form's field schema as a template, then start any future form from one instead of rebuilding it from scratch.
- **Event Linking**: Tag a form to a specific event — shown as a badge in the builder and on the public form page itself.
- **Field Customization**: Text inputs, textareas, dropdowns, checkboxes, and file upload fields.
- **Public Form Slugs**: Custom public landing pages rendered at `/forms/[slug]`.
- **Form Protection**: Deletion of public forms is strictly restricted to Centre Head and Super User.

#### 10. Analytics & Reports (`/dashboard/reports`)
- **Executive Report Generator**: Styled PDF report generation and CSV data exports.
- **Report Types**: Performance scorecards, event post-mortems, financial audit summaries, and member activity reports.
- **Time Period Filter**: Scope any report to a specific month or a custom date range instead of a fixed quarter.

#### 11. Announcements Engine (`/dashboard/announcements`)
- **Targeted Broadcasting**: Multi-scope message delivery (`ALL_MEMBERS`, `CORE_COMMITTEE`, `DEPARTMENTS`, `INDIVIDUAL`).
- **Dual Notification**: In-dashboard bell alerts combined with automated Light Mode HTML email dispatch.
- **Authoring Rules**: Allowed for Leadership, Core Committee, and Heads; blocked for Alumni & Executive Council without approval.

#### 12. Member Directory & Roster (`/dashboard/directory`)
- **Central Roster**: Complete roster management covering Advisory Board, Core Committee, Training Associates, and Alumni.
- **Bulk Roster Import**: Download a CSV template and bulk-upload members.
- **Tier & Persona Control**: Manage Tiers 1 through 7, roles, divisions, and departments.
- **Status Controls**: Active vs. Terminated account status toggles — restricted to the Centre Head, and requires a typed reason for the record.
- **Automated Termination Email**: Terminating a member automatically dispatches an official notification email (including the stated reason) to their registered address, retaining historical records in the database.
- **Member Protection**: Member removal and termination controls are strictly blocked for Executive Council roles.

#### 13. Guest Directory (`/dashboard/guest-directory`)
- **External Contact Cards**: Directory for visiting guests, external VIPs, faculty advisors, and industry partners.
- **Bulk Roster Import**: Download a CSV template and bulk-upload guests, same pattern as the Member Directory.
- **Access Scoping**: View and add contacts allowed for Executive Council, Centre Head, and Faculty; contact deletion restricted to Centre Head and Super User.

#### 14. Guest Invites Dispatcher (`/dashboard/guest-invites`)
- **Mass Email Dispatcher**: Batch invitation engine for official events and guest communications.
- **Mail-Merge Engine**: Dynamic placeholder substitution (`{{name}}`, `{{email}}`, `{{role}}`).
- **Delivery Monitoring**: Progress tracking bar with real-time success and failure reporting.

#### 15. Dynamic Group Policies (`/dashboard/policies`)
- **Granular RBAC Engine**: Super User authority to grant any of 15 capability keys (`EVENTS_CREATE`, `TASKS_EDIT`, `EDIT_DIRECTORY`, `BUILD_FORMS`, etc.).
- **Quick Selection Controls**: Integrated **Select All** and **Select None** controls for capabilities/privileges, divisions, and tiers.
- **Targeting Matrix**: Target by Member ID, Division, Tier, or Designation Keyword.
- **Approval Gateways**: Configure optional approval sign-offs (Centre Head, specific member, policy tag holder).
- **Scope Restrictions**: Apply `OWN_ONLY` visibility restrictions to specific users or tiers.

#### 16. Backup & Restore (`/dashboard/backup`)
- **Database Snapshot Manager**: Export complete system state to formatted JSON backup files.
- **System Restoration**: Restore database state with validation checks, rollback protection, and backup history logs.

#### 17. Email Management & Client (`/dashboard/email`)
- **SMTP Client Configuration**: Configure Nodemailer for Google Workspace SMTP, Local Postfix, or Custom SMTP.
- **Diagnostics & Testing**: Live connection verification tool with instant test mail delivery.
- **Dispatch Logs**: Detailed audit log of all sent and failed email notifications.
- **Master Light Mode Template Engine**: Centralized HTML email wrapper styling.

#### 18. System & Account Settings (`/dashboard/settings`)
- **Personal Profile**: Profile customization and password updates.
- **Profile Photo Upload**: Upload a profile photo (max 2 MB) — shows immediately in the header, sidebar, and Settings itself.
- **Secure Email Update**: Updating login email sends a 5-minute OTP code to the CURRENT email inbox for security verification.
- **Emergency System Lockdown**: Super User toggle to lock the dashboard site-wide (renders plain 404 for non-admin session attempts).

Settings is also reachable directly from the dashboard header: clicking the name/avatar in the top navbar opens a dropdown with **Settings** and **Sign Out**, alongside the sidebar's own links.

---

## 🔐 Permission Hierarchy & Role-Based Access Control (RBAC)

The system enforces a multi-tiered permission model backed by dynamic policy grants ([`src/lib/permissions.ts`](file:///Users/kayo/ERP/leads-dashboard/src/lib/permissions.ts)):

| Tier / Role | Authority Scope & Access Level |
| :--- | :--- |
| **Tier 1 — Super User** | Complete root system authority, policy management, audit logging, impersonation, and bypass access. |
| **Tier 2 — Centre Head** | Universal oversight across all campuses, final reimbursement sign-off, announcement approval, and evaluation authority. |
| **Tier 2.5 — GG Events Head** | Cross-campus access: full view, edit, and evaluation authority over both **GG Campus** and **RTC Campus** events. |
| **Tier 3 — Events Head & Advisory** | Event & task management, campus-restricted student evaluation (RTC Events Head manages RTC Campus only). |
| **Tier 4–5 — Core Committee** | Executive Council (President, Vice President, Gen Secs) & Dept Heads. Event creation requires **Centre Head approval**; Task allotment requires **Event Head approval**. Member termination is strictly blocked. |
| **Tier 6 — Training Associates** | Operational execution (view assigned tasks/events, submit design assets, request task extensions). |
| **Tier 7 — Alumni** | Read-only student view for calendar, event overviews, own performance ratings, past reimbursements, and profile settings. |

---

## 📐 System Architecture & Engineering Diagrams

The LEADS ERP platform is designed with a decoupled modular architecture, encrypted persistent JSON data stores, and cross-module data integration pipelines.

### 1. Database Entity-Relationship (ER) Schema
![Database Entity-Relationship ER Diagram](docs/database_er_diagram.png)

### 2. Module-to-Module Data Flow Architecture
![Module Data Flow Diagram](docs/module_data_flow_diagram.png)

### 3. Individual Subsystem Architectural Flowcharts

| Subsystem Area | Structural Flowchart Diagram | Core Module Connections |
| :--- | :--- | :--- |
| **Events & Tasks Subsystem** | ![Events & Tasks Diagram](docs/modules/events_and_tasks_module_structure.png) | Draft validation → Approval queues → Sub-committee rosters → Sponsor merge → Deliverable tracking → Automatic completion triggers. |
| **Finance & Budget Subsystem** | ![Finance & Budget Diagram](docs/modules/finance_and_budget_module_structure.png) | Annual budget → Income/Sponsorship ingestion → Claim validation → 2-Stage audit → Sponsor depletion first → Net Centre cost & surplus return engine. |
| **Design & Forms Subsystem** | ![Design & Forms Diagram](docs/modules/designs_and_forms_module_structure.png) | Asset upload → AI OCR scan → Gate 1 Style & Gate 2 Proofread clearances → Task auto-completion → Dynamic form creation → Public sign-ups → Word DOCX template exports. |

---

## 🎨 UI Aesthetics & Light Mode Styling

- **Dynamic Inspirational Quotes Carousel**: Auto-rotating hero banner on the login screen (`src/app/page.tsx`) cycling through 20 quotes on leadership and inspiring young minds — global and Indian leaders, education advocates, and business leaders — every ~3.5 seconds, with smooth cross-fade transitions (no manual prev/next controls; the dot indicators still allow jumping to a specific quote).
- **Branded Loading Splash**: A centered LEADS logo splash (spinning ring, timed progress bar) shows for 5 seconds after login and for 2 seconds when switching between dashboard modules.
- **Collapsible Sidebar**: The desktop sidebar collapses to an icon-only rail to reclaim page width, and temporarily flies out to full width on hover without shifting the page content underneath. The collapsed/expanded preference persists across reloads.
- **Isometric Light Mode Background**: Custom geometric isometric cube background image (`/images/light-bg.jpg`) rendered fixed across Light Mode layout ([`src/app/globals.css`](file:///Users/kayo/ERP/leads-dashboard/src/app/globals.css)).
- **Master Light Mode Email Template**: Institutional HTML email wrapper with clean white cards (`#ffffff`), soft slate borders (`#e2e8f0`), LEADS institutional blue accents (`#0284c7`), and dark slate body text (`#0f172a`, `#334155`) ([`src/lib/email-service.ts`](file:///Users/kayo/ERP/leads-dashboard/src/lib/email-service.ts)).

---

## 🛠️ Technology Stack

- **Framework**: [Next.js 16](https://nextjs.org) (App Router, Client Components)
- **Language**: [TypeScript](https://www.typescriptlang.org) (Strict type checking)
- **Styling**: Vanilla CSS & TailwindCSS v4 with custom glassmorphism effects (`.glass-panel`)
- **Icons**: [Lucide React](https://lucide.dev)
- **Email Engine**: [Nodemailer](https://nodemailer.com) with custom HTML templates

---

## 💻 Getting Started

### Installation & Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Type Verification

```bash
# Run TypeScript compilation check
npx tsc --noEmit
```

---

## ⚖️ Intellectual Property & Licensing Notice

All Intellectual Property, Copyrights, Development Licensing, and Proprietary System Architecture belong exclusively to **Kayomarz Pavri**. Unauthorized copying, distribution, or reproduction of this codebase or its custom components is strictly prohibited.

© 2026 LEADS Next Gen Centre &middot; MSRUAS Internal Operations Portal. All rights reserved.
