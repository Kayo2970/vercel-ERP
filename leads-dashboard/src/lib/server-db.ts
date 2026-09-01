/**
 * server-db.ts — Shared server-side file-based database helper.
 *
 * Each collection lives in its own file under data/ (data/members.json,
 * data/events.json, ...) rather than one shared database.json — a write to
 * one collection no longer requires reading and rewriting every other
 * collection, and unrelated collections never block each other's writes
 * (each has its own async mutex). The files stay "interconnected" the same
 * way real relational tables do: by referencing each other's ids (tasks
 * reference eventId/assigneeId, ratings reference targetId, reimbursements
 * reference eventId, etc.) — the connections are in the data, not in a
 * shared physical file.
 *
 * A one-time, idempotent migration splits any pre-existing single-file
 * data/database.json into these per-collection files on first read after
 * upgrading, and retires (never deletes) the old file to data/database.json.migrated
 * as a safety net.
 */
import fs from 'fs/promises';
import path from 'path';
import { deleteStoredFile, saveBase64File } from './file-storage';
import { encryptData, decryptData, isEncryptedPayload } from './encryption';
import {
  initialEvents,
  initialTasks,
  initialRatings,
  initialReimbursements,
  initialAnnouncements,
  initialForms,
  initialFormTemplates,
  initialSubmissions,
  initialDesigns,
  initialGroupPolicies,
  initialAccessLevelSettings,
  initialSystemSettings,
  initialGuests,
  initialBudgets,
  initialIncomeSources,
  FEEDBACK_FORM_TEMPLATE_ID,
} from './local-data';

const DATA_DIR = path.join(process.cwd(), 'data');
const LEGACY_DB_PATH = path.join(DATA_DIR, 'database.json');
const RETIRED_LEGACY_DB_PATH = path.join(DATA_DIR, 'database.json.migrated');
const META_PATH = path.join(DATA_DIR, '_meta.json');

export interface DbSchema {
  members: any[];
  events: any[];
  tasks: any[];
  ratings: any[];
  reimbursements: any[];
  announcements: any[];
  forms: any[];
  formTemplates: any[];
  submissions: any[];
  designs: any[];
  groupPolicies: any[];
  accessLevelSettings: any[];
  systemSettings: any[];
  auditLogs: any[];
  emails: any[];
  passwordResets: any[];
  emailChanges: any[];
  accountActivations: any[];
  emailSettings: any[];
  guests: any[];
  budgets: any[];
  incomeSources: any[];
  // One row per (memberId, date) a birthday email was actually sent for —
  // see src/lib/birthday-scheduler.ts. Purely an idempotency guard so a
  // PM2 restart near midnight (or two scheduler ticks landing on the same
  // day) can never double-send the same member's birthday email.
  birthdayEmailLog: any[];
  lastUpdated?: string;
}

const EMPTY_DB: DbSchema = {
  members: [],
  events: [],
  tasks: [],
  ratings: [],
  reimbursements: [],
  announcements: [],
  forms: [],
  formTemplates: [],
  submissions: [],
  designs: [],
  groupPolicies: [],
  accessLevelSettings: [],
  systemSettings: [],
  auditLogs: [],
  emails: [],
  passwordResets: [],
  emailChanges: [],
  accountActivations: [],
  emailSettings: [],
  guests: [],
  budgets: [],
  incomeSources: [],
  birthdayEmailLog: [],
};

const SEED_DB: DbSchema = {
  // Deliberately NOT seeded from local-data.ts's initialMembers — that fake
  // faculty roster shared one known default password across every account.
  // A fresh deploy now starts with zero members; run `npm run setup`
  // (scripts/setup-superuser.mjs) once before first start to create the one
  // real Super User account interactively (email + a password you choose).
  // Everyone else gets added through the app afterward.
  members: [],
  events: initialEvents,
  tasks: initialTasks,
  ratings: initialRatings,
  reimbursements: initialReimbursements,
  announcements: initialAnnouncements,
  forms: initialForms,
  formTemplates: initialFormTemplates,
  submissions: initialSubmissions,
  designs: initialDesigns,
  groupPolicies: initialGroupPolicies,
  accessLevelSettings: initialAccessLevelSettings,
  systemSettings: initialSystemSettings,
  auditLogs: [],
  emails: [],
  passwordResets: [],
  emailChanges: [],
  accountActivations: [],
  emailSettings: [
    {
      id: 'default',
      provider: 'gmail',
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      secure: false,
      authUser: 'leads@msruas.ac.in',
      authPass: '',
      fromName: 'LEADS Next Gen Centre',
      fromEmail: 'leads@msruas.ac.in',
      replyTo: 'leads@msruas.ac.in',
      updatedAt: new Date().toISOString()
    }
  ],
  guests: initialGuests,
  budgets: initialBudgets,
  incomeSources: initialIncomeSources,
  birthdayEmailLog: [],
};

const COLLECTION_KEYS = Object.keys(EMPTY_DB) as (keyof DbSchema)[];

function collectionPath(key: keyof DbSchema): string {
  return path.join(DATA_DIR, `${String(key)}.json`);
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * One-time, idempotent split of the legacy single-file database.json into
 * per-collection files. Cached in module scope so concurrent calls (e.g.
 * several requests landing at once on first boot after upgrading) all await
 * the same migration instead of racing each other. Safe to call on every
 * boot — a no-op once migration has happened (ENOENT on the legacy path).
 */
let migrationPromise: Promise<void> | null = null;
function ensureMigrated(): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      let legacy: Partial<DbSchema>;
      try {
        const raw = await fs.readFile(LEGACY_DB_PATH, 'utf-8');
        legacy = JSON.parse(raw);
      } catch (err: any) {
        if (err?.code !== 'ENOENT') {
          console.error('[server-db] Legacy database.json read failed during migration check:', err);
        }
        return; // no legacy file (or unreadable) — nothing to migrate
      }

      await fs.mkdir(DATA_DIR, { recursive: true });
      for (const key of COLLECTION_KEYS) {
        const target = collectionPath(key);
        if (await fileExists(target)) continue; // already migrated (or created independently) — never overwrite
        const value = Array.isArray(legacy[key]) ? legacy[key] : (EMPTY_DB[key] as any[]);
        await fs.writeFile(target, JSON.stringify(value, null, 2), 'utf-8');
      }

      // Retire, never delete, the legacy file — undeletable safety net if migration
      // logic ever has a bug. Idempotent: if a retired copy already exists (a prior
      // partial run), leave both alone rather than overwriting the earlier snapshot.
      if (!(await fileExists(RETIRED_LEGACY_DB_PATH))) {
        try {
          await fs.rename(LEGACY_DB_PATH, RETIRED_LEGACY_DB_PATH);
        } catch (err) {
          console.error('[server-db] Failed to retire legacy database.json after migration:', err);
        }
      }
    })();
  }
  return migrationPromise;
}

/**
 * 30-Day Storage Retention Cleanup Helper:
 * Checks design items past 30 days, marks them as expired, and purges the stored
 * file — both the legacy inline base64 payload (if the record predates the
 * disk-backed storage migration) and, for newer records, the actual file on disk
 * referenced by storageKey.
 */
function processDesignRetention(designs: any[]): any[] {
  if (!Array.isArray(designs)) return [];
  const nowMs = Date.now();

  return designs.map(item => {
    if (!item.expiresAt) return item;
    const expiresMs = new Date(item.expiresAt).getTime();
    if (nowMs > expiresMs) {
      if (!item.isExpired && item.storageKey) {
        // Best-effort, not awaited — this function stays synchronous and never
        // blocks a read waiting on a delete that only needs to happen once.
        deleteStoredFile(item.storageKey).catch(() => {});
      }
      return {
        ...item,
        isExpired: true,
        fileData: undefined, // Purge legacy inline payload after 30 days
        fileUrl: undefined,
        storageKey: undefined,
      };
    }
    return item;
  });
}

/**
 * One-time, idempotent migration of any legacy inline-base64 file payloads
 * (designs.json's fileData, reimbursements.json's receiptFiles[].dataUrl /
 * receiptData) out to real files under data/uploads/, rewriting the JSON
 * records to reference them via storageKey/url instead. Safe to run on every
 * boot — a record that's already migrated has no dataUrl/fileData left to act
 * on, so it's skipped. Cached in module scope like ensureMigrated().
 */
let fileMigrationPromise: Promise<void> | null = null;
function ensureFilesMigrated(): Promise<void> {
  if (!fileMigrationPromise) {
    fileMigrationPromise = (async () => {
      await migrateDesignFilesToDisk();
      await migrateReimbursementFilesToDisk();
    })();
  }
  return fileMigrationPromise;
}

/**
 * One-off correction: an instance already running before local-data.ts's
 * seed was corrected may still have Dr. Subhadeep Mukherjee's old email
 * baked into its members.json — the seed only applies on first boot, and
 * an already-existing collection file is never overwritten. Runs once per
 * boot, only touches the record if the stale address is still present, and
 * is a permanent no-op afterward.
 */
let subhadeepEmailFixPromise: Promise<void> | null = null;
function ensureSubhadeepEmailFixed(): Promise<void> {
  if (!subhadeepEmailFixPromise) {
    subhadeepEmailFixPromise = (async () => {
      const STALE_EMAIL = 'subhadeep.mukherjee@msruas.ac.in';
      const CORRECT_EMAIL = 'subhadeepmukherjee.ms.mc@msruas.ac.in';
      try {
        const raw = await fs.readFile(collectionPath('members'), 'utf-8');
        const members = JSON.parse(raw);
        if (!Array.isArray(members)) return;
        let changed = false;
        const updated = members.map((m: any) => {
          if (m?.email?.toLowerCase() === STALE_EMAIL) {
            changed = true;
            return { ...m, email: CORRECT_EMAIL };
          }
          return m;
        });
        if (changed) {
          await fs.writeFile(collectionPath('members'), JSON.stringify(updated, null, 2), 'utf-8');
        }
      } catch (err: any) {
        if (err?.code !== 'ENOENT') {
          console.error('[server-db] Subhadeep email correction check failed:', err);
        }
      }
    })();
  }
  return subhadeepEmailFixPromise;
}

/**
 * One-off correction: an instance already running before local-data.ts's
 * seed was corrected may still have Dr. Pallabi Mund's and Dr. Ajay R's old
 * emails baked into its members.json — same situation as the Subhadeep fix
 * above. Runs once per boot, only touches a record if its stale address is
 * still present, and is a permanent no-op afterward.
 */
let staleEmailFixPromise: Promise<void> | null = null;
function ensureStaleEmailsFixed(): Promise<void> {
  if (!staleEmailFixPromise) {
    staleEmailFixPromise = (async () => {
      const CORRECTIONS: Record<string, string> = {
        'pallabi.mund@msruas.ac.in': 'pallabimund.ms.mc@msruas.ac.in',
        'ajay.r@msruas.ac.in': 'ajay.ca.mc@msruas.ac.in',
      };
      try {
        const raw = await fs.readFile(collectionPath('members'), 'utf-8');
        const members = JSON.parse(raw);
        if (!Array.isArray(members)) return;
        let changed = false;
        const updated = members.map((m: any) => {
          const correct = CORRECTIONS[m?.email?.toLowerCase()];
          if (correct) {
            changed = true;
            return { ...m, email: correct };
          }
          return m;
        });
        if (changed) {
          await fs.writeFile(collectionPath('members'), JSON.stringify(updated, null, 2), 'utf-8');
        }
      } catch (err: any) {
        if (err?.code !== 'ENOENT') {
          console.error('[server-db] Stale email correction check failed:', err);
        }
      }
    })();
  }
  return staleEmailFixPromise;
}

const REMOVED_SEED_MEMBER_IDS = new Set([
  'm5', 'm6', 'm8', 'm13', 'm14', 'm15', 'm16', 'm17', 'm18', 'm19',
  'm20', 'm21', 'm22', 'm23', 'm24', 'm25', 'm26', 'm27', 'm28', 'm29',
  'm30', 'm31', 'm32', 'm33', 'm34', 'm35'
]);

let productionRosterPrunePromise: Promise<void> | null = null;
function ensureProductionRosterPruned(): Promise<void> {
  if (!productionRosterPrunePromise) {
    productionRosterPrunePromise = (async () => {
      try {
        const raw = await fs.readFile(collectionPath('members'), 'utf-8');
        const parsed = JSON.parse(raw);
        let jsonContent: any = parsed;
        if (isEncryptedPayload(parsed)) {
          try {
            jsonContent = JSON.parse(decryptData(parsed));
          } catch {
            return;
          }
        }
        if (!Array.isArray(jsonContent)) return;

        let changed = false;
        const updated = jsonContent
          .filter((m: any) => !REMOVED_SEED_MEMBER_IDS.has(m?.id))
          .map((m: any) => {
            if (['m2', 'm3', 'm4', 'm7', 'm10', 'm11', 'm12'].includes(m?.id)) {
              if (m.division !== 'Faculty') {
                changed = true;
                return { ...m, division: 'Faculty' };
              }
            }
            return m;
          });

        if (updated.length < jsonContent.length) {
          changed = true;
        }

        if (changed) {
          await writeCollectionFile('members', updated);
        }
      } catch (err: any) {
        if (err?.code !== 'ENOENT') {
          console.error('[server-db] Production roster prune check failed:', err);
        }
      }
    })();
  }
  return productionRosterPrunePromise;
}

/**
 * One-time, idempotent cleanup: deleting a form used to leave its
 * submissions behind forever (fixed going forward — DELETE /api/forms/[id]
 * now cascades), but that fix only stops NEW orphans from being created —
 * any database that already had a form deleted before that shipped is
 * still carrying old orphaned submissions, which can even resurface under
 * a brand-new form later built on the same slug (submissions are matched
 * by slug as a fallback for records predating a reliable formId). Prunes
 * any submission whose formId AND slug both fail to match a currently
 * existing form. Runs once per boot; a permanent no-op once there's
 * nothing left to prune.
 */
let orphanedSubmissionsPrunePromise: Promise<void> | null = null;
function ensureOrphanedSubmissionsPruned(): Promise<void> {
  if (!orphanedSubmissionsPrunePromise) {
    orphanedSubmissionsPrunePromise = (async () => {
      try {
        const readJsonArray = async (key: keyof DbSchema): Promise<any[] | null> => {
          const raw = await fs.readFile(collectionPath(key), 'utf-8');
          const parsed = JSON.parse(raw);
          let content: any = parsed;
          if (isEncryptedPayload(parsed)) {
            try {
              content = JSON.parse(decryptData(parsed));
            } catch {
              return null;
            }
          }
          return Array.isArray(content) ? content : null;
        };

        const forms = await readJsonArray('forms');
        if (!forms) return; // no forms file yet, or undecryptable — nothing safe to prune against

        const validFormIds = new Set(forms.map((f: any) => f?.id).filter(Boolean));
        const validSlugs = new Set(forms.map((f: any) => f?.slug).filter(Boolean));

        const submissions = await readJsonArray('submissions');
        if (!submissions) return;

        const pruned = submissions.filter((s: any) => validFormIds.has(s?.formId) || validSlugs.has(s?.slug));
        if (pruned.length !== submissions.length) {
          await writeCollectionFile('submissions', pruned);
        }
      } catch (err: any) {
        if (err?.code !== 'ENOENT') {
          console.error('[server-db] Orphaned submissions prune check failed:', err);
        }
      }
    })();
  }
  return orphanedSubmissionsPrunePromise;
}

/**
 * One-time, idempotent seed: the built-in Feedback Form Template only
 * auto-appears via SEED_DB on a brand-new formTemplates.json (first boot
 * for that specific collection). Any database that already existed before
 * this template shipped needs it inserted directly — same shape as the
 * other one-off corrections above. Runs once per boot; a permanent no-op
 * once the template id is present.
 */
let feedbackFormTemplateSeedPromise: Promise<void> | null = null;
function ensureFeedbackFormTemplateSeeded(): Promise<void> {
  if (!feedbackFormTemplateSeedPromise) {
    feedbackFormTemplateSeedPromise = (async () => {
      const builtIn = SEED_DB.formTemplates.find((t: any) => t.id === FEEDBACK_FORM_TEMPLATE_ID);
      if (!builtIn) return;
      try {
        const raw = await fs.readFile(collectionPath('formTemplates'), 'utf-8');
        const parsed = JSON.parse(raw);
        let jsonContent: any = parsed;
        if (isEncryptedPayload(parsed)) {
          try {
            jsonContent = JSON.parse(decryptData(parsed));
          } catch {
            return;
          }
        }
        if (!Array.isArray(jsonContent)) return;
        const existingIdx = jsonContent.findIndex((t: any) => t?.id === FEEDBACK_FORM_TEMPLATE_ID);
        if (existingIdx === -1) {
          await writeCollectionFile('formTemplates', [builtIn, ...jsonContent]);
          return;
        }
        // Already present, but this is a built-in/managed template (not
        // something an admin hand-edits) — a database seeded before a
        // field-definition change shipped (e.g. "Type of Event" becoming a
        // multiselect) would otherwise keep serving its stale copy forever,
        // since the ENOENT first-boot seed path only ever runs once. Keep
        // it in sync with the current code-defined version whenever the
        // fields differ.
        if (JSON.stringify(jsonContent[existingIdx]?.fields) !== JSON.stringify(builtIn.fields)) {
          const updated = [...jsonContent];
          updated[existingIdx] = { ...updated[existingIdx], fields: builtIn.fields };
          await writeCollectionFile('formTemplates', updated);
        }
      } catch (err: any) {
        if (err?.code !== 'ENOENT') {
          console.error('[server-db] Feedback Form Template seed check failed:', err);
        }
        // ENOENT: no file yet — readCollectionFile's first-boot seed path handles it.
      }
    })();
  }
  return feedbackFormTemplateSeedPromise;
}

async function migrateDesignFilesToDisk(): Promise<void> {
  let designs: any[];
  try {
    designs = JSON.parse(await fs.readFile(collectionPath('designs'), 'utf-8'));
  } catch {
    return; // no file yet — nothing to migrate
  }
  if (!Array.isArray(designs)) return;

  let changed = false;
  for (const item of designs) {
    if (typeof item.fileData === 'string' && item.fileData.startsWith('data:')) {
      try {
        const stored = await saveBase64File('designs', item.id, 0, item.fileName || 'file', item.fileData);
        item.fileUrl = stored.url;
        item.storageKey = stored.storageKey;
        delete item.fileData;
        changed = true;
      } catch (err) {
        console.error('[server-db] Failed to migrate design file to disk for', item.id, err);
      }
    }
  }
  if (changed) await writeCollectionFile('designs', designs);
}

async function migrateReimbursementFilesToDisk(): Promise<void> {
  let items: any[];
  try {
    items = JSON.parse(await fs.readFile(collectionPath('reimbursements'), 'utf-8'));
  } catch {
    return;
  }
  if (!Array.isArray(items)) return;

  let changed = false;
  for (const item of items) {
    const files = Array.isArray(item.receiptFiles) ? item.receiptFiles : [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f && typeof f.dataUrl === 'string' && f.dataUrl.startsWith('data:')) {
        try {
          const stored = await saveBase64File('reimbursements', item.id, i, f.name || 'file', f.dataUrl);
          f.url = stored.url;
          f.storageKey = stored.storageKey;
          delete f.dataUrl;
          changed = true;
        } catch (err) {
          console.error('[server-db] Failed to migrate receipt file to disk for', item.id, i, err);
        }
      }
    }
    // Legacy single-file shape predating receiptFiles[] entirely.
    if (files.length === 0 && typeof item.receiptData === 'string' && item.receiptData.startsWith('data:')) {
      try {
        const stored = await saveBase64File('reimbursements', item.id, 0, item.receiptUrl || 'receipt.pdf', item.receiptData);
        item.receiptFiles = [{ name: item.receiptUrl || 'receipt.pdf', url: stored.url, storageKey: stored.storageKey }];
        delete item.receiptData;
        changed = true;
      } catch (err) {
        console.error('[server-db] Failed to migrate legacy receipt for', item.id, err);
      }
    }
  }
  if (changed) await writeCollectionFile('reimbursements', items);
}

async function readCollectionFile<T = any>(key: keyof DbSchema): Promise<T[]> {
  await ensureMigrated();
  await ensureFilesMigrated();
  await ensureSubhadeepEmailFixed();
  await ensureStaleEmailsFixed();
  await ensureProductionRosterPruned();
  await ensureOrphanedSubmissionsPruned();
  await ensureFeedbackFormTemplateSeeded();
  try {
    const raw = await fs.readFile(collectionPath(key), 'utf-8');
    const parsed = JSON.parse(raw);
    let jsonContent: any = parsed;

    if (isEncryptedPayload(parsed)) {
      try {
        const decryptedText = decryptData(parsed);
        jsonContent = JSON.parse(decryptedText);
      } catch (decErr) {
        console.error(`[server-db] Decryption failed for collection "${String(key)}":`, decErr);
        return ((EMPTY_DB[key] as any[]) ?? []) as T[];
      }
    }

    let arr: any[] = Array.isArray(jsonContent) ? jsonContent : ((EMPTY_DB[key] as any[]) ?? []);
    if (key === 'designs') arr = processDesignRetention(arr);
    return arr as T[];
  } catch (err: any) {
    if (err?.code !== 'ENOENT') return ((EMPTY_DB[key] as any[]) ?? []) as T[];
    // First boot for this specific collection: seed it from local-data.ts's initial* export.
    const seeded = ((SEED_DB[key] as any[]) ?? []) as T[];
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const encryptedPayload = encryptData(JSON.stringify(seeded));
      await fs.writeFile(collectionPath(key), JSON.stringify(encryptedPayload, null, 2), 'utf-8');
    } catch (writeErr) {
      console.error(`[server-db] First-boot seed write failed for "${String(key)}":`, writeErr);
    }
    return seeded;
  }
}

async function writeCollectionFile<T = any>(key: keyof DbSchema, data: T[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const jsonString = JSON.stringify(data);
  const encryptedPayload = encryptData(jsonString);
  await fs.writeFile(collectionPath(key), JSON.stringify(encryptedPayload, null, 2), 'utf-8');
}

/** Best-effort shared freshness marker — nothing depends on this for correctness. */
async function touchMeta(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(META_PATH, JSON.stringify({ lastUpdated: new Date().toISOString() }, null, 2), 'utf-8');
  } catch (err) {
    console.error('[server-db] Failed to update _meta.json:', err);
  }
}

/** Read every collection and assemble the full DbSchema shape (used by the /api/data aggregate poll). */
export async function readDb(): Promise<DbSchema> {
  const entries = await Promise.all(
    COLLECTION_KEYS.map(async key => [key, await readCollectionFile(key)] as const)
  );
  const db = Object.fromEntries(entries) as unknown as DbSchema;
  try {
    const metaRaw = await fs.readFile(META_PATH, 'utf-8');
    db.lastUpdated = JSON.parse(metaRaw)?.lastUpdated;
  } catch {
    // no meta file yet — fine, lastUpdated stays undefined
  }
  return db;
}

/**
 * Read a single collection from its own file.
 */
export async function readCollection<T = any>(key: keyof DbSchema): Promise<T[]> {
  return readCollectionFile<T>(key);
}

// Per-collection write locks — a write to "tasks" never waits on a concurrent
// write to "members" or any other unrelated collection.
const writeLocks = new Map<keyof DbSchema, Promise<void>>();

/**
 * Apply a mutation to a single collection and write only that collection's file.
 * The mutator receives the current array and returns the updated array.
 * Locked per-collection so concurrent calls to the SAME collection queue up
 * safely, while calls to different collections proceed independently.
 */
export async function mutateCollection<T = any>(
  key: keyof DbSchema,
  mutator: (current: T[]) => T[]
): Promise<T[]> {
  const previousLock = writeLocks.get(key) ?? Promise.resolve();
  let result: T[] = [];
  let mutationError: unknown = null;

  const thisLock = previousLock.then(async () => {
    try {
      const current = await readCollectionFile<T>(key);
      const updated = mutator(current);
      await writeCollectionFile(key, updated);
      result = updated;
    } catch (err) {
      mutationError = err;
    }
  });

  writeLocks.set(key, thisLock);
  await thisLock;
  touchMeta(); // best-effort, not awaited — never blocks or fails a mutation
  if (mutationError) throw mutationError;
  return result;
}
