# LEADS All-in-One Dashboard — Content & Copy Document
**LEADS Next Gen Centre | MSRUAS | Version 1.0 | August 2026**

---

## Version History

| Version | Date | Author | Change |
|---------|------|--------|--------|
| v1.0 | Aug 2026 | Kayomarz Pavri | Initial document |

---

## 1. Login Page

- Header: "LEADS All-in-One Dashboard"
- Subtext: "Sign in with your MSRUAS email to continue"
- Button: "Sign in"
- Error state: "We couldn't find an account with that email. Contact your committee head if you believe this is a mistake."

## 2. Task Module

| Screen | Copy |
|---|---|
| New task assigned (email subject) | "New task assigned: {task_title}" |
| New task assigned (email body) | "You've been assigned a new task — {task_title}, due {due_date}. Open the dashboard to acknowledge it." |
| Task not yet acknowledged (banner) | "You have {n} task(s) awaiting acknowledgment." |
| Acknowledge button | "I've received this, starting work" |
| Extension request label | "Request an extension" |
| Extension request field | "New deadline requested" / "Reason for extension" |
| Extension approved (email) | "Your extension for {task_title} has been approved. New deadline: {new_date}." |
| Extension denied (email) | "Your extension request for {task_title} was not approved. Original deadline stands: {due_date}." |
| Task completed confirmation | "Marked as completed. Your contribution has been logged." |

## 3. Rating Module

| Screen | Copy |
|---|---|
| Rating form header | "Rate performance — {task_title or event_title}" |
| Criteria labels | "Quality of work" · "Timeliness" · "Initiative" · "Collaboration" |
| Committee rating toggle | "Rate as a committee" (label shown only to centre head / head of events / faculty) |
| Rating submitted | "Rating submitted and added to {member/committee}'s performance record." |
| Individual's own rating view | "Your performance this quarter" |

## 4. Reimbursement Module

| Screen | Copy |
|---|---|
| New claim button | "Submit a reimbursement claim" |
| Form fields | "Amount" · "Category" · "Upload receipt" · "Bank account details" |
| Bank details note | "Your bank details are encrypted and only visible to approvers processing your payout." |
| Status: submitted | "Submitted — awaiting first review" |
| Status: under review | "Under review by {committee name}" |
| Status: approved | "Approved — payout in process" |
| Status: rejected | "Not approved — see reviewer note below" |
| Status: paid | "Paid on {date}" |

## 5. Public Form Module

- Form header (respondent-facing): "{Form title}" with LEADS logo, no dashboard navigation visible
- Submit button: "Submit response"
- Thank-you page: "Thanks — your response has been recorded."
- Form builder helper text: "This link can be shared with anyone, including people without a LEADS Dashboard account."

## 6. Reports Module

| Screen | Copy |
|---|---|
| Report type selector | "By event" · "By committee" · "By individual" |
| Export options | "Export as PDF" · "Export as CSV" |
| Chart section header | "Performance breakdown" |
| Empty state (no data yet) | "No ratings recorded yet for this {event/committee/individual}." |
| Quarterly rollup label | "Q{n} performance summary" |

## 7. Announcements

| Screen | Copy |
|---|---|
| New announcement button | "Post an announcement" |
| Scope selector | "Everyone" · "Specific committee" · "Specific role tier" |
| Announcement feed empty state | "No announcements yet." |

## 8. Tone Guidelines

- Direct and functional — this is an internal ops tool, not a marketing site
- Never use exclamation points in system messages (status updates, confirmations)
- Error messages explain what happened and what to do next, never just "Error"
- Public form copy is the one place that can be slightly warmer, since external respondents are being asked a favor
