'use client';

import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle, RotateCw, X } from 'lucide-react';
import { subscribeSyncStatus, getSyncEntries, getSyncSuccessFlash, dismissSyncEntry, type SyncEntry } from '@/lib/sync-status';

/**
 * Corner-anchored, honest feedback for every background write in the app —
 * "Saving...", a brief "Saved" confirmation, or a persistent "failed to save"
 * with a real retry, instead of the silence a fire-and-forget write used to
 * leave behind. Mounted once in the dashboard shell.
 */
export function SyncStatusPill() {
  const [entries, setEntries] = useState<SyncEntry[]>([]);
  const [successFlash, setSuccessFlash] = useState<{ id: string; label: string } | null>(null);

  useEffect(() => {
    const sync = () => {
      setEntries(getSyncEntries());
      setSuccessFlash(getSyncSuccessFlash());
    };
    sync();
    return subscribeSyncStatus(sync);
  }, []);

  const pending = entries.filter(e => e.status === 'pending');
  const errors = entries.filter(e => e.status === 'error');

  if (pending.length === 0 && errors.length === 0 && !successFlash) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col-reverse items-end gap-2 pointer-events-none">
      {errors.map(entry => (
        <div
          key={entry.id}
          className="pointer-events-auto flex items-center gap-2 pl-3 pr-2 py-2 rounded-xl glass-panel border border-danger/30 shadow-lg text-xs animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <AlertCircle className="h-3.5 w-3.5 text-danger shrink-0" />
          <span className="text-theme-text-primary font-medium">{entry.message || `Failed to save ${entry.label}.`}</span>
          {entry.retry && (
            <button
              type="button"
              onClick={entry.retry}
              className="flex items-center gap-1 text-accent font-semibold hover:underline cursor-pointer shrink-0"
            >
              <RotateCw className="h-3 w-3" />
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={() => dismissSyncEntry(entry.id)}
            className="text-theme-text-secondary hover:text-theme-text-primary p-0.5 shrink-0 cursor-pointer"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {successFlash && errors.length === 0 && (
        <div className="pointer-events-none flex items-center gap-2 px-3 py-2 rounded-xl glass-panel border border-success/30 shadow-lg text-xs animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
          <span className="text-theme-text-primary font-medium">Saved</span>
        </div>
      )}

      {pending.length > 0 && errors.length === 0 && !successFlash && (
        <div className="pointer-events-none flex items-center gap-2 px-3 py-2 rounded-xl glass-panel border border-theme-border/30 shadow-lg text-xs animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Loader2 className="h-3.5 w-3.5 text-accent shrink-0 animate-spin" />
          <span className="text-theme-text-secondary font-medium">
            {pending.length === 1 ? `${pending[0].verb} ${pending[0].label}...` : `Saving ${pending.length} changes...`}
          </span>
        </div>
      )}
    </div>
  );
}
