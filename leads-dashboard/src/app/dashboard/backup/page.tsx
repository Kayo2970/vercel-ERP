'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  DatabaseBackup,
  Download,
  Upload,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  FileQuestion,
} from 'lucide-react';
import { logAuditEvent, getSystemSettings, updateSystemSettings } from '@/lib/local-data';
import { canManageBackup } from '@/lib/permissions';
import { EmptyState } from '@/components/ui/empty-state';
import { FileDropzone, FilePreviewRow, createProgressTracker, uploadFormData } from '@/components/ui/file-dropzone';

export default function BackupRestorePage() {
  const [user, setUser] = useState<any>(null);
  const [userHydrated, setUserHydrated] = useState(false);

  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [backupPassphraseConfirm, setBackupPassphraseConfirm] = useState('');
  const [showBackupPassphrase, setShowBackupPassphrase] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupError, setBackupError] = useState('');
  const [backupSuccess, setBackupSuccess] = useState('');

  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState('');
  const [restoreSuccess, setRestoreSuccess] = useState('');
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreEtaSeconds, setRestoreEtaSeconds] = useState<number | null>(null);

  const [lockdownEnabled, setLockdownEnabled] = useState(false);
  const [isTogglingLockdown, setIsTogglingLockdown] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error(e);
      }
    }
    setLockdownEnabled(getSystemSettings().lockdownEnabled);
    setUserHydrated(true);
  }, []);

  const handleToggleLockdown = async () => {
    setIsTogglingLockdown(true);
    const next = !lockdownEnabled;
    updateSystemSettings({ lockdownEnabled: next }, user?.name || 'Super User');
    setLockdownEnabled(next);
    setIsTogglingLockdown(false);
  };

  const hasBackupAccess = canManageBackup(user);

  const handleDownloadBackup = async () => {
    setBackupError('');
    setBackupSuccess('');
    if (backupPassphrase.length < 8) {
      setBackupError('Passphrase must be at least 8 characters.');
      return;
    }
    if (backupPassphrase !== backupPassphraseConfirm) {
      setBackupError('Passphrases do not match.');
      return;
    }

    setIsBackingUp(true);
    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase: backupPassphrase }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Backup failed.');
      }

      const collections = res.headers.get('X-Backup-Collections');
      const files = res.headers.get('X-Backup-Files');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().split('T')[0];
      const link = document.createElement('a');
      link.href = url;
      link.download = `leads-backup-${stamp}.leadsbackup`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      logAuditEvent(
        'DATABASE_BACKUP_DOWNLOADED',
        user?.name || 'Super User',
        `Downloaded an encrypted full database backup (${collections || '?'} collections, ${files || '?'} files)`,
        user?.email
      );
      setBackupSuccess(`Backup downloaded — ${collections || '?'} collections and ${files || '?'} files, encrypted with your passphrase.`);
      setBackupPassphrase('');
      setBackupPassphraseConfirm('');
    } catch (err: any) {
      setBackupError(err.message || 'Backup failed.');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleFileSelected = (files: File[]) => {
    setRestoreFile(files[0] || null);
    setRestoreError('');
    setRestoreSuccess('');
    setRestoreProgress(0);
    setRestoreEtaSeconds(null);
  };

  const handleRestore = async () => {
    setRestoreError('');
    setRestoreSuccess('');
    if (!restoreFile) {
      setRestoreError('Select a .leadsbackup file first.');
      return;
    }
    if (!restorePassphrase) {
      setRestoreError('Enter the passphrase this backup was encrypted with.');
      return;
    }
    if (restoreConfirmText !== 'RESTORE') {
      setRestoreError('Type RESTORE in the confirmation box to proceed.');
      return;
    }

    setIsRestoring(true);
    setRestoreProgress(0);
    setRestoreEtaSeconds(null);
    try {
      const formData = new FormData();
      formData.append('file', restoreFile);
      formData.append('passphrase', restorePassphrase);

      const tracker = createProgressTracker((pct, eta) => { setRestoreProgress(pct); setRestoreEtaSeconds(eta); });
      const data = await uploadFormData('/api/backup/restore', formData, tracker);

      logAuditEvent(
        'DATABASE_RESTORED',
        user?.name || 'Super User',
        `Restored the database from an uploaded backup (${data.collectionCount} collections, ${data.fileCount} files). Previous live data retired to ${data.retiredTo}.`,
        user?.email
      );
      setRestoreSuccess(
        `Restore complete — ${data.collectionCount} collections and ${data.fileCount} files restored. The data that was live before this restore was kept, not deleted, in "${data.retiredTo}" on the server. Reload the page (and restart the app process on the server for a fully clean state).`
      );
      setRestoreFile(null);
      setRestorePassphrase('');
      setRestoreConfirmText('');
      setRestoreProgress(0);
      setRestoreEtaSeconds(null);
    } catch (err: any) {
      // Deliberately doesn't clear restoreFile — a failed restore keeps the
      // backup file staged so a dropped connection can be retried with one tap.
      setRestoreError(err.message || 'Restore failed.');
    } finally {
      setIsRestoring(false);
    }
  };

  if (!userHydrated) return null;

  if (!hasBackupAccess) {
    return (
      <div className="p-6 md:p-8">
        <EmptyState
          icon={ShieldAlert}
          title="Super User Access Required"
          description="Database backup and restore can move or overwrite every record and uploaded file in the system. Only the Super User account can access this page."
        />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-theme-text-primary flex items-center gap-2">
          <DatabaseBackup className="h-5 w-5 text-accent" />
          Database Backup &amp; Restore
        </h1>
        <p className="text-xs text-theme-text-secondary">
          Download an encrypted copy of everything — every collection (members, tasks, events, ratings, reimbursements,
          announcements, forms, submissions, designs, group policies, audit logs) and every uploaded file (design assets,
          reimbursement receipts) — or restore the system from a previous backup.
        </p>
      </div>

      {/* Site-wide Lockdown */}
      <div className={`glass-panel rounded-2xl p-6 space-y-3 border ${lockdownEnabled ? 'border-danger/30' : 'border-theme-card-border'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${lockdownEnabled ? 'bg-danger/10' : 'bg-theme-border/10'}`}>
              <FileQuestion className={`h-4.5 w-4.5 ${lockdownEnabled ? 'text-danger' : 'text-theme-text-secondary'}`} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-theme-text-primary">Site-Wide Lockdown</h3>
              <p className="text-[11px] text-theme-text-secondary max-w-md">
                When enabled, every dashboard page shows a plain "Page Not Found" screen to everyone except the Super User. Takes effect for signed-in users within seconds — no reload needed on their end.
              </p>
            </div>
          </div>

          <button
            onClick={handleToggleLockdown}
            disabled={isTogglingLockdown}
            role="switch"
            aria-checked={lockdownEnabled}
            className={`shrink-0 relative w-14 h-8 rounded-full transition-colors duration-200 ease-in-out cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              lockdownEnabled ? 'bg-danger' : 'bg-theme-border/40'
            }`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out ${
                lockdownEnabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {lockdownEnabled && (
          <div className="flex items-start gap-2 p-3 bg-danger/5 border border-danger/25 rounded-xl text-[11px] text-theme-text-secondary">
            <AlertTriangle className="h-3.5 w-3.5 text-danger shrink-0 mt-0.5" />
            <span>
              Lockdown is currently <strong className="text-danger">ON</strong>. Only the Super User account can use the dashboard right now — flip this off to restore access for everyone else.
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Backup */}
        <div className="glass-panel rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-accent/10 rounded-xl">
              <Download className="h-4.5 w-4.5 text-accent" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-theme-text-primary">Download Backup</h3>
              <p className="text-[11px] text-theme-text-secondary">Encrypted with a passphrase only you know</p>
            </div>
          </div>

          {backupSuccess && (
            <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/20 rounded-xl text-[11px] text-theme-text-primary">
              <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
              <span>{backupSuccess}</span>
            </div>
          )}
          {backupError && (
            <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/20 rounded-xl text-[11px] text-theme-text-primary">
              <ShieldAlert className="h-4 w-4 text-danger shrink-0" />
              <span>{backupError}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-theme-text-secondary">Encryption Passphrase</label>
            <div className="flex items-center gap-2 px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl focus-within:border-accent">
              <Lock className="h-3.5 w-3.5 text-theme-text-secondary shrink-0" />
              <input
                type={showBackupPassphrase ? 'text' : 'password'}
                value={backupPassphrase}
                onChange={(e) => setBackupPassphrase(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full bg-transparent border-0 focus:outline-none focus:ring-0 text-theme-text-primary placeholder-theme-text-secondary text-xs"
              />
              <button type="button" onClick={() => setShowBackupPassphrase(!showBackupPassphrase)} className="text-theme-text-secondary cursor-pointer">
                {showBackupPassphrase ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-theme-text-secondary">Confirm Passphrase</label>
            <input
              type={showBackupPassphrase ? 'text' : 'password'}
              value={backupPassphraseConfirm}
              onChange={(e) => setBackupPassphraseConfirm(e.target.value)}
              placeholder="Re-enter the passphrase"
              className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary placeholder-theme-text-secondary focus:outline-none focus:border-accent text-xs"
            />
          </div>

          <div className="flex items-start gap-2 p-3 bg-warning/5 border border-warning/20 rounded-xl text-[11px] text-theme-text-secondary">
            <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
            <span>There is no way to recover this file without the exact passphrase. Store it somewhere safe — losing it makes the backup permanently unreadable.</span>
          </div>

          <button
            onClick={handleDownloadBackup}
            disabled={isBackingUp}
            className="w-full flex items-center justify-center gap-2 py-3 bg-accent hover:bg-primary-light text-white font-semibold text-xs rounded-xl transition-all shadow-md shadow-accent/15 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="h-4 w-4" />
            {isBackingUp ? 'Encrypting & Packaging...' : 'Download Encrypted Backup'}
          </button>
        </div>

        {/* Restore */}
        <div className="glass-panel rounded-2xl p-6 space-y-4 border border-danger/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-danger/10 rounded-xl">
              <Upload className="h-4.5 w-4.5 text-danger" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-theme-text-primary">Restore From Backup</h3>
              <p className="text-[11px] text-theme-text-secondary">Overwrites all current data — read the warning below</p>
            </div>
          </div>

          {restoreSuccess && (
            <div className="flex items-start gap-2 p-3 bg-success/10 border border-success/20 rounded-xl text-[11px] text-theme-text-primary">
              <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
              <span>{restoreSuccess}</span>
            </div>
          )}
          {restoreError && (
            <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/20 rounded-xl text-[11px] text-theme-text-primary">
              <ShieldAlert className="h-4 w-4 text-danger shrink-0" />
              <span>{restoreError}</span>
            </div>
          )}

          <div className="flex items-start gap-2 p-3 bg-danger/5 border border-danger/25 rounded-xl text-[11px] text-theme-text-secondary">
            <AlertTriangle className="h-3.5 w-3.5 text-danger shrink-0 mt-0.5" />
            <span>
              This replaces every record and uploaded file currently in the system with what's in the backup. The data
              that's live right now is kept on the server (renamed, not deleted) as a safety net — but nothing already
              live will be visible in the app after this completes.
            </span>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-theme-text-secondary">Backup File (.leadsbackup)</label>
            <FileDropzone
              onFilesSelected={handleFileSelected}
              accept=".leadsbackup"
              disabled={isRestoring}
              label="Click or drag a backup file here"
              compact
            />
            {restoreFile && (
              <FilePreviewRow
                file={restoreFile}
                status={isRestoring ? 'uploading' : restoreError ? 'error' : 'idle'}
                progress={restoreProgress}
                etaSeconds={restoreEtaSeconds}
                error={restoreError}
                onRetry={restoreError ? handleRestore : undefined}
                onRemove={!isRestoring ? () => handleFileSelected([]) : undefined}
              />
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-theme-text-secondary">Encryption Passphrase</label>
            <div className="flex items-center gap-2 px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl focus-within:border-accent">
              <Lock className="h-3.5 w-3.5 text-theme-text-secondary shrink-0" />
              <input
                type="password"
                value={restorePassphrase}
                onChange={(e) => setRestorePassphrase(e.target.value)}
                placeholder="The passphrase this backup was created with"
                className="w-full bg-transparent border-0 focus:outline-none focus:ring-0 text-theme-text-primary placeholder-theme-text-secondary text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-theme-text-secondary">
              Type <span className="font-mono font-bold text-danger">RESTORE</span> to confirm
            </label>
            <input
              type="text"
              value={restoreConfirmText}
              onChange={(e) => setRestoreConfirmText(e.target.value)}
              placeholder="RESTORE"
              className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary placeholder-theme-text-secondary focus:outline-none focus:border-danger text-xs font-mono"
            />
          </div>

          <button
            onClick={handleRestore}
            disabled={isRestoring}
            className="w-full flex items-center justify-center gap-2 py-3 bg-danger hover:bg-danger/90 text-white font-semibold text-xs rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className="h-4 w-4" />
            {isRestoring ? 'Restoring...' : 'Restore & Overwrite Live Data'}
          </button>
        </div>
      </div>
    </div>
  );
}
