import { readCollection, mutateCollection } from './server-db';

/**
 * Google's own publicly-maintained "Holidays in India" calendar, exposed as a
 * plain ICS feed — no API key, no rate limit we'd hit at this volume. There's
 * no single official Indian-government holiday API to sync from; this is the
 * closest practical, freely-accessible, auto-updating source (the same one
 * most calendar apps use for this purpose).
 */
const INDIAN_HOLIDAYS_ICS_URL =
  'https://calendar.google.com/calendar/ical/en.indian%23holiday%40group.v.calendar.google.com/public/basic.ics';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const SYNC_HORIZON_DAYS = 730; // sync ~2 years out; older/farther entries aren't useful to plan around

interface ParsedHoliday {
  title: string;
  date: string; // "YYYY-MM-DD"
}

/** RFC 5545 line unfolding: a continuation line starts with a single space/tab. */
function unfoldIcsLines(text: string): string[] {
  const rawLines = text.split(/\r\n|\n|\r/);
  const lines: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function parseIcsDate(value: string): string | null {
  // All-day VEVENTs use DTSTART;VALUE=DATE:YYYYMMDD — the property params
  // (before the colon) are stripped by the caller, this just parses the value.
  const m = value.trim().match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Minimal VEVENT parser — deliberately only extracts SUMMARY and DTSTART.
 * Sufficient for Google's holiday feed (simple all-day events, no recurrence
 * rules to expand), not a general-purpose ICS parser.
 */
function parseIcsHolidays(icsText: string): ParsedHoliday[] {
  const lines = unfoldIcsLines(icsText);
  const holidays: ParsedHoliday[] = [];
  let inEvent = false;
  let summary: string | null = null;
  let date: string | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      summary = null;
      date = null;
      continue;
    }
    if (line === 'END:VEVENT') {
      if (inEvent && summary && date) holidays.push({ title: summary, date });
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).split(';')[0];
    const value = line.slice(colonIdx + 1);

    if (key === 'SUMMARY') summary = value.replace(/\\,/g, ',').replace(/\\n/gi, ' ').replace(/\\\\/g, '\\').trim();
    else if (key === 'DTSTART') date = parseIcsDate(value);
  }

  return holidays;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function todayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function addDaysDateString(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Fetches the Indian-holidays ICS feed and upserts each upcoming entry as an
 * `isHoliday: true` EventItem in the `events` collection. Each holiday gets a
 * stable, content-derived id (`holiday_<date>_<slug>`), so re-running this
 * every week naturally updates a holiday whose date the source corrects and
 * never creates a duplicate for one that hasn't changed — no separate sync
 * log needed.
 */
export async function runHolidaySync(): Promise<{ fetched: number; upserted: number }> {
  const res = await fetch(INDIAN_HOLIDAYS_ICS_URL);
  if (!res.ok) throw new Error(`Holiday feed fetch failed: HTTP ${res.status}`);
  const icsText = await res.text();
  const parsed = parseIcsHolidays(icsText);

  const today = todayDateString();
  const horizon = addDaysDateString(today, SYNC_HORIZON_DAYS);
  const upcoming = parsed.filter((h) => h.date >= today && h.date <= horizon);

  let upserted = 0;
  await mutateCollection<any>('events', (current) => {
    const byId = new Map(current.map((e: any) => [e.id, e]));
    for (const h of upcoming) {
      const id = `holiday_${h.date}_${slugify(h.title)}`;
      const existing = byId.get(id);
      if (existing && existing.title === h.title && existing.startDate === h.date && existing.isHoliday) continue;

      byId.set(id, {
        ...(existing || {}),
        id,
        title: h.title,
        description: existing?.description || 'Indian public holiday / festival (auto-synced weekly).',
        startDate: h.date,
        endDate: h.date,
        status: existing?.status || 'planned',
        committees: existing?.committees || [],
        isHoliday: true,
        approvalStatus: 'approved',
      });
      upserted++;
    }
    return Array.from(byId.values());
  });

  return { fetched: parsed.length, upserted };
}

/**
 * For every synced holiday landing within the coming 7 days (i.e. today, the
 * Sunday sync run, IS "one weekend before" that holiday), creates a
 * `holiday_social_approval` task — assigned as a group to every Centre Head /
 * Events Head on the roster — asking whether a social media post is needed.
 * Skips any holiday that already has one (keyed by a deterministic task id),
 * so a re-run (or the boot catch-up) never creates duplicates.
 */
export async function runHolidayApprovalTasks(): Promise<{ created: number }> {
  const events = await readCollection<any>('events');
  const today = todayDateString();
  const windowEnd = addDaysDateString(today, 7);

  const upcomingHolidays = events.filter((e: any) => e.isHoliday && e.startDate >= today && e.startDate <= windowEnd);
  if (upcomingHolidays.length === 0) return { created: 0 };

  const tasks = await readCollection<any>('tasks');
  const alreadyAsked = new Set(
    tasks.filter((t: any) => t.workflowType === 'holiday_social_approval').map((t: any) => t.eventId)
  );
  const toCreate = upcomingHolidays.filter((h: any) => !alreadyAsked.has(h.id));
  if (toCreate.length === 0) return { created: 0 };

  const members = await readCollection<any>('members');
  const activeMembers = members.filter((m: any) => m.status !== 'Terminated' && m.email);
  let approvers = activeMembers.filter((m: any) => {
    const role = (m.role || '').toLowerCase();
    return role.includes('centre head') || role.includes('center head') || role.includes('events head') || role.includes('head of events');
  });
  // Never leave the task with no one able to see/answer it.
  if (approvers.length === 0) approvers = activeMembers.filter((m: any) => m.tier === 1);

  let created = 0;
  await mutateCollection<any>('tasks', (current) => {
    const next = [...current];
    for (const h of toCreate) {
      const id = `task_holiday_approval_${h.id}`;
      if (next.some((t: any) => t.id === id)) continue;
      next.unshift({
        id,
        title: `Social media post needed for "${h.title}"?`,
        event: h.title,
        eventId: h.id,
        assignee: approvers.map((a: any) => a.name).join(', ') || 'Centre Head',
        assigneeType: 'group',
        assigneeIds: approvers.map((a: any) => a.id),
        dueDate: h.startDate,
        status: 'Assigned',
        creatorName: 'Holiday Scheduler',
        workflowType: 'holiday_social_approval',
      });
      created++;
    }
    return next;
  });

  return { created };
}

async function runHolidayWeeklyCheck(): Promise<void> {
  try {
    await runHolidaySync();
  } catch (err) {
    console.error('[holiday-scheduler] Holiday sync failed:', err);
  }
  try {
    await runHolidayApprovalTasks();
  } catch (err) {
    console.error('[holiday-scheduler] Approval task creation failed:', err);
  }
}

/** ms until the next Sunday 00:00:20 local time (if today IS Sunday, schedules
 *  for next week's — the boot catch-up run already covers today). */
function msUntilNextSunday(): number {
  const now = new Date();
  const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSunday, 0, 0, 20, 0);
  return next.getTime() - now.getTime();
}

/**
 * Starts the in-process weekly (Sunday) holiday-sync + approval-task
 * scheduler. Registered once from instrumentation.ts at server boot, mirroring
 * birthday-scheduler.ts's pattern exactly: an immediate catch-up run (so a
 * server restart doesn't cost a missed week), then a timer aligned to the
 * next Sunday, repeating every 7 days after that. Every operation here is
 * idempotent (content-derived ids for holidays, a deterministic task id per
 * holiday for approval tasks), so re-running this on every boot is always safe.
 */
export function startHolidayScheduler(): void {
  const g = globalThis as unknown as { __holidaySchedulerStarted?: boolean };
  if (g.__holidaySchedulerStarted) return;
  g.__holidaySchedulerStarted = true;

  runHolidayWeeklyCheck().catch((err) => console.error('[holiday-scheduler] Startup catch-up check failed:', err));

  setTimeout(() => {
    runHolidayWeeklyCheck().catch((err) => console.error('[holiday-scheduler] Sunday check failed:', err));
    setInterval(() => {
      runHolidayWeeklyCheck().catch((err) => console.error('[holiday-scheduler] Weekly check failed:', err));
    }, WEEK_MS);
  }, msUntilNextSunday());
}
