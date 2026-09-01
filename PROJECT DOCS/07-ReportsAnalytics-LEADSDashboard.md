# LEADS All-in-One Dashboard — Reports & Analytics Specification
**LEADS Next Gen Centre | MSRUAS | Version 1.0 | August 2026**

---

## Version History

| Version | Date | Author | Change |
|---------|------|--------|--------|
| v1.0 | Aug 2026 | Kayomarz Pavri | Initial document |

---

## 1. Purpose

This module answers the "how are we doing" question at three levels — event, committee, individual — and never shows a naked number where a chart can tell the story faster.

## 2. Report Types

### 2.1 By Event
- All tasks under the event, completion rate, average rating
- Bar chart: average rating per committee that contributed to the event
- Radar chart: event-wide average across the four rating criteria (quality/timeliness/initiative/collaboration)

### 2.2 By Committee
- Roster, active tasks, historical committee-level ratings (from faculty)
- Line chart: committee performance trend across quarters
- Bar chart: individual member ratings within the committee, side by side

### 2.3 By Individual
- Full task history, contribution log, all ratings received
- Radar chart: this person's average across the four criteria
- Line chart: this person's overall_score trend over time
- Quarterly rollup card: single combined score for the quarter

## 3. Chart Requirements

- Every chart uses the rating color scale defined in the Design System (Section 3) — consistent across all report types
- Every chart ships with a plain-text data table directly beneath it (for accessibility and for anyone who wants the raw numbers)
- Charts render both in-app and inside the exported PDF — not just as a live dashboard feature

## 4. Export

| Format | Contents | Use case |
|---|---|---|
| PDF | Formatted report with charts, headers, LEADS branding | Sharing with faculty, printing for review meetings |
| CSV | Raw underlying data, no charts | Further analysis in Excel, record-keeping |

Export requests are queued server-side (see Tech Spec Section 5) and delivered via in-app notification + email when ready, since chart-heavy PDFs take a few seconds to render for larger committees.

## 5. Access to Reports

| Role | Can view |
|---|---|
| Super user, centre head, head of events | All reports, all levels |
| Advisory board | All reports, view-only |
| Core committee | Reports for their own committee(s) only |
| Training associate | Their own individual report only |

## 6. Data Freshness

Reports are computed live from the `ratings`, `tasks`, and `contributions` tables — no separate data warehouse or nightly batch job needed at this scale (~140 users). Revisit this if the dataset grows significantly beyond current projections.
