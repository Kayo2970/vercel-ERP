/**
 * permissions.ts — Centralized role/access checks for the LEADS dashboard.
 *
 * Built on top of the real data model already in production:
 *   - `Member.tier` (1 = Super User ... 7 = Alumni)
 *   - `Member.division` ('Advisory Board' | 'Core Committee' | 'Training Associate' | 'Alumni')
 *   - `Member.department` (real department name, e.g. "Design and Social Media")
 *   - "Head" designation expressed as a role-string convention: any role containing
 *     the word "Head" (e.g. "Head of Events", "Logistics Head", "Head Design and
 *     Social Media") — there is no separate designations array.
 *
 * There is no session-scoped "current user" object here; every function takes the
 * user explicitly so it works the same in pages, modals, and background sync code.
 */
import { Member, Guest, TaskItem, RatingItem, ReimbursementItem, BudgetItem, GroupPolicy, EventItem, PublicFormItem, ModuleAccessKey, getMembers, getGroupPolicies, getAccessLevelSettings, canViewTask } from './local-data';

export type SessionUser = {
  id?: string;
  name: string;
  email: string;
  tier: number;
  division?: string;
  committee?: string;
  department?: string;
  role?: string;
} | null | undefined;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Check if user holds an executive role: President, Vice President, or Chief Coordinator. */
export function isExecutiveRole(user: SessionUser): boolean {
  if (!user) return false;
  const role = ((user as any)?.role || '').toLowerCase();
  return role.includes('president') || role.includes('vice president') || role.includes('chief coordinator');
}

/** Check if user holds Alumni role/tier. */
export function isAlumniRole(user: SessionUser): boolean {
  if (!user) return false;
  const division = ((user as any)?.division || '').toLowerCase();
  const role = ((user as any)?.role || '').toLowerCase();
  return user.tier === 7 || division.includes('alumni') || role.includes('alumni');
}

/** Build a whole-word, case-insensitive matcher for one configured keyword. */
function keywordMatches(text: string, keyword: string): boolean {
  const kw = keyword.trim();
  if (!kw) return false;
  return new RegExp(`\\b${escapeRegex(kw)}\\b`, 'i').test(text);
}

/** Build a whole-word, case-insensitive matcher for a comma-separated list of phrases. */
function anyKeywordMatches(text: string, keywords: string): boolean {
  return keywords
    .split(',')
    .map(k => k.trim())
    .filter(Boolean)
    .some(k => new RegExp(`\\b${escapeRegex(k)}\\b`, 'i').test(text));
}

/**
 * True for any member whose role string contains the configured "Head"
 * keyword (default "head", whole-word, case-insensitive) — covers "Head of
 * Events", "Logistics Head", "Head Design and Social Media", "Centre Head",
 * etc. The keyword itself is editable by the Super User (see
 * getAccessLevelSettings / the Group Policies page's Built-in Access Rules
 * panel) instead of being fixed in code.
 */
export function isHeadRole(user: SessionUser): boolean {
  const role = (user as any)?.role;
  if (!user || typeof role !== 'string') return false;
  return keywordMatches(role, getAccessLevelSettings().headKeyword);
}

/** Check if user holds the tag of Sector Head (Centre Head / Sector Head / Department Head / Base Leadership). */
export function isSectorHead(user: SessionUser): boolean {
  if (!user) return false;
  const role = (user as any)?.role || '';
  const settings = getAccessLevelSettings();
  const isSectorOrCentreHead = anyKeywordMatches(role, settings.sectorHeadKeywords);
  const isGeneralHead = isHeadRole(user) && !keywordMatches(role, settings.financeKeyword);
  return user.tier <= settings.sectorHeadMaxTier || isSectorOrCentreHead || isGeneralHead || hasCapability(user, 'APPROVE_REIMBURSEMENTS_SECTOR');
}

/** Check if user holds the tag of Finance Head (Finance Head / Finance Lead / Finance Department). */
export function isFinanceHead(user: SessionUser): boolean {
  if (!user) return false;
  const role = (user as any)?.role || '';
  const dept = user.department || resolveMember(user)?.department || '';
  const financeKeyword = getAccessLevelSettings().financeKeyword;
  const isFinanceRole = keywordMatches(role, financeKeyword);
  const isFinanceDept = keywordMatches(dept, financeKeyword);
  // tier === 1 (the true Super User) is deliberately hardcoded, never configurable —
  // see AccessLevelSettings' doc comment for why.
  return user.tier === 1 || isFinanceRole || isFinanceDept || hasCapability(user, 'APPROVE_REIMBURSEMENTS_FINANCE');
}

/** Base leadership: tier <= the configured threshold (default 3) — Super User, Centre Head, Head of Events. */
export function isBaseLeadership(user: SessionUser): boolean {
  return !!user && user.tier <= getAccessLevelSettings().baseLeadershipMaxTier;
}

/** Core Committee: tier === the configured value (default 5). */
export function isCoreCommitteeTier(user: SessionUser): boolean {
  return !!user && user.tier === getAccessLevelSettings().coreCommitteeTier;
}

/** Check if user is Centre Head (Super User tier 1, or tier <= 2 / Centre Head / Advisor designation). */
export function isCentreHead(user: SessionUser): boolean {
  if (!user) return false;
  if (user.tier === 1) return true;
  const role = (user as any)?.role || '';
  const settings = getAccessLevelSettings();
  // Whole-word match on "advisor" so "Faculty Advisor" qualifies but "Advisory
  // Board Member" does not (a raw substring check would wrongly match
  // "Advisory" too, since it starts with the letters "advisor").
  return user.tier <= settings.sectorHeadMaxTier || anyKeywordMatches(role, settings.sectorHeadKeywords) || keywordMatches(role, 'advisor');
}

/** Check if user holds the designation of Head of Events (or Events Head). */
export function isHeadOfEvents(user: SessionUser): boolean {
  if (!user) return false;
  const role = ((user as any)?.role || '').toLowerCase();
  return role.includes('head of event') || role.includes('head of events') || role.includes('events head');
}

/** Check if user is Events Head for GG Campus or holds Tier 2.5 leadership. */
export function isEventsHeadGgCampus(user: SessionUser): boolean {
  if (!user) return false;
  if (user.tier === 2.5) return true;
  const role = ((user as any)?.role || '').toLowerCase();
  const committee = ((user as any)?.committee || '').toLowerCase();
  return (role.includes('events head') && role.includes('gg')) || 
         (role.includes('head of events') && role.includes('gg')) ||
         (role.includes('events') && role.includes('gg campus')) ||
         (committee.includes('gg campus') && isHeadOfEvents(user));
}

/** Check if user is Events Head for RTC Campus. */
export function isEventsHeadRtcCampus(user: SessionUser): boolean {
  if (!user) return false;
  const role = ((user as any)?.role || '').toLowerCase();
  const committee = ((user as any)?.committee || '').toLowerCase();
  return (role.includes('events head') && role.includes('rtc')) || 
         (role.includes('head of events') && role.includes('rtc')) ||
         (role.includes('events') && role.includes('rtc campus')) ||
         (committee.includes('rtc campus') && isHeadOfEvents(user));
}

/**
 * Fixed dual-reviewer evaluation rule: every task evaluation gets exactly two
 * reviewers — the Centre Head and the GG Campus Events Head (Tier 2.5) — and
 * the score shown is the average of whichever of those two have reviewed so
 * far (see resolveRatingReviewerRole/getEffectiveRatingScore). This applies
 * to every campus, including RTC: the RTC Events Head no longer independently
 * evaluates. A Design Portal deliverable task (`isDesignDeliverable`) stays a
 * separate lane, unaffected by the above — the Design Head who actually
 * approved/finalized the design can also rate it (their review does not
 * participate in the Centre Head/GG Head average; see
 * resolveRatingReviewerRole's DESIGN_HEAD case).
 */
export function canEvaluateEventStudent(user: SessionUser, eventCampus?: string, isDesignDeliverable?: boolean): boolean {
  if (!user || isAlumniRole(user)) return false;
  if (isDesignDeliverable && isDesignHead(user)) return true;
  return isCentreHead(user) || isEventsHeadGgCampus(user) || user.tier === 2.5;
}

/** The two (or three, for a design deliverable) fixed "slots" a rating submission fills. */
export type RatingReviewerRole = 'CENTRE_HEAD' | 'GG_HEAD' | 'DESIGN_HEAD';

/**
 * Resolves which fixed reviewer slot `user` fills when submitting a rating —
 * CENTRE_HEAD and GG_HEAD are the two required reviewers averaged together
 * for every task (see canEvaluateEventStudent); DESIGN_HEAD is the separate,
 * unaveraged design-deliverable lane. Checked in this order so a Centre Head
 * (including the Super User, who always satisfies isCentreHead) always fills
 * the CENTRE_HEAD slot even if they'd otherwise also qualify as Design Head.
 * Returns null if `user` doesn't hold access at all (mirrors
 * canEvaluateEventStudent — callers should gate on that first).
 */
export function resolveRatingReviewerRole(user: SessionUser, isDesignDeliverable?: boolean): RatingReviewerRole | null {
  if (!user) return null;
  if (isCentreHead(user)) return 'CENTRE_HEAD';
  if (isEventsHeadGgCampus(user) || user.tier === 2.5) return 'GG_HEAD';
  if (isDesignDeliverable && isDesignHead(user)) return 'DESIGN_HEAD';
  return null;
}

/** Check if user is a Design Head (Head role + Design department/role). */
export function isDesignHead(user: SessionUser): boolean {
  if (!user) return false;
  if (user.tier <= 2) return true; // Super User and Centre Head have design review authority
  const role = ((user as any)?.role || '').toLowerCase();
  const dept = (user.department || resolveMember(user)?.department || '').toLowerCase();
  const isDesign = role.includes('design') || dept.includes('design');
  return isHeadRole(user) && isDesign;
}

/** Resolve the full Member record for a session user (persona objects are a subset of Member). */
function resolveMember(user: SessionUser): Member | undefined {
  if (!user) return undefined;
  const members = getMembers();
  return (
    (user.id && members.find(m => m.id === user.id)) ||
    members.find(m => m.email.toLowerCase() === user.email.toLowerCase())
  );
}

/**
 * Group Policy Management — dynamic, Super User-managed access control.
 *
 * A fixed catalog of grantable capabilities, split at resource+action grain
 * (Events and Tasks each get CREATE/EDIT/DELETE/VIEW_ALL) so a policy can grant
 * exactly one slice of access — e.g. "create events" without also granting
 * "delete events" or "view everyone's events." Every capability key here maps
 * to an existing `can*` check below via `hasCapability()`, so a Group Policy
 * grant has the exact same effect as the hardcoded tier/role rules already
 * covering that action — it's an additional grant path, never a replacement.
 */
export const CAPABILITY_CATALOG: { key: string; label: string; description: string; module: string }[] = [
  { key: 'EVENTS_CREATE', label: 'Create Events', description: 'Create new events and their sub-committees.', module: 'Events' },
  { key: 'EVENTS_EDIT', label: 'Edit Events', description: "Edit any existing event's details.", module: 'Events' },
  { key: 'EVENTS_DELETE', label: 'Delete Events', description: 'Delete any event.', module: 'Events' },
  { key: 'EVENTS_VIEW_ALL', label: 'View All Events', description: 'See every event, not just ones created by or listing this person.', module: 'Events' },
  { key: 'TASKS_CREATE', label: 'Create Tasks', description: 'Assign new tasks to individuals or committees.', module: 'Tasks' },
  { key: 'TASKS_EDIT', label: 'Edit Tasks', description: 'Edit any existing task.', module: 'Tasks' },
  { key: 'TASKS_DELETE', label: 'Delete Tasks', description: 'Delete any task.', module: 'Tasks' },
  { key: 'TASKS_VIEW_ALL', label: 'View All Tasks', description: "See every task, not just this person's own or their department's.", module: 'Tasks' },
  { key: 'DECIDE_TASK_EXTENSION', label: 'Decide Task Extensions', description: 'Approve or reject a Pending Extension request on a task.', module: 'Tasks' },
  { key: 'EDIT_DIRECTORY', label: 'Edit Member Directory', description: 'Add, edit, remove, and bulk-manage member records.', module: 'Members Directory' },
  { key: 'VIEW_FULL_DIRECTORY', label: 'View Full Directory', description: 'See the entire member roster, not just their own profile.', module: 'Members Directory' },
  { key: 'TERMINATE_MEMBER', label: 'Terminate/Reactivate Members', description: 'Terminate or reactivate any member account.', module: 'Members Directory' },
  { key: 'GUEST_DIRECTORY_ACCESS', label: 'Access Guest Directory', description: 'Open the Guest Directory module at all (visiting-card contacts) — same baseline as Centre Head/Faculty/Executive get by default.', module: 'Guest Directory' },
  { key: 'GUEST_DIRECTORY_DELETE', label: 'Delete Guest Records', description: 'Remove any guest from the Guest Directory, not just ones they added.', module: 'Guest Directory' },
  { key: 'VIEW_ALL_DESIGNS', label: 'View All Design Submissions', description: 'See every submission in the Design Portal, not just their own.', module: 'Design Portal' },
  { key: 'DESIGN_STYLE_APPROVE', label: 'Style Approve/Reject Designs', description: 'Approve or reject a design submission on the Style Review step.', module: 'Design Portal' },
  { key: 'DESIGN_DELETE', label: 'Delete Design Submissions', description: 'Delete any design submission, not just their own.', module: 'Design Portal' },
  { key: 'APPROVE_REIMBURSEMENTS_SECTOR', label: 'Approve Reimbursements (Sector Head stage)', description: 'First-pass reimbursement review and approval.', module: 'Reimbursements' },
  { key: 'APPROVE_REIMBURSEMENTS_FINANCE', label: 'Approve Reimbursements (Finance Head stage)', description: 'Final-stage reimbursement approval.', module: 'Reimbursements' },
  { key: 'PROPOSE_BUDGET', label: 'Propose Budgets', description: 'Propose an annual or monthly budget request.', module: 'Budget & Funds' },
  { key: 'MANAGE_BUDGET', label: 'Manage Budget & Funds', description: 'Propose and manage budget requests beyond the built-in Centre Head/Finance Head roles.', module: 'Budget & Funds' },
  { key: 'BUILD_FORMS', label: 'Build Public Forms', description: 'Create and edit public-facing forms.', module: 'Public Forms' },
  { key: 'CREATE_ANNOUNCEMENT', label: 'Publish Announcements', description: 'Author and publish announcements to a chosen scope.', module: 'Announcements' },
  { key: 'APPROVE_ANNOUNCEMENT', label: 'Approve Announcements', description: 'Approve or reject a Pending announcement before it circulates.', module: 'Announcements' },
  { key: 'RATING_EDIT_ANY', label: 'Edit/Delete Any Rating', description: 'Edit or delete a rating authored by someone else.', module: 'Ratings & Reports' },
  { key: 'VIEW_ALL_REPORTS', label: 'View All Reports', description: 'See every report/rating record, not just their own or their department’s.', module: 'Ratings & Reports' },
  { key: 'MANAGE_GUEST_INVITES', label: 'Manage Guest Invites', description: 'Access the Guest Invites mail-merge tool.', module: 'Guest Invites' },
  { key: 'MANAGE_BACKUP', label: 'Access Backup & Restore', description: 'Download system backups and restore from an archive.', module: 'Administration' },
  { key: 'MANAGE_EMAIL_SETTINGS', label: 'Access Email Management', description: 'View dispatch logs and manage email settings.', module: 'Administration' },
];

/** True if a policy is enabled and, when it has an expiry date, hasn't passed it yet. */
function isPolicyActive(policy: GroupPolicy): boolean {
  if (policy.enabled === false) return false;
  if (policy.expiresAt && policy.expiresAt <= new Date().toISOString()) return false;
  return true;
}

/** True if a member satisfies ANY of a policy's non-empty target criteria. */
function memberMatchesPolicy(member: Member, policy: GroupPolicy): boolean {
  if (policy.targetMemberIds?.includes(member.id)) return true;
  if (policy.targetDivisions?.length && policy.targetDivisions.includes(member.division)) return true;
  if (policy.targetTiers?.length && policy.targetTiers.includes(member.tier)) return true;
  if (policy.targetDesignationKeyword?.trim()) {
    const kw = policy.targetDesignationKeyword.trim().toLowerCase();
    if ((member.role || '').toLowerCase().includes(kw)) return true;
  }
  return false;
}

/**
 * Resolve whether `user` currently holds `capability` through any enabled
 * Group Policy tag whose targeting matches them. Super User (tier 1) always
 * has every capability implicitly and never needs an explicit policy.
 */
export function hasCapability(user: SessionUser, capability: string): boolean {
  if (!user) return false;
  if (user.tier === 1) return true;
  const member = resolveMember(user);
  if (!member) return false;
  const policies = getGroupPolicies().filter(isPolicyActive);
  return policies.some(p => p.capabilities?.includes(capability) && memberMatchesPolicy(member, p));
}

/**
 * Module View/Edit Access — the generalized, every-module version of the
 * eventVisibilityScope pattern (GroupPolicy.moduleAccess). Each module gets a
 * canonical key + label here for the Group Policies UI; the actual grant/
 * restriction resolution lives in the functions below and is threaded into
 * each module's existing can*() checks as an additional path, never a
 * replacement — a policy with no moduleAccess entry for a module changes
 * nothing about that module's built-in behavior.
 */
export const MODULE_CATALOG: { key: ModuleAccessKey; label: string; description: string; ownershipNote?: string }[] = [
  { key: 'EVENTS', label: 'Events', description: 'Event records and their committees.', ownershipNote: 'Ownership = the event’s creator or a listed committee member.' },
  { key: 'TASKS', label: 'Tasks', description: 'Assigned task deliverables.', ownershipNote: 'Ownership = the task’s creator or assignee.' },
  { key: 'DIRECTORY', label: 'Members Directory', description: 'The member roster.', ownershipNote: 'Ownership = whoever added the member record. Edit ‘Own’ is one-time, within 24 hours of adding.' },
  { key: 'GUEST_DIRECTORY', label: 'Guest Directory', description: 'Visiting-card guest contacts.', ownershipNote: 'Ownership = whoever added the guest record. Edit ‘Own’ is one-time, within 24 hours of adding.' },
  { key: 'DESIGNS', label: 'Design Portal', description: 'Design submissions and proofreading.' },
  { key: 'REIMBURSEMENTS', label: 'Reimbursements', description: 'Reimbursement claims.', ownershipNote: 'Ownership = the claimant.' },
  { key: 'BUDGET', label: 'Budget & Funds', description: 'Budget proposals and verification.' },
  { key: 'FORMS', label: 'Public Forms', description: 'Public-facing forms and their submissions.' },
  { key: 'ANNOUNCEMENTS', label: 'Announcements', description: 'Published announcements.' },
  { key: 'RATINGS', label: 'Ratings & Reports', description: 'Student performance ratings.', ownershipNote: 'Ownership = the rating’s author.' },
  { key: 'GUEST_INVITES', label: 'Guest Invites', description: 'The guest-invite mail-merge tool.' },
  { key: 'EMAIL', label: 'Email Management', description: 'Dispatch logs and email settings.' },
];

/** Active, targeting-matched policies that set a moduleAccess entry for `moduleKey` (or, for EVENTS only, the legacy eventVisibilityScope flag). */
function matchingModulePolicies(user: SessionUser, moduleKey: ModuleAccessKey): GroupPolicy[] {
  if (!user) return [];
  const member = resolveMember(user);
  if (!member) return [];
  return getGroupPolicies().filter(p => {
    if (!isPolicyActive(p) || !memberMatchesPolicy(member, p)) return false;
    if (p.moduleAccess?.[moduleKey]) return true;
    if (moduleKey === 'EVENTS' && p.eventVisibilityScope === 'OWN_ONLY') return true;
    return false;
  });
}

/** True if an active policy grants this member full ("ALL") view access to `moduleKey`, beyond whatever their built-in role/tier already gives them. Super User always true. */
export function hasModuleViewAllGrant(user: SessionUser, moduleKey: ModuleAccessKey): boolean {
  if (user?.tier === 1) return true;
  return matchingModulePolicies(user, moduleKey).some(p => p.moduleAccess?.[moduleKey]?.view === 'ALL');
}

/**
 * True if this member should be restricted to only records they created for
 * `moduleKey` — purely restrictive, exactly like the legacy eventVisibilityScope
 * OWN_ONLY flag it generalizes: an explicit 'ALL' grant from ANY matching
 * policy always wins over a restriction from another. Never true for Super User.
 */
export function hasModuleViewOwnRestriction(user: SessionUser, moduleKey: ModuleAccessKey): boolean {
  if (user?.tier === 1) return false;
  const policies = matchingModulePolicies(user, moduleKey);
  if (policies.some(p => p.moduleAccess?.[moduleKey]?.view === 'ALL')) return false;
  return policies.some(p => p.moduleAccess?.[moduleKey]?.view === 'OWN' || (moduleKey === 'EVENTS' && p.eventVisibilityScope === 'OWN_ONLY'));
}

/**
 * Explicit Edit override from a Group Policy for `moduleKey`: 'ALL' grants
 * unrestricted edit access beyond the module's built-in rule; 'NONE' revokes
 * edit outright, even overriding a tier/role that would otherwise qualify —
 * the "cannot edit, view only" lever; 'OWN' limits edit to records this
 * member created (only meaningful for modules whose records track a
 * creator — see each MODULE_CATALOG entry's ownershipNote). Returns
 * undefined when no matching policy sets an edit override at all, so the
 * caller should fall back to that module's own default entirely. When
 * multiple matching policies disagree, the most permissive wins (ALL > OWN >
 * NONE) — the same "more permissive path wins" rule getApprovalRequirement
 * already uses. Super User (tier 1) always resolves to 'ALL' and can never
 * be downgraded by a policy.
 */
export function resolveModuleEditOverride(user: SessionUser, moduleKey: ModuleAccessKey): 'ALL' | 'OWN' | 'NONE' | undefined {
  if (user?.tier === 1) return 'ALL';
  const edits = matchingModulePolicies(user, moduleKey)
    .map(p => p.moduleAccess?.[moduleKey]?.edit)
    .filter((e): e is 'ALL' | 'OWN' | 'NONE' => !!e);
  if (edits.length === 0) return undefined;
  if (edits.includes('ALL')) return 'ALL';
  if (edits.includes('OWN')) return 'OWN';
  return 'NONE';
}

/**
 * Explicit View override from a Group Policy for `moduleKey`: 'ALL' grants
 * unrestricted view access; 'NONE' revokes view access; 'OWN' limits view
 * to records this member created or met. Returns undefined when no policy sets a view override.
 */
export function resolveModuleViewOverride(user: SessionUser, moduleKey: ModuleAccessKey): 'ALL' | 'OWN' | undefined {
  if (user?.tier === 1) return 'ALL';
  const views = matchingModulePolicies(user, moduleKey)
    .map(p => p.moduleAccess?.[moduleKey]?.view)
    .filter((v): v is 'ALL' | 'OWN' => v === 'ALL' || v === 'OWN');
  if (views.length === 0) return undefined;
  if (views.includes('ALL')) return 'ALL';
  return 'OWN';
}

export function isOwnCreatedGuest(guest: { createdBy?: string; metBy?: string }, user: SessionUser): boolean {
  if (!user) return false;
  const userEmail = (user.email || '').trim().toLowerCase();
  const userName = (user.name || '').trim().toLowerCase();
  const userId = (user.id || '').trim().toLowerCase();

  const createdBy = (guest.createdBy || '').trim().toLowerCase();
  const metBy = (guest.metBy || '').trim().toLowerCase();

  if (createdBy && (createdBy === userEmail || createdBy === userId || createdBy === userName)) return true;
  if (metBy && metBy === userName) return true;
  return false;
}

/** One-time self-edit window for records that track a creator (Members, Guests) — 24 hours from creation. */
export const SELF_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

function isOwnCreatedRecordEditable(record: { createdBy?: string; metBy?: string; createdAt?: string; selfEditUsedAt?: string }, user: SessionUser): boolean {
  if (!user) return false;
  if (!isOwnCreatedGuest(record, user)) return false;
  if (record.selfEditUsedAt) return false;
  if (!record.createdAt) return false;
  const createdAt = new Date(record.createdAt).getTime();
  if (Number.isNaN(createdAt)) return false;
  return Date.now() - createdAt <= SELF_EDIT_WINDOW_MS;
}

/** Check if user can view a specific guest record (strictly filtered when moduleAccess.GUEST_DIRECTORY.view === 'OWN' or edit === 'OWN'). */
export function canViewGuestRecord(guest: Guest, user: SessionUser): boolean {
  if (!user) return false;
  if (user.tier === 1) return true;

  const viewOverride = resolveModuleViewOverride(user, 'GUEST_DIRECTORY');
  const editOverride = resolveModuleEditOverride(user, 'GUEST_DIRECTORY');

  if (editOverride === 'NONE' && !viewOverride) return false;

  // An explicit 'OWN' override ALWAYS takes precedence over built-in role/tier defaults
  if (viewOverride === 'OWN' || editOverride === 'OWN' || hasModuleViewOwnRestriction(user, 'GUEST_DIRECTORY')) {
    return isOwnCreatedGuest(guest, user);
  }

  if (viewOverride === 'ALL' || editOverride === 'ALL') {
    return true;
  }

  // Built-in default: Centre Head has full view access when no policy override exists
  if (isCentreHead(user)) return true;

  // All other users holding access default to viewing only their own created/met guests
  return isOwnCreatedGuest(guest, user);
}

/**
 * Per-row Member Directory edit permission — three tiers of control:
 * 1) Super User / base leadership (Centre Head, Head of Events): unrestricted,
 *    same as before this feature existed.
 * 2) An explicit moduleAccess.DIRECTORY.edit override from a Group Policy
 *    ('ALL' unrestricted, 'NONE' revoked, 'OWN' restricted per (3)) always wins
 *    over the default for anyone who isn't base leadership.
 * 3) Default for a non-leadership member who only holds EDIT_DIRECTORY via a
 *    Group Policy capability grant (no explicit edit override set): they may
 *    edit ONLY the member record they personally added, ONLY ONCE, and ONLY
 *    within 24 hours of adding it — after that (or after their one edit),
 *    the record is theirs to view but never edit again; a full admin can
 *    still edit it anytime.
 */
export function canEditMemberRecordRow(member: Member, user: SessionUser): boolean {
  if (isExecutiveRole(user) || isAlumniRole(user)) return false;
  if (user?.tier === 1) return true;
  const override = resolveModuleEditOverride(user, 'DIRECTORY');
  if (override === 'NONE') return false;
  if (override === 'ALL') return true;
  if (isBaseLeadership(user)) return true;
  if (override === 'OWN') return isOwnCreatedRecordEditable(member, user);
  if (hasCapability(user, 'EDIT_DIRECTORY')) return isOwnCreatedRecordEditable(member, user);
  return false;
}

/**
 * Per-row Guest Directory edit permission — explicit Group Policy 'OWN' or 'ALL'
 * override ALWAYS takes precedence over built-in role defaults.
 */
export function canEditGuestRecord(guest: Guest, user: SessionUser): boolean {
  if (!user) return false;
  if (user?.tier === 1) return true;
  const override = resolveModuleEditOverride(user, 'GUEST_DIRECTORY');
  if (override === 'NONE') return false;
  if (override === 'ALL') return true;
  if (override === 'OWN') return isOwnCreatedRecordEditable(guest, user);
  if (isCentreHead(user)) return true;
  if (!canAccessGuestDirectory(user)) return false;
  return isOwnCreatedRecordEditable(guest, user);
}

/**
 * True when `user`'s Directory edit access is the restricted, one-time-per-
 * record kind rather than full admin access — the Directory page uses this
 * right after a successful save to decide whether to stamp selfEditUsedAt
 * (spending the editor's one-time use) or leave the record untouched
 * (a full admin can edit the same record again later).
 */
export function isRestrictedDirectoryEditor(user: SessionUser): boolean {
  if (user?.tier === 1) return false;
  if (resolveModuleEditOverride(user, 'DIRECTORY') === 'ALL') return false;
  return !isBaseLeadership(user);
}

/** Same as isRestrictedDirectoryEditor, for the Guest Directory page. */
export function isRestrictedGuestEditor(user: SessionUser): boolean {
  if (user?.tier === 1) return false;
  if (resolveModuleEditOverride(user, 'GUEST_DIRECTORY') === 'ALL') return false;
  return !isCentreHead(user);
}

export interface ApprovalRequirement {
  requiresApproval: boolean;
  approverType?: GroupPolicy['approverType'];
  approverMemberId?: string;
  approverPolicyTagId?: string;
  approverName?: string; // human-readable, for the "submitted for approval from X" toast
  policyName?: string;
}

function resolveApproverName(policy: GroupPolicy): string {
  if (policy.approverType === 'SPECIFIC_MEMBER' && policy.approverMemberId) {
    return getMembers().find(m => m.id === policy.approverMemberId)?.name || 'the designated approver';
  }
  if (policy.approverType === 'POLICY_TAG' && policy.approverPolicyTagId) {
    const tagPolicy = getGroupPolicies().find(p => p.id === policy.approverPolicyTagId);
    return tagPolicy ? `anyone holding "${tagPolicy.name}"` : 'the designated approver';
  }
  return 'the Center Head';
}

/**
 * Whether `user` acting under `capability` needs sign-off before their action takes
 * effect, and who from. `builtInGranted` is whether the user already has this
 * capability through a hardcoded tier/role rule (in which case approval never
 * applies — approval only ever gates access that came SOLELY from a policy tag).
 * If the user holds the capability through multiple matching policies and at least
 * one of them doesn't require approval, that non-approval grant wins (the more
 * permissive path is used) — approval is only imposed when EVERY grant path demands it.
 */
export function getApprovalRequirement(user: SessionUser, capability: string, builtInGranted: boolean): ApprovalRequirement {
  if (builtInGranted || !user) return { requiresApproval: false };
  const member = resolveMember(user);
  if (!member) return { requiresApproval: false };

  const policies = getGroupPolicies().filter(
    p => isPolicyActive(p) && p.capabilities?.includes(capability) && memberMatchesPolicy(member, p)
  );
  if (policies.length === 0) return { requiresApproval: false };
  if (policies.some(p => !p.requiresApproval)) return { requiresApproval: false };

  const policy = policies[0];
  return {
    requiresApproval: true,
    approverType: policy.approverType || 'CENTER_HEAD',
    approverMemberId: policy.approverMemberId,
    approverPolicyTagId: policy.approverPolicyTagId,
    approverName: resolveApproverName(policy),
    policyName: policy.name,
  };
}

/** Sector Head first-stage approval permission. */
export function canApproveAsSectorHead(user: SessionUser): boolean {
  if (isExecutiveRole(user) || isAlumniRole(user)) return false;
  return isSectorHead(user);
}

/** Centre Head first-stage verification permission for reimbursement claims. */
export function canVerifyReimbursementCentreHead(user: SessionUser): boolean {
  return isCentreHead(user) || user?.tier === 1;
}

/** Finance Head second-stage approval permission for reimbursement claims. */
export function canApproveAsFinanceHead(user: SessionUser, claim?: ReimbursementItem): boolean {
  if (!user || !isFinanceHead(user) || isExecutiveRole(user) || isAlumniRole(user)) return false;
  if (user.tier === 1 || isCentreHead(user)) return true;
  if (!claim) return true;
  return claim.centreHeadVerified === true || claim.status === 'Verified by Centre Head' || claim.status === 'Under Review';
}

/** Centre Head can propose budgets (annual + monthly breakdowns), or a PROPOSE_BUDGET/MANAGE_BUDGET grant. A moduleAccess.BUDGET.edit override always wins. */
export function canSubmitBudget(user: SessionUser): boolean {
  const override = resolveModuleEditOverride(user, 'BUDGET');
  if (override === 'NONE') return false;
  if (override === 'ALL') return true;
  return isCentreHead(user) || hasCapability(user, 'PROPOSE_BUDGET') || hasCapability(user, 'MANAGE_BUDGET');
}

/** Centre Head stage-1 verification permission for a Pending budget request. */
export function canVerifyBudgetCentreHead(user: SessionUser): boolean {
  return isCentreHead(user) || user?.tier === 1;
}

/**
 * Finance Head stage-2 final decision on a budget request. Requires the
 * Centre Head's stage-1 verification first, unless the Finance Head is also
 * the Centre Head (or Super User) — same bypass shape as
 * canApproveAsFinanceHead() for reimbursements.
 */
export function canDecideBudget(user: SessionUser, budget?: BudgetItem): boolean {
  if (!user || !isFinanceHead(user)) return false;
  if (user.tier === 1 || isCentreHead(user)) return true;
  if (!budget) return true;
  return budget.centreHeadVerified === true;
}

/** Announcement approval gatekeeper — Centre Head or GG Campus Events Head (Tier 2.5). */
export function canApproveAnnouncement(user: SessionUser): boolean {
  if (!user) return false;
  return isCentreHead(user) || isEventsHeadGgCampus(user) || user.tier === 1 || user.tier === 2.5 || hasCapability(user, 'APPROVE_ANNOUNCEMENT');
}

/**
 * Visibility rule for reimbursement claims:
 * - Claimant sees their own claims.
 * - Super User sees all.
 * - Sector Head sees all claims (including 'Pending' claims awaiting Sector Head approval).
 * - Finance Head sees claims ONLY AFTER Sector Head has approved them ('Under Review', 'Approved', 'Denied').
 *   Pending claims do NOT reflect on Finance Head's dashboard until Sector Head approves!
 */
export function canViewReimbursement(claim: ReimbursementItem, user: SessionUser): boolean {
  if (!user) return false;

  // Claimant always sees their own claims
  if (user.email && claim.memberEmail.toLowerCase() === user.email.toLowerCase()) {
    return true;
  }

  // Super User sees all
  if (user.tier === 1) return true;

  // An explicit moduleAccess.REIMBURSEMENTS.view === 'ALL' Group Policy grant
  if (hasModuleViewAllGrant(user, 'REIMBURSEMENTS')) return true;

  // Sector Head sees all claims, including stage-1 Pending claims
  if (isSectorHead(user)) return true;

  // Centre Head (or Centre-Head-equivalent, e.g. a Faculty Advisor) verifies
  // stage-1 claims directly on the Reimbursements page — they need to see
  // Pending claims too, or the verify/reject buttons they're entitled to
  // would never actually appear on anything.
  if (isCentreHead(user)) return true;

  // Finance Head sees claims ONLY AFTER Sector Head approval ('Under Review', 'Approved', 'Denied')
  if (isFinanceHead(user)) {
    return claim.status !== 'Pending';
  }

  return false;
}

/** Event creation — leadership, Core Committee, any Head, or an EVENTS_CREATE grant. */
export function canCreateEvent(user: SessionUser): boolean {
  return isBaseLeadership(user) || isCoreCommitteeTier(user) || isHeadRole(user) || hasCapability(user, 'EVENTS_CREATE');
}

/**
 * Event editing — same baseline as creation, or an EVENTS_EDIT grant. A
 * moduleAccess.EVENTS.edit override from a Group Policy always wins over
 * that baseline: 'NONE' revokes edit even for a role that would otherwise
 * qualify, 'ALL' grants it outright.
 */
export function canEditEvent(user: SessionUser): boolean {
  const override = resolveModuleEditOverride(user, 'EVENTS');
  if (override === 'NONE') return false;
  if (override === 'ALL') return true;
  return isBaseLeadership(user) || isCoreCommitteeTier(user) || isHeadRole(user) || hasCapability(user, 'EVENTS_EDIT');
}

/** Event deletion — base leadership only by default, or an EVENTS_DELETE grant. */
export function canDeleteEvent(user: SessionUser): boolean {
  return isBaseLeadership(user) || hasCapability(user, 'EVENTS_DELETE');
}

/** Umbrella check for "can this user manage events at all" — gates the events UI's
 *  create button and per-row edit/delete affordances the same way the old single
 *  canManageTasksAndEvents() did, now backed by the finer create/edit/delete checks. */
export function canManageEvents(user: SessionUser): boolean {
  return canCreateEvent(user) || canEditEvent(user) || canDeleteEvent(user);
}

/**
 * Per-event visibility. The DEFAULT is unchanged from before this feature existed —
 * every member sees every event — UNLESS the Super User has explicitly created a
 * Group Policy targeting this member with `eventVisibilityScope: 'OWN_ONLY'`, in
 * which case they only see events they created or are listed on a committee for.
 * This is deliberately restrictive-by-opt-in only: nothing narrows for anyone until
 * a policy is built for them, so existing behavior never regresses on its own.
 */
export function canViewEvent(event: EventItem, user: SessionUser): boolean {
  if (!user) return false;
  // Auto-synced public holidays aren't sensitive LEADS event data — they're
  // always visible, regardless of a restrictive OWN_ONLY event-visibility policy.
  if (event.isHoliday) return true;

  const isRtcHead = isEventsHeadRtcCampus(user);
  const isGgHead = isEventsHeadGgCampus(user) || user.tier === 2.5;

  // Asymmetric restriction: RTC Head cannot view GG Campus events
  if (event.campus === 'GG Campus' && isRtcHead && !isGgHead && !isCentreHead(user) && user.tier !== 1) {
    return false;
  }

  if (isBaseLeadership(user) || isHeadRole(user) || user.tier === 2.5 || hasCapability(user, 'EVENTS_VIEW_ALL') || hasModuleViewAllGrant(user, 'EVENTS')) return true;

  const member = resolveMember(user);
  if (!member) return true;

  if (!hasModuleViewOwnRestriction(user, 'EVENTS')) return true;

  if (event.createdBy && (event.createdBy === user.name || event.createdBy === user.email)) return true;
  return (event.committees || []).some(c => (c.memberIds || []).includes(member.id));
}

/** Whether `user` acting under `action` (create/edit) needs approval, and from whom. */
export function getEventApprovalRequirement(user: SessionUser, action: 'CREATE' | 'EDIT' | 'DELETE'): ApprovalRequirement {
  if (isExecutiveRole(user) && !isCentreHead(user) && user?.tier !== 1) {
    return {
      requiresApproval: true,
      approverType: 'CENTER_HEAD',
      approverName: 'the Center Head',
      policyName: 'Executive Event Sign-off Requirement'
    };
  }
  if (action === 'DELETE') {
    // Deletion's built-in (no-approval-needed) grant is narrower than create/edit's —
    // it mirrors canDeleteEvent() exactly: Base Leadership only, not every Head/Core
    // Committee role, since deleting is destructive and irreversible.
    return getApprovalRequirement(user, 'EVENTS_DELETE', isBaseLeadership(user));
  }
  const capability = action === 'CREATE' ? 'EVENTS_CREATE' : 'EVENTS_EDIT';
  const builtIn = isBaseLeadership(user) || user?.tier === 2.5 || isCoreCommitteeTier(user) || isHeadRole(user);
  return getApprovalRequirement(user, capability, builtIn);
}

/** Whether `user` is the resolved approver for a specific pending event (create, edit, or delete). */
export function canApprovePendingEvent(event: EventItem, user: SessionUser): boolean {
  if (!user) return false;
  if (user.tier === 1) return true;
  if (event.approvalStatus !== 'pending_create' && event.approvalStatus !== 'pending_edit' && event.approvalStatus !== 'pending_delete') return false;

  const member = resolveMember(user);
  if (!member) return false;

  if (event.approverType === 'SPECIFIC_MEMBER') return member.id === event.approverMemberId;
  if (event.approverType === 'POLICY_TAG' && event.approverPolicyTagId) {
    const tagPolicy = getGroupPolicies().find(p => p.id === event.approverPolicyTagId);
    return !!tagPolicy && memberMatchesPolicy(member, tagPolicy);
  }
  return isSectorHead(user); // CENTER_HEAD (default)
}

/**
 * Whether creating/editing a task lands immediately or needs sign-off first.
 * Deliberately narrower than getEventApprovalRequirement's trusted set:
 * a plain Core Committee tier (no Head role, no Base Leadership) always
 * routes through approval here — Tasks assigns real people real deliverables,
 * so it trusts fewer roles unconditionally than Events does.
 */
export function getTaskApprovalRequirement(user: SessionUser, action: 'CREATE' | 'EDIT'): ApprovalRequirement {
  if (isExecutiveRole(user) && !isCentreHead(user) && user?.tier !== 1) {
    return {
      requiresApproval: true,
      approverType: 'CENTER_HEAD',
      approverName: 'the Centre Head or GG Campus Events Head',
      policyName: 'Executive Task Sign-off Requirement'
    };
  }
  const trusted = isBaseLeadership(user) || user?.tier === 2.5 || isHeadRole(user);
  if (trusted) return { requiresApproval: false };

  // Not trusted, but they may still hold create/edit access from a different
  // built-in rule entirely (Core Committee's canCreateTask/canEditTask grant
  // needs no policy at all) or from a TASKS_CREATE/TASKS_EDIT policy capability.
  // getApprovalRequirement() can't see the former — it only ever reasons about
  // policy-granted capabilities — so check the real access gate directly and,
  // if they have it by any means, always route it through approval here.
  const hasAccess = action === 'CREATE' ? canCreateTask(user) : canEditTask(user);
  if (!hasAccess) return { requiresApproval: false };
  return {
    requiresApproval: true,
    approverType: 'CENTER_HEAD',
    approverName: 'the Centre Head or GG Campus Events Head',
    policyName: 'Task Sign-off Requirement',
  };
}

/** Whether `user` is the resolved approver for a specific pending task (create or edit). */
export function canApprovePendingTask(task: TaskItem, user: SessionUser): boolean {
  if (!user) return false;
  if (user.tier === 1) return true;
  if (task.approvalStatus !== 'pending_create' && task.approvalStatus !== 'pending_edit') return false;

  const member = resolveMember(user);
  if (!member) return false;

  if (task.approverType === 'SPECIFIC_MEMBER') return member.id === task.approverMemberId;
  if (task.approverType === 'POLICY_TAG' && task.approverPolicyTagId) {
    const tagPolicy = getGroupPolicies().find(p => p.id === task.approverPolicyTagId);
    return !!tagPolicy && memberMatchesPolicy(member, tagPolicy);
  }
  return isCentreHead(user) || isEventsHeadGgCampus(user); // CENTER_HEAD (default): Centre Head or GG Campus Events Head
}

/** Who can answer the weekly holiday-scheduler's "is a social media post
 *  needed for this festival?" task (workflowType 'holiday_social_approval',
 *  see src/lib/holiday-scheduler.ts + local-data.ts's respondToHolidayApproval) —
 *  Super User, Centre Head, or the GG Campus Events Head only. The RTC Campus
 *  Events Head is deliberately excluded (previously granted via isHeadOfEvents/
 *  isEventsHeadRtcCampus, both removed here) — festival/social-media posting
 *  approval for this workflow is a GG-only responsibility, matching the same
 *  GG-only pattern already used by canApprovePendingTask above. */
export function canRespondToHolidayApproval(task: TaskItem, user: SessionUser): boolean {
  if (!user) return false;
  if (task.workflowType !== 'holiday_social_approval') return false;
  return isCentreHead(user) || isEventsHeadGgCampus(user);
}

/** Task creation — leadership, Core Committee, any Head, or a TASKS_CREATE grant. */
export function canCreateTask(user: SessionUser): boolean {
  return isBaseLeadership(user) || isCoreCommitteeTier(user) || isHeadRole(user) || hasCapability(user, 'TASKS_CREATE');
}

/**
 * Task editing — same baseline as creation, or a TASKS_EDIT grant. A
 * moduleAccess.TASKS.edit override always wins over that baseline.
 */
export function canEditTask(user: SessionUser): boolean {
  const override = resolveModuleEditOverride(user, 'TASKS');
  if (override === 'NONE') return false;
  if (override === 'ALL') return true;
  return isBaseLeadership(user) || isCoreCommitteeTier(user) || isHeadRole(user) || hasCapability(user, 'TASKS_EDIT');
}

/**
 * Task deletion — base leadership or a TASKS_DELETE grant can delete any task
 * immediately. Passing the task additionally lets its own creator delete it
 * (no approval needed — deleting your own not-yet-relevant task is not the
 * same risk as deleting someone else's).
 */
export function canDeleteTask(user: SessionUser, task?: TaskItem): boolean {
  if (isBaseLeadership(user) || hasCapability(user, 'TASKS_DELETE')) return true;
  if (task && user?.name && task.creatorName === user.name) return true;
  return false;
}

/** Umbrella check replacing the old canManageTasksAndEvents() for the Tasks page. */
export function canManageTasks(user: SessionUser): boolean {
  return canCreateTask(user) || canEditTask(user) || canDeleteTask(user);
}

/**
 * Extended task visibility: wraps the existing `canViewTask` (individual assignee /
 * event-committee membership) and adds department-scoped visibility for Heads, so a
 * Head sees every task assigned to a member of their own department, not just tasks
 * they personally own or committees they sit on. A TASKS_VIEW_ALL grant sees every
 * task outright — purely additive, since Tasks already default to "own only" for
 * everyone without one of these grants.
 */
export function canViewTaskExtended(task: TaskItem, user: SessionUser): boolean {
  if (hasCapability(user, 'TASKS_VIEW_ALL') || hasModuleViewAllGrant(user, 'TASKS')) return true;
  if (isExecutiveRole(user)) return true;
  if (canViewTask(task as any, user as any)) return true;
  if (!user || !isHeadRole(user)) return false;

  const department = user.department || resolveMember(user)?.department;
  if (!department) return false;

  if (task.assigneeType === 'individual') {
    const members = getMembers();
    const assigneeMember = task.assigneeId
      ? members.find(m => m.id === task.assigneeId)
      : members.find(m =>
          (task.assigneeEmail && m.email.toLowerCase() === task.assigneeEmail.toLowerCase()) ||
          m.name.toLowerCase() === (task.assignee || '').toLowerCase()
        );
    return assigneeMember?.department === department;
  }

  return false;
}

/** Check if user is Dr. Subhadeep / Centre Head Leadership. */
export function isDrSubhadeep(user: SessionUser): boolean {
  if (!user) return false;
  const name = (user.name || '').toLowerCase();
  const email = (user.email || '').toLowerCase();
  return name.includes('subhadeep') || name.includes('subhadip') || name.includes('subhadeepmukherjee') || email.includes('subhadeep');
}

/**
 * Check if user is Kayomarz Pavri — the founding Super User (seeded as member
 * 'm1'). Identity-based (matches by id, name, or either of his known login
 * emails) rather than tier/role alone, so it keeps working even if his tier,
 * role string, or login email ever changes, and even as additional Super User
 * accounts are added that would otherwise be just as hidden from him as they
 * are from everyone else.
 */
export function isKayomarzPavri(user: SessionUser): boolean {
  if (!user) return false;
  const name = (user.name || '').toLowerCase();
  const email = (user.email || '').toLowerCase();
  return user.id === 'm1' || name.includes('kayomarz') || email === 'kayo2970@gmail.com' || email === 'kayo2970@outlook.com';
}

/**
 * Full, unrestricted account visibility — sees every member record, including
 * other Super User accounts that are otherwise hidden from the general
 * directory (see the Security & Privacy filter in the Directory page). Any
 * Super User already sees every other hidden account; Kayomarz Pavri gets
 * this by identity as well, so the override survives regardless of which
 * account/tier he's currently logged in under.
 */
export function canViewHiddenAccounts(user: SessionUser): boolean {
  if (!user) return false;
  return user.tier === 1 || user.role === 'Super User' || isKayomarzPavri(user);
}

/**
 * Rating & Report visibility: leadership, Centre Head, and Dr. Subhadeep Mukherjee see everything;
 * a Head sees ratings for members of their own department (their "team"); everyone else sees only ratings given to them.
 */
export function canViewRating(rating: RatingItem, user: SessionUser): boolean {
  if (!user) return false;
  if (isBaseLeadership(user) || isCentreHead(user) || isDrSubhadeep(user) || hasCapability(user, 'VIEW_ALL_REPORTS') || hasModuleViewAllGrant(user, 'RATINGS')) return true;

  const isOwn =
    rating.targetId === user.id ||
    rating.targetName.toLowerCase() === user.name.toLowerCase();
  if (isOwn) return true;

  if (isHeadRole(user)) {
    const department = user.department || resolveMember(user)?.department;
    if (!department) return false;
    const members = getMembers();
    const targetMember = members.find(m => m.id === rating.targetId) ||
      members.find(m => m.name.toLowerCase() === rating.targetName.toLowerCase());
    return targetMember?.department === department;
  }

  return false;
}

/**
 * Rating edit/delete permission: the rating's own author, Centre Head, a
 * RATING_EDIT_ANY grant, or a moduleAccess.RATINGS.edit override ('ALL'
 * grants edit-any, 'NONE' revokes even the author's own edit rights).
 */
export function canEditRating(rating: RatingItem, user: SessionUser): boolean {
  if (!user) return false;
  const override = resolveModuleEditOverride(user, 'RATINGS');
  const isAuthor = user.name === rating.raterName;
  if (override === 'NONE') return false;
  if (override === 'ALL') return true;
  if (user.tier === 1 || isAuthor || isCentreHead(user) || hasCapability(user, 'RATING_EDIT_ANY')) return true;
  if (override === 'OWN') return isAuthor;

  return false;
}

/**
 * Full member roster visibility: everyone tier <= 5 (Advisory Board through Core
 * Committee, which already covers every Head-role member seeded at tier 5, plus the
 * tier-3 "Head of Events" case). Training Associates (tier 6) and Alumni (tier 7) only
 * see their own profile.
 */
export function canViewFullDirectory(user: SessionUser): boolean {
  if (isAlumniRole(user)) return false;
  return !!user && (user.tier <= 5 || isHeadRole(user) || isExecutiveRole(user) || hasCapability(user, 'VIEW_FULL_DIRECTORY') || hasModuleViewAllGrant(user, 'DIRECTORY'));
}

/**
 * Roster CRUD access at all (shows the Add Member button, CSV import, and
 * bulk tools) — base leadership, or an explicit Group Policy grant. This is
 * the umbrella "can manage the directory" gate; PER-ROW edit permission for
 * a specific member is narrower and handled separately by
 * canEditMemberRecordRow, which restricts a non-leadership grantee to only
 * the records they personally added.
 */
export function canEditDirectory(user: SessionUser): boolean {
  if (isExecutiveRole(user) || isAlumniRole(user)) return false;
  return isBaseLeadership(user) || hasCapability(user, 'EDIT_DIRECTORY') || resolveModuleEditOverride(user, 'DIRECTORY') === 'ALL';
}

/** Check if user can terminate members (Centre Head or Super User only). */
export function canTerminateMember(user: SessionUser): boolean {
  if (isExecutiveRole(user) || isAlumniRole(user)) return false;
  return isCentreHead(user) || user?.tier === 1 || hasCapability(user, 'TERMINATE_MEMBER');
}

/**
 * Directly set another member's password, taking effect immediately with no OTP
 * or self-setup step for them to complete. Deliberately Super User (tier 1) ONLY —
 * unlike most admin actions in this file, isCentreHead() is NOT accepted here.
 * Centre Head can still ask a member to set up their own password on next login
 * (see requestMemberPasswordReset), just not assign one directly.
 */
export function canSetMemberPassword(user: SessionUser): boolean {
  return user?.tier === 1;
}

/** Check if user is in the Faculty division. */
export function isFaculty(user: SessionUser): boolean {
  return !!user && user.division === 'Faculty';
}

/** Guest Directory (visiting-card contacts) — Centre Head, Faculty, Executive Council, or a GUEST_DIRECTORY_ACCESS/moduleAccess grant. */
export function canAccessGuestDirectory(user: SessionUser): boolean {
  if (isAlumniRole(user)) return false;
  if (resolveModuleEditOverride(user, 'GUEST_DIRECTORY') === 'NONE') return false;
  return isCentreHead(user) || isFaculty(user) || isExecutiveRole(user) || hasCapability(user, 'GUEST_DIRECTORY_ACCESS') || !!resolveModuleEditOverride(user, 'GUEST_DIRECTORY');
}

/** Check if user can delete contacts from guest directory — Centre Head/Super User by default, or an explicit GUEST_DIRECTORY_DELETE grant. */
export function canRemoveGuestContact(user: SessionUser): boolean {
  if (isExecutiveRole(user) || isAlumniRole(user)) return false;
  return isCentreHead(user) || user?.tier === 1 || hasCapability(user, 'GUEST_DIRECTORY_DELETE');
}

/**
 * Form builder access — existing convention (tier 1 or tier 5), plus any Head
 * regardless of tier, or a BUILD_FORMS grant. A moduleAccess.FORMS.edit
 * override always wins: 'NONE' revokes, 'ALL' grants outright.
 */
export function canBuildForms(user: SessionUser): boolean {
  if (isAlumniRole(user)) return false;
  const override = resolveModuleEditOverride(user, 'FORMS');
  if (override === 'NONE') return false;
  if (override === 'ALL') return true;
  return (!!user && (user.tier === 1 || user.tier === 5)) || isHeadRole(user) || isExecutiveRole(user) || hasCapability(user, 'BUILD_FORMS');
}

/** Check if user can delete public forms (Centre Head or Super User only), or a moduleAccess.FORMS.edit === 'ALL' grant. */
export function canDeleteForms(user: SessionUser): boolean {
  if (isExecutiveRole(user) || isAlumniRole(user)) return false;
  if (resolveModuleEditOverride(user, 'FORMS') === 'NONE') return false;
  return isCentreHead(user) || user?.tier === 1 || resolveModuleEditOverride(user, 'FORMS') === 'ALL';
}

/**
 * Whether building/editing/deleting a public form lands immediately or needs
 * Centre Head sign-off first. Forms are public-facing (a live link goes out
 * the moment it's built), so the trusted-without-approval set is narrower and
 * specific: Centre Head, Finance Head, any of the three named Events Head
 * roles, or Design Head — a generic/unnamed "Head" role, Executive roles,
 * Advisory Board, and Core Committee all route through approval.
 */
export function getFormApprovalRequirement(user: SessionUser, action: 'CREATE' | 'EDIT' | 'DELETE'): ApprovalRequirement {
  const trusted = user?.tier === 1 || isCentreHead(user) || isFinanceHead(user) || isDesignHead(user) || isHeadOfEvents(user);
  if (trusted) return { requiresApproval: false };

  // canBuildForms()/canDeleteForms() grant Core Committee, any generic Head
  // role, and Executive roles access with no policy involved at all —
  // getApprovalRequirement() only reasons about policy-granted capabilities,
  // so it can't see that built-in grant. Check the real access gate directly
  // and route it through approval whenever they have access by any means.
  const hasAccess = action === 'DELETE' ? canDeleteForms(user) || canBuildForms(user) : canBuildForms(user);
  if (!hasAccess) return { requiresApproval: false };
  return {
    requiresApproval: true,
    approverType: 'CENTER_HEAD',
    approverName: 'the Centre Head',
    policyName: 'Public Form Sign-off Requirement',
  };
}

/** Whether `user` is the resolved approver for a specific pending form (create, edit, or delete). */
export function canApprovePendingForm(form: PublicFormItem, user: SessionUser): boolean {
  if (!user) return false;
  if (user.tier === 1) return true;
  if (form.approvalStatus !== 'pending_create' && form.approvalStatus !== 'pending_edit' && form.approvalStatus !== 'pending_delete') return false;

  const member = resolveMember(user);
  if (!member) return false;

  if (form.approverType === 'SPECIFIC_MEMBER') return member.id === form.approverMemberId;
  if (form.approverType === 'POLICY_TAG' && form.approverPolicyTagId) {
    const tagPolicy = getGroupPolicies().find(p => p.id === form.approverPolicyTagId);
    return !!tagPolicy && memberMatchesPolicy(member, tagPolicy);
  }
  return isCentreHead(user); // CENTER_HEAD (default)
}

/**
 * Announcement authoring — Core Committee, Advisory Board, Faculty, Heads,
 * Centre Head & GG Campus Events Head, or a CREATE_ANNOUNCEMENT grant. A
 * moduleAccess.ANNOUNCEMENTS.edit override always wins over that baseline.
 */
export function canCreateAnnouncement(user: SessionUser): boolean {
  if (!user || isAlumniRole(user)) return false;
  const override = resolveModuleEditOverride(user, 'ANNOUNCEMENTS');
  if (override === 'NONE') return false;
  if (override === 'ALL') return true;
  return isBaseLeadership(user) || isCoreCommitteeTier(user) || user.tier === 4 || user.tier === 5 || isFaculty(user) || isHeadRole(user) || hasCapability(user, 'CREATE_ANNOUNCEMENT');
}

/**
 * Design Portal visibility: a plain Design submitter only sees their own uploads
 * (plus anything explicitly assigned to them to proofread — handled separately in
 * the page's own "proofread" tab). Leadership and any Head see every submission.
 * Also doubles as the Design Portal's edit-any-submission gate (see designs/page.tsx),
 * so a moduleAccess.DESIGNS.view === 'ALL' grant here also grants edit-any there.
 */
export function canViewAllDesigns(user: SessionUser): boolean {
  if (isAlumniRole(user) || isExecutiveRole(user)) return false;
  return isBaseLeadership(user) || isDesignHead(user) || hasCapability(user, 'VIEW_ALL_DESIGNS') || hasModuleViewAllGrant(user, 'DESIGNS');
}

/** Task extension request permission: own task or a team member in department (for Heads). */
export function canRequestTaskExtension(task: TaskItem, user: SessionUser): boolean {
  if (!user) return false;
  if (user.id && task.assigneeId === user.id) return true;
  if (user.email && task.assigneeEmail?.toLowerCase() === user.email.toLowerCase()) return true;
  if (user.name && task.assignee.toLowerCase() === user.name.toLowerCase()) return true;

  if (isHeadRole(user)) {
    const department = user.department || resolveMember(user)?.department;
    if (!department) return false;
    const members = getMembers();
    const assigneeMember = members.find(m => m.id === task.assigneeId || m.name.toLowerCase() === task.assignee.toLowerCase());
    return assigneeMember?.department === department;
  }
  return false;
}

/** Task extension approval/rejection: base leadership, or Faculty. */
export function canDecideTaskExtension(user: SessionUser): boolean {
  return isBaseLeadership(user) || isFaculty(user) || hasCapability(user, 'DECIDE_TASK_EXTENSION');
}

/** Guest Invites mail-merge tool — Centre Head/Super User by default, or a MANAGE_GUEST_INVITES/moduleAccess grant. */
export function canManageGuestInvites(user: SessionUser): boolean {
  const override = resolveModuleEditOverride(user, 'GUEST_INVITES');
  if (override === 'NONE') return false;
  if (override === 'ALL') return true;
  return isCentreHead(user) || hasCapability(user, 'MANAGE_GUEST_INVITES');
}

/** Backup & Restore access — Super User by default, or a MANAGE_BACKUP grant. Deliberately no moduleAccess 'NONE' override: this always stays at least Super-User-only, never revocable from the one account that must always be able to recover the system. */
export function canManageBackup(user: SessionUser): boolean {
  return user?.tier === 1 || hasCapability(user, 'MANAGE_BACKUP');
}

/** Email Management access — Super User/Centre Head by default, or a MANAGE_EMAIL_SETTINGS grant. */
export function canManageEmailSettings(user: SessionUser): boolean {
  const override = resolveModuleEditOverride(user, 'EMAIL');
  if (override === 'ALL') return true;
  return user?.tier === 1 || isCentreHead(user) || hasCapability(user, 'MANAGE_EMAIL_SETTINGS');
}

/**
 * Whether an announcement's target `scope` matches a given viewer — the canonical
 * implementation (and the recipient-set builder it shares logic with) lives in
 * announcement-scope.ts so both real email dispatch (server) and this per-viewer
 * relevance check can use the exact same scope-matching rules.
 */
export { getAnnouncementScopeMatch } from './announcement-scope';
