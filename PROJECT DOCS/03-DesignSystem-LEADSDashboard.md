# LEADS All-in-One Dashboard — Design System
**LEADS Next Gen Centre | MSRUAS | Version 1.0 | August 2026**

---

## Version History

| Version | Date | Author | Change |
|---------|------|--------|--------|
| v1.0 | Aug 2026 | Kayomarz Pavri | Initial document |

---

## 1. Visual Direction

Clean, corporate SaaS — closer to an internal ops tool (Linear, monday.com) than a marketing site. The interface should feel trustworthy and fast, not decorative. Dashboards are read constantly by busy students and faculty, so density and clarity beat visual flourish.

## 2. Color Palette

| Token | Hex | Usage |
|---|---|---|
| Primary (LEADS navy) | #0F2A47 | Nav bar, primary buttons, headers |
| Primary light | #1E4D7B | Hover states, secondary emphasis |
| Accent (action) | #2E75B6 | Links, active states, chart accents |
| Success | #2E8B57 | Approved, completed, on-track ratings |
| Warning | #D9A441 | Extension requested, pending approval |
| Danger | #C0392B | Overdue, rejected, low rating (1–2) |
| Neutral background | #F5F7FA | Page background |
| Surface (card) | #FFFFFF | Cards, panels, modals |
| Text primary | #1A1A1A | Body text |
| Text secondary | #6B7280 | Muted labels, timestamps |
| Border | #E2E5EA | Dividers, table borders |

Dark mode: navy becomes the background base (#0B1B2E), surfaces lift to #14243A, text inverts to #E8ECF1. All chart colors keep their hue but shift 1 shade lighter for contrast on dark backgrounds.

## 3. Rating Color Scale (used across ratings, reports, charts)

| Score | Label | Color |
|---|---|---|
| 5 | Excellent | #2E8B57 (success green) |
| 4 | Good | #7FB069 (light green) |
| 3 | Satisfactory | #D9A441 (amber) |
| 2 | Needs improvement | #E08E45 (orange) |
| 1 | Unsatisfactory | #C0392B (danger red) |

This scale is used consistently in every chart, badge, and table cell that shows a rating — never re-mapped per screen.

## 4. Typography

- **Font**: Inter (or system-ui fallback) — highly legible at small sizes for dense dashboard tables
- Headings: 600 weight. Body: 400 weight. Never more than two weights on a screen.
- Base size: 14px for tables and dense UI, 16px for forms and reading content, 24–28px for page titles.

## 5. Dark Mode

Enabled from v1, toggle in account settings. Charts and rating colors are pre-tested for both modes — no color is dropped or altered in meaning between light and dark.

## 6. Component Patterns

- **Status badges**: pill-shaped, colored background matching state (success/warning/danger), used for task status, reimbursement status, event status
- **Rating display**: always paired — a numeric score AND a colored bar/star indicator, never numbers alone (per reporting requirement)
- **Tables**: sticky header, zebra striping optional, row-level actions on hover
- **Forms (internal)**: label above field, inline validation, grouped in cards by section
- **Public forms**: simplified, no dashboard chrome, LEADS logo header, single-column, mobile-first — a respondent should never feel like they've entered an internal tool

## 7. Charts (Reports Module)

- Bar charts: individual/committee comparison across a metric
- Line charts: performance trend over time (per quarter)
- Radar charts: multi-criteria evaluation (quality/timeliness/initiative/collaboration) for a single individual or committee
- All charts render with the rating color scale (Section 3) applied consistently
- Every chart has a plain-text data table alternative for accessibility and export

## 8. Responsive Behavior

- Breakpoints: 375px (mobile), 768px (tablet), 1280px (desktop)
- Task acknowledgment, extension requests, and rating views must work cleanly at 375px — students will use these primarily on phones
- Reports and analytics are desktop-optimized but remain usable (stacked charts) on tablet
